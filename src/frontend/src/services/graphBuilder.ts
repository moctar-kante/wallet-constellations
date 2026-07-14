import type {
  GraphEdge,
  GraphNode,
  Transaction,
  WalletGraph,
  WalletSummary,
} from "../types";
import { computeNetFlow, detectWhale, getWeeklyActivity } from "./filters";
import {
  getNodeIdentity,
  getSnsParticipation,
  toCanonicalId,
} from "./identityService";

type EdgeAccumulator = GraphEdge & {
  counterpartyId: string;
};

function addTokenAmount(
  map: Record<string, number>,
  token: string,
  amount: number,
) {
  map[token] = (map[token] ?? 0) + amount;
}

function buildEdgeFromTx(
  acctLower: string,
  displayIdLower: string,
  displayId: string,
  tx: Transaction,
  edgeMap: Map<string, EdgeAccumulator>,
) {
  const fromLower = tx.from.toLowerCase();
  const toLower = tx.to.toLowerCase();
  const isFrom = fromLower === acctLower || fromLower === displayIdLower;
  const isTo = toLower === acctLower || toLower === displayIdLower;
  const counterparty = isFrom ? tx.to : isTo ? tx.from : null;
  if (!counterparty) return null;

  const counterpartyLower = toCanonicalId(counterparty);
  const edgeKey = [toCanonicalId(acctLower), counterpartyLower]
    .sort()
    .join("|");
  const token = tx.token ?? "ICP";
  const isIcp = token === "ICP";

  const existing = edgeMap.get(edgeKey);
  if (existing) {
    existing.tx_count += 1;
    if (isIcp) existing.total_amount += tx.amount;
    if (isTo) {
      existing.inCount += 1;
      addTokenAmount(existing.inAmountByToken!, token, tx.amount);
      addTokenAmount(existing.inCountByToken!, token, 1);
    } else {
      existing.outCount += 1;
      addTokenAmount(existing.outAmountByToken!, token, tx.amount);
      addTokenAmount(existing.outCountByToken!, token, 1);
    }
  } else {
    const inAmountByToken: Record<string, number> = {};
    const outAmountByToken: Record<string, number> = {};
    const inCountByToken: Record<string, number> = {};
    const outCountByToken: Record<string, number> = {};
    if (isTo) {
      inAmountByToken[token] = tx.amount;
      inCountByToken[token] = 1;
    } else {
      outAmountByToken[token] = tx.amount;
      outCountByToken[token] = 1;
    }
    edgeMap.set(edgeKey, {
      source: displayId,
      target: counterparty,
      counterpartyId: counterpartyLower, // canonical id — consistent node identity regardless of hex/principal first-seen format
      tx_count: 1,
      total_amount: isIcp ? tx.amount : 0,
      inCount: isTo ? 1 : 0,
      outCount: isFrom ? 1 : 0,
      inAmountByToken,
      outAmountByToken,
      inCountByToken,
      outCountByToken,
    });
  }
  return counterpartyLower;
}

/** Compute netFlowByToken and totalVolumeICP for an edge */
function enrichEdge(edge: GraphEdge): GraphEdge {
  const netFlowByToken: Record<string, number> = {};
  const allTokens = new Set([
    ...Object.keys(edge.inAmountByToken ?? {}),
    ...Object.keys(edge.outAmountByToken ?? {}),
  ]);
  for (const token of allTokens) {
    const inAmt = edge.inAmountByToken?.[token] ?? 0;
    const outAmt = edge.outAmountByToken?.[token] ?? 0;
    netFlowByToken[token] = inAmt - outAmt;
  }
  return {
    ...edge,
    netFlowByToken,
    totalVolumeICP:
      (edge.inAmountByToken?.ICP ?? 0) + (edge.outAmountByToken?.ICP ?? 0),
  };
}

/** Get saved wallet addresses from localStorage */
function getSavedAddresses(): Set<string> {
  try {
    const raw = localStorage.getItem("icpath_saved_wallets");
    if (!raw) return new Set();
    const wallets = JSON.parse(raw) as Array<{ address: string }>;
    return new Set(wallets.map((w) => w.address.toLowerCase()));
  } catch {
    return new Set();
  }
}

