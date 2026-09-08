import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TX_LIMIT,
  type IcrcFetchDebugEntry,
  fetchIcrcTokenList,
  fetchIcrcTransactions,
  fetchWalletTransactions,
} from "../services/explorerService";
import { filterByTimeRange } from "../services/filters";
import {
  buildGraph,
  buildMultiDepthGraph,
  computeSummary,
  getTopCounterparties,
} from "../services/graphBuilder";
import type {
  ExplorerError,
  SavedWallet,
  SearchHistoryEntry,
  TimeRange,
  Transaction,
  WalletData,
} from "../types";

const DEFAULT_MAX_COUNTERPARTIES = 20;
const HISTORY_KEY = "icpath_search_history";
const LABELS_KEY = "wallet-labels";
const SAVED_WALLETS_KEY = "icpath_saved_wallets";
const MAX_HISTORY = 10;
const MAX_PINS = 20;
const DEBUG_KEY = "icpath_debug";

type DepthFetch = {
  nodeId: string;
  accountId: string;
  transactions: Transaction[];
};

// Debug state written to window.__ICRC_DEBUG when debug mode is active
export interface IcrcDebugState {
  tokenListCount: number;
  tokenListSource: "cached" | "fresh" | "stale" | "error";
  tokenListTimestamp: string;
  perToken: IcrcFetchDebugEntry[];
  icpTxCount: number;
  icrcTotalTxCount: number;
  mergedTxCount: number;
  icrcCounterpartyCount: number;
  icrcUnconditionalCount: number;
  lastUpdated: string;
}

declare global {
  interface Window {
    __ICRC_DEBUG?: IcrcDebugState;
  }
}

function safeGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private browsing / storage full — ignore
  }
}

export function getSearchHistory(): SearchHistoryEntry[] {
  return safeGetJSON<SearchHistoryEntry[]>(HISTORY_KEY, []);
}

export function getWalletLabels(): Record<string, string> {
  return safeGetJSON<Record<string, string>>(LABELS_KEY, {});
}

export function getSavedWallets(): SavedWallet[] {
  return safeGetJSON<SavedWallet[]>(SAVED_WALLETS_KEY, []);
}

export function clearSearchHistory(): void {
  safeSetJSON(HISTORY_KEY, []);
}

function saveToSearchHistory(address: string, label?: string): void {
  const prev = getSearchHistory();
  const deduped = [
    { address, label, searchedAt: Date.now() },
    ...prev.filter((e) => e.address !== address),
  ].slice(0, MAX_HISTORY);
  safeSetJSON(HISTORY_KEY, deduped);
}

// Fetch ICRC transactions for all tokens in parallel to minimise load latency.
// Returns merged txs and (optionally) populates debugEntries.
async function fetchIcrcInParallel(
  tokens: Array<{ canisterId: string; symbol: string; decimals: number }>,
  principal: string,
  limit: number,
  cancelledRef: { current: boolean },
  debugEntries?: IcrcFetchDebugEntry[],
  originalPrincipal?: string,
): Promise<Transaction[]> {
  if (cancelledRef.current) return [];

  console.log(`[ICRC] Fetching ${tokens.length} tokens in parallel...`);

  const results = await Promise.all(
    tokens.map((token) =>
      fetchIcrcTransactions(
        token.canisterId,
        principal,
        limit,
        token.symbol,
        token.decimals,
        debugEntries,
        originalPrincipal,
      ).catch((err) => {
        console.warn(
          `[ICRC] FAILED ${token.symbol} (${token.canisterId.slice(0, 8)}): ${err instanceof Error ? err.message : String(err)}`,
        );
        return [] as Transaction[];
      }),
    ),
  );

  const found = tokens
    .filter((_, idx) => results[idx].length > 0)
    .map((t) => t.symbol);
  console.log(
    `[ICRC] Parallel fetch done: ${found.length} tokens returned results${found.length > 0 ? ` (${found.join(", ")})` : ""}`,
  );

  return results.flat();
}

/** Run the full ICRC fetch pipeline (token list + batched txs) for a single address. */
/** Run the full ICRC fetch pipeline (token list + batched txs) for a single address. */
async function fetchAllIcrcForAddress(
  principal: string,
  limit: number,
  cancelledRef: { current: boolean },
  debugEntries?: IcrcFetchDebugEntry[],
  originalPrincipal?: string,
): Promise<Transaction[]> {
  const tokenList = await fetchIcrcTokenList();
  if (cancelledRef.current) return [];

  if (tokenList.length === 0) {
    console.warn(
      "[ICRC] Token list empty — skipping ICRC fetch for",
      principal.slice(0, 12),
    );
    return [];
  }

  const allIcrcTxs = await fetchIcrcInParallel(
    tokenList,
    principal,
    limit,
    cancelledRef,
    debugEntries,
    originalPrincipal,
  );

  return allIcrcTxs;
}

