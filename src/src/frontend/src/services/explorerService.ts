import { Principal } from "@dfinity/principal";
import type { ExplorerError, Transaction } from "../types";

const LEDGER_API_BASE = "https://ledger-api.internetcomputer.org";
const ICRC_API_BASE = "https://icrc-api.internetcomputer.org";

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

// Safely extract a principal string from a value that may be a string or
// an object like { owner: "principal-id", subaccount: [...] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractOwner(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    return String(val.owner ?? val.address ?? "");
  }
  return String(val);
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

// Convert a principal-format address to hex account ID.
// Returns the original string if it's already a hex account ID or not a valid principal.
function principalAddressToHex(addr: string): string {
  if (!addr || addr === "minting-account" || addr === "burn-address")
    return addr;
  // Already a 64-char hex account ID
  if (/^[0-9a-fA-F]{64}$/.test(addr.trim())) return addr.toLowerCase();
  // Try to convert principal to hex account ID
  const hex = principalToAccountIdentifier(addr);
  return hex ?? addr;
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
  const url = `${base}/accounts/${encodeURIComponent(accountId)}/transactions?limit=${limit}&sort_by=-block_height`;

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

// ── ICRC multi-token support ──────────────────────────────────────────────────

export interface IcrcTokenInfo {
  canisterId: string;
  symbol: string;
  decimals: number;
}

let icrcTokenListCache: IcrcTokenInfo[] | null = null;

async function fetchIcrcTokenListOnce(): Promise<IcrcTokenInfo[]> {
  const res = await fetch(`${ICRC_API_BASE}/api/v1/ledgers?limit=200`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  // API returns { data: [...], total_ledgers: N }
  const list = Array.isArray(data) ? data : (data?.data ?? data?.ledgers ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = (Array.isArray(list) ? list : [])
    .map((item: any) => ({
      canisterId: item.ledger_canister_id ?? item.canister_id ?? item.id ?? "",
      symbol:
        item.icrc1_metadata?.icrc1_symbol ??
        item.symbol ??
        item.token_symbol ??
        "UNKNOWN",
      decimals: Number(
        item.icrc1_metadata?.icrc1_decimals ?? item.decimals ?? 8,
      ),
    }))
    .filter((t: IcrcTokenInfo) => t.canisterId);
  return parsed;
}

export async function fetchIcrcTokenList(): Promise<IcrcTokenInfo[]> {
  // Return from cache only if non-empty
  if (icrcTokenListCache && icrcTokenListCache.length > 0)
    return icrcTokenListCache;
  try {
    let parsed = await fetchIcrcTokenListOnce();
    // Retry once if the first attempt returned empty (transient failure)
    if (parsed.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      parsed = await fetchIcrcTokenListOnce();
    }
    if (parsed.length > 0) {
      icrcTokenListCache = parsed;
    }
    return parsed;
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeIcrcTransaction(
  raw: any,
  decimals: number,
): Transaction | null {
  try {
    // Handle flat format: { index, kind, amount, from_owner, to_owner, from_account, to_account, timestamp }
    // from_owner / to_owner may be a plain string OR an object { owner: "...", subaccount: [...] }
    if (raw.from_owner !== undefined || raw.to_owner !== undefined) {
      const kind = String(raw.kind ?? "");
      if (kind === "mint") {
        return {
          timestamp: parseTimestamp(raw.timestamp),
          from: "minting-account",
          to: extractOwner(raw.to_owner ?? raw.to_account),
          amount: Number(raw.amount ?? 0) / 10 ** decimals,
          blockIndex: Number(raw.index ?? raw.block_index ?? 0),
        };
      }
      if (kind === "burn") {
        return {
          timestamp: parseTimestamp(raw.timestamp),
          from: extractOwner(raw.from_owner ?? raw.from_account),
          to: "burn-address",
          amount: Number(raw.amount ?? 0) / 10 ** decimals,
          blockIndex: Number(raw.index ?? raw.block_index ?? 0),
        };
      }
      // transfer (default)
      return {
        timestamp: parseTimestamp(raw.timestamp),
        from: extractOwner(raw.from_owner ?? raw.from_account),
        to: extractOwner(raw.to_owner ?? raw.to_account),
        amount: Number(raw.amount ?? 0) / 10 ** decimals,
        blockIndex: Number(raw.index ?? raw.block_index ?? 0),
      };
    }

    // Handle nested format: { transaction: { transfer/mint/burn, timestamp } }
    const tx = raw?.transaction;
    if (!tx) return null;

    if (tx.transfer) {
      const from = extractOwner(tx.transfer.from?.owner ?? tx.transfer.from);
      const to = extractOwner(tx.transfer.to?.owner ?? tx.transfer.to);
      const amount = Number(tx.transfer.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(tx.timestamp ?? raw.timestamp),
        from,
        to,
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
      };
    }

    if (tx.mint) {
      const to = extractOwner(tx.mint.to?.owner ?? tx.mint.to);
      const amount = Number(tx.mint.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(tx.timestamp ?? raw.timestamp),
        from: "minting-account",
        to,
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
      };
    }

    if (tx.burn) {
      const from = extractOwner(tx.burn.from?.owner ?? tx.burn.from);
      const amount = Number(tx.burn.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(tx.timestamp ?? raw.timestamp),
        from,
        to: "burn-address",
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
      };
    }

    if (raw.from !== undefined && raw.to !== undefined) {
      const from = extractOwner(raw.from?.owner ?? raw.from);
      const to = extractOwner(raw.to?.owner ?? raw.to);
      const amount = Number(raw.amount ?? 0) / 10 ** decimals;
      return {
        timestamp: parseTimestamp(raw.timestamp ?? raw.created_at),
        from,
        to,
        amount,
        blockIndex: Number(raw.id ?? raw.block_index ?? 0),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function fetchIcrcTransactions(
  canisterId: string,
  accountId: string,
  limit = 100,
  symbol = "UNKNOWN",
  decimals = 8,
): Promise<Transaction[]> {
  async function tryFetch(acctId: string): Promise<Transaction[]> {
    try {
      const url = `${ICRC_API_BASE}/api/v1/ledgers/${encodeURIComponent(canisterId)}/accounts/${encodeURIComponent(acctId)}/transactions?limit=${limit}&sort_by=-block_height`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const rawList = extractTransactionArray(data);
      if (rawList.length === 0) return [];
      const txs: Transaction[] = [];
      for (const raw of rawList) {
        const tx = normalizeIcrcTransaction(raw, decimals);
        if (tx) {
          tx.token = symbol;
          tx.decimals = decimals;
          tx.from = principalAddressToHex(tx.from);
          tx.to = principalAddressToHex(tx.to);
          txs.push(tx);
        }
      }
      return txs;
    } catch {
      return [];
    }
  }

  // Try with accountId as-is first
  const result = await tryFetch(accountId);
  if (result.length > 0) return result;

  // If no results and accountId looks like a principal (not a 64-char hex),
  // retry with the derived hex account identifier
  const trimmed = accountId.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const hexId = principalToAccountIdentifier(trimmed);
    if (hexId && hexId !== trimmed) {
      const hexResult = await tryFetch(hexId);
      if (hexResult.length > 0) return hexResult;
    }
  }

  return result;
}
