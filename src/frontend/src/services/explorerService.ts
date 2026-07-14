import { Principal } from "@dfinity/principal";
import type { backendInterface } from "../backend.d";
import type { ExplorerError, Transaction } from "../types";

const LEDGER_API_BASE = "https://ledger-api.internetcomputer.org";
// DFINITY official ICRC API — called directly from the browser. Replaces the
// broken IC Explorer proxy (open-api.icexplorer.io via backend canister).
// ICP transactions still come from the official ledger API via
// fetchWalletTransactions (unchanged). The DFINITY ICRC API is authoritative
// for ICRC token data.
const ICRC_API_BASE = "https://icrc-api.internetcomputer.org";

// ── Backend actor accessor (legacy no-op) ───────────────────────────────────
//
// ICRC fetching is now entirely frontend-only (direct browser fetch to
// icrc-api.internetcomputer.org). setBackendActor() is kept as a no-op stub
// so useWallet.ts and App.tsx — which still call it — do not break. The
// injected actor is accepted but never used for ICRC.

// Last error reason captured by the ICRC API reachability probe. Read by
// StatusPanel (via getLastIcExplorerError) to surface the actual reject reason
// next to the status dot. Reset to null on a successful probe.
let lastIcExplorerError: string | null = null;

/**
 * Returns the last error reason captured by checkIcExplorerReachable(), or
 * null if the last probe succeeded. The string is the raw reason: the caught
 * error message or HTTP status text from the DFINITY ICRC API.
 */
export function getLastIcExplorerError(): string | null {
  return lastIcExplorerError;
}

/**
 * Inject the authenticated backend actor (from useAuth). Kept for backward
 * compatibility — useWallet.ts and App.tsx call this. ICRC fetching is now
 * frontend-only, so this is a no-op that merely stores the actor without
 * using it. The signature is preserved so existing import lines do not break.
 */
export function setBackendActor(_actor: backendInterface | null): void {
  // No-op: ICRC fetching is frontend-only. Signature preserved for
  // backward compatibility with useWallet.ts and App.tsx callers.
}

export const DEFAULT_TX_LIMIT = 100;

function e8sToIcp(val: string | number | bigint): number {
  const n = typeof val === "bigint" ? Number(val) : Number(val);
  return n / 1e8;
}

function parseTimestamp(raw: string | number | null | undefined): string {
  if (!raw) return new Date().toISOString();
  if (typeof raw === "number") {
    const asMs =
      raw > 1e15 ? Math.floor(raw / 1e6) : raw > 1e12 ? raw : raw * 1000;
    return new Date(asMs).toISOString();
  }
  if (typeof raw === "string" && /^\d{18,19}$/.test(raw)) {
    return new Date(Math.floor(Number(raw) / 1e6)).toISOString();
  }
  return new Date(raw).toISOString();
}

