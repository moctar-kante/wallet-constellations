import type { TimeRange, Transaction } from "../types";

export function filterByTimeRange(
  transactions: Transaction[],
  range: TimeRange,
): Transaction[] {
  if (range === "all") return transactions;

  const now = Date.now();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  return transactions.filter((tx) => {
    const ts = new Date(tx.timestamp).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });
}

export function getDailyActivity(
  transactions: Transaction[],
  principal: string,
): Array<{
  date: string;
  txIn: number;
  txOut: number;
  volIn: number;
  volOut: number;
}> {
  const principalLower = principal.toLowerCase();
  const byDay = new Map<
    string,
    { txIn: number; txOut: number; volIn: number; volOut: number }
  >();

  for (const tx of transactions) {
    const day = tx.timestamp.slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, { txIn: 0, txOut: 0, volIn: 0, volOut: 0 });
    }
    const entry = byDay.get(day)!;
    if (tx.to.toLowerCase() === principalLower) {
      entry.txIn += 1;
      entry.volIn += tx.amount;
    } else if (tx.from.toLowerCase() === principalLower) {
      entry.txOut += 1;
      entry.volOut += tx.amount;
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}
