import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import type { WalletData } from "../types";
import { ActivityChart } from "./ActivityChart";

// Raw hex for chart contexts (allowed per design system)
const NEON_BLUE = "#4AA8FF";
const NEON_AMBER = "#FFB300";

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(3)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(3)}k`;
  return n.toFixed(3);
}

interface TokenVolumeEntry {
  token: string;
  volume: number;
  inAmount: number;
  outAmount: number;
}

function buildTokenPortfolio(walletData: WalletData): TokenVolumeEntry[] {
  const map = new Map<
    string,
    { volume: number; inAmount: number; outAmount: number }
  >();
  for (const edge of walletData.graph.edges) {
    for (const [token, amt] of Object.entries(edge.inAmountByToken ?? {})) {
      const prev = map.get(token) ?? { volume: 0, inAmount: 0, outAmount: 0 };
      map.set(token, {
        volume: prev.volume + amt,
        inAmount: prev.inAmount + amt,
        outAmount: prev.outAmount,
      });
    }
    for (const [token, amt] of Object.entries(edge.outAmountByToken ?? {})) {
      const prev = map.get(token) ?? { volume: 0, inAmount: 0, outAmount: 0 };
      map.set(token, {
        volume: prev.volume + amt,
        inAmount: prev.inAmount,
        outAmount: prev.outAmount + amt,
      });
    }
  }
  return [...map.entries()]
    .map(([token, v]) => ({ token, ...v }))
    .sort((a, b) => b.volume - a.volume);
}

interface WalletStatCardProps {
  walletData: WalletData;
  address: string;
  label: string;
  accentColor: string;
  otherTokens?: string[];
}

function WalletStatCard({
  walletData,
  address,
  label,
  accentColor,
  otherTokens = [],
}: WalletStatCardProps) {
  const { summary } = walletData;
  const portfolio = useMemo(
    () => buildTokenPortfolio(walletData),
    [walletData],
  );

  const shortAddr =
    address.length > 16
      ? `${address.slice(0, 8)}…${address.slice(-6)}`
      : address;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-3 h-3 rounded-full shrink-0"
          style={{ background: accentColor }}
        />
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span
          className="font-mono text-[10px] text-muted-foreground truncate"
          title={address}
        >
          {shortAddr}
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/40 rounded-lg px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground mb-0.5">Txs</div>
          <div className="text-sm font-bold text-foreground tabular-nums">
            {summary.totalTx}
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground mb-0.5">ICP In</div>
          <div className="text-xs font-bold text-green-400 tabular-nums">
            {fmt(summary.totalIn)}
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground mb-0.5">
            ICP Out
          </div>
          <div className="text-xs font-bold text-orange-400 tabular-nums">
            {fmt(summary.totalOut)}
          </div>
        </div>
      </div>

      {/* Token portfolio */}
      {portfolio.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">
            Token Activity
          </div>
          <div className="flex flex-wrap gap-1">
            {portfolio.slice(0, 10).map((entry) => {
              const isShared = otherTokens.includes(entry.token);
              return (
                <Badge
                  key={entry.token}
                  variant="outline"
                  className={`text-[10px] h-5 border-0 gap-1 ${
                    isShared
                      ? "bg-[#00FF88]/15 text-[#00FF88]"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                  title={`${entry.token}: ${fmt(entry.volume)} total`}
                >
                  {isShared && (
                    <span className="text-[8px] font-bold leading-none">★</span>
                  )}
                  {entry.token}
                  <span className="opacity-60 text-[9px]">
                    {fmt(entry.volume)}
                  </span>
                </Badge>
              );
            })}
            {portfolio.length > 10 && (
              <span className="text-[10px] text-muted-foreground/60 self-center">
                +{portfolio.length - 10} more
              </span>
            )}
          </div>
          {otherTokens.length > 0 && (
            <div className="text-[9px] text-[#00FF88]/70 mt-1">
              ★ tokens shared with the other wallet
            </div>
          )}
        </div>
      )}

      {/* Activity timeline */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">
          Activity Timeline
        </div>
        <ActivityChart
          transactions={walletData.transactions}
          principal={address}
        />
      </div>
    </div>
  );
}

interface ComparisonStatsPanelProps {
  wallet1Data: WalletData;
  wallet2Data: WalletData;
  addr1: string;
  addr2: string;
}

export function ComparisonStatsPanel({
  wallet1Data,
  wallet2Data,
  addr1,
  addr2,
}: ComparisonStatsPanelProps) {
  const tokens1 = useMemo(
    () => buildTokenPortfolio(wallet1Data).map((e) => e.token),
    [wallet1Data],
  );
  const tokens2 = useMemo(
    () => buildTokenPortfolio(wallet2Data).map((e) => e.token),
    [wallet2Data],
  );

  const sharedTokens = useMemo(
    () => tokens1.filter((t) => tokens2.includes(t)),
    [tokens1, tokens2],
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-neon-blue" />
        <h3 className="text-sm font-semibold text-foreground">
          Wallet Statistics
        </h3>
        {sharedTokens.length > 0 && (
          <span className="text-[11px] text-[#00FF88]/80">
            {sharedTokens.length} token{sharedTokens.length !== 1 ? "s" : ""} in
            common
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/60 border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Wallet 1
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <WalletStatCard
              walletData={wallet1Data}
              address={addr1}
              label="Wallet 1"
              accentColor={NEON_BLUE}
              otherTokens={tokens2}
            />
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Wallet 2
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <WalletStatCard
              walletData={wallet2Data}
              address={addr2}
              label="Wallet 2"
              accentColor={NEON_AMBER}
              otherTokens={tokens1}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
