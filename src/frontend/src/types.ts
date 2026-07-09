export interface Transaction {
  timestamp: string;
  from: string;
  to: string;
  amount: number; // native token float
  blockIndex: number;
  token?: string; // e.g. 'ICP', 'CHAT', 'ckBTC' — default 'ICP'
  decimals?: number; // default 8
}

export type NodeIdentityType =
  | "user"
  | "nns"
  | "sns"
  | "dex"
  | "project"
  | "neuron"
  | "cluster";

export interface NodeIdentity {
  type: NodeIdentityType;
  label: string; // display name (e.g. "OpenChat", "NNS Governance")
  icon: string; // emoji or symbol
  ringColor: string; // CSS color string
  snsTokens?: string[]; // SNS tokens this address has interacted with
}

export interface GraphNode {
  id: string;
  isCenter: boolean;
  txCount: number;
  totalAmount: number;
  depth?: number;
  identity?: NodeIdentity;
  sparklineData?: number[]; // 8 weekly tx-count buckets
  isWhale?: boolean;
  isPinned?: boolean;
  netFlowICP?: number; // positive = net receiver, negative = net sender
  clusterSize?: number; // set when this node represents a collapsed cluster
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
  netFlowByToken?: Record<string, number>; // token -> net amount (positive = more in)
  totalVolumeICP?: number; // total ICP volume (in + out)
}

export interface WalletSummary {
  totalTx: number;
  totalIn: number;
  totalOut: number;
  counterpartyCount: number;
  whaleThreshold?: number; // ICP amount at 90th percentile
  priceUSD?: number; // current ICP/USD price
}

export interface WalletGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface WalletData {
  summary: WalletSummary;
  transactions: Transaction[];
  /** Full unfiltered transaction set — used for wallet age computation */
  allTransactions?: Transaction[];
  graph: WalletGraph;
}

export interface SharedCounterparty {
  address: string;
  label?: string;
  txCountWallet1: number;
  txCountWallet2: number;
  tokensWallet1: string[];
  tokensWallet2: string[];
}

export interface ComparisonData {
  wallet1: WalletData;
  wallet2: WalletData;
  sharedNodeIds: Set<string>;
}

export interface SavedWallet {
  address: string;
  label?: string;
  pinnedAt: number;
}

export interface SearchHistoryEntry {
  address: string;
  label?: string;
  searchedAt: number;
}

export type TimeRange = "all" | "day" | "week" | "1mo" | "3mo" | "6mo" | "1y";

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
