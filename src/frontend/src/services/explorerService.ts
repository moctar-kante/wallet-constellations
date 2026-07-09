import { Principal } from "@dfinity/principal";
import { ExternalBlob, createActor } from "../backend";
import type { backendInterface } from "../backend.d";
import type { ExplorerError, Transaction } from "../types";

const LEDGER_API_BASE = "https://ledger-api.internetcomputer.org";
// IC Explorer aggregated API — single source for non-ICP token data.
// Replaces the brute-force per-ledger ICRC registry pipeline.
// Browser fetch to this host is CORS-blocked, so all IC Explorer calls are
// proxied through the backend canister (icexplorer_portfolio / icexplorer_txlist).

// ── Backend actor accessor ───────────────────────────────────────────────────
//
// explorerService is a plain module (not a hook), so it cannot call useAuth().
// The IC Explorer proxy methods (icexplorer_portfolio / icexplorer_txlist) are
// public canister methods that work with an anonymous agent, so we lazily build
// an anonymous actor using the SAME createActor factory exported from
// @/backend (no second factory). The React layer may override this with the
// authenticated actor via setBackendActor() so logged-in users route proxy
// calls through their identity.
const BACKEND_CANISTER_ID =
  (import.meta as { env?: Record<string, string> }).env?.CANISTER_ID_BACKEND ??
  "aaaaa-aa";

function noopUpload(_file: ExternalBlob): Promise<Uint8Array> {
  return Promise.resolve(new Uint8Array());
}
function noopDownload(_file: Uint8Array): Promise<ExternalBlob> {
  return Promise.resolve(ExternalBlob.fromURL(""));
}

let injectedActor: backendInterface | null = null;
let anonymousActor: backendInterface | null = null;

function getBackendActor(): backendInterface | null {
  if (injectedActor) return injectedActor;
  if (!anonymousActor) {
    try {
      anonymousActor = createActor(
        BACKEND_CANISTER_ID,
        noopUpload,
        noopDownload,
      );
    } catch (err) {
      console.warn(
        "[IC Explorer] Failed to build anonymous backend actor:",
        err,
      );
      return null;
    }
  }
  return anonymousActor;
}

/**
 * Inject the authenticated backend actor (from useAuth) so IC Explorer proxy
 * calls route through the user's identity when logged in. When not called, or
 * called with null, the service falls back to an anonymous actor for the
 * public proxy methods.
 */
