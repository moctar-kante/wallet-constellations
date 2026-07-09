import type { TimeRange, Transaction } from "../types";

export function filterByTimeRange(
  transactions: Transaction[],
  range: TimeRange,
): Transaction[] {
  if (range === "all") return transactions;

  const now = Date.now();
  const msMap: Record<string, number> = {
    day: 1 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    "1mo": 30 * 24 * 60 * 60 * 1000,
    "3mo": 90 * 24 * 60 * 60 * 1000,
    "6mo": 180 * 24 * 60 * 60 * 1000,
    "1y": 365 * 24 * 60 * 60 * 1000,
  };
  const ms = msMap[range];
  if (!ms) return transactions;
  const cutoff = now - ms;

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

/**
 * Aggregate transactions involving a principal by week (last 8 weeks).
 * Returns 8 tx-count numbers, oldest→newest, suitable for a sparkline.
 */
export function getWeeklyActivity(
  transactions: Transaction[],
  principal: string,
): number[] {
  const principalLower = principal.toLowerCase();
  const now = Date.now();
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

  const buckets = Array.from({ length: 8 }, (_, i) => {
    const start = now - (7 - i) * MS_WEEK;
    return { start, end: start + MS_WEEK, txCount: 0 };
  });

  for (const tx of transactions) {
    const ts = new Date(tx.timestamp).getTime();
    if (Number.isNaN(ts)) continue;
    const involved =
      tx.from.toLowerCase() === principalLower ||
      tx.to.toLowerCase() === principalLower;
    if (!involved) continue;
    for (const bucket of buckets) {
      if (ts >= bucket.start && ts < bucket.end) {
        bucket.txCount += 1;
        break;
      }
    }
  }

  return buckets.map((b) => b.txCount);
}

/**
 * Compute net ICP flow for an address.
 * Positive = net receiver, negative = net sender.
 */
export function computeNetFlow(
  transactions: Transaction[],
  address: string,
): number {
  const addrLower = address.toLowerCase();
  let net = 0;
  for (const tx of transactions) {
    if (tx.token && tx.token !== "ICP") continue; // ICP only
    if (tx.to.toLowerCase() === addrLower) {
      net += tx.amount;
    } else if (tx.from.toLowerCase() === addrLower) {
      net -= tx.amount;
    }
  }
  return net;
}

/**
 * Detect if an address is a "whale" relative to all addresses in the graph.
 * Returns true if this address moved more total ICP than the 90th percentile.
 */
export function detectWhale(
  transactions: Transaction[],
  address: string,
  allAddresses: string[],
): boolean {
  if (allAddresses.length < 3) return false;

  const volumes = new Map<string, number>();
  for (const addr of allAddresses) {
    volumes.set(addr.toLowerCase(), 0);
  }

  for (const tx of transactions) {
    if (tx.token && tx.token !== "ICP") continue;
    const fromLower = tx.from.toLowerCase();
    const toLower = tx.to.toLowerCase();
    if (volumes.has(fromLower)) {
      volumes.set(fromLower, (volumes.get(fromLower) ?? 0) + tx.amount);
    }
    if (volumes.has(toLower)) {
      volumes.set(toLower, (volumes.get(toLower) ?? 0) + tx.amount);
    }
  }

  const myVolume = volumes.get(address.toLowerCase()) ?? 0;
  return myVolume > 10000;
}
