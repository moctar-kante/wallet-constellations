import type { TimeRange, Transaction } from "../types";
import { principalToAccountIdentifier } from "./explorerService";

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

export type ActivityInterval = "hour" | "day" | "week";

/**
 * Compute the bucket key for a transaction timestamp at the chosen interval.
 * - hour: "YYYY-MM-DDTHH" (e.g. "2026-09-10T14")
 * - day:  "YYYY-MM-DD"   (e.g. "2026-09-10")
 * - week: ISO week key   (e.g. "2026-W37")
 */
function bucketKey(timestamp: string, interval: ActivityInterval): string {
  if (interval === "hour") return timestamp.slice(0, 13);
  if (interval === "day") return timestamp.slice(0, 10);

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10);
  // ISO 8601 week number: shift to the Thursday of the week, then count weeks
  // from the first Thursday of the year.
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function getDailyActivity(
  transactions: Transaction[],
  principal: string,
  interval: ActivityInterval = "day",
): Array<{
  date: string;
  txIn: number;
  txOut: number;
  volIn: number;
  volOut: number;
}> {
  const principalLower = principal.toLowerCase();
  // ICP transactions carry hex account identifiers (from principalToAccountIdentifier)
  // while ICRC transactions carry principal strings. Match against BOTH forms so
  // per-day counts are real regardless of which format a transaction uses.
  const accountIdLower = (
    principalToAccountIdentifier(principal) ?? ""
  ).toLowerCase();
  const byBucket = new Map<
    string,
    { txIn: number; txOut: number; volIn: number; volOut: number }
  >();

  for (const tx of transactions) {
    const key = bucketKey(tx.timestamp, interval);
    if (!byBucket.has(key)) {
      byBucket.set(key, { txIn: 0, txOut: 0, volIn: 0, volOut: 0 });
    }
    const entry = byBucket.get(key)!;
    const toLower = tx.to.toLowerCase();
    const fromLower = tx.from.toLowerCase();
    const isIn =
      toLower === principalLower ||
      (accountIdLower !== "" && toLower === accountIdLower);
    const isOut =
      fromLower === principalLower ||
      (accountIdLower !== "" && fromLower === accountIdLower);
    if (isIn) {
      entry.txIn += 1;
      entry.volIn += tx.amount;
    } else if (isOut) {
      entry.txOut += 1;
      entry.volOut += tx.amount;
    }
  }

  return [...byBucket.entries()]
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
