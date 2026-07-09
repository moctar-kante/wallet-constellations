import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, GitCompareArrows, Loader2 } from "lucide-react";
import type { useComparison } from "../hooks/useComparison";
import type { TimeRange } from "../types";
import { ComparisonStatsPanel } from "./ComparisonStatsPanel";
import { ConstellationGraph } from "./ConstellationGraph";
import { SharedCounterpartiesPanel } from "./SharedCounterpartiesPanel";

// Raw hex for SVG rings — allowed per design system rules
const SHARED_NODE_COLOR = "#00FF88";
const WALLET2_ACCENT = "#FFB300";

type ComparisonHook = ReturnType<typeof useComparison>;

interface WalletComparisonViewProps {
  comparison: ComparisonHook;
  onBack: () => void;
}

function shortenAddr(addr: string) {
  if (!addr || addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function GraphSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted-foreground px-1">
        {label}
      </div>
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-card"
        style={{ minHeight: 400 }}
        data-ocid="compare.loading_state"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-neon-blue" />
          <span className="text-sm">Loading constellation…</span>
        </div>
      </div>
    </div>
  );
}

export function WalletComparisonView({
  comparison,
  onBack,
}: WalletComparisonViewProps) {
  const {
    isLoading,
    data,
    sharedCounterparties,
    error1,
    error2,
    address1,
    address2,
    timeRange,
    setTimeRange,
  } = comparison;

  const hasData = !!data;
  const sharedNodeArray = hasData ? [...data.sharedNodeIds] : [];

  const short1 = shortenAddr(address1);
  const short2 = shortenAddr(address2);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-screen-2xl mx-auto w-full">
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to main view"
          data-ocid="compare.back_button"
          className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GitCompareArrows className="h-4 w-4 text-neon-blue shrink-0" />
          <span className="text-sm font-medium text-muted-foreground">
            Comparing:
          </span>
          <span className="text-sm font-mono text-neon-blue truncate">
            {short1}
          </span>
          <span className="text-xs text-muted-foreground/60 shrink-0">vs</span>
          <span
            className="text-sm font-mono truncate"
            style={{ color: WALLET2_ACCENT }}
          >
            {short2}
          </span>
        </div>

        {/* Time range selector */}
        <Select
          value={timeRange}
          onValueChange={(v) => setTimeRange(v as TimeRange)}
        >
          <SelectTrigger
            className="w-[90px] bg-muted/50 border-border text-foreground shrink-0"
            data-ocid="compare.time_range_select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 days</SelectItem>
            <SelectItem value="30d">30 days</SelectItem>
            <SelectItem value="90d">90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error state */}
      {(error1 || error2) && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-ocid="compare.error_state"
        >
          {error1 || error2}
        </div>
      )}

      {/* Graphs row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <GraphSkeleton label={`Wallet 1: ${short1}`} />
            <GraphSkeleton label={`Wallet 2: ${short2}`} />
          </>
        ) : hasData ? (
          <>
            {/* Wallet 1 graph */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-neon-blue/80" />
                Wallet 1:{" "}
                <span className="font-mono text-neon-blue/80">{short1}</span>
              </div>
              <div className="relative" style={{ minHeight: 400, height: 400 }}>
                <ConstellationGraph
                  nodes={data.wallet1.graph.nodes}
                  edges={data.wallet1.graph.edges}
                  centerPrincipal={address1}
                  onNavigate={() => {}}
                  edgeWeight="tx_count"
                  maxCounterparties={20}
                  onMaxCounterpartiesChange={() => {}}
                  graphDepth={1}
                  onDepthChange={() => {}}
                  txLimit={200}
                  onTxLimitChange={() => {}}
                  showCrossEdges={false}
                  onShowCrossEdgesChange={() => {}}
                  transactions={data.wallet1.transactions}
                  highlightNodeIds={sharedNodeArray}
                  highlightColor={SHARED_NODE_COLOR}
                />
              </div>
            </div>

            {/* Wallet 2 graph */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: `${WALLET2_ACCENT}CC` }}
                />
                Wallet 2:{" "}
                <span
                  className="font-mono"
                  style={{ color: `${WALLET2_ACCENT}CC` }}
                >
                  {short2}
                </span>
              </div>
              <div className="relative" style={{ minHeight: 400, height: 400 }}>
                <ConstellationGraph
                  nodes={data.wallet2.graph.nodes}
                  edges={data.wallet2.graph.edges}
                  centerPrincipal={address2}
                  onNavigate={() => {}}
                  edgeWeight="tx_count"
                  maxCounterparties={20}
                  onMaxCounterpartiesChange={() => {}}
                  graphDepth={1}
                  onDepthChange={() => {}}
                  txLimit={200}
                  onTxLimitChange={() => {}}
                  showCrossEdges={false}
                  onShowCrossEdgesChange={() => {}}
                  transactions={data.wallet2.transactions}
                  highlightNodeIds={sharedNodeArray}
                  highlightColor={SHARED_NODE_COLOR}
                  accentColor={WALLET2_ACCENT}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Shared counterparties */}
      {hasData && !isLoading && (
        <Card className="bg-card border-border p-4">
          <SharedCounterpartiesPanel
            counterparties={sharedCounterparties}
            addr1={address1}
            addr2={address2}
          />
        </Card>
      )}

      {/* Stats */}
      {hasData && !isLoading && (
        <Card className="bg-card border-border p-4">
          <ComparisonStatsPanel
            wallet1Data={data.wallet1}
            wallet2Data={data.wallet2}
            addr1={address1}
            addr2={address2}
          />
        </Card>
      )}
    </div>
  );
}