// SHA-224 implementation (pure JS, no external deps)
function sha224(data: Uint8Array): Uint8Array {
  let h0 = 0xc1059ed8 | 0;
  let h1 = 0x367cd507 | 0;
  let h2 = 0x3070dd17 | 0;
  let h3 = 0xf70e5939 | 0;
  let h4 = 0xffc00b31 | 0;
  let h5 = 0x68581511 | 0;
  let h6 = 0x64f98fa7 | 0;
  let h7 = 0xbefa4fa4 | 0;

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = (msgLen + 9 + 63) & ~63;
  const msg = new Uint8Array(padLen);
  msg.set(data);
  msg[msgLen] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

  for (let i = 0; i < padLen; i += 64) {
    const w = new Int32Array(64);
    for (let j = 0; j < 16; j++) {
      w[j] = view.getInt32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 =
        rotr(w[j - 15] >>> 0, 7) ^
        rotr(w[j - 15] >>> 0, 18) ^
        ((w[j - 15] >>> 0) >>> 3);
      const s1 =
        rotr(w[j - 2] >>> 0, 17) ^
        rotr(w[j - 2] >>> 0, 19) ^
        ((w[j - 2] >>> 0) >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    // biome-ignore lint/style/useSingleVarDeclarator: SHA256 implementation requires compact multi-var declaration
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e >>> 0, 6) ^ rotr(e >>> 0, 11) ^ rotr(e >>> 0, 25);
      const ch = ((e & f) ^ (~e & g)) | 0;
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rotr(a >>> 0, 2) ^ rotr(a >>> 0, 13) ^ rotr(a >>> 0, 22);
      const maj = ((a & b) ^ (a & c) ^ (b & c)) | 0;
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const result = new Uint8Array(28);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0 >>> 0, false);
  rv.setUint32(4, h1 >>> 0, false);
  rv.setUint32(8, h2 >>> 0, false);
  rv.setUint32(12, h3 >>> 0, false);
  rv.setUint32(16, h4 >>> 0, false);
  rv.setUint32(20, h5 >>> 0, false);
  rv.setUint32(24, h6 >>> 0, false);
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function principalToAccountIdentifier(input: string): string | null {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  try {
    const principal = Principal.fromText(trimmed);
    const principalBytes = principal.toUint8Array();
    const domainSep = new TextEncoder().encode("\x0Aaccount-id");
    const subaccount = new Uint8Array(32);
    const msg = new Uint8Array(
      domainSep.length + principalBytes.length + subaccount.length,
    );
    msg.set(domainSep, 0);
    msg.set(principalBytes, domainSep.length);
    msg.set(subaccount, domainSep.length + principalBytes.length);
    const hash = sha224(msg);
    const checksum = crc32(hash);
    const checksumBytes = new Uint8Array(4);
    new DataView(checksumBytes.buffer).setUint32(0, checksum, false);
    const accountIdBytes = new Uint8Array(32);
    accountIdBytes.set(checksumBytes, 0);
    accountIdBytes.set(hash, 4);
    return Array.from(accountIdBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

// Convert a principal-format address to a hex account ID. Returns the original
// string if it's already a hex account ID or not a valid principal. Used to
// normalize ICRC from/to addresses so they merge into the same graph edges as
// ICP transactions (which use hex account identifiers).
function principalAddressToHex(addr: string): string {
  if (!addr || addr === "minting-account" || addr === "burn-address")
    return addr;
  // Already a 64-char hex account ID
  if (/^[0-9a-fA-F]{64}$/.test(addr.trim())) return addr.toLowerCase();
  // Try to convert principal to hex account ID
  const hex = principalToAccountIdentifier(addr);
  return hex ?? addr;
}

// Safely extract a principal string from a value that may be a plain string
// or an object like { owner: "principal-id", subaccount: [...] }. The ICRC
// API returns from/to owners in either shape depending on the ledger.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractOwner(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    return String(val.owner ?? val.address ?? "");
  }
  return String(val);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTransaction(raw: any): Transaction | null {
  try {
    if (
      raw?.from_account_identifier !== undefined ||
      raw?.to_account_identifier !== undefined
    ) {
      const amount = raw.amount ? e8sToIcp(raw.amount) : 0;
      return {
        timestamp: parseTimestamp(raw.created_at ?? raw.timestamp),
        from: String(raw.from_account_identifier ?? ""),
        to: String(raw.to_account_identifier ?? ""),
        amount,
        blockIndex: Number(
          raw.block_height ??
            raw.block_identifier?.index ??
            raw.block_index ??
            0,
        ),
      };
    }
    if (raw?.transaction?.operations) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops = raw.transaction.operations as any[];
      const txOps = ops.filter(
        (o) => o.type === "TRANSACTION" || o.type === "Transfer",
      );
      const feeOps = ops.filter((o) => o.type === "FEE" || o.type === "Fee");
      if (txOps.length >= 2) {
        const senderOp = txOps.find((o) =>
          String(o.amount?.value ?? "").startsWith("-"),
        );
        const receiverOp = txOps.find(
          (o) => !String(o.amount?.value ?? "").startsWith("-"),
        );
        if (senderOp && receiverOp) {
          const amountRaw = Math.abs(
            Number.parseFloat(receiverOp.amount?.value ?? "0"),
          );
          const decimals = receiverOp.amount?.currency?.decimals ?? 8;
          return {
            timestamp: parseTimestamp(raw.timestamp),
            from: senderOp.account?.address ?? "",
            to: receiverOp.account?.address ?? "",
            amount: amountRaw / 10 ** decimals,
            blockIndex: raw.block_identifier?.index ?? raw.block_index ?? 0,
          };
        }
      }
      const nonFeeOps = ops.filter(
        (o) => !feeOps.includes(o) && o.account?.address,
      );
      if (nonFeeOps.length >= 2) {
        const amountRaw = Math.abs(
          Number.parseFloat(nonFeeOps[0].amount?.value ?? "0"),
        );
        const decimals = nonFeeOps[0].amount?.currency?.decimals ?? 8;
        return {
          timestamp: parseTimestamp(raw.timestamp),
          from: nonFeeOps[0].account?.address ?? "",
          to: nonFeeOps[1].account?.address ?? "",
          amount: amountRaw / 10 ** decimals,
          blockIndex: raw.block_identifier?.index ?? raw.block_index ?? 0,
        };
      }
    }
    if (raw?.from && raw?.to) {
      let amount = 0;
      if (typeof raw.amount === "object" && raw.amount !== null) {
        amount = e8sToIcp(raw.amount.e8s ?? raw.amount.value ?? 0);
      } else if (
        typeof raw.amount === "number" ||
        typeof raw.amount === "string"
      ) {
        const numAmt = Number(raw.amount);
        amount = numAmt > 1000 ? e8sToIcp(numAmt) : numAmt;
      }
      return {
        timestamp: parseTimestamp(
          raw.timestamp ?? raw.created_at_time ?? raw.date,
        ),
        from: String(raw.from),
        to: String(raw.to),
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? raw.blockIndex ?? 0),
      };
    }
    const op = raw?.transaction?.operation ?? raw?.transaction?.operations?.[0];
    const transfer = op?.Transfer ?? op?.transfer ?? raw?.transaction?.transfer;
    if (transfer) {
      const amountVal =
        transfer.amount?.e8s ?? transfer.amount?.value ?? transfer.amount ?? 0;
      return {
        timestamp: parseTimestamp(
          raw?.transaction?.created_at_time?.timestamp_nanos ??
            raw?.created_at_time ??
            raw?.timestamp,
        ),
        from: String(
          transfer.from?.address ??
            transfer.from ??
            raw?.transaction?.from ??
            "",
        ),
        to: String(
          transfer.to?.address ?? transfer.to ?? raw?.transaction?.to ?? "",
        ),
        amount: e8sToIcp(amountVal),
        blockIndex: Number(raw?.id ?? raw?.block_index ?? 0),
      };
    }
  } catch {
    // ignore parse errors on individual records
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractTransactionArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.blocks)) return data.blocks;
  if (Array.isArray(data?.transactions)) return data.transactions;
  if (Array.isArray(data?.data?.transactions)) return data.data.transactions;
  if (Array.isArray(data?.data?.blocks)) return data.data.blocks;
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

export type FetchResult =
  | { ok: true; transactions: Transaction[]; accountIdentifier?: string }
  | { ok: false; error: ExplorerError };

export async function fetchWalletTransactions(
  principal: string,
  proxyUrl?: string,
  limit: number = DEFAULT_TX_LIMIT,
): Promise<FetchResult> {
  if (!principal || principal.trim() === "") {
    return { ok: false, error: "invalid" };
  }

  const accountId = principalToAccountIdentifier(principal.trim());
  if (!accountId) {
    return { ok: false, error: "invalid" };
  }

  // Cache lookup: reuse the shared txCache Map with a distinct 'walletTxs'
  // prefix so ICP-ledger responses are cached the same way fetchIcrcTransactions
  // caches ICRC responses (5-min TTL via CACHE_TTL_MS, non-empty results only).
  const wkey = cacheKey("walletTxs", principal.trim(), accountId);
  const cachedTxs = getCached(txCache, wkey);
  if (cachedTxs) {
    console.log(
      `[ICP] Tx fetch: ${cachedTxs.length} txs (cached) for ${principal.trim()}`,
    );
    return { ok: true, transactions: cachedTxs, accountIdentifier: accountId };
  }

  const base = proxyUrl ? proxyUrl.replace(/\/$/, "") : LEDGER_API_BASE;
  const url = `${base}/accounts/${encodeURIComponent(accountId)}/transactions?limit=${limit}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      err instanceof TypeError &&
      (msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("networkerror") ||
        msg.toLowerCase().includes("network request failed"))
    ) {
      return { ok: false, error: "cors" };
    }
    return { ok: false, error: "network" };
  }

  if (!response.ok) {
    return { ok: false, error: "http" };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: "parse" };
  }

  const rawList = extractTransactionArray(data);
  const transactions: Transaction[] = [];
  for (const raw of rawList) {
    const tx = normalizeTransaction(raw);
    if (tx) transactions.push(tx);
  }

  if (transactions.length === 0 && rawList.length > 0) {
    return { ok: false, error: "parse" };
  }

  // Cache non-empty results only — matches fetchIcrcTransactions behavior
  // (line 1207: never cache empty/failed responses, let next search retry fresh).
  if (transactions.length > 0) setCached(txCache, wkey, transactions);

  return { ok: true, transactions, accountIdentifier: accountId };
}

export async function checkExplorerReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${LEDGER_API_BASE}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return r.status < 500;
  } catch {
    try {
      const r2 = await fetch(LEDGER_API_BASE, {
        signal: AbortSignal.timeout(5000),
      });
      return r2.status < 500;
    } catch {
      return false;
    }
  }
}

/**
 * Reachability probe for the DFINITY ICRC API (icrc-api.internetcomputer.org).
 * Repurposed from the old IC Explorer proxy probe — now pings the official
 * ICRC ledgers endpoint with limit=1 to confirm the API is reachable and
 * returning valid JSON. Returns false and sets lastIcExplorerError on any
 * failure (network, HTTP, parse). StatusPanel reads getLastIcExplorerError()
 * to surface the reason next to the status dot.
 */
export async function checkIcExplorerReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${ICRC_API_BASE}/api/v1/ledgers?limit=1`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      lastIcExplorerError = `HTTP ${r.status} ${r.statusText}`;
      console.warn(
        `[ICRC] reachability probe failed: HTTP ${r.status} ${r.statusText}`,
      );
      return false;
    }
    const data = await r.json();
    // Confirm the response is shaped like a ledgers list (array or {data: [...]}).
    const list = extractTransactionArray(data);
    if (!Array.isArray(list)) {
      lastIcExplorerError = "unexpected response shape";
      console.warn(
        "[ICRC] reachability probe failed: unexpected response shape",
        data,
      );
      return false;
    }
    lastIcExplorerError = null;
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastIcExplorerError = msg;
    console.warn("[ICRC] reachability probe failed:", err);
    return false;
  }
}

