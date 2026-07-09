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
  tokenListSource: "cached" | "fresh" | "stale" | "error" | "IC Explorer";
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

// Fetch all ICRC transactions for a single wallet address in ONE call.
// The new IC Explorer /api/tx/list endpoint is wallet-scoped and returns the
// full cross-token history (ICP + ICRC) in a single paginated request, so the
// old per-token batching loop is no longer needed.
async function fetchAllIcrcForAddress(
  address: string,
  limit: number,
  cancelledRef: { current: boolean },
  debugEntries?: IcrcFetchDebugEntry[],
  originalPrincipal?: string,
): Promise<Transaction[]> {
  if (cancelledRef.current) return [];
  const txs = await fetchIcrcTransactions(
    address,
    limit,
    debugEntries,
    originalPrincipal,
  );
  if (cancelledRef.current) return [];
  return txs;
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
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [graphDepth, setGraphDepth] = useState<1 | 2 | 3>(1);
  const [showCrossEdges, setShowCrossEdges] = useState(false);
  const [depthLoading, setDepthLoading] = useState(false);
  const [depth1Fetches, setDepth1Fetches] = useState<DepthFetch[]>([]);
  const [depth2Fetches, setDepth2Fetches] = useState<DepthFetch[]>([]);
  const [icrcLoading, setIcrcLoading] = useState(false);
  const [icrcError, setIcrcError] = useState(false);
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
    setRawTransactions([]);
    setAccountIdentifier("");
    setDepth1Fetches([]);
    setDepth2Fetches([]);
    setIcrcLoading(false);
    setIcrcError(false);
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
      setRawTransactions(result.transactions);
      setAccountIdentifier(acctId);
      if (result.transactions.length === 0) {
        setErrorType("empty");
      }
      // ICRC fetch ALWAYS runs — for ICP-only, ICRC-only, and mixed wallets alike.
      icrcCancelledRef.current = false;
      setIcrcLoading(true);
      const icpTxCount = result.transactions.length;

      (async () => {
        try {
          // 1) Fetch the wallet's token portfolio from IC Explorer in one call.
          //    Pass both the principal and the resolved hex account id so the
          //    API can resolve the wallet regardless of input format.
          const tokenList = await fetchIcrcTokenList(principal.trim(), acctId);
          if (icrcCancelledRef.current) return;

          console.log(
            `[ICRC] Portfolio loaded: ${tokenList.length} tokens from IC Explorer`,
          );

          // 2) Fetch the full cross-token ICRC transaction history in ONE
          //    wallet-scoped call. The new /api/tx/list endpoint returns all
          //    ICRC txs for the wallet in a single paginated request — no
          //    per-token iteration needed.
          const debugEntries: IcrcFetchDebugEntry[] = [];
          const allIcrcTxs = await fetchIcrcTransactions(
            acctId,
            txLimitRef.current,
            debugModeRef.current ? debugEntries : undefined,
            principal.trim(),
          );
          if (icrcCancelledRef.current) return;

          console.log(
            `[ICRC] Merging: ICP=${icpTxCount}, ICRC_total=${allIcrcTxs.length}, combined=${icpTxCount + allIcrcTxs.length}`,
          );

          if (allIcrcTxs.length > 0) {
            setRawTransactions((prev) => {
              const merged = [...prev, ...allIcrcTxs];
              console.log(
                `[ICRC] Merged ${allIcrcTxs.length} ICRC txs with ${prev.length} ICP txs → ${merged.length} total`,
              );

              // Write to debug object if debug mode is active
              if (debugModeRef.current) {
                window.__ICRC_DEBUG = {
                  tokenListCount: tokenList.length,
                  tokenListSource: "IC Explorer",
                  tokenListTimestamp: new Date().toISOString(),
                  perToken: debugEntries,
                  icpTxCount,
                  icrcTotalTxCount: allIcrcTxs.length,
                  mergedTxCount: merged.length,
                  icrcCounterpartyCount: 0, // updated by graph builder
                  icrcUnconditionalCount: 0,
                  lastUpdated: new Date().toISOString(),
                };
              }

              return merged;
            });
          } else if (debugModeRef.current) {
            window.__ICRC_DEBUG = {
              tokenListCount: tokenList.length,
              tokenListSource: "IC Explorer",
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
    setRawTransactions([]);
    setAccountIdentifier("");
    setErrorType(null);
    setLoading(false);
    setDepth1Fetches([]);
    setDepth2Fetches([]);
    setGraphDepth(1);
    setShowCrossEdges(false);
    setIcrcLoading(false);
    setIcrcError(false);
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

  const filteredTransactions = useMemo(
    () => filterByTimeRange(rawTransactions, timeRange),
    [rawTransactions, timeRange],
  );

  // Multi-depth fetch: fetch ICP + ICRC for all counterparty wallets at depth 1 and 2
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPrincipal intentionally excluded to avoid re-fetching on every keystroke
  useEffect(() => {
    if (
      !accountIdentifier ||
      rawTransactions.length === 0 ||
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
        rawTransactions,
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

          // Also fetch ICRC for this counterparty address
          let icrcTxs: Transaction[] = [];
          if (!cancelled) {
            try {
              icrcTxs = await fetchAllIcrcForAddress(
                cp.address,
                txLimitRef.current,
                cancelledRef,
                undefined,
                currentPrincipal,
              );
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

                  let icrcTxs: Transaction[] = [];
                  if (!cancelled) {
                    try {
                      icrcTxs = await fetchAllIcrcForAddress(
                        cp.address,
                        txLimitRef.current,
                        cancelledRef,
                        undefined,
                        currentPrincipal,
                      );
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
  }, [accountIdentifier, rawTransactions, graphDepth]);

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
    togglePin,
    isPinned,
    getSearchHistory,
    getSavedWallets,
    clearSearchHistory,
    debugMode,
  };
}
