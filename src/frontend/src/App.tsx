import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { Coins, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ActivityChart } from "./components/ActivityChart";
import { AddTokenModal } from "./components/AddTokenModal";
import { BreadcrumbNav } from "./components/Breadcrumb";
import { ComparisonModeModal } from "./components/ComparisonModeModal";
import { ConstellationGraph } from "./components/ConstellationGraph";
import { EmptyState } from "./components/EmptyState";
import { Footer } from "./components/Footer";
import { IcrcDebugPanel } from "./components/IcrcDebugPanel";
import { OverviewPanel } from "./components/OverviewPanel";
import { SavedWalletsPanel } from "./components/SavedWalletsPanel";
import { StatusPanel } from "./components/StatusPanel";
import { TopBar } from "./components/TopBar";
import { TransactionTable } from "./components/TransactionTable";
import { WalletComparisonView } from "./components/WalletComparisonView";
import { useAuth } from "./hooks/useAuth";
import { useComparison } from "./hooks/useComparison";
import { useTheme } from "./hooks/useTheme";
import { useUserData } from "./hooks/useUserData";
import { useWallet } from "./hooks/useWallet";
import { getDailyActivity } from "./services/filters";
import { fetchIcpUsdPrice } from "./services/priceService";
import type { ExplorerError, GraphEdge, GraphNode, Transaction } from "./types";

