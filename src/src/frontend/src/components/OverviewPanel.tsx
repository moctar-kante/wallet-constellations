import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { getTopCounterparties } from "../services/graphBuilder";
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
}

export function OverviewPanel({
  principal,
  walletData,
  onNavigate,
}: OverviewPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(principal).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const topCounterparties = walletData
    ? getTopCounterparties(principal, walletData.transactions)
    : [];

  const activityScore = walletData
    ? Math.min(100, (walletData.summary.totalTx / 100) * 100)
    : 0;

  return (
    <aside className="flex flex-col gap-3 w-full">
      {/* Wallet Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Wallet Info
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {principal ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-foreground truncate flex-1">
                {shortenId(principal)}
              </span>
              <button
                type="button"
                data-ocid="wallet.button"
                onClick={handleCopy}
                className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors"
                title="Copy principal"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-neon-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
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
