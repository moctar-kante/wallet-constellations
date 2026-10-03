import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type ActivityInterval, getDailyActivity } from "../services/filters";
import type { Transaction } from "../types";

// Theme-aware chart colors — read from the semantic CSS variables in index.css
// (:root dark vs .light) so the chart switches together with the page theme.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

// Accent line colors — read from the semantic CSS variables so they follow the
// theme system (dark vs light) like the rest of the chart tokens.
const GREEN = cssVar("--chart-in");
const AMBER = cssVar("--chart-out");
const GRID_COLOR = cssVar("--chart-grid");
const TEXT_COLOR = cssVar("--chart-text");

type ChartMode = "tx" | "volume";

const INTERVALS: Array<{ value: ActivityInterval; label: string }> = [
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
];

// Chain-key BTC-pegged tokens (e.g. ckBTC, ckTESTBTC) are displayed in
// satoshis (integer units) rather than decimal BTC.
function isChainKeyBtc(token: string): boolean {
  return /btc/i.test(token);
}

// The BTC/sats selector should appear whenever a chain-key BTC token is present
// in the selected transaction set — not only when it happens to be the dominant
// token by volume — so a wallet holding any ckBTC gets the unit toggle.
function hasChainKeyBtc(transactions: Transaction[]): boolean {
  return transactions.some((tx) => isChainKeyBtc(tx.token ?? "ICP"));
}

// Tokens that actually appear in the transaction set, ordered by transaction
// count (descending) so the first entry is the natural default selection.
function tokenOptions(
  transactions: Transaction[],
): Array<{ token: string; count: number }> {
  const counts = new Map<string, number>();
  for (const tx of transactions) {
    const token = tx.token ?? "ICP";
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
}

// Human-readable x-axis label for a bucket key at the chosen interval:
// hour -> "MM-DD HH:00", day -> "MM-DD", week -> "W37".
function formatBucketLabel(date: string, interval: ActivityInterval): string {
  if (interval === "hour") {
    return `${date.slice(5, 10)} ${date.slice(11, 13)}:00`;
  }
  if (interval === "week") {
    return date.slice(5); // "YYYY-W37" -> "W37"
  }
  return date.slice(5); // "YYYY-MM-DD" -> "MM-DD"
}

interface ActivityChartProps {
  transactions: Transaction[];
  principal: string;
  btcUnit: "btc" | "sats";
  onBtcUnitChange: (u: "btc" | "sats") => void;
}

export function ActivityChart({
  transactions,
  principal,
  btcUnit,
  onBtcUnitChange,
}: ActivityChartProps) {
  const [mode, setMode] = useState<ChartMode>("tx");
  const [interval, setInterval] = useState<ActivityInterval>("day");

  const tokens = tokenOptions(transactions);
  const defaultToken = tokens[0]?.token ?? "ICP";
  const [selectedToken, setSelectedToken] = useState<string>(defaultToken);
  // Fall back to the default when the current selection is no longer present
  // in the transaction set (e.g. the wallet data changed).
  const activeToken = tokens.some((t) => t.token === selectedToken)
    ? selectedToken
    : defaultToken;

  const daily = getDailyActivity(
    transactions,
    principal,
    interval,
    activeToken,
  );
  const isBtc = isChainKeyBtc(activeToken);
  const showBtcToggle = hasChainKeyBtc(transactions);

  const chartData = daily.map((d) => ({
    date: formatBucketLabel(d.date, interval),
    in:
      mode === "tx"
        ? d.txIn
        : isBtc && btcUnit === "sats"
          ? Math.round(d.volIn * 100_000_000)
          : d.volIn,
    out:
      mode === "tx"
        ? d.txOut
        : isBtc && btcUnit === "sats"
          ? Math.round(d.volOut * 100_000_000)
          : d.volOut,
  }));

  const volumeUnitLabel = isBtc
    ? btcUnit === "sats"
      ? "sats"
      : "BTC"
    : activeToken;

  return (
    <div className="space-y-3">
      {/* Mode + interval toggles */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          data-ocid="wallet.toggle"
          onClick={() => setMode("tx")}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            mode === "tx"
              ? "bg-neon-blue/20 border-neon-blue/50 text-neon-blue"
              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Tx Count
        </button>
        <button
          type="button"
          data-ocid="wallet.toggle"
          onClick={() => setMode("volume")}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            mode === "volume"
              ? "bg-neon-amber/20 border-neon-amber/50 text-neon-amber"
              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Volume
        </button>

        <div
          className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
          data-ocid="wallet.interval_toggle"
        >
          {INTERVALS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              data-ocid="wallet.interval_toggle"
              onClick={() => setInterval(value)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                interval === value
                  ? "bg-neon-blue/20 text-neon-blue"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          data-ocid="wallet.token_select"
          value={activeToken}
          onChange={(e) => setSelectedToken(e.target.value)}
          aria-label="Token"
          className="text-xs px-2 py-1 rounded border border-border bg-muted/50 text-foreground transition-colors focus:outline-none focus:border-neon-blue/50"
        >
          {tokens.map(({ token }) => (
            <option key={token} value={token}>
              {token}
            </option>
          ))}
        </select>

        {mode === "volume" && showBtcToggle && (
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5 ml-auto">
            <button
              type="button"
              data-ocid="wallet.btc_unit_toggle"
              onClick={() => onBtcUnitChange("sats")}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                btcUnit === "sats"
                  ? "bg-neon-blue/20 text-neon-blue"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              sats
            </button>
            <button
              type="button"
              data-ocid="wallet.btc_unit_toggle"
              onClick={() => onBtcUnitChange("btc")}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                btcUnit === "btc"
                  ? "bg-neon-blue/20 text-neon-blue"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              btc
            </button>
          </div>
        )}
      </div>

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
          No chart data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, left: -16, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis
              dataKey="date"
              tick={{ fill: TEXT_COLOR, fontSize: 10 }}
              axisLine={{ stroke: GRID_COLOR }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: TEXT_COLOR, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: cssVar("--chart-tooltip-bg"),
                border: `1px solid ${cssVar("--chart-tooltip-border")}`,
                borderRadius: "6px",
                fontSize: "11px",
                color: cssVar("--chart-tooltip-text"),
              }}
              labelStyle={{ color: TEXT_COLOR }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", color: TEXT_COLOR }} />
            <Line
              type="monotone"
              dataKey="in"
              name={
                mode === "tx"
                  ? "Incoming Txs"
                  : `Volume In (${volumeUnitLabel})`
              }
              stroke={GREEN}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: GREEN }}
            />
            <Line
              type="monotone"
              dataKey="out"
              name={
                mode === "tx"
                  ? "Outgoing Txs"
                  : `Volume Out (${volumeUnitLabel})`
              }
              stroke={AMBER}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: AMBER }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