// Theme-aware chart colors — read from the semantic CSS variables in index.css
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function NetworkBreakdown({
  nodes,
  edges,
  edgeWeight,
  onEdgeWeightChange,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  edgeWeight: "tx_count" | "total_amount";
  onEdgeWeightChange: (v: "tx_count" | "total_amount") => void;
}) {
  const top5 = [...nodes]
    .filter((n) => !n.isCenter)
    .sort((a, b) => b.txCount - a.txCount)
    .slice(0, 5);

  const data = top5.map((n) => {
    const edgeTo = edges.find((e) => e.source === n.id || e.target === n.id);
    return {
      name: n.id.length > 10 ? `${n.id.slice(0, 6)}\u2026` : n.id,
      value:
        edgeWeight === "tx_count"
          ? (edgeTo?.tx_count ?? n.txCount)
          : (edgeTo?.total_amount ?? 0),
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          data-ocid="wallet.toggle"
          onClick={() => onEdgeWeightChange("tx_count")}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            edgeWeight === "tx_count"
              ? "bg-neon-blue/20 border-neon-blue/50 text-neon-blue"
              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          By Tx Count
        </button>
        <button
          type="button"
          data-ocid="wallet.toggle"
          onClick={() => onEdgeWeightChange("total_amount")}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            edgeWeight === "total_amount"
              ? "bg-neon-amber/20 border-neon-amber/50 text-neon-amber"
              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          By Volume
        </button>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-44 text-xs text-muted-foreground">
          No counterparty data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={cssVar(`--chart-donut-${(i % 6) + 1}`)}
                  opacity={0.85}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: cssVar("--chart-tooltip-bg"),
                border: `1px solid ${cssVar("--chart-tooltip-border")}`,
                borderRadius: "6px",
                fontSize: "11px",
                color: cssVar("--chart-tooltip-text"),
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "10px", color: cssVar("--chart-text") }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Chain-key BTC-pegged tokens (e.g. ckBTC, ckTESTBTC) are displayed in
// satoshis (integer units) or decimal BTC depending on the selected unit.
function formatTokenAmount(
  token: string,
  amount: number,
  btcUnit: "btc" | "sats",
): string {
  if (/btc/i.test(token)) {
    if (btcUnit === "sats") {
      return `${Math.round(amount * 100_000_000).toLocaleString()} sats`;
    }
    return `${amount.toFixed(8)} BTC`;
  }
  return `${amount.toFixed(4)} ${token}`;
}

function formatShortDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return ts;
  }
}

// Token-holdings breakdown derived from per-token amounts already on each
// GraphEdge (inAmountByToken / outAmountByToken). No new API calls.
function TokenHoldings({
  edges,
  btcUnit,
}: {
  edges: GraphEdge[];
  btcUnit: "btc" | "sats";
}) {
  const rows = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of edges) {
      for (const [token, amt] of Object.entries(e.inAmountByToken ?? {})) {
        map.set(token, (map.get(token) ?? 0) + amt);
      }
      for (const [token, amt] of Object.entries(e.outAmountByToken ?? {})) {
        map.set(token, (map.get(token) ?? 0) + amt);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [edges]);

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-32 text-xs text-muted-foreground"
        data-ocid="wallet.empty_state"
      >
        No token data
      </div>
    );
  }

  const max = rows[0][1];

  return (
    <div className="space-y-2.5">
      {rows.map(([token, amount]) => (
        <div key={token} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{token}</span>
            <span className="font-mono text-muted-foreground">
              {formatTokenAmount(token, amount, btcUnit)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-neon-blue/70"
              style={{ width: `${max > 0 ? (amount / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Callout panel derived from the existing transactions and daily activity.
// Shows the largest single transaction and the most active day. No new API calls.
function Highlights({
  transactions,
  principal,
  btcUnit,
}: {
  transactions: Transaction[];
  principal: string;
  btcUnit: "btc" | "sats";
}) {
  const largest = useMemo(() => {
    if (!transactions.length) return null;
    return transactions.reduce((a, b) => (b.amount > a.amount ? b : a));
  }, [transactions]);

  const mostActiveDay = useMemo(() => {
    const daily = getDailyActivity(transactions, principal);
    if (!daily.length) return null;
    return daily.reduce((a, b) =>
      a.txIn + a.txOut >= b.txIn + b.txOut ? a : b,
    );
  }, [transactions, principal]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Largest Transaction
        </div>
        {largest ? (
          <>
            <div className="text-sm font-bold text-foreground">
              {formatTokenAmount(
                largest.token ?? "ICP",
                largest.amount,
                btcUnit,
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {formatShortDate(largest.timestamp)}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">No data</div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Most Active Day
        </div>
        {mostActiveDay ? (
          <>
            <div className="text-sm font-bold text-foreground">
              {mostActiveDay.txIn + mostActiveDay.txOut} txs
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {formatShortDate(mostActiveDay.date)}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">No data</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const {
    isLoggedIn,
    principal: authPrincipal,
    actor,
    login,
    logout,
    isLoading: authLoading,
  } = useAuth();
  const userData = useUserData(isLoggedIn, actor);

  const {
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
    tokenCoverage,
    togglePin,
    debugMode,
    addTokenByCanisterId,
    depth3LatencyMs,
  } = useWallet();

  const comparison = useComparison();

  const handleStartComparison = (addr1: string, addr2: string) => {
    comparison.startComparison(addr1, addr2);
    setComparisonActive(true);
  };

  const handleBackFromComparison = () => {
    setComparisonActive(false);
    comparison.reset();
  };

  // Manual "add token by canister ID" flow. The ICRC API only serves
  // SNS-governed and chain-key tokens automatically, so this queries the
  // user-supplied ledger canister directly (via HttpAgent to ic0.app) and
  // merges its transactions into the graph.
  const handleAddToken = async (canisterId: string) => {
    if (!currentPrincipal) {
      throw new Error("Load a wallet first to add a token.");
    }
    const result = await addTokenByCanisterId(canisterId);
    if (!result.ok) {
      if (result.error === "invalid") {
        throw new Error("Invalid canister ID or no wallet loaded.");
      }
      if (result.error === "empty") {
        throw new Error("No transactions found for this token and wallet.");
      }
      throw new Error(
        "Could not reach the ledger canister. Check the ID and try again.",
      );
    }
  };

  const [edgeWeight, setEdgeWeight] = useState<"tx_count" | "total_amount">(
    "tx_count",
  );
  // Shared BTC/sats unit — lifted here so every amount display (table,
  // overview, graph, charts, and the App formatter) stays consistent.
  const [btcUnit, setBtcUnit] = useState<"btc" | "sats">("sats");
  const [icpUsdPrice, setIcpUsdPrice] = useState<number | undefined>(undefined);
  const [savedPanelOpen, setSavedPanelOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [comparisonActive, setComparisonActive] = useState(false);
  const [pinTrigger, setPinTrigger] = useState(0);
  const [addTokenOpen, setAddTokenOpen] = useState(false);

  // Refs so the txLimit-change effect doesn't re-run on principal/navigate changes
  const currentPrincipalRef = useRef(currentPrincipal);
  currentPrincipalRef.current = currentPrincipal;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const searchRef = useRef(search);
  searchRef.current = search;

  // Fetch ICP/USD price on mount and every 5 minutes
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      const price = await fetchIcpUsdPrice();
      if (!cancelled && price !== null) setIcpUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Re-fetch when txLimit changes (if a principal is already loaded)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only triggers on txLimit change
  useEffect(() => {
    if (currentPrincipalRef.current) {
      navigateRef.current(currentPrincipalRef.current);
    }
  }, [txLimit]);

  // Handle ?address= URL param on first load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const addr = params.get("address");
      if (addr?.trim()) {
        searchRef.current(addr.trim());
      }
    } catch {
      // ignore URL parse errors
    }
  }, []);

  const hasData = !!walletData;
  const graphNodes = walletData?.graph.nodes ?? [];
  const graphEdges = walletData?.graph.edges ?? [];

  const emptyVariant: "search" | ExplorerError = errorType ?? "search";

  return (
    <div className="min-h-screen flex flex-col">
      <Toaster />

      {/* Sync indicator */}
      {(userData.syncing || userData.migrated) && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg text-muted-foreground">
          {userData.syncing && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-neon-blue" />
              <span>Syncing your data…</span>
            </>
          )}
          {!userData.syncing && userData.migrated && (
            <>
              <span className="text-neon-green">✓</span>
              <span>Data synced to your account</span>
            </>
          )}
        </div>
      )}

      {/* Comparison modal */}
      {compareModalOpen && (
        <ComparisonModeModal
          onCompare={handleStartComparison}
          onClose={() => setCompareModalOpen(false)}
        />
      )}

      {/* Add token by canister ID modal */}
      {addTokenOpen && (
        <AddTokenModal
          onAddToken={handleAddToken}
          onClose={() => setAddTokenOpen(false)}
        />
      )}

      {/* Saved wallets panel — slide-in from left */}
      <SavedWalletsPanel
        open={savedPanelOpen}
        onClose={() => setSavedPanelOpen(false)}
        onNavigate={navigate}
        onUnpin={(address) => {
          togglePin(address);
          userData.toggleFavorite(address);
        }}
        refreshTrigger={pinTrigger}
        savedWallets={userData.savedWallets}
        labels={userData.labels}
      />

      <TopBar
        onSearch={search}
        onReset={reset}
        loading={loading}
        currentPrincipal={currentPrincipal}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleSavedPanel={() => setSavedPanelOpen((o) => !o)}
        savedPanelOpen={savedPanelOpen}
        onOpenCompare={() => setCompareModalOpen(true)}
        isLoggedIn={isLoggedIn}
        authPrincipal={authPrincipal}
        authLoading={authLoading}
        onLogin={login}
        onLogout={logout}
      />

      {!comparisonActive && (
        <BreadcrumbNav
          historyStack={historyStack}
          currentPrincipal={currentPrincipal}
          onBack={goBack}
          onReset={reset}
          onJumpTo={jumpTo}
        />
      )}

      {/* Comparison view */}
      {comparisonActive ? (
        <main className="flex-1 flex flex-col">
          <WalletComparisonView
            comparison={comparison}
            onBack={handleBackFromComparison}
            btcUnit={btcUnit}
            onBtcUnitChange={setBtcUnit}
          />
          <Footer />
        </main>
      ) : (
        <main className="flex-1 flex flex-col gap-4 p-4 max-w-screen-2xl mx-auto w-full">
          {!currentPrincipal && !loading && (
            <div className="text-center pt-8 pb-2">
              <h1 className="text-2xl font-bold text-foreground mb-1">
                Enter Principal ID or Account ID
              </h1>
              <p className="text-sm text-muted-foreground">
                Visualize ICP wallet transaction networks as interactive
                constellations
              </p>
            </div>
          )}

          {/* System status bar — one line above the graph */}
          <div className="flex justify-end items-center gap-2">
            {hasData && (
              <button
                type="button"
                data-ocid="wallet.add_token_button"
                onClick={() => setAddTokenOpen(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:border-neon-blue/40 transition-colors"
              >
                <Coins className="h-3.5 w-3.5 text-neon-blue" />
                Add Token
              </button>
            )}
            <StatusPanel />
          </div>

          {/* Depth-3 fetch latency — reports whether the third fetch wave
              meaningfully increases load latency */}
          {depth3LatencyMs !== null && (
            <div className="flex justify-end" data-ocid="wallet.depth3_latency">
              <span
                className="text-[11px] text-muted-foreground"
                title="Time spent fetching the third wave of counterparty data (depth-3 nodes)"
              >
                Depth-3 load: {depth3LatencyMs.toLocaleString()} ms
              </span>
            </div>
          )}

          {/* Main layout — stacks on mobile, side-by-side on md+ */}
          <div className="flex flex-col md:flex-row gap-4">
            {(hasData || loading) && (
              <div className="w-full md:w-64 lg:w-72 shrink-0">
                <OverviewPanel
                  principal={currentPrincipal}
                  walletData={walletData}
                  onNavigate={navigate}
                  timeRange={timeRange}
                  onTimeRangeChange={setTimeRange}
                  tokenCoverage={tokenCoverage}
                  btcUnit={btcUnit}
                  onBtcUnitChange={setBtcUnit}
                />
              </div>
            )}

            <div className="flex-1 flex flex-col gap-4">
              <div
                className="relative"
                style={{ minHeight: "520px", height: "520px" }}
              >
                {loading ? (
                  <div
                    className="flex items-center justify-center h-full min-h-[520px] rounded-lg border border-border bg-card"
                    data-ocid="wallet.loading_state"
                  >
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-neon-blue" />
                      <span className="text-sm">
                        Fetching constellation data…
                      </span>
                    </div>
                  </div>
                ) : hasData ? (
                  <div className="relative h-full min-h-[520px]">
                    <ConstellationGraph
                      nodes={graphNodes}
                      edges={graphEdges}
                      centerPrincipal={currentPrincipal}
                      onNavigate={navigate}
                      edgeWeight={edgeWeight}
                      onMaxCounterpartiesChange={setMaxCounterparties}
                      maxCounterparties={maxCounterparties}
                      graphDepth={graphDepth}
                      onDepthChange={(d) => setGraphDepth(d as 1 | 2 | 3)}
                      depthLoading={depthLoading}
                      txLimit={txLimit}
                      onTxLimitChange={setTxLimit}
                      icrcLoading={icrcLoading}
                      showCrossEdges={showCrossEdges}
                      onShowCrossEdgesChange={setShowCrossEdges}
                      transactions={walletData?.transactions}
                      icpUsdPrice={icpUsdPrice}
                      onPinToggle={() => setPinTrigger((n) => n + 1)}
                      externalLabels={userData.labels}
                      onSetLabel={userData.setLabel}
                      onToggleFavorite={(address) => {
                        userData.toggleFavorite(address);
                        togglePin(address);
                        setPinTrigger((n) => n + 1);
                      }}
                      isFavorite={userData.isFavorite}
                      btcUnit={btcUnit}
                      onBtcUnitChange={setBtcUnit}
                    />
                  </div>
                ) : (
                  <div className="relative h-full min-h-[520px] rounded-lg border border-border bg-card overflow-hidden">
                    <EmptyState
                      variant={emptyVariant}
                      onProxySet={setProxyUrl}
                      proxyUrl={proxyUrl}
                    />
                  </div>
                )}
              </div>

              {/* Charts row — directly under the graph */}
              {hasData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">
                        Daily Transaction Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <ActivityChart
                        transactions={walletData.transactions}
                        principal={currentPrincipal}
                        btcUnit={btcUnit}
                        onBtcUnitChange={setBtcUnit}
                      />
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">
                        Network Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <NetworkBreakdown
                        nodes={graphNodes}
                        edges={graphEdges}
                        edgeWeight={edgeWeight}
                        onEdgeWeightChange={setEdgeWeight}
                      />
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* New data-driven panels — fill the gap above the table */}
              {hasData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">
                        Token Holdings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <TokenHoldings edges={graphEdges} btcUnit={btcUnit} />
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">
                        Highlights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <Highlights
                        transactions={walletData.transactions}
                        principal={currentPrincipal}
                        btcUnit={btcUnit}
                      />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Transactions table */}
          {hasData && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">
                  Recent Transactions
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({walletData.transactions.length} total)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <TransactionTable
                  transactions={walletData.transactions}
                  principal={currentPrincipal}
                  onNavigate={navigate}
                  btcUnit={btcUnit}
                  onBtcUnitChange={setBtcUnit}
                />
              </CardContent>
            </Card>
          )}
        </main>
      )}

      {!comparisonActive && <Footer />}

      {/* ICRC Debug Panel — toggle with Shift+D */}
      {debugMode && (
        <IcrcDebugPanel
          debugState={window.__ICRC_DEBUG}
          onClose={() => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "D", shiftKey: true }),
            );
          }}
        />
      )}
    </div>
  );
}
