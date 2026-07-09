import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TX_LIMIT,
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
  TimeRange,
  Transaction,
  WalletData,
} from "../types";

const DEFAULT_MAX_COUNTERPARTIES = 20;

type DepthFetch = {
  nodeId: string;
  accountId: string;
  transactions: Transaction[];
};

export function useWallet() {
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [currentPrincipal, setCurrentPrincipal] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
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

  const proxyUrlRef = useRef(proxyUrl);
  proxyUrlRef.current = proxyUrl;
  const txLimitRef = useRef(txLimit);
  txLimitRef.current = txLimit;
  const icrcCancelledRef = useRef(false);

  const loadPrincipal = useCallback(async (principal: string) => {
    setLoading(true);
    setErrorType(null);
    setRawTransactions([]);
    setAccountIdentifier("");
    setDepth1Fetches([]);
    setDepth2Fetches([]);
    setIcrcLoading(false);
    setIcrcError(false);
    icrcCancelledRef.current = true; // cancel any in-flight ICRC fetch

    const result = await fetchWalletTransactions(
      principal.trim(),
      proxyUrlRef.current || undefined,
      txLimitRef.current,
    );

    if (result.ok) {
      setRawTransactions(result.transactions);
      const acctId = result.accountIdentifier ?? principal;
      setAccountIdentifier(acctId);
      if (result.transactions.length === 0) {
        setErrorType("empty");
      } else {
        // Start ICRC background fetch
        icrcCancelledRef.current = false;
        setIcrcLoading(true);
        (async () => {
          try {
            const tokenList = await fetchIcrcTokenList();
            if (icrcCancelledRef.current) return;

            if (tokenList.length === 0) {
              // Token list fetch failed — set error flag so UI can inform user
              if (!icrcCancelledRef.current) {
                setIcrcError(true);
                setIcrcLoading(false);
              }
              return;
            }

            const results = await Promise.all(
              tokenList.map((token) =>
                fetchIcrcTransactions(
                  token.canisterId,
                  principal.trim(),
                  txLimitRef.current,
                  token.symbol,
                  token.decimals,
                ).catch(() => [] as Transaction[]),
              ),
            );
            if (icrcCancelledRef.current) return;

            const allIcrcTxs = results.flat().filter((tx) => tx !== null);
            if (allIcrcTxs.length > 0) {
              setRawTransactions((prev) => [...prev, ...allIcrcTxs]);
            }
          } catch {
            // silent failure
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

  // Fresh search — clears breadcrumb history
  const search = useCallback(
    async (principal: string) => {
      if (!principal.trim()) return;
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

  const filteredTransactions = useMemo(
    () => filterByTimeRange(rawTransactions, timeRange),
    [rawTransactions, timeRange],
  );

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
    setDepthLoading(true);

    (async () => {
      const top5 = getTopCounterparties(accountIdentifier, rawTransactions, 5);

      const d1Results = await Promise.all(
        top5.map(async (cp) => {
          const res = await fetchWalletTransactions(
            cp.address,
            proxyUrlRef.current || undefined,
            txLimitRef.current,
          );
          return {
            nodeId: cp.address,
            accountId: res.ok
              ? (res.accountIdentifier ?? cp.address)
              : cp.address,
            transactions: res.ok ? res.transactions : [],
          };
        }),
      );

      if (cancelled) return;
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
                fetchWalletTransactions(
                  cp.address,
                  proxyUrlRef.current || undefined,
                  txLimitRef.current,
                ).then((res) => ({
                  nodeId: cp.address,
                  accountId: res.ok
                    ? (res.accountIdentifier ?? cp.address)
                    : cp.address,
                  transactions: res.ok ? res.transactions : [],
                })),
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
    };
  }, [accountIdentifier, rawTransactions, graphDepth]);

  const walletData = useMemo<WalletData | null>(() => {
    if (!currentPrincipal || rawTransactions.length === 0) return null;
    const acctId = accountIdentifier || currentPrincipal;
    // Graph uses ALL raw transactions (not time-filtered) so old ICRC activity shows
    const graph =
      graphDepth === 1
        ? buildGraph(
            currentPrincipal,
            acctId,
            rawTransactions,
            maxCounterparties,
          )
        : buildMultiDepthGraph(
            {
              displayId: currentPrincipal,
              accountId: acctId,
              transactions: rawTransactions,
            },
            depth1Fetches,
            depth2Fetches,
            maxCounterparties,
            showCrossEdges,
          );
    return {
      // Summary and table use filtered transactions (respects time range)
      summary: computeSummary(acctId, filteredTransactions),
      transactions: filteredTransactions,
      graph,
    };
  }, [
    currentPrincipal,
    rawTransactions,
    filteredTransactions,
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
  };
}
