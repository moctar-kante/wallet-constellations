import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getTopCounterparties } from "../services/graphBuilder";
import { getSnsParticipation } from "../services/identityService";
import { fetchIcpUsdPrice } from "../services/priceService";
import type { TimeRange } from "../types";
import type { WalletData } from "../types";

function shortenId(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatIcp(val: number) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  return val.toFixed(4);
}

interface OverviewPanelProps {
  principal: string;
  walletData: WalletData | null;
  onNavigate: (p: string) => void;
  timeRange?: TimeRange;
  onTimeRangeChange?: (r: TimeRange) => void;
}

function formatWalletAge(
  firstTxDate: Date,
): { age: string; since: string } | null {
  const now = new Date();
  const diffMs = now.getTime() - firstTxDate.getTime();

  // Guard: reject epoch-zero, future timestamps, or sub-second diffs
  if (diffMs <= 0) return null;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30.44);
  const diffYears = Math.floor(diffDays / 365.25);

  // If we can't produce a meaningful age, bail out
  if (diffDays === 0 && diffMonths === 0 && diffYears === 0) return null;

  let age: string;
  if (diffYears >= 1) {
    const remainMonths = Math.floor((diffDays - diffYears * 365.25) / 30.44);
    age =
      remainMonths > 0
        ? `${diffYears}y ${remainMonths}mo`
        : `${diffYears} year${diffYears > 1 ? "s" : ""}`;
  } else if (diffMonths >= 1) {
    age = `${diffMonths} month${diffMonths > 1 ? "s" : ""}`;
  } else {
    age = `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  }

  const since = firstTxDate.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  return { age, since };
}

export function OverviewPanel({
  principal,
  walletData,
  onNavigate,
  timeRange,
  onTimeRangeChange,
}: OverviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const [icpPrice, setIcpPrice] = useState<number | null>(null);

  // Fetch ICP price for display
  useEffect(() => {
    let cancelled = false;
    fetchIcpUsdPrice().then((p) => {
      if (!cancelled && p !== null) setIcpPrice(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(principal).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
    toast.success("Address copied!", { duration: 2000 });
  };

  // Wallet age — always computed from the FULL unfiltered transaction list.
  // walletData.allTransactions holds raw txs regardless of the current time filter.
  // Never fall back to walletData.transactions (filtered) — use empty array instead.
  const allTxsForAge = walletData?.allTransactions ?? [];

  const walletAge = useMemo(() => {
    if (!allTxsForAge.length) return null;
    let earliest = Number.POSITIVE_INFINITY;
    for (const tx of allTxsForAge) {
      const ts = new Date(tx.timestamp).getTime();
      // Skip NaN, epoch-zero (1970-01-01), and clearly bogus timestamps
      if (!Number.isNaN(ts) && ts > 0 && ts < earliest) earliest = ts;
    }
    if (!Number.isFinite(earliest) || earliest <= 0) return null;
    return formatWalletAge(new Date(earliest));
  }, [allTxsForAge]);

  // Whether wallet is old enough for 1y option (>= 365 days old)
  const walletIsOlderThanYear = useMemo(() => {
    if (!allTxsForAge.length) return false;
    let earliest = Number.POSITIVE_INFINITY;
    for (const tx of allTxsForAge) {
      const ts = new Date(tx.timestamp).getTime();
      if (!Number.isNaN(ts) && ts < earliest) earliest = ts;
    }
    if (!Number.isFinite(earliest)) return false;
    return Date.now() - earliest >= 365 * 24 * 60 * 60 * 1000;
  }, [allTxsForAge]);

  const topCounterparties = walletData
    ? getTopCounterparties(principal, walletData.transactions)
    : [];

  const activityScore = walletData
    ? Math.min(100, (walletData.summary.totalTx / 100) * 100)
    : 0;

  // SNS participation — derived from transactions
  const snsParticipation =
    walletData && walletData.transactions.length > 0
      ? getSnsParticipation(principal, walletData.transactions)
      : [];

  const timeRangeLabels: Record<TimeRange, string> = {
    all: "All time",
    day: "Day",
    week: "Week",
    "1mo": "1 month",
    "3mo": "3 months",
    "6mo": "6 months",
    "1y": "1 year",
  };

  return (
    <aside className="flex flex-col gap-3 w-full">
      {/* Wallet Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Wallet Info
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {principal ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-foreground truncate flex-1">
                  {shortenId(principal)}
                </span>
                <button
                  type="button"
                  data-ocid="wallet.copy_address"
                  onClick={handleCopy}
                  className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors"
                  title={copied ? "Copied!" : "Copy address"}
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-neon-green" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
              {/* ICP/USD price */}
              {icpPrice !== null && (
                <p className="text-[10px] text-muted-foreground/70">
                  1 ICP ={" "}
                  <span className="text-neon-amber font-medium">
                    ${icpPrice.toFixed(2)}
                  </span>
                </p>
              )}
              {/* Wallet age */}
              {walletAge && (
                <div className="pt-1 border-t border-border/40 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Wallet age
                    </span>
                    <span className="text-[10px] font-medium text-foreground">
                      {walletAge.age}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Since
                    </span>
                    <span className="text-[10px] text-muted-foreground/80">
                      {walletAge.since}
                    </span>
                  </div>
                </div>
              )}
              {/* Time range filter */}
              {onTimeRangeChange && timeRange && (
                <div className="pt-1 border-t border-border/40">
                  <div className="text-[10px] text-muted-foreground mb-1.5">
                    Time filter
                  </div>
                  <Select
                    value={timeRange}
                    onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
                  >
                    <SelectTrigger
                      className="h-7 text-xs bg-muted/40 border-border/60 text-foreground w-full"
                      data-ocid="wallet.time_range_select"
                    >
                      <SelectValue>{timeRangeLabels[timeRange]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="day">Day (24h)</SelectItem>
                      <SelectItem value="week">Week (7d)</SelectItem>
                      <SelectItem value="1mo">1 month</SelectItem>
                      <SelectItem value="3mo">3 months</SelectItem>
                      <SelectItem value="6mo">6 months</SelectItem>
                      {walletIsOlderThanYear && (
                        <SelectItem value="1y">1 year</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              No wallet loaded
            </span>
          )}
        </CardContent>
      </Card>

      {/* Transaction Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Transaction Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total Txs</span>
            <span className="text-sm font-bold text-foreground">
              {walletData?.summary.totalTx ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft className="h-3 w-3 text-neon-green" />
              <span className="text-xs text-muted-foreground">Total In</span>
            </div>
            <span className="text-sm font-bold text-neon-green">
              {walletData ? formatIcp(walletData.summary.totalIn) : "—"} ICP
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3 w-3 text-neon-red" />
              <span className="text-xs text-muted-foreground">Total Out</span>
            </div>
            <span className="text-sm font-bold text-neon-red">
              {walletData ? formatIcp(walletData.summary.totalOut) : "—"} ICP
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-neon-blue" />
              <span className="text-xs text-muted-foreground">
                Counterparties
              </span>
            </div>
            <span className="text-sm font-bold text-foreground">
              {walletData?.summary.counterpartyCount ?? 0}
            </span>
          </div>

          {/* SNS DAO participation */}
          {snsParticipation.length > 0 && (
            <div className="pt-1 border-t border-border/50">
              <div className="flex items-start gap-1.5">
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                  DAOs:
                </span>
                <span className="text-xs text-neon-green font-medium leading-snug">
                  {snsParticipation.join(", ")}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Counterparties */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top Counterparties
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {topCounterparties.length === 0 ? (
            <span className="text-xs text-muted-foreground">No data</span>
          ) : (
            <ol className="space-y-2">
              {topCounterparties.map((cp, i) => (
                <li
                  key={cp.address}
                  data-ocid={`wallet.item.${i + 1}`}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs text-muted-foreground w-4 text-right">
                    {i + 1}.
                  </span>
                  <button
                    type="button"
                    data-ocid="wallet.link"
                    onClick={() => onNavigate(cp.address)}
                    className="font-mono text-xs text-neon-blue hover:text-neon-blue/70 truncate flex-1 text-left transition-colors"
                    title={cp.address}
                  >
                    {shortenId(cp.address)}
                  </button>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {cp.txCount} txs
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Activity Score */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-neon-amber" />
            Activity Score
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <Progress value={activityScore} className="h-2 bg-muted" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Low</span>
            <span className="text-neon-amber font-medium">
              {activityScore.toFixed(0)}%
            </span>
            <span>High</span>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