/** Enrich a node with identity, sparkline, whale, and net flow data */
function enrichNode(
  node: GraphNode,
  allTransactions: Transaction[],
  allAddresses: string[],
  savedAddresses: Set<string>,
): GraphNode {
  const identity = getNodeIdentity(node.id);
  const snsTokens = getSnsParticipation(node.id, allTransactions);
  if (snsTokens.length > 0) {
    identity.snsTokens = snsTokens;
  }

  const sparklineData = getWeeklyActivity(allTransactions, node.id);
  const netFlowICP = computeNetFlow(allTransactions, node.id);
  const isWhale = detectWhale(allTransactions, node.id, allAddresses);
  const isPinned = savedAddresses.has(node.id.toLowerCase());

  return {
    ...node,
    identity,
    sparklineData,
    netFlowICP,
    isWhale,
    isPinned,
  };
}

export function buildGraph(
  displayId: string,
  accountIdentifier: string,
  transactions: Transaction[],
  maxCounterparties = 20,
): WalletGraph {
  const acctLower = accountIdentifier.toLowerCase();
  const displayIdLower = displayId.toLowerCase();

  const edgeMap = new Map<string, EdgeAccumulator>();
  const counterpartyTx = new Map<string, number>();
  const icrcCounterparties = new Set<string>();

  for (const tx of transactions) {
    const cpLower = buildEdgeFromTx(
      acctLower,
      displayIdLower,
      displayId,
      tx,
      edgeMap,
    );
    if (cpLower) {
      counterpartyTx.set(cpLower, (counterpartyTx.get(cpLower) ?? 0) + 1);
      if (tx.token && tx.token !== "ICP") {
        icrcCounterparties.add(cpLower);
      }
    }
  }

  const sortedCounterparties = [...counterpartyTx.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCounterparties)
    .map(([id]) => id);

  const allowedSet = new Set(sortedCounterparties);
  for (const cp of icrcCounterparties) {
    if (!allowedSet.has(cp)) {
      allowedSet.add(cp);
      sortedCounterparties.push(cp);
    }
  }

  const savedAddresses = getSavedAddresses();
  const allAddresses = [displayId, ...sortedCounterparties];

  const centerNode: GraphNode = {
    id: displayId,
    isCenter: true,
    txCount: transactions.length,
    totalAmount: transactions.reduce((s, t) => s + t.amount, 0),
    depth: 0,
  };

  const counterpartyNodes: GraphNode[] = sortedCounterparties.map((id) => {
    const original = transactions.find(
      (t) => toCanonicalId(t.from) === id || toCanonicalId(t.to) === id,
    );
    const originalId = original
      ? toCanonicalId(original.from) === id
        ? original.from
        : original.to
      : id;
    return {
      id: originalId,
      isCenter: false,
      txCount: counterpartyTx.get(id) ?? 0,
      totalAmount: 0,
      depth: 1,
    };
  });

  const rawNodes = [centerNode, ...counterpartyNodes];
  const nodes = rawNodes.map((n) =>
    enrichNode(n, transactions, allAddresses, savedAddresses),
  );

  const edges: GraphEdge[] = [...edgeMap.values()]
    .filter(
      (e) =>
        allowedSet.has(toCanonicalId(e.source)) ||
        allowedSet.has(toCanonicalId(e.target)),
    )
    .map(({ counterpartyId: _cid, ...rest }) => enrichEdge(rest));

  return { nodes, edges };
}

type DepthEdgeData = {
  inCount: number;
  outCount: number;
  tx_count: number;
  total_amount: number;
  counterpartyId: string;
  inAmountByToken: Record<string, number>;
  outAmountByToken: Record<string, number>;
  inCountByToken: Record<string, number>;
  outCountByToken: Record<string, number>;
};

