export interface Transaction {
  timestamp: string;
  from: string;
  to: string;
  amount: number; // ICP float
  blockIndex: number;
  token?: string; // e.g. 'ICP', 'CHAT', 'ckBTC' — default 'ICP'
  decimals?: number; // default 8
}

export interface GraphNode {
  id: string;
  isCenter: boolean;
  txCount: number;
  totalAmount: number;
  depth?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  tx_count: number;
  total_amount: number; // ICP only, for edge width
  inCount: number;
  outCount: number;
  inAmountByToken: Record<string, number>; // token symbol -> total amount in
  outAmountByToken: Record<string, number>; // token symbol -> total amount out
  inCountByToken: Record<string, number>; // token symbol -> count in
  outCountByToken: Record<string, number>; // token symbol -> count out
}

export interface WalletSummary {
  totalTx: number;
  totalIn: number;
  totalOut: number;
  counterpartyCount: number;
}

export interface WalletGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface WalletData {
  summary: WalletSummary;
  transactions: Transaction[];
  graph: WalletGraph;
}

export type TimeRange = "7d" | "30d" | "90d" | "all";

export type ExplorerError =
  | "cors"
  | "network"
  | "http"
  | "parse"
  | "empty"
  | "invalid";

export interface WalletState {
  historyStack: string[];
  currentPrincipal: string;
  timeRange: TimeRange;
  loading: boolean;
  errorType: ExplorerError | null;
  rawTransactions: Transaction[];
}