export function useWallet() {
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [currentPrincipal, setCurrentPrincipal] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [maxCounterparties, setMaxCounterparties] = useState(
    DEFAULT_MAX_COUNTERPARTIES,
  );
  const [txLimit, setTxLimit] = useState(DEFAULT_TX_LIMIT);
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<ExplorerError | null>(null);
  const [icpTransactions, setIcpTransactions] = useState<Transaction[]>([]);
  const [icrcTransactions, setIcrcTransactions] = useState<Transaction[]>([]);
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [graphDepth, setGraphDepth] = useState<1 | 2 | 3>(1);
  const [showCrossEdges, setShowCrossEdges] = useState(false);
  const [depthLoading, setDepthLoading] = useState(false);
  const [depth1Fetches, setDepth1Fetches] = useState<DepthFetch[]>([]);
  const [depth2Fetches, setDepth2Fetches] = useState<DepthFetch[]>([]);
  const [icrcLoading, setIcrcLoading] = useState(false);
  const [icrcError, setIcrcError] = useState(false);
  // Number of ICRC tokens loaded for the current wallet — used by the UI to
  // show a token-coverage note (full SNS + chain-key set represented).
  const [tokenCoverage, setTokenCoverage] = useState(0);
  // Force re-render when pins change
  const [pinnedVersion, setPinnedVersion] = useState(0);

  const proxyUrlRef = useRef(proxyUrl);
  proxyUrlRef.current = proxyUrl;
  const txLimitRef = useRef(txLimit);
  txLimitRef.current = txLimit;
  const icrcCancelledRef = useRef(false);

  // Debug mode state
  const [debugMode, setDebugMode] = useState<boolean>(() =>
    safeGetJSON<boolean>(DEBUG_KEY, false),
  );
  const debugModeRef = useRef(debugMode);
  debugModeRef.current = debugMode;

  // Toggle debug mode on Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d")) {
        setDebugMode((prev) => {
          const next = !prev;
          safeSetJSON(DEBUG_KEY, next);
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const loadPrincipal = useCallback(async (principal: string) => {
    setLoading(true);
    setErrorType(null);
    setIcpTransactions([]);
    setIcrcTransactions([]);
    setAccountIdentifier("");
    setDepth1Fetches([]);
    setDepth2Fetches([]);
    setIcrcLoading(false);
    setIcrcError(false);
    setTokenCoverage(0);
    icrcCancelledRef.current = true;

    const result = await fetchWalletTransactions(
      principal.trim(),
      proxyUrlRef.current || undefined,
      txLimitRef.current,
    );

    if (result.ok) {
      const acctId = result.accountIdentifier ?? principal;
      console.log(
        `[ICP] Loaded ${result.transactions.length} transactions, accountId=${acctId}`,
      );
      setIcpTransactions(result.transactions);
      setIcrcTransactions([]);
      setAccountIdentifier(acctId);
      if (result.transactions.length === 0) {
        setErrorType("empty");
      } else {
        icrcCancelledRef.current = false;
        setIcrcLoading(true);
        const icpTxCount = result.transactions.length;

        (async () => {
          try {
            const tokenList = await fetchIcrcTokenList();
            if (icrcCancelledRef.current) return;

            console.log(`[ICRC] Token list loaded: ${tokenList.length} tokens`);
            setTokenCoverage(tokenList.length);

            if (tokenList.length === 0) {
              if (!icrcCancelledRef.current) {
                setIcrcError(true);
                setIcrcLoading(false);
              }
              return;
            }

            const debugEntries: IcrcFetchDebugEntry[] = [];
            // Pass both the raw input (may be principal) and the resolved hex account ID
            // so ICRC fetches try both formats and maximise hit rate
            const allIcrcTxs = await fetchIcrcInParallel(
              tokenList,
              principal.trim(),
              txLimitRef.current,
              icrcCancelledRef,
              debugModeRef.current ? debugEntries : undefined,
              acctId !== principal.trim() ? acctId : undefined,
            );
            if (icrcCancelledRef.current) return;

            console.log(
              `[ICRC] Merging: ICP=${icpTxCount}, ICRC_total=${allIcrcTxs.length}, combined=${icpTxCount + allIcrcTxs.length}`,
            );

            if (allIcrcTxs.length > 0) {
              setIcrcTransactions(allIcrcTxs);
              console.log(
                `[ICRC] Merged ${allIcrcTxs.length} ICRC txs with ${icpTxCount} ICP txs → ${icpTxCount + allIcrcTxs.length} total`,
              );

              // Write to debug object if debug mode is active
              if (debugModeRef.current) {
                window.__ICRC_DEBUG = {
                  tokenListCount: tokenList.length,
                  tokenListSource: "fresh",
                  tokenListTimestamp: new Date().toISOString(),
                  perToken: debugEntries,
                  icpTxCount,
                  icrcTotalTxCount: allIcrcTxs.length,
                  mergedTxCount: icpTxCount + allIcrcTxs.length,
                  icrcCounterpartyCount: 0, // updated by graph builder
                  icrcUnconditionalCount: 0,
                  lastUpdated: new Date().toISOString(),
                };
              }
            } else if (debugModeRef.current) {
              window.__ICRC_DEBUG = {
                tokenListCount: tokenList.length,
                tokenListSource: "fresh",
                tokenListTimestamp: new Date().toISOString(),
                perToken: debugEntries,
                icpTxCount,
                icrcTotalTxCount: 0,
                mergedTxCount: icpTxCount,
                icrcCounterpartyCount: 0,
                icrcUnconditionalCount: 0,
                lastUpdated: new Date().toISOString(),
              };
            }
          } catch (err) {
            console.error("[ICRC] Unexpected error during ICRC fetch:", err);
          } finally {
            if (!icrcCancelledRef.current) {
              setIcrcLoading(false);
            }
          }
        })();
      }
    } else {
      setErrorType(result.error);
    }

    setLoading(false);
  }, []);

  const navigate = useCallback(
    async (principal: string) => {
      if (!principal.trim()) return;
      if (currentPrincipal) {
        setHistoryStack((prev) => [...prev, currentPrincipal]);
      }
      setCurrentPrincipal(principal.trim());
      await loadPrincipal(principal.trim());
    },
    [currentPrincipal, loadPrincipal],
  );

  // Fresh search — clears breadcrumb, saves to search history
  const search = useCallback(
    async (principal: string) => {
      if (!principal.trim()) return;
      const labels = getWalletLabels();
      const label = labels[principal.trim().toLowerCase()];
      saveToSearchHistory(principal.trim(), label);
      setHistoryStack([]);
      setCurrentPrincipal(principal.trim());
      await loadPrincipal(principal.trim());
    },
    [loadPrincipal],
  );

  const goBack = useCallback(async () => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setHistoryStack((stack) => stack.slice(0, -1));
    setCurrentPrincipal(prev);
    await loadPrincipal(prev);
  }, [historyStack, loadPrincipal]);

  const jumpTo = useCallback(
    async (index: number) => {
      const target = historyStack[index];
      if (!target) return;
      setHistoryStack((stack) => stack.slice(0, index));
      setCurrentPrincipal(target);
      await loadPrincipal(target);
    },
    [historyStack, loadPrincipal],
  );

  const reset = useCallback(() => {
    icrcCancelledRef.current = true;
    setHistoryStack([]);
    setCurrentPrincipal("");
    setIcpTransactions([]);
    setIcrcTransactions([]);
    setAccountIdentifier("");
    setErrorType(null);
    setLoading(false);
    setDepth1Fetches([]);
    setDepth2Fetches([]);
    setGraphDepth(1);
    setShowCrossEdges(false);
    setIcrcLoading(false);
    setIcrcError(false);
    setTokenCoverage(0);
  }, []);

  /** Toggle pin/unpin a wallet address */
  const togglePin = useCallback((address: string, label?: string) => {
    const current = getSavedWallets();
    const idx = current.findIndex(
      (w) => w.address.toLowerCase() === address.toLowerCase(),
    );
    let updated: SavedWallet[];
    if (idx >= 0) {
      updated = current.filter((_, i) => i !== idx);
    } else {
      const newPin: SavedWallet = {
        address,
        label: label ?? getWalletLabels()[address.toLowerCase()],
        pinnedAt: Date.now(),
      };
      updated = [newPin, ...current].slice(0, MAX_PINS);
    }
    safeSetJSON(SAVED_WALLETS_KEY, updated);
    setPinnedVersion((v) => v + 1);
  }, []);

  const isPinned = useCallback(
    (address: string): boolean => {
      // Use pinnedVersion to ensure reactivity
      void pinnedVersion;
      return getSavedWallets().some(
        (w) => w.address.toLowerCase() === address.toLowerCase(),
      );
    },
    [pinnedVersion],
  );

  // Merged view of ICP + ICRC transactions for consumers that need the full set.
  // The depth-1/2 effect depends only on icpTransactions so the ICRC merge
  // landing does not restart the in-flight per-node sweep.
  const rawTransactions = useMemo(
    () => [...icpTransactions, ...icrcTransactions],
    [icpTransactions, icrcTransactions],
  );

  const filteredTransactions = useMemo(
    () => filterByTimeRange(rawTransactions, timeRange),
    [rawTransactions, timeRange],
  );

  // Multi-depth fetch: fetch ICP + ICRC for all counterparty wallets at depth 1 and 2
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPrincipal intentionally excluded to avoid re-fetching on every keystroke
  useEffect(() => {
    if (
      !accountIdentifier ||
      icpTransactions.length === 0 ||
      graphDepth === 1
    ) {
      setDepth1Fetches([]);
      setDepth2Fetches([]);
      return;
    }

    let cancelled = false;
    const cancelledRef = { current: false };
    setDepthLoading(true);

    (async () => {
      const top5 = getTopCounterparties(
        accountIdentifier,
        icpTransactions,
        5,
        currentPrincipal,
      );

      // Fetch ICP + ICRC for each depth-1 counterparty
      const d1Results = await Promise.all(
        top5.map(async (cp) => {
          const icpRes = await fetchWalletTransactions(
            cp.address,
            proxyUrlRef.current || undefined,
            txLimitRef.current,
          );

          const icpTxs = icpRes.ok ? icpRes.transactions : [];
          const acctId = icpRes.ok
            ? (icpRes.accountIdentifier ?? cp.address)
            : cp.address;

          // Set ICP data immediately per node — do not block on the ICRC sweep
          const node: DepthFetch = {
            nodeId: cp.address,
            accountId: acctId,
            transactions: icpTxs,
          };
          if (!cancelled) {
            setDepth1Fetches((prev) => {
              const next = prev.filter((f) => f.nodeId !== cp.address);
              return [...next, node];
            });
          }

          // Patch ICRC results in via functional state update as each node's
          // sweep resolves — do not block the state update on the full sweep
          let icrcTxs: Transaction[] = [];
          if (!cancelled) {
            try {
              icrcTxs = await fetchAllIcrcForAddress(
                cp.address,
                txLimitRef.current,
                cancelledRef,
              );
              if (!cancelled && icrcTxs.length > 0) {
                setDepth1Fetches((prev) =>
                  prev.map((f) =>
                    f.nodeId === cp.address
                      ? { ...f, transactions: [...f.transactions, ...icrcTxs] }
                      : f,
                  ),
                );
              }
            } catch {
              // non-critical — continue with ICP only
            }
          }

          const allTxs = [...icpTxs, ...icrcTxs];
          console.log(
            `[Depth-1] ${cp.address.slice(0, 12)}: ICP=${icpTxs.length}, ICRC=${icrcTxs.length}, total=${allTxs.length}`,
          );

          return {
            nodeId: cp.address,
            accountId: acctId,
            transactions: allTxs,
          };
        }),
      );

      if (cancelled) return;
      cancelledRef.current = false;
      setDepth1Fetches(d1Results);

      if (graphDepth === 3) {
        const existingIds = new Set<string>([
          accountIdentifier.toLowerCase(),
          ...top5.map((cp) => cp.address.toLowerCase()),
        ]);
        const d2Promises: Promise<DepthFetch>[] = [];
        for (const d1 of d1Results) {
          if (d1.transactions.length === 0) continue;
          const cpList = getTopCounterparties(d1.accountId, d1.transactions, 3);
          for (const cp of cpList) {
            const cpLower = cp.address.toLowerCase();
            if (!existingIds.has(cpLower)) {
              existingIds.add(cpLower);
              d2Promises.push(
                (async () => {
                  const icpRes = await fetchWalletTransactions(
                    cp.address,
                    proxyUrlRef.current || undefined,
                    txLimitRef.current,
                  );

                  const icpTxs = icpRes.ok ? icpRes.transactions : [];
                  const acctId = icpRes.ok
                    ? (icpRes.accountIdentifier ?? cp.address)
                    : cp.address;

                  // Set ICP data immediately per node — do not block on the ICRC sweep
                  const node: DepthFetch = {
                    nodeId: cp.address,
                    accountId: acctId,
                    transactions: icpTxs,
                  };
                  if (!cancelled) {
                    setDepth2Fetches((prev) => {
                      const next = prev.filter((f) => f.nodeId !== cp.address);
                      return [...next, node];
                    });
                  }

                  // Patch ICRC results in via functional state update as each
                  // node's sweep resolves — do not block the state update
                  let icrcTxs: Transaction[] = [];
                  if (!cancelled) {
                    try {
                      icrcTxs = await fetchAllIcrcForAddress(
                        cp.address,
                        txLimitRef.current,
                        cancelledRef,
                      );
                      if (!cancelled && icrcTxs.length > 0) {
                        setDepth2Fetches((prev) =>
                          prev.map((f) =>
                            f.nodeId === cp.address
                              ? {
                                  ...f,
                                  transactions: [...f.transactions, ...icrcTxs],
                                }
                              : f,
                          ),
                        );
                      }
                    } catch {
                      // non-critical
                    }
                  }

                  const allTxs = [...icpTxs, ...icrcTxs];
                  console.log(
                    `[Depth-2] ${cp.address.slice(0, 12)}: ICP=${icpTxs.length}, ICRC=${icrcTxs.length}, total=${allTxs.length}`,
                  );

                  return {
                    nodeId: cp.address,
                    accountId: acctId,
                    transactions: allTxs,
                  };
                })(),
              );
            }
          }
        }
        const d2Results = await Promise.all(d2Promises);
        if (cancelled) return;
        setDepth2Fetches(d2Results);
      } else {
        setDepth2Fetches([]);
      }

      if (!cancelled) setDepthLoading(false);
    })();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [accountIdentifier, icpTransactions, graphDepth]);

  const walletData = useMemo<WalletData | null>(() => {
    console.log(
      `[Graph] walletData memo: principal=${currentPrincipal.slice(0, 12)}, rawTx=${rawTransactions.length}, acctId=${accountIdentifier.slice(0, 12)}`,
    );
    if (!currentPrincipal || rawTransactions.length === 0) return null;
    const acctId = accountIdentifier || currentPrincipal;

    // Graph uses filtered transactions so it respects the time filter
    const filteredForGraph = filteredTransactions;
    const graphToUse =
      graphDepth === 1
        ? buildGraph(
            currentPrincipal,
            acctId,
            filteredForGraph,
            maxCounterparties,
          )
        : buildMultiDepthGraph(
            {
              displayId: currentPrincipal,
              accountId: acctId,
              transactions: filteredForGraph,
            },
            depth1Fetches.map((f) => ({
              ...f,
              transactions: filterByTimeRange(f.transactions, timeRange),
            })),
            depth2Fetches.map((f) => ({
              ...f,
              transactions: filterByTimeRange(f.transactions, timeRange),
            })),
            maxCounterparties,
            showCrossEdges,
          );

    return {
      summary: computeSummary(acctId, filteredTransactions),
      transactions: filteredTransactions,
      // allTransactions: always the full raw set — used for wallet age computation
      allTransactions: rawTransactions,
      graph: graphToUse,
    };
  }, [
    currentPrincipal,
    rawTransactions,
    filteredTransactions,
    timeRange,
    maxCounterparties,
    accountIdentifier,
    graphDepth,
    depth1Fetches,
    depth2Fetches,
    showCrossEdges,
  ]);

  return {
    historyStack,
    currentPrincipal,
    timeRange,
    setTimeRange,
    maxCounterparties,
    setMaxCounterparties,
    txLimit,
    setTxLimit,
    loading,
    errorType,
    rawTransactions,
    filteredTransactions,
    walletData,
    navigate,
    search,
    goBack,
    jumpTo,
    reset,
    proxyUrl,
    setProxyUrl,
    graphDepth,
    setGraphDepth,
    showCrossEdges,
    setShowCrossEdges,
    depthLoading,
    icrcLoading,
    icrcError,
    tokenCoverage,
    togglePin,
    isPinned,
    getSearchHistory,
    getSavedWallets,
    clearSearchHistory,
    debugMode,
  };
}
