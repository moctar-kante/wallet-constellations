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
import { getDailyActivity } from "../services/filters";
import type { Transaction } from "../types";

// Raw hex values for recharts drawing context (allowed per design-system rules)
const GREEN = "#3FE08C";
const AMBER = "#F0B35A";
const GRID_COLOR = "#22324A";
const TEXT_COLOR = "#9FB0C8";

type ChartMode = "tx" | "volume";

interface ActivityChartProps {
  transactions: Transaction[];
  principal: string;
}

export function ActivityChart({ transactions, principal }: ActivityChartProps) {
  const [mode, setMode] = useState<ChartMode>("tx");

  const daily = getDailyActivity(transactions, principal);

  const chartData = daily.map((d) => ({
    date: d.date.slice(5), // MM-DD
    in: mode === "tx" ? d.txIn : Number.parseFloat(d.volIn.toFixed(4)),
    out: mode === "tx" ? d.txOut : Number.parseFloat(d.volOut.toFixed(4)),
  }));

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-2">
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
          Daily Tx Count
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
          Daily Volume
        </button>
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
                background: "#0E1626",
                border: "1px solid #22324A",
                borderRadius: "6px",
                fontSize: "11px",
                color: "#E9EEF7",
              }}
              labelStyle={{ color: TEXT_COLOR }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", color: TEXT_COLOR }} />
            <Line
              type="monotone"
              dataKey="in"
              name={mode === "tx" ? "Incoming Txs" : "Volume In (ICP)"}
              stroke={GREEN}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: GREEN }}
            />
            <Line
              type="monotone"
              dataKey="out"
              name={mode === "tx" ? "Outgoing Txs" : "Volume Out (ICP)"}
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
