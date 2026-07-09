import type {
  GraphEdge,
  GraphNode,
  Transaction,
  WalletGraph,
  WalletSummary,
} from "../types";

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

  const counterpartyLower = counterparty.toLowerCase();
  const edgeKey = [acctLower, counterpartyLower].sort().join("|");
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
      counterpartyId: counterparty,
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
  // Track counterparties that appear in ICRC (non-ICP) transactions
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

  // Always include ICRC-only counterparties regardless of the top-N limit
  const allowedSet = new Set(sortedCounterparties);
  for (const cp of icrcCounterparties) {
    if (!allowedSet.has(cp)) {
      allowedSet.add(cp);
      sortedCounterparties.push(cp);
    }
  }

  const nodes: GraphNode[] = [
    {
      id: displayId,
      isCenter: true,
      txCount: transactions.length,
      totalAmount: transactions.reduce((s, t) => s + t.amount, 0),
      depth: 0,
    },
    ...sortedCounterparties.map((id) => {
      const original = transactions.find(
        (t) => t.from.toLowerCase() === id || t.to.toLowerCase() === id,
      );
      const originalId = original
        ? original.from.toLowerCase() === id
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
    }),
  ];

  const edges: GraphEdge[] = [...edgeMap.values()]
    .filter(
      (e) =>
        allowedSet.has(e.source.toLowerCase()) ||
        allowedSet.has(e.target.toLowerCase()),
    )
    .map(({ counterpartyId: _cid, ...rest }) => rest);

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

    const cpLower = counterparty.toLowerCase();
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

/**
 * Scan transactions and add edges between any two nodes that are already in
 * allNodes (cross-edges: same-depth or across non-parent-child depths).
 */
function addCrossEdges(
  allTxs: Transaction[],
  allNodes: Map<string, GraphNode>,
  allEdges: Map<string, GraphEdge>,
) {
  for (const tx of allTxs) {
    const fromLower = tx.from.toLowerCase();
    const toLower = tx.to.toLowerCase();
    if (fromLower === toLower) continue;
    const fromNode = allNodes.get(fromLower);
    const toNode = allNodes.get(toLower);
    if (!fromNode || !toNode) continue;

    // Only add cross-edges (skip parent-child edges already added)
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
      // Update existing edge
      const e = allEdges.get(existingKey)!;
      e.tx_count += 1;
      if (isIcp) e.total_amount += tx.amount;
      // from→to = outbound from fromNode, inbound to toNode
      // we treat inbound/outbound relative to the lower-depth node
      const isInbound = existingKey === key2; // key2 means to|from, so from's perspective it's inbound
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
      // New cross-edge
      const outAmountByToken: Record<string, number> = { [token]: tx.amount };
      const outCountByToken: Record<string, number> = { [token]: 1 };
      allEdges.set(key1, {
        source: fromNode.id,
        target: toNode.id,
        tx_count: 1,
        total_amount: isIcp ? tx.amount : 0,
        inCount: 0,
        outCount: 1,
        inAmountByToken: {},
        outAmountByToken,
        inCountByToken: {},
        outCountByToken,
      });
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

  const centerIdLower = center.accountId.toLowerCase();
  const centerDisplayIdLower = center.displayId.toLowerCase();

  allNodes.set(center.displayId.toLowerCase(), {
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

  // Always include ICRC-only counterparties in depth-1 regardless of top-N limit
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
    allEdges.set(`${center.displayId.toLowerCase()}|${cpLower}`, {
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
    });
  }

  // Depth-2
  for (const d1Fetch of depth1Fetches) {
    if (!allNodes.has(d1Fetch.nodeId.toLowerCase())) continue;

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

    const d1Node = allNodes.get(d1Fetch.nodeId.toLowerCase())!;
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
      allEdges.set(`${d1Node.id.toLowerCase()}|${cpLower}`, {
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
      });
    }
  }

  // Depth-3
  for (const d2Fetch of depth2Fetches) {
    if (!allNodes.has(d2Fetch.nodeId.toLowerCase())) continue;

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

    const d2Node = allNodes.get(d2Fetch.nodeId.toLowerCase())!;
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
      allEdges.set(`${d2Node.id.toLowerCase()}|${cpLower}`, {
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
      });
    }
  }

  // Cross-edges: connections between nodes already in graph (across/within depths)
  if (showCrossEdges) {
    const allTxs = [
      ...center.transactions,
      ...depth1Fetches.flatMap((f) => f.transactions),
      ...depth2Fetches.flatMap((f) => f.transactions),
    ];
    addCrossEdges(allTxs, allNodes, allEdges);
  }

  return {
    nodes: [...allNodes.values()],
    edges: [...allEdges.values()],
  };
}

export function computeSummary(
  accountId: string,
  transactions: Transaction[],
): WalletSummary {
  const acctLower = accountId.toLowerCase();
  let totalIn = 0;
  let totalOut = 0;
  const counterparties = new Set<string>();

  for (const tx of transactions) {
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
    totalTx: transactions.length,
    totalIn,
    totalOut,
    counterpartyCount: counterparties.size,
  };
}

export function getTopCounterparties(
  accountId: string,
  transactions: Transaction[],
  limit = 5,
): Array<{ address: string; txCount: number; volume: number }> {
  const acctLower = accountId.toLowerCase();
  const map = new Map<string, { txCount: number; volume: number }>();

  for (const tx of transactions) {
    const isFrom = tx.from.toLowerCase() === acctLower;
    const isTo = tx.to.toLowerCase() === acctLower;
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