function processTransactionsForDepth(
  txs: Transaction[],
  acctLower: string,
  displayIdLower: string,
  existingNodes: Map<string, GraphNode>,
  skipExisting = false,
): {
  txCount: Map<string, number>;
  edgeData: Map<string, DepthEdgeData>;
  icrcCounterparties: Set<string>;
} {
  const txCount = new Map<string, number>();
  const edgeData = new Map<string, DepthEdgeData>();
  const icrcCounterparties = new Set<string>();

  for (const tx of txs) {
    const fromLower = tx.from.toLowerCase();
    const toLower = tx.to.toLowerCase();
    const isFrom = fromLower === acctLower || fromLower === displayIdLower;
    const isTo = toLower === acctLower || toLower === displayIdLower;
    const counterparty = isFrom ? tx.to : isTo ? tx.from : null;
    if (!counterparty) continue;

    const cpLower = toCanonicalId(counterparty);
    if (skipExisting && existingNodes.has(cpLower)) continue;

    const token = tx.token ?? "ICP";
    const isIcp = token === "ICP";

    txCount.set(cpLower, (txCount.get(cpLower) ?? 0) + 1);
    if (!isIcp) {
      icrcCounterparties.add(cpLower);
    }
    const edge = edgeData.get(cpLower) ?? {
      inCount: 0,
      outCount: 0,
      tx_count: 0,
      total_amount: 0,
      counterpartyId: counterparty,
      inAmountByToken: {},
      outAmountByToken: {},
      inCountByToken: {},
      outCountByToken: {},
    };
    edge.tx_count += 1;
    if (isIcp) edge.total_amount += tx.amount;
    if (isTo) {
      edge.inCount += 1;
      addTokenAmount(edge.inAmountByToken, token, tx.amount);
      addTokenAmount(edge.inCountByToken, token, 1);
    } else {
      edge.outCount += 1;
      addTokenAmount(edge.outAmountByToken, token, tx.amount);
      addTokenAmount(edge.outCountByToken, token, 1);
    }
    edgeData.set(cpLower, edge);
  }

  return { txCount, edgeData, icrcCounterparties };
}

function addCrossEdges(
  allTxs: Transaction[],
  allNodes: Map<string, GraphNode>,
  allEdges: Map<string, GraphEdge>,
) {
  for (const tx of allTxs) {
    const fromLower = toCanonicalId(tx.from);
    const toLower = toCanonicalId(tx.to);
    if (fromLower === toLower) continue;
    const fromNode = allNodes.get(fromLower);
    const toNode = allNodes.get(toLower);
    if (!fromNode || !toNode) continue;

    const key1 = `${fromLower}|${toLower}`;
    const key2 = `${toLower}|${fromLower}`;
    const token = tx.token ?? "ICP";
    const isIcp = token === "ICP";

    const existingKey = allEdges.has(key1)
      ? key1
      : allEdges.has(key2)
        ? key2
        : null;
    if (existingKey) {
      const e = allEdges.get(existingKey)!;
      e.tx_count += 1;
      if (isIcp) e.total_amount += tx.amount;
      const isInbound = existingKey === key2;
      if (isInbound) {
        e.inCount += 1;
        addTokenAmount(e.inAmountByToken!, token, tx.amount);
        addTokenAmount(e.inCountByToken!, token, 1);
      } else {
        e.outCount += 1;
        addTokenAmount(e.outAmountByToken!, token, tx.amount);
        addTokenAmount(e.outCountByToken!, token, 1);
      }
    } else {
      allEdges.set(
        key1,
        enrichEdge({
          source: fromNode.id,
          target: toNode.id,
          tx_count: 1,
          total_amount: isIcp ? tx.amount : 0,
          inCount: 0,
          outCount: 1,
          inAmountByToken: {},
          outAmountByToken: { [token]: tx.amount },
          inCountByToken: {},
          outCountByToken: { [token]: 1 },
        }),
      );
    }
  }
}