export function testParser(): boolean {
  try {
    const sample = [
      {
        block_height: "1",
        from_account_identifier:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00",
        to_account_identifier:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00",
        amount: "100000000",
        created_at: 1700000000,
        transfer_type: "send",
      },
    ];
    for (const r of sample) {
      const tx = normalizeTransaction(r);
      if (!tx) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── ICRC multi-token support (DFINITY official ICRC API) ──────────────────────
//
// ICRC token data now comes directly from icrc-api.internetcomputer.org via
// browser fetch (no backend proxy). Two endpoints cover the full non-ICP feed:
//
//   GET /api/v1/ledgers?limit=100&offset=N  — full ledger registry (300+ tokens)
//   GET /api/v1/ledgers/{canisterId}/accounts/{accountId}/transactions
//                                            — per-ledger tx history
//
// ICP transactions still come from the official ledger API via
// fetchWalletTransactions (unchanged). The DFINITY ICRC API is authoritative
// for ICRC.

export interface IcrcTokenInfo {
  canisterId: string;
  symbol: string;
  decimals: number;
}

/** Per-fetch debug entry written to window.__ICRC_DEBUG when debug mode is on */
export interface IcrcFetchDebugEntry {
  symbol: string;
  canisterId: string;
  resultCount: number;
  addressFormat: "principal" | "hex" | "none";
  error?: string;
  httpStatus?: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL on token list + tx responses
const LEDGERS_PAGE_SIZE = 100; // API hard cap per page
const LEDGERS_MAX_PAGES = 20; // safety cap: 20 × 100 = 2000 ledgers
const TX_FETCH_BATCH_SIZE = 16; // process 16 ledgers at a time to balance throughput and rate limits
const TX_BATCH_DELAY_MS = 50; // short delay between batches (50ms)

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

// Address-keyed caches for token list + per-ledger transaction responses.
const tokenListCache = new Map<string, CacheEntry<IcrcTokenInfo[]>>();
const txCache = new Map<string, CacheEntry<Transaction[]>>();

function cacheKey(...parts: string[]): string {
  return parts.filter(Boolean).join("|").toLowerCase();
}

function getCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
): void {
  if (value === null || value === undefined) return;
  cache.set(key, { value, fetchedAt: Date.now() });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Parse token metadata from the ICRC API ledger response. The DFINITY
// /api/v1/ledgers and /api/v2/ledgers endpoints return icrc1_metadata as a
// PLAIN OBJECT mapping key -> string value, e.g.:
//   { icrc1_symbol: "CKBTC", icrc1_decimals: "8", icrc1_name: "ckBTC", ... }
// The per-ledger metadata endpoint instead returns an ARRAY of {key, val}
// pairs where val is a Candid variant ({ Text: "CKBTC" } / { Nat: "8" }).
// This parser handles BOTH shapes plus flat top-level fallbacks so the real
// symbol is resolved instead of UNKNOWN.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLedgerMetadata(item: any): {
  canisterId: string;
  symbol: string;
  decimals: number;
} {
  const canisterId = String(
    item.ledger_canister_id ?? item.canister_id ?? item.id ?? "",
  ).trim();

  let symbol = "";
  let decimals: number | null = null;

  // Unwrap a Candid variant value ({Text:"X"}, {Nat:"8"}, {text:...}) or
  // return the value as-is if it is already a primitive. Handles plain
  // strings, numbers, and the common variant wrappers of any casing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unwrap = (val: any): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "string" || typeof val === "number") return String(val);
    // Candid variant wrappers: { Text: "X" }, { text: "x" }, { value: ... }
    const wrapped =
      val.Text ?? val.text ?? val.value ?? val.Value ?? val.string ?? val.str;
    if (wrapped !== undefined) return String(wrapped);
    // Last resort: stringify and strip JSON noise.
    return String(val);
  };

  // Strip surrounding whitespace and matching quotes ("X" / 'X') so a value
  // like "\"CKBTC\"" or " CKBTC " normalizes to "CKBTC".
  const clean = (raw: string): string => {
    let s = String(raw ?? "").trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1).trim();
    }
    return s;
  };

  const meta: any = item.icrc1_metadata ?? item.metadata ?? item.meta;

  // Shape A — metadata is a PLAIN OBJECT (DFINITY /api/v1|v2/ledgers shape):
  //   { icrc1_symbol: "CKBTC", icrc1_decimals: "8", icrc1_name: "ckBTC" }
  // Keys may use the "icrc1:" colon form or the underscore form; values are
  // plain strings (or occasionally variant-wrapped).
  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    const symbolVal =
      meta.icrc1_symbol ?? meta["icrc1:symbol"] ?? meta.symbol ?? meta.Symbol;
    if (symbolVal !== undefined) symbol = clean(unwrap(symbolVal));

    const decVal =
      meta.icrc1_decimals ??
      meta["icrc1:decimals"] ??
      meta.decimals ??
      meta.Decimals;
    if (decVal !== undefined) {
      const parsed = Number(unwrap(decVal));
      if (!Number.isNaN(parsed)) decimals = parsed;
    }
  }

  // Shape B — metadata is an ARRAY of {key, val} pairs (per-ledger endpoint
  // shape). val may be a Candid variant ({Text:"X"}, {Nat:"8"}) OR a plain
  // string. Match the "icrc1:symbol" / "icrc1:decimals" keys case-insensitively
  // against the colon form, and also accept the underscore form.
  if (!symbol || decimals === null) {
    if (Array.isArray(meta)) {
      for (const entry of meta) {
        const key = String(entry?.key ?? "").toLowerCase();
        const val = entry?.val;
        if (!val) continue;
        if (
          (key === "icrc1:symbol" ||
            key === "icrc1_symbol" ||
            key === "symbol") &&
          !symbol
        ) {
          symbol = clean(unwrap(val));
        } else if (
          (key === "icrc1:decimals" ||
            key === "icrc1_decimals" ||
            key === "decimals") &&
          decimals === null
        ) {
          const parsed = Number(unwrap(val));
          if (!Number.isNaN(parsed)) decimals = parsed;
        }
      }
    }
  }

  // Shape C — flat top-level fallback fields on the ledger object itself.
  if (!symbol) {
    const flat =
      item.symbol ??
      item.token_symbol ??
      item.icrc1_symbol ??
      item.ticker ??
      item.name ??
      "";
    symbol = clean(String(flat));
  }
  if (decimals === null) {
    const d = Number(item.decimals ?? item.icrc1_decimals ?? 8);
    decimals = Number.isNaN(d) ? 8 : d;
  }

  // UNKNOWN only as an absolute last resort.
  if (!symbol) symbol = "UNKNOWN";

  return { canisterId, symbol, decimals };
}

