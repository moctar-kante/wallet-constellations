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
  // Split raw transactions into ICP-ledger and ICRC-merge buckets so the
  // depth-1/2 effect can depend on icpTransactions (the ICP-ledger set that
  // drives counterparty selection) WITHOUT retriggering when the ICRC merge
  // appends to icrcTransactions. The combined rawTransactions is derived via
  // useMemo below for consumers that need the merged list.
  const [icpTransactions, setIcpTransactions] = useState<Transaction[]>([]);
  const [icrcTransactions, setIcrcTransactions] = useState<Transaction[]>([]);
  const rawTransactions = useMemo(
    () => [...icpTransactions, ...icrcTransactions],
    [icpTransactions, icrcTransactions],
  );
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
    setIcpTransactions([]);
    setIcrcTransactions([]);
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
      setIcpTransactions(result.transactions);
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
          // Pass the principal TEXT as the primary address so the ICRC API
          // is queried with the principal form first; fetchIcrcTransactions
          // falls back to the hex account id only if that returns nothing.
          // The original principal is also passed as the fourth arg so the
          // hex-input code path still has it for resolution.
          const allIcrcTxs = await fetchIcrcTransactions(
            principal.trim(),
            txLimitRef.current,
            debugModeRef.current ? debugEntries : undefined,
            principal.trim(),
          );
          if (icrcCancelledRef.current) return;

          console.log(
            `[ICRC] Merging: ICP=${icpTxCount}, ICRC_total=${allIcrcTxs.length}, combined=${icpTxCount + allIcrcTxs.length}`,
          );

          if (allIcrcTxs.length > 0) {
            setIcrcTransactions((prev) => {
              const merged = [...prev, ...allIcrcTxs];
              console.log(
                `[ICRC] Merged ${allIcrcTxs.length} ICRC txs with ${prev.length} prior ICRC txs → ${merged.length} total`,
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
                  mergedTxCount: icpTxCount + merged.length,
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

    // Shared dedup set for depth-2 targets. Initialized atomically with the
    // root account + the top-5 depth-1 counterparties BEFORE any depth-1
    // fetches start, so each depth-1 callback can add its own depth-2 targets
    // as it resolves without re-fetching targets already claimed by an
    // earlier-resolving depth-1 counterparty.
    const top5 = getTopCounterparties(
      accountIdentifier,
      icpTransactions,
      5,
      currentPrincipal,
    );
    const existingIds = new Set<string>([
      accountIdentifier.toLowerCase(),
      ...top5.map((cp) => cp.address.toLowerCase()),
    ]);

    (async () => {
      const d1Results: DepthFetch[] = [];
      const d2Results: DepthFetch[] = [];

      // Fetch ICP + ICRC for each depth-1 counterparty. When graphDepth === 3,
      // each depth-1 callback kicks off its OWN depth-2 fetches immediately
      // after its depth-1 fetch resolves (instead of waiting for all depth-1
      // fetches to finish). The shared existingIds Set is mutated atomically
      // per depth-1 result so later-resolving counterparties skip targets
      // already claimed by earlier-resolving ones.
      await Promise.all(
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

          const d1Result: DepthFetch = {
            nodeId: cp.address,
            accountId: acctId,
            transactions: allTxs,
          };
          d1Results.push(d1Result);

          // Kick off depth-2 fetches for this counterparty immediately, using
          // the shared existingIds Set for cross-counterparty dedup.
          if (graphDepth === 3 && allTxs.length > 0) {
            const cpList = getTopCounterparties(acctId, allTxs, 3);
            const localD2Targets: { address: string; accountId: string }[] = [];
            for (const d2cp of cpList) {
              const cpLower = d2cp.address.toLowerCase();
              if (!existingIds.has(cpLower)) {
                existingIds.add(cpLower);
                localD2Targets.push({
                  address: d2cp.address,
                  accountId: acctId,
                });
              }
            }

            await Promise.all(
              localD2Targets.map(async ({ address }) => {
                if (cancelled) return;
                // Parallelize per-counterparty ICP + ICRC fetches
                const [icpRes2, icrcTxs2] = await Promise.all([
                  fetchWalletTransactions(
                    address,
                    proxyUrlRef.current || undefined,
                    txLimitRef.current,
                  ),
                  cancelled
                    ? Promise.resolve([] as Transaction[])
                    : fetchAllIcrcForAddress(
                        address,
                        txLimitRef.current,
                        cancelledRef,
                        undefined,
                        currentPrincipal,
                      ).catch(() => [] as Transaction[]),
                ]);

                if (cancelled) return;

                const icpTxs2 = icpRes2.ok ? icpRes2.transactions : [];
                const acctId2 = icpRes2.ok
                  ? (icpRes2.accountIdentifier ?? address)
                  : address;

                const allTxs2 = [...icpTxs2, ...icrcTxs2];
                console.log(
                  `[Depth-2] ${address.slice(0, 12)}: ICP=${icpTxs2.length}, ICRC=${icrcTxs2.length}, total=${allTxs2.length}`,
                );

                d2Results.push({
                  nodeId: address,
                  accountId: acctId2,
                  transactions: allTxs2,
                });
              }),
            );
          }
        }),
      );

      if (cancelled) return;
      setDepth1Fetches(d1Results);
      setDepth2Fetches(d2Results);

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
    togglePin,
    isPinned,
    getSearchHistory,
    getSavedWallets,
    clearSearchHistory,
    debugMode,
  };
}