export function buildMultiDepthGraph(
  center: { displayId: string; accountId: string; transactions: Transaction[] },
  depth1Fetches: Array<{
    nodeId: string;
    accountId: string;
    transactions: Transaction[];
  }>,
  depth2Fetches: Array<{
    nodeId: string;
    accountId: string;
    transactions: Transaction[];
  }>,
  maxCounterparties: number,
  showCrossEdges = false,
): WalletGraph {
  const allNodes = new Map<string, GraphNode>();
  const allEdges = new Map<string, GraphEdge>();
  const savedAddresses = getSavedAddresses();

  const centerIdLower = center.accountId.toLowerCase();
  const centerDisplayIdLower = center.displayId.toLowerCase();

  allNodes.set(toCanonicalId(center.displayId), {
    id: center.displayId,
    isCenter: true,
    txCount: center.transactions.length,
    totalAmount: center.transactions.reduce((s, t) => s + t.amount, 0),
    depth: 0,
  });

  // Depth-1
  const {
    txCount: d1TxCount,
    edgeData: d1EdgeData,
    icrcCounterparties: d1IcrcCps,
  } = processTransactionsForDepth(
    center.transactions,
    centerIdLower,
    centerDisplayIdLower,
    allNodes,
    false,
  );

  const sortedD1 = [...d1TxCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCounterparties);

  const d1AllowedSet = new Set(sortedD1.map(([id]) => id));
  for (const cp of d1IcrcCps) {
    if (!d1AllowedSet.has(cp)) {
      d1AllowedSet.add(cp);
      const txCnt = d1TxCount.get(cp) ?? 0;
      sortedD1.push([cp, txCnt]);
    }
  }

  for (const [cpLower] of sortedD1) {
    const edgeInfo = d1EdgeData.get(cpLower)!;
    allNodes.set(cpLower, {
      id: edgeInfo.counterpartyId,
      isCenter: false,
      txCount: edgeInfo.tx_count,
      totalAmount: edgeInfo.total_amount,
      depth: 1,
    });
    allEdges.set(
      `${toCanonicalId(center.displayId)}|${cpLower}`,
      enrichEdge({
        source: center.displayId,
        target: edgeInfo.counterpartyId,
        tx_count: edgeInfo.tx_count,
        total_amount: edgeInfo.total_amount,
        inCount: edgeInfo.inCount,
        outCount: edgeInfo.outCount,
        inAmountByToken: edgeInfo.inAmountByToken,
        outAmountByToken: edgeInfo.outAmountByToken,
        inCountByToken: edgeInfo.inCountByToken,
        outCountByToken: edgeInfo.outCountByToken,
      }),
    );
  }

  // Depth-2
  for (const d1Fetch of depth1Fetches) {
    if (!allNodes.has(toCanonicalId(d1Fetch.nodeId))) continue;

    const d1AcctLower = d1Fetch.accountId.toLowerCase();
    const d1DisplayIdLower = d1Fetch.nodeId.toLowerCase();
    const { txCount: d2TxCount, edgeData: d2EdgeData } =
      processTransactionsForDepth(
        d1Fetch.transactions,
        d1AcctLower,
        d1DisplayIdLower,
        allNodes,
        true,
      );

    const top3 = [...d2TxCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const d1Node = allNodes.get(toCanonicalId(d1Fetch.nodeId))!;
    for (const [cpLower] of top3) {
      if (allNodes.has(cpLower)) continue;
      const edgeInfo = d2EdgeData.get(cpLower)!;
      allNodes.set(cpLower, {
        id: edgeInfo.counterpartyId,
        isCenter: false,
        txCount: edgeInfo.tx_count,
        totalAmount: edgeInfo.total_amount,
        depth: 2,
      });
      allEdges.set(
        `${toCanonicalId(d1Node.id)}|${cpLower}`,
        enrichEdge({
          source: d1Node.id,
          target: edgeInfo.counterpartyId,
          tx_count: edgeInfo.tx_count,
          total_amount: edgeInfo.total_amount,
          inCount: edgeInfo.inCount,
          outCount: edgeInfo.outCount,
          inAmountByToken: edgeInfo.inAmountByToken,
          outAmountByToken: edgeInfo.outAmountByToken,
          inCountByToken: edgeInfo.inCountByToken,
          outCountByToken: edgeInfo.outCountByToken,
        }),
      );
    }
  }

  // Depth-3
  for (const d2Fetch of depth2Fetches) {
    if (!allNodes.has(toCanonicalId(d2Fetch.nodeId))) continue;

    const d2AcctLower = d2Fetch.accountId.toLowerCase();
    const d2DisplayIdLower = d2Fetch.nodeId.toLowerCase();
    const { txCount: d3TxCount, edgeData: d3EdgeData } =
      processTransactionsForDepth(
        d2Fetch.transactions,
        d2AcctLower,
        d2DisplayIdLower,
        allNodes,
        true,
      );

    const top2 = [...d3TxCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    const d2Node = allNodes.get(toCanonicalId(d2Fetch.nodeId))!;
    for (const [cpLower] of top2) {
      if (allNodes.has(cpLower)) continue;
      const edgeInfo = d3EdgeData.get(cpLower)!;
      allNodes.set(cpLower, {
        id: edgeInfo.counterpartyId,
        isCenter: false,
        txCount: edgeInfo.tx_count,
        totalAmount: edgeInfo.total_amount,
        depth: 3,
      });
      allEdges.set(
        `${toCanonicalId(d2Node.id)}|${cpLower}`,
        enrichEdge({
          source: d2Node.id,
          target: edgeInfo.counterpartyId,
          tx_count: edgeInfo.tx_count,
          total_amount: edgeInfo.total_amount,
          inCount: edgeInfo.inCount,
          outCount: edgeInfo.outCount,
          inAmountByToken: edgeInfo.inAmountByToken,
          outAmountByToken: edgeInfo.outAmountByToken,
          inCountByToken: edgeInfo.inCountByToken,
          outCountByToken: edgeInfo.outCountByToken,
        }),
      );
    }
  }

  if (showCrossEdges) {
    const allTxs = [
      ...center.transactions,
      ...depth1Fetches.flatMap((f) => f.transactions),
      ...depth2Fetches.flatMap((f) => f.transactions),
    ];
    addCrossEdges(allTxs, allNodes, allEdges);
  }

  // Enrich all nodes
  const allTxsForEnrich = [
    ...center.transactions,
    ...depth1Fetches.flatMap((f) => f.transactions),
    ...depth2Fetches.flatMap((f) => f.transactions),
  ];
  const allAddresses = [...allNodes.values()].map((n) => n.id);

  const enrichedNodes = [...allNodes.values()].map((n) =>
    enrichNode(n, allTxsForEnrich, allAddresses, savedAddresses),
  );

  return {
    nodes: enrichedNodes,
    edges: [...allEdges.values()],
  };
}

export function computeSummary(
  accountId: string,
  transactions: Transaction[],
): import("../types").WalletSummary {
  const acctLower = accountId.toLowerCase();
  let totalIn = 0;
  let totalOut = 0;
  const counterparties = new Set<string>();

  // Only ICP transactions count toward ALL four metrics
  const icpTxs = transactions.filter((tx) => !tx.token || tx.token === "ICP");

  for (const tx of icpTxs) {
    const isTo = tx.to.toLowerCase() === acctLower;
    const isFrom = tx.from.toLowerCase() === acctLower;
    if (isTo) {
      totalIn += tx.amount;
      if (tx.from) counterparties.add(tx.from.toLowerCase());
    } else if (isFrom) {
      totalOut += tx.amount;
      if (tx.to) counterparties.add(tx.to.toLowerCase());
    }
  }

  return {
    totalTx: icpTxs.length,
    totalIn,
    totalOut,
    counterpartyCount: counterparties.size,
  };
}

export function getTopCounterparties(
  accountId: string,
  transactions: Transaction[],
  limit = 5,
  displayId?: string,
): Array<{ address: string; txCount: number; volume: number }> {
  const acctLower = accountId.toLowerCase();
  const displayIdLower = displayId?.toLowerCase() ?? "";
  const map = new Map<string, { txCount: number; volume: number }>();

  for (const tx of transactions) {
    const fromLower = tx.from.toLowerCase();
    const toLower = tx.to.toLowerCase();
    const isFrom = fromLower === acctLower || fromLower === displayIdLower;
    const isTo = toLower === acctLower || toLower === displayIdLower;
    const counterparty = isFrom ? tx.to : isTo ? tx.from : null;
    if (!counterparty) continue;
    const existing = map.get(counterparty);
    if (existing) {
      existing.txCount += 1;
      existing.volume += tx.amount;
    } else {
      map.set(counterparty, { txCount: 1, volume: tx.amount });
    }
  }

  return [...map.entries()]
    .sort((a, b) => b[1].txCount - a[1].txCount)
    .slice(0, limit)
    .map(([address, stats]) => ({ address, ...stats }));
}