/**
 * Fetch the full ICRC ledger registry from the DFINITY ICRC API, paginating
 * through ALL ledgers (300+) using limit=100 and offset. Does NOT use
 * sort_by=-block_height (unsupported parameter that caused prior failures).
 * Signature kept compatible: both params optional, returns IcrcTokenInfo[].
 * Callers (useWallet, comparisonService) pass the wallet identifier for
 * cache keying.
 */
export async function fetchIcrcTokenList(
  principal?: string,
  accountId?: string,
): Promise<IcrcTokenInfo[]> {
  const p = principal?.trim() || "";
  const a = accountId?.trim() || "";
  const key = cacheKey("tokenlist", p, a);

  const cached = getCached(tokenListCache, key);
  if (cached) {
    console.log(`[ICRC] Token list: ${cached.length} ledgers (cached)`);
    return cached;
  }

  const allTokens: IcrcTokenInfo[] = [];
  let offset = 0;
  let fetchError: string | null = null;

  for (let page = 0; page < LEDGERS_MAX_PAGES; page++) {
    const url = `${ICRC_API_BASE}/api/v1/ledgers?limit=${LEDGERS_PAGE_SIZE}&offset=${offset}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fetchError = `fetch error at offset ${offset}: ${msg}`;
      console.error(
        `[ICRC] /api/v1/ledgers fetch failed at offset ${offset}:`,
        err,
      );
      break;
    }

    if (!res.ok) {
      fetchError = `HTTP ${res.status} ${res.statusText} at offset ${offset}`;
      console.error(
        `[ICRC] /api/v1/ledgers returned HTTP ${res.status} ${res.statusText} at offset ${offset}`,
      );
      break;
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fetchError = `JSON parse error at offset ${offset}: ${msg}`;
      console.error(
        `[ICRC] /api/v1/ledgers JSON parse failed at offset ${offset}:`,
        err,
      );
      break;
    }

    const list = extractTransactionArray(data);
    if (!Array.isArray(list) || list.length === 0) {
      // No more ledgers — end of pagination.
      break;
    }

    for (const item of list) {
      const { canisterId, symbol, decimals } = parseLedgerMetadata(item);
      if (!canisterId) continue;
      allTokens.push({ canisterId, symbol, decimals });
    }

    // If the page returned fewer than the page size, we've reached the end.
    if (list.length < LEDGERS_PAGE_SIZE) break;
    offset += LEDGERS_PAGE_SIZE;
  }

  console.log(
    `[ICRC] Token list: ${allTokens.length} ledgers (fresh) for ${p || a}${fetchError ? ` (last error: ${fetchError})` : ""}`,
  );

  // Never cache empty/failed responses — let the next search retry fresh.
  if (allTokens.length > 0) setCached(tokenListCache, key, allTokens);
  return allTokens;
}

// Normalize a single ICRC transaction from the DFINITY API into the stable
// Transaction interface. Handles flat format ({ kind, amount, from_owner,
// to_owner, from_account, to_account, timestamp }) and nested format
// ({ transaction: { transfer/mint/burn, timestamp } }). Applies decimal
// division ONCE by 10^decimals (the API returns raw amounts). Converts
// from/to to hex account IDs so they merge into the same graph edges as ICP
// transactions. Tags the token field so graphBuilder identifies it as ICRC.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeIcrcTransaction(
  raw: any,
  decimals: number,
  symbol: string,
): Transaction | null {
  try {
    // Flat format: { index, kind, amount, from_owner, to_owner, from_account,
    // to_account, timestamp }. from_owner / to_owner may be a plain string OR
    // an object { owner: "...", subaccount: [...] }.
    if (raw.from_owner !== undefined || raw.to_owner !== undefined) {
      const kind = String(raw.kind ?? "");
      const amount = Number(raw.amount ?? 0) / 10 ** decimals;
      const blockIndex = Number(raw.index ?? raw.block_index ?? 0);
      const timestamp = parseTimestamp(raw.timestamp);

      if (kind === "mint") {
        return {
          timestamp,
          from: "minting-account",
          to: principalAddressToHex(
            extractOwner(raw.to_owner ?? raw.to_account),
          ),
          amount,
          blockIndex,
          token: symbol,
          decimals,
        };
      }
      if (kind === "burn") {
        return {
          timestamp,
          from: principalAddressToHex(
            extractOwner(raw.from_owner ?? raw.from_account),
          ),
          to: "burn-address",
          amount,
          blockIndex,
          token: symbol,
          decimals,
        };
      }
      // transfer (default)
      return {
        timestamp,
        from: principalAddressToHex(
          extractOwner(raw.from_owner ?? raw.from_account),
        ),
        to: principalAddressToHex(extractOwner(raw.to_owner ?? raw.to_account)),
        amount,
        blockIndex,
        token: symbol,
        decimals,
      };
    }

    // Nested format: { transaction: { transfer/mint/burn, timestamp } }
    const tx = raw?.transaction;
    if (!tx) return null;

    if (tx.transfer) {
      const from = principalAddressToHex(
        extractOwner(tx.transfer.from?.owner ?? tx.transfer.from),
      );
      const to = principalAddressToHex(
        extractOwner(tx.transfer.to?.owner ?? tx.transfer.to),
      );
      const amount = Number(tx.transfer.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(tx.timestamp ?? raw.timestamp),
        from,
        to,
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
        token: symbol,
        decimals,
      };
    }

    if (tx.mint) {
      const to = principalAddressToHex(
        extractOwner(tx.mint.to?.owner ?? tx.mint.to),
      );
      const amount = Number(tx.mint.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(tx.timestamp ?? raw.timestamp),
        from: "minting-account",
        to,
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
        token: symbol,
        decimals,
      };
    }

    if (tx.burn) {
      const from = principalAddressToHex(
        extractOwner(tx.burn.from?.owner ?? tx.burn.from),
      );
      const amount = Number(tx.burn.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(tx.timestamp ?? raw.timestamp),
        from,
        to: "burn-address",
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
        token: symbol,
        decimals,
      };
    }

    if (raw.from !== undefined && raw.to !== undefined) {
      const from = principalAddressToHex(
        extractOwner(raw.from?.owner ?? raw.from),
      );
      const to = principalAddressToHex(extractOwner(raw.to?.owner ?? raw.to));
      const amount = Number(raw.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(raw.timestamp ?? raw.created_at),
        from,
        to,
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
        token: symbol,
        decimals,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ICRC] normalizeIcrcTransaction failed for ${symbol}: ${msg}`,
    );
    return null;
  }
  return null;
}