export function setBackendActor(actor: backendInterface | null): void {
  injectedActor = actor;
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
 * Reachability probe for the IC Explorer proxy (via the backend canister).
 * Issues a lightweight portfolio call for a well-known test address and
 * considers the proxy reachable if the backend actor resolves and returns a
 * parseable response (regardless of success code — we only need to confirm the
 * round-trip works). Returns false if no actor is available or the call throws.
 */
export async function checkIcExplorerReachable(): Promise<boolean> {
  const actor = getBackendActor();
  if (!actor) return false;
  try {
    // NNS Governance canister — a stable, always-existent address that IC
    // Explorer indexes. We only care that the proxy round-trips, not the
    // portfolio contents.
    const raw = await actor.icexplorer_portfolio("rrkah-fqaaa-aaaaa-aaaaq-cai");
    if (!raw) return false;
    JSON.parse(raw); // throws on non-JSON
    return true;
  } catch (err) {
    console.warn("[IC Explorer] reachability probe failed:", err);
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

// ── IC Explorer multi-token support ───────────────────────────────────────────
//
// The brute-force "query all 300+ ledgers" pipeline has been replaced with IC
// Explorer's aggregated API (https://open-api.icexplorer.io). Two endpoints
// cover the entire non-ICP token feed in ONE call each:
//
//   POST /api/holder/user  — wallet's full token portfolio (holdings)
//   POST /api/tx/list      — full cross-token transaction history (paginated)
//
// ICP transactions still come from the official ledger API via
// fetchWalletTransactions (unchanged). IC Explorer is authoritative for ICRC.

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

const IC_EXPLORER_SUCCESS_CODE = 600;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL on portfolio + tx responses
const TX_MAX_PAGES = 5; // cap pagination at 5 pages × size to bound latency
const TX_PAGE_SIZE = 100;

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

// Address-keyed caches for portfolio + transaction responses.
const portfolioCache = new Map<string, CacheEntry<IcrcTokenInfo[]>>();
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

// Build the request body for IC Explorer endpoints. The API accepts principal,
// accountId, or accountTextual — we pass whichever identifiers we have so it
// can resolve the wallet regardless of input format.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildIcExplorerBody(
  principal: string | undefined,
  accountId: string | undefined,
  page: number,
  size: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { page, size, isDesc: true };
  if (principal) body.principal = principal;
  if (accountId) body.accountId = accountId;
  if (extra) Object.assign(body, extra);
  return body;
}

// POST helper for IC Explorer. Proxied through the backend canister to bypass
// browser CORS — the backend exposes icexplorer_portfolio (POST /api/holder/user)
// and icexplorer_txlist (POST /api/tx/list), each returning the raw IC Explorer
// JSON body as a string. Returns the parsed JSON `data` payload on statusCode
// 600, or null on any other status / fetch failure. Never throws — callers fall
// back to empty results so the graph still renders ICP-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postIcExplorer<T = any>(
  path: string,
  body: Record<string, unknown>,
): Promise<{
  data: T | null;
  httpStatus: number | null;
  error: string | null;
}> {
  const actor = getBackendActor();
  if (!actor) {
    console.warn(`[IC Explorer] ${path} no backend actor available`);
    return { data: null, httpStatus: null, error: "no backend actor" };
  }

  try {
    let rawBody: string;
    if (path === "/api/holder/user") {
      // Portfolio endpoint: backend takes the address string and rebuilds the
      // request body server-side. Pass the principal/accountId we have so the
      // backend can resolve the wallet.
      const address = String(body.principal ?? body.accountId ?? "");
      rawBody = await actor.icexplorer_portfolio(address);
    } else if (path === "/api/tx/list") {
      // Tx-list endpoint: backend takes the full JSON request body as a string.
      rawBody = await actor.icexplorer_txlist(JSON.stringify(body));
    } else {
      console.warn(`[IC Explorer] unsupported proxied path: ${path}`);
      return {
        data: null,
        httpStatus: null,
        error: `unsupported path ${path}`,
      };
    }

    const json = JSON.parse(rawBody);
    if (json?.statusCode !== IC_EXPLORER_SUCCESS_CODE) {
      console.warn(
        `[IC Explorer] ${path} non-success statusCode: ${json?.statusCode}`,
      );
      return {
        data: null,
        httpStatus: json?.statusCode ?? null,
        error: `statusCode ${json?.statusCode}`,
      };
    }
    return {
      data: (json?.data ?? null) as T,
      httpStatus: json.statusCode,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[IC Explorer] ${path} proxy error: ${msg}`);
    return {
      data: null,
      httpStatus: null,
      error: `Proxy error: ${msg}`,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface HolderUserItem {
  ledgerId: string;
  symbol: string;
  amount: string | number;
  tokenDecimal: number;
  valueUSD?: number;
  owner?: string;
  subaccount?: unknown;
  accountId?: string;
  alias?: string;
  snapshotTime?: string | number;
  totalSupply?: string | number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface HolderUserData {
  list?: HolderUserItem[];
}

/**
 * Fetch a wallet's full token portfolio from IC Explorer's /api/holder/user in
 * a single call. Returns the holdings normalized to IcrcTokenInfo[]. Replaces
 * the old brute-force pagination of /api/v1/ledgers.
 *
 * Signature kept compatible: both params optional, returns IcrcTokenInfo[].
 * Callers (useWallet, comparisonService) now pass the wallet identifier.
 */
export async function fetchIcrcTokenList(
  principal?: string,
  accountId?: string,
): Promise<IcrcTokenInfo[]> {
  const p = principal?.trim() || "";
  const a = accountId?.trim() || "";
  if (!p && !a) return [];

  const key = cacheKey(p, a);
  const cached = getCached(portfolioCache, key);
  if (cached) {
    console.log(`[IC Explorer] Portfolio: ${cached.length} tokens (cached)`);
    return cached;
  }

  const body = buildIcExplorerBody(p || undefined, a || undefined, 1, 100);
  const { data, error } = await postIcExplorer<HolderUserData>(
    "/api/holder/user",
    body,
  );

  if (!data || !Array.isArray(data.list)) {
    // Surface the labeled error (CORS / network / HTTP / parse) on the console
    // so it's visible alongside the Shift+D panel. fetchIcrcTokenList has no
    // debugEntries param, so the console is the only channel here.
    console.warn(
      `[IC Explorer] /api/holder/user returned no list for ${p || a}${error ? ` — ${error}` : ""}`,
    );
    return [];
  }

  const tokens: IcrcTokenInfo[] = [];
  for (const item of data.list) {
    const canisterId = String(item.ledgerId ?? "").trim();
    const symbol = String(item.symbol ?? "").trim();
    const decimals =
      typeof item.tokenDecimal === "number"
        ? item.tokenDecimal
        : Number(item.tokenDecimal ?? 8);
    if (!canisterId || !symbol || Number.isNaN(decimals)) continue;
    tokens.push({ canisterId, symbol, decimals });
  }

  console.log(
    `[IC Explorer] Portfolio: ${tokens.length} tokens (fresh) for ${p || a}`,
  );
  // Never cache empty/failed responses — let the next search retry fresh.
  if (tokens.length > 0) setCached(portfolioCache, key, tokens);
  return tokens;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TxListItem {
  category?: string;
  op?: string;
  fromOwner?: string;
  fromAccountId?: string;
  fromAccountTextual?: string;
  toOwner?: string;
  toAccountId?: string;
  toAccountTextual?: string;
  token0LedgerId?: string;
  token0Amount?: string | number;
  token0Decimal?: number;
  token0Symbol?: string;
  token0TxTime?: string | number;
  token0TxIndex?: number;
  token0TxHash?: string;
  token1LedgerId?: string;
  token1Amount?: string | number;
  token1Decimal?: number;
  token1Symbol?: string;
  token1TxTime?: string | number;
  token1TxIndex?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TxListData {
  pageNum?: number;
  pageSize?: number;
  size?: number;
  pages?: number;
  total?: number;
  list?: TxListItem[];
}

// Map a single IC Explorer tx-list item to the stable Transaction interface.
// timestamp = token0TxTime (ms epoch), from = fromOwner||fromAccountId,
// to = toOwner||toAccountId, amount = token0Amount, blockIndex = token0TxIndex,
// token = token0Symbol||'ICP', decimals = token0Decimal.
function normalizeIcExplorerTx(raw: TxListItem): Transaction | null {
  try {
    const timestamp = parseTimestamp(raw.token0TxTime);
    const from = String(
      raw.fromOwner || raw.fromAccountId || raw.fromAccountTextual || "",
    );
    const to = String(
      raw.toOwner || raw.toAccountId || raw.toAccountTextual || "",
    );
    if (!from && !to) return null;

    const decimals =
      typeof raw.token0Decimal === "number"
        ? raw.token0Decimal
        : Number(raw.token0Decimal ?? 8);
    // IC Explorer API returns token0Amount already in human-readable form.
    // Do NOT divide again by 10^decimals — that produces ~2.6e-19 (effectively zero).
    const amountRaw = Number(raw.token0Amount ?? 0);
    const amount = Number.isNaN(amountRaw) ? 0 : amountRaw;
    const blockIndex = Number(raw.token0TxIndex ?? 0);
    const token = String(raw.token0Symbol || "ICP").trim() || "ICP";
    const canisterId = String(raw.token0LedgerId ?? "").trim();
    // Token-specific phantom identifiers so mint/burn nodes don't all collapse
    // into one misleading node. Prefer symbol, fall back to canister id.
    const phantomTag = token !== "ICP" ? token : canisterId;
    const mintId = phantomTag ? `mint:${phantomTag}` : "minting-account";
    const burnId = phantomTag ? `burn:${phantomTag}` : "burn-address";

    return {
      timestamp,
      from: from || mintId,
      to: to || burnId,
      amount,
      blockIndex: Number.isNaN(blockIndex) ? 0 : blockIndex,
      token,
      decimals: Number.isNaN(decimals) ? 8 : decimals,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[IC Explorer] normalizeIcExplorerTx failed: ${msg}`);
    return null;
  }
}

/**
 * Fetch a wallet's full cross-token transaction history (ICP + ICRC) from IC
 * Explorer's /api/tx/list in a single paginated call. Replaces the old
 * per-ledger fetchIcrcTransactions loop.
 *
 * Signature changed to be wallet-scoped: the first arg is now the wallet
 * address (principal or hex account id), not a canister id. Optional limit
 * caps the total txs fetched (paginated up to TX_MAX_PAGES). debugEntries, if
 * provided, is populated with one entry per token symbol seen.
 */
export async function fetchIcrcTransactions(
  address: string,
  limit: number = DEFAULT_TX_LIMIT,
  debugEntries?: IcrcFetchDebugEntry[],
  originalPrincipal?: string,
): Promise<Transaction[]> {
  const addr = address.trim();
  if (!addr) return [];

  // Resolve principal vs hex account id for the request body.
  const isHex = /^[0-9a-fA-F]{64}$/.test(addr);
  const principal = isHex ? originalPrincipal?.trim() || "" : addr;
  const accountId = isHex ? addr : (principalToAccountIdentifier(addr) ?? "");

  const key = cacheKey(principal, accountId);
  const cached = getCached(txCache, key);
  if (cached) {
    console.log(`[IC Explorer] Tx list: ${cached.length} txs (cached)`);
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
          httpStatus: IC_EXPLORER_SUCCESS_CODE,
        });
      }
    }
    return cached;
  }

  const size = Math.min(limit, TX_PAGE_SIZE) || TX_PAGE_SIZE;
  const maxPages = Math.min(TX_MAX_PAGES, Math.max(1, Math.ceil(limit / size)));
  const allTxs: Transaction[] = [];
  const perTokenCount = new Map<string, number>();
  const perTokenLedger = new Map<string, string>();
  let httpStatus: number | null = null;
  let fetchError: string | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const body = buildIcExplorerBody(
      principal || undefined,
      accountId || undefined,
      page,
      size,
    );
    const {
      data,
      httpStatus: status,
      error,
    } = await postIcExplorer<TxListData>("/api/tx/list", body);
    if (status !== null) httpStatus = status;
    if (error) fetchError = error;
    if (!data || !Array.isArray(data.list)) break;

    for (const raw of data.list) {
      const tx = normalizeIcExplorerTx(raw);
      if (!tx) continue;
      allTxs.push(tx);
      const sym = tx.token || "ICP";
      perTokenCount.set(sym, (perTokenCount.get(sym) ?? 0) + 1);
      const ledgerId = String(raw.token0LedgerId ?? "");
      if (ledgerId && !perTokenLedger.has(sym))
        perTokenLedger.set(sym, ledgerId);
    }

    const pages = data.pages ?? 1;
    if (page >= pages) break;
    if (data.list.length < size) break;
  }

  console.log(
    `[IC Explorer] Tx list: ${allTxs.length} txs across ${perTokenCount.size} tokens for ${principal || accountId}${fetchError ? ` (last error: ${fetchError})` : ""}`,
  );

  if (debugEntries) {
    for (const [sym, count] of perTokenCount) {
      debugEntries.push({
        symbol: sym,
        canisterId: perTokenLedger.get(sym) || sym,
        resultCount: count,
        addressFormat: "none",
        httpStatus: httpStatus ?? undefined,
        // Surface the last fetch error on every token row so the Shift+D panel
        // shows it even when some txs were fetched before the failure.
        error: fetchError ?? undefined,
      });
    }
    // If the entire fetch failed (no tokens seen), still emit one debug row so
    // the diagnostics panel surfaces the error (CORS / network / HTTP / parse).
    if (perTokenCount.size === 0 && fetchError) {
      debugEntries.push({
        symbol: "ICRC",
        canisterId: principal || accountId || "",
        resultCount: 0,
        addressFormat: "none",
        httpStatus: httpStatus ?? undefined,
        error: fetchError,
      });
    }
  }

  // Never cache empty/failed responses — let the next search retry fresh.
  if (allTxs.length > 0) setCached(txCache, key, allTxs);
  return allTxs;
}
