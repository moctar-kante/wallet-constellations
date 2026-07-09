// ICP/USD price service — fetches from Coinbase with fallback
// Caches in memory for 5 minutes

interface PriceCache {
  price: number;
  fetchedAt: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchFromCoinbase(): Promise<number | null> {
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ICP-USD/spot", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { amount?: string } };
    const amount = json?.data?.amount;
    if (!amount) return null;
    const price = Number.parseFloat(amount);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

async function fetchFromIcpApi(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/ticker",
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      base_id?: string;
      target_id?: string;
      last_price?: number;
      ticker_id?: string;
    }>;
    if (!Array.isArray(data)) return null;
    const pair = data.find(
      (t) =>
        (t.ticker_id &&
          (t.ticker_id.includes("ICP") || t.ticker_id.includes("icp"))) ||
        (t.base_id && t.base_id === "ryjl3-tyaaa-aaaaa-aaaba-cai"),
    );
    if (pair?.last_price && Number.isFinite(pair.last_price)) {
      return pair.last_price;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchIcpUsdPrice(): Promise<number | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.price;
  }

  let price = await fetchFromCoinbase();
  if (price === null) {
    price = await fetchFromIcpApi();
  }

  if (price !== null) {
    cache = { price, fetchedAt: Date.now() };
  }

  return price;
}

/**
 * Format a USD amount with k/M suffixes and 3 decimals.
 * Examples: $1.234k, $1.234M, $0.500
 */
export function formatUsd(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(3)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(3)}k`;
  return `$${usd.toFixed(3)}`;
}