// Fetch transactions for a single ledger/account pair. The accountId is
// placed into the URL in the form indicated by addressFormat:
//   - "principal": accountId is the principal TEXT (e.g. "yc3yb-oqaaa-aaaag-qc4ga-cai")
//   - "hex":       accountId is the 64-char hex account identifier
// The DFINITY ICRC API accepts either form as the {accountId} path segment.
// Returns { txs, httpStatus, error }. Never throws — errors are captured and
// surfaced via the returned error string so the caller can log them to console
// AND the diagnostics panel.
async function fetchLedgerTxs(
  canisterId: string,
  accountId: string,
  limit: number,
  symbol: string,
  decimals: number,
  addressFormat: "principal" | "hex",
): Promise<{
  txs: Transaction[];
  httpStatus: number | null;
  error: string | null;
}> {
  // The accountId is already in the requested form; embed it directly. The
  // addressFormat only governs which form the caller supplied and is echoed
  // in log lines for diagnostics.
  const urlAccountId = accountId;
  const url = `${ICRC_API_BASE}/api/v1/ledgers/${encodeURIComponent(canisterId)}/accounts/${encodeURIComponent(urlAccountId)}/transactions?limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = `HTTP ${res.status} ${res.statusText}`;
      console.warn(
        `[ICRC] ${symbol} (${canisterId.slice(0, 8)}) ${addressFormat} account ${accountId.slice(0, 12)}: ${err}`,
      );
      return { txs: [], httpStatus: res.status, error: err };
    }
    const data = await res.json();
    const rawList = extractTransactionArray(data);
    if (rawList.length === 0) {
      console.log(
        `[ICRC] ${symbol} (${canisterId.slice(0, 8)}) ${addressFormat} account ${accountId.slice(0, 12)}: 0 txs`,
      );
      return { txs: [], httpStatus: res.status, error: null };
    }
    const txs: Transaction[] = [];
    for (const raw of rawList) {
      const tx = normalizeIcrcTransaction(raw, decimals, symbol);
      if (tx) txs.push(tx);
    }
    console.log(
      `[ICRC] ${symbol} (${canisterId.slice(0, 8)}) ${addressFormat} account ${accountId.slice(0, 12)}: ${txs.length} txs`,
    );
    return { txs, httpStatus: res.status, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ICRC] ${symbol} (${canisterId.slice(0, 8)}) ${addressFormat} account ${accountId.slice(0, 12)} fetch error: ${msg}`,
      err,
    );
    return { txs: [], httpStatus: null, error: msg };
  }
}

