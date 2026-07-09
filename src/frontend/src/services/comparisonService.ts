import type { ComparisonData, SharedCounterparty, WalletData } from "../types";
import {
  DEFAULT_TX_LIMIT,
  fetchIcrcTransactions,
  fetchWalletTransactions,
  principalToAccountIdentifier,
} from "./explorerService";
import { buildGraph, computeSummary } from "./graphBuilder";

async function fetchAllTransactionsForAddress(
  address: string,
  limit = DEFAULT_TX_LIMIT,
  originalPrincipal?: string,
) {
  // ICP ledger fetch first — unchanged.
  const icpResult = await fetchWalletTransactions(address, undefined, limit);
  const icpTransactions = icpResult.ok ? icpResult.transactions : [];
  const accountIdentifier =
    icpResult.ok && icpResult.accountIdentifier
      ? icpResult.accountIdentifier
      : (principalToAccountIdentifier(address.trim()) ?? address.trim());

  // IC Explorer's fetchIcrcTransactions hits /api/tx/list once for the whole
  // wallet (cross-token, paginated). No token-list fetch or per-token iteration
  // is needed. Pass the wallet address (principal or account id), not a
  // canister id. Thread originalPrincipal through so hex account-id wallets
  // resolve their principal for the request body, matching the depth-0 path in
  // useWallet.ts.
  let allTransactions = [...icpTransactions];
  try {
    const icrcTransactions = await fetchIcrcTransactions(
      address.trim(),
      limit,
      undefined,
      originalPrincipal,
    );
    if (icrcTransactions.length > 0) {
      allTransactions = allTransactions.concat(icrcTransactions);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ICRC] comparisonService fetchAllTransactionsForAddress failed for ${address.slice(0, 12)}: ${msg}`,
    );
    // ICRC fetch failure is non-fatal; proceed with ICP-only data
  }

  return { transactions: allTransactions, accountIdentifier };
}

export async function compareWallets(
  address1: string,
  address2: string,
  limit = DEFAULT_TX_LIMIT,
): Promise<{ comparison: ComparisonData; shared: SharedCounterparty[] }> {
  const [data1, data2] = await Promise.all([
    fetchAllTransactionsForAddress(address1, limit, address1),
    fetchAllTransactionsForAddress(address2, limit, address2),
  ]);

  const graph1 = buildGraph(
    address1.trim(),
    data1.accountIdentifier,
    data1.transactions,
  );
  const graph2 = buildGraph(
    address2.trim(),
    data2.accountIdentifier,
    data2.transactions,
  );

  const summary1 = computeSummary(data1.accountIdentifier, data1.transactions);
  const summary2 = computeSummary(data2.accountIdentifier, data2.transactions);

  const walletData1: WalletData = {
    summary: summary1,
    transactions: data1.transactions,
    graph: graph1,
  };
  const walletData2: WalletData = {
    summary: summary2,
    transactions: data2.transactions,
    graph: graph2,
  };

  const nodeIds1 = new Set(graph1.nodes.map((n) => n.id.toLowerCase()));
  const nodeIds2 = new Set(graph2.nodes.map((n) => n.id.toLowerCase()));

  const sharedNodeIds = new Set<string>();
  for (const id of nodeIds1) {
    if (nodeIds2.has(id)) sharedNodeIds.add(id);
  }

  const shared = computeSharedCounterparties(walletData1, walletData2);

  return {
    comparison: { wallet1: walletData1, wallet2: walletData2, sharedNodeIds },
    shared,
  };
}

export function computeSharedCounterparties(
  walletData1: WalletData,
  walletData2: WalletData,
): SharedCounterparty[] {
  const nodeMap1 = new Map(
    walletData1.graph.nodes.map((n) => [n.id.toLowerCase(), n]),
  );
  const nodeMap2 = new Map(
    walletData2.graph.nodes.map((n) => [n.id.toLowerCase(), n]),
  );

  // Build token sets per node from edges in each graph
  function getTokensForNode(
    nodeIdLower: string,
    walletData: WalletData,
  ): string[] {
    const tokens = new Set<string>();
    for (const edge of walletData.graph.edges) {
      const srcLower = edge.source.toLowerCase();
      const tgtLower = edge.target.toLowerCase();
      if (srcLower === nodeIdLower || tgtLower === nodeIdLower) {
        for (const token of Object.keys(edge.inAmountByToken ?? {})) {
          tokens.add(token);
        }
        for (const token of Object.keys(edge.outAmountByToken ?? {})) {
          tokens.add(token);
        }
      }
    }
    return [...tokens];
  }

  const result: SharedCounterparty[] = [];

  for (const [id, node1] of nodeMap1) {
    const node2 = nodeMap2.get(id);
    if (!node2) continue;
    // Skip center nodes (the wallets themselves)
    if (node1.isCenter || node2.isCenter) continue;

    const tokensWallet1 = getTokensForNode(id, walletData1);
    const tokensWallet2 = getTokensForNode(id, walletData2);

    result.push({
      address: node1.id,
      txCountWallet1: node1.txCount,
      txCountWallet2: node2.txCount,
      tokensWallet1,
      tokensWallet2,
    });
  }

  // Sort by combined tx count descending
  return result.sort(
    (a, b) =>
      b.txCountWallet1 +
      b.txCountWallet2 -
      (a.txCountWallet1 + a.txCountWallet2),
  );
}
