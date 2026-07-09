import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ActivityChart } from "./components/ActivityChart";
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
import { fetchIcpUsdPrice } from "./services/priceService";
import type { ExplorerError, GraphEdge, GraphNode } from "./types";

// Raw hex values for recharts drawing context (allowed per design-system rules)
const DONUT_COLORS = ["#66C7FF", "#F0B35A", "#3FE08C", "#FF5A5F", "#C084FC"];

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
                  fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                  opacity={0.85}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#0E1626",
                border: "1px solid #22324A",
                borderRadius: "6px",
                fontSize: "11px",
                color: "#E9EEF7",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "10px", color: "#9FB0C8" }} />
          </PieChart>
        </ResponsiveContainer>
      )}
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
    togglePin,
    debugMode,
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

  const [edgeWeight, setEdgeWeight] = useState<"tx_count" | "total_amount">(
    "tx_count",
  );
  const [icpUsdPrice, setIcpUsdPrice] = useState<number | undefined>(undefined);
  const [savedPanelOpen, setSavedPanelOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [comparisonActive, setComparisonActive] = useState(false);
  const [pinTrigger, setPinTrigger] = useState(0);

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
          <div className="flex justify-end">
            <StatusPanel />
          </div>

          {/* Main layout — stacks on mobile, side-by-side on lg+ */}
          <div className="flex flex-col lg:flex-row gap-4">
            {(hasData || loading) && (
              <div className="w-full lg:w-72 shrink-0">
                <OverviewPanel
                  principal={currentPrincipal}
                  walletData={walletData}
                  onNavigate={navigate}
                  timeRange={timeRange}
                  onTimeRangeChange={setTimeRange}
                />
              </div>
            )}

            <div
              className="flex-1 relative"
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
                />
              </CardContent>
            </Card>
          )}

          {/* Charts row */}
          {hasData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