/**
 * Fetch a wallet's full ICRC transaction history from the DFINITY ICRC API.
 *
 * Iterates the FULL ledger registry from fetchIcrcTokenList (all 300+ ICRC
 * tokens) in batches of TX_FETCH_BATCH_SIZE with TX_BATCH_DELAY_MS between
 * batches. For each ledger, tries BOTH account formats: the principal TEXT
 * first (the DFINITY ICRC API resolves principal-text account ids directly),
 * and if that returns no results, the hex account identifier as a genuine
 * fallback. The two attempts use genuinely different address forms. Every
 * fetch error is logged to console with full context (ledger, account format,
 * error) AND surfaced in the Shift+D diagnostics panel via debugEntries.
 *
 * Signature kept compatible with useWallet.ts and comparisonService.ts:
 *   fetchIcrcTransactions(address, limit?, debugEntries?, originalPrincipal?)
 * The first arg is the wallet address (principal text or hex account id).
 * When it is a principal text, it is used as the primary fetch; when it is a
 * hex account id, originalPrincipal (if provided) is used as the primary
 * fetch and the hex id is the fallback.
 */
export async function fetchIcrcTransactions(
  address: string,
  limit: number = DEFAULT_TX_LIMIT,
  debugEntries?: IcrcFetchDebugEntry[],
  originalPrincipal?: string,
): Promise<Transaction[]> {
  const addr = address.trim();
  if (!addr) return [];

  // Resolve principal vs hex account id for the request.
  const isHex = /^[0-9a-fA-F]{64}$/.test(addr);
  const principal = isHex ? originalPrincipal?.trim() || "" : addr;
  const hexAccountId = isHex
    ? addr
    : (principalToAccountIdentifier(addr) ?? "");

  const key = cacheKey("txs", principal, hexAccountId);
  const cached = getCached(txCache, key);
  if (cached) {
    console.log(`[ICRC] Tx fetch: ${cached.length} txs (cached)`);
    if (debugEntries) {
      // Re-derive per-token counts from cached txs for the debug panel.
      const byToken = new Map<string, { count: number; canisterId: string }>();
      for (const tx of cached) {
        const sym = tx.token || "ICP";
        const entry = byToken.get(sym);
        if (entry) entry.count += 1;
        else byToken.set(sym, { count: 1, canisterId: "" });
      }
      for (const [sym, info] of byToken) {
        debugEntries.push({
          symbol: sym,
          canisterId: info.canisterId || sym,
          resultCount: info.count,
          addressFormat: "none",
        });
      }
    }
    return cached;
  }

  // 1) Fetch the full ledger registry (all 300+ ICRC tokens).
  const tokenList = await fetchIcrcTokenList(principal, hexAccountId);
  if (tokenList.length === 0) {
    console.warn(
      `[ICRC] No ledgers available from token list for ${principal || hexAccountId}`,
    );
    if (debugEntries) {
      debugEntries.push({
        symbol: "ICRC",
        canisterId: principal || hexAccountId || "",
        resultCount: 0,
        addressFormat: "none",
        error: "no ledgers available from token list",
      });
    }
    return [];
  }

  console.log(
    `[ICRC] Querying ${tokenList.length} ledgers for ${principal || hexAccountId} (batch size ${TX_FETCH_BATCH_SIZE})`,
  );

  const allTxs: Transaction[] = [];
  let totalQueried = 0;
  let totalWithResults = 0;
  let totalErrored = 0;

  // 2) Batch through the ledgers, TX_FETCH_BATCH_SIZE at a time, with
  //    short delays between batches to avoid rate limiting.
  for (let i = 0; i < tokenList.length; i += TX_FETCH_BATCH_SIZE) {
    const batch = tokenList.slice(i, i + TX_FETCH_BATCH_SIZE);

    // Process each ledger in the batch in parallel.
    const batchResults = await Promise.all(
      batch.map(async (token) => {
        totalQueried += 1;
        const { canisterId, symbol, decimals } = token;

        // Try BOTH account formats, principal text FIRST (the DFINITY ICRC
        // API resolves principal-text account ids directly), then fall back
        // to the hex account identifier only if the principal attempt
        // returned no results. The two attempts use genuinely different
        // address forms so the fallback is a real second try, not a no-op.
        let result = {
          txs: [] as Transaction[],
          httpStatus: null as number | null,
          error: null as string | null,
        };
        let usedFormat: "principal" | "hex" = "principal";

        // Primary attempt: principal text (e.g. "yc3yb-oqaaa-aaaag-qc4ga-cai").
        if (principal) {
          result = await fetchLedgerTxs(
            canisterId,
            principal,
            limit,
            symbol,
            decimals,
            "principal",
          );
        }

        // Fallback: if the principal attempt returned no results AND a hex
        // account id is available, retry with the hex account identifier. The
        // two address forms (principal text vs 64-char hex) are genuinely
        // different strings, so this is a real alternate attempt — NOT a no-op.
        // The previous guard compared principalDerivedHex !== hexAccountId, but
        // hexAccountId is itself derived from the same principal, so the two
        // were always identical and the fallback never ran. Removed that guard.
        if (result.txs.length === 0 && hexAccountId) {
          const altResult = await fetchLedgerTxs(
            canisterId,
            hexAccountId,
            limit,
            symbol,
            decimals,
            "hex",
          );
          if (altResult.txs.length > 0) {
            result = altResult;
            usedFormat = "hex";
          } else if (altResult.error && !result.error) {
            // Preserve the error from the alternate attempt if the
            // principal attempt had no error (e.g. principal returned 0
            // txs cleanly but hex attempt errored).
            result.error = altResult.error;
            result.httpStatus = altResult.httpStatus;
          }
        }

        // Populate the debug entry for this token with full context.
        if (debugEntries) {
          debugEntries.push({
            symbol,
            canisterId,
            resultCount: result.txs.length,
            addressFormat: result.txs.length > 0 ? usedFormat : "none",
            error: result.error ?? undefined,
            httpStatus: result.httpStatus ?? undefined,
          });
        }

        if (result.txs.length > 0) totalWithResults += 1;
        if (result.error) totalErrored += 1;

        return result.txs;
      }),
    );

    for (const txs of batchResults) {
      for (const tx of txs) allTxs.push(tx);
    }

    // Short delay between batches to avoid rate limiting (skip after the
    // last batch).
    if (i + TX_FETCH_BATCH_SIZE < tokenList.length) {
      await sleep(TX_BATCH_DELAY_MS);
    }
  }

  console.log(
    `[ICRC] Tx fetch complete: ${allTxs.length} txs across ${totalWithResults}/${totalQueried} ledgers (${totalErrored} errored) for ${principal || hexAccountId}`,
  );

  // Summary debug entry showing totals: queried, with results, errored.
  if (debugEntries) {
    debugEntries.push({
      symbol: "__SUMMARY__",
      canisterId: principal || hexAccountId || "",
      resultCount: allTxs.length,
      addressFormat: "none",
      error:
        totalErrored > 0
          ? `${totalQueried} queried, ${totalWithResults} with results, ${totalErrored} errored`
          : undefined,
    });
  }

  // Never cache empty/failed responses — let the next search retry fresh.
  if (allTxs.length > 0) setCached(txCache, key, allTxs);
  return allTxs;
}
