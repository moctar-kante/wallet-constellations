import type { NodeIdentity, NodeIdentityType, Transaction } from "../types";

interface KnownCanister {
  id: string;
  name: string;
  type: NodeIdentityType;
  icon: string;
  ringColor: string;
}

const COLORS: Record<NodeIdentityType, string> = {
  user: "#94A3B8",
  sns: "#3FE08C",
  dex: "#F0B35A",
  nns: "#60A5FA",
  neuron: "#C084FC",
  project: "#7DD3FC",
  cluster: "#475569",
};

const ICONS: Record<NodeIdentityType, string> = {
  user: "👤",
  sns: "🌐",
  dex: "⚡",
  nns: "🔷",
  neuron: "💎",
  project: "🔹",
  cluster: "◈",
};

export const KNOWN_CANISTERS: KnownCanister[] = [
  // ── NNS ─────────────────────────────────────────────────────────────────
  {
    id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    name: "NNS Governance",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },
  {
    id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    name: "ICP Ledger",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },
  {
    id: "qoctq-giaaa-aaaaa-aaaea-cai",
    name: "NNS Root",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },
  {
    id: "rkp4c-7iaaa-aaaaa-aaaca-cai",
    name: "NNS Lifeline",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },
  {
    id: "r7inp-6aaaa-aaaaa-aaabq-cai",
    name: "NNS Registry",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },
  {
    id: "rdmx6-jaaaa-aaaaa-aaadq-cai",
    name: "NNS Identity",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },
  {
    id: "aaaaa-aa",
    name: "IC Management",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },
  {
    id: "6s3za-cqaaa-aaaaa-aaacq-cai",
    name: "Cycles Minting",
    type: "nns",
    icon: ICONS.nns,
    ringColor: COLORS.nns,
  },

  // ── SNS Governance Canisters ─────────────────────────────────────────────
  {
    id: "3e3x2-xyaaa-aaaaq-aaalq-cai",
    name: "OpenChat",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "7jkta-eyaaa-aaaaq-aaa6q-cai",
    name: "Kinic",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "6rdgd-kyaaa-aaaaq-aaavq-cai",
    name: "Hot or Not",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "tw2vt-hqaaa-aaaaq-aab6a-cai",
    name: "Gold DAO",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "xjngq-yaaaa-aaaaq-aabha-cai",
    name: "BOOM DAO",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "extk5-gaaaa-aaaaq-aadaq-cai",
    name: "Neutrinite",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "jfnic-kaaaa-aaaaq-aadla-cai",
    name: "WaterNeuron",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "2hx64-daaaa-aaaaq-aaana-cai",
    name: "Dragginz",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "yc3ey-aiaaa-aaaaq-aabgq-cai",
    name: "DecideAI",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "u67kc-jyaaa-aaaaq-aabpq-cai",
    name: "YRAL",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "6syxn-4yaaa-aaaaq-aaboq-cai",
    name: "NTN",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "h4j5e-7iaaa-aaaaq-aacca-cai",
    name: "ICLighthouse",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "uly3p-iqaaa-aaaaq-aabma-cai",
    name: "Sonic DAO",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "fnnai-ryaaa-aaaaq-aabna-cai",
    name: "Funnai",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },

  // ── SNS Ledger Canisters ────────────────────────────────────────────────
  {
    id: "2ouva-viaaa-aaaaq-aaamq-cai",
    name: "OpenChat Ledger",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "73mez-iiaaa-aaaaq-aaasq-cai",
    name: "Kinic Ledger",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },
  {
    id: "tyyy3-4aaaa-aaaaq-aab7a-cai",
    name: "Gold DAO Ledger",
    type: "sns",
    icon: ICONS.sns,
    ringColor: COLORS.sns,
  },

  // ── DEX Canisters ────────────────────────────────────────────────────────
  {
    id: "5ucrv-taaaa-aaaag-qb2uq-cai",
    name: "ICPSwap",
    type: "dex",
    icon: ICONS.dex,
    ringColor: COLORS.dex,
  },
  {
    id: "3xwpq-ziaaa-aaaah-qcn4a-cai",
    name: "Sonic DEX",
    type: "dex",
    icon: ICONS.dex,
    ringColor: COLORS.dex,
  },
  {
    id: "ltyfs-qiaaa-aaaak-aan3a-cai",
    name: "ICPSwap Pool",
    type: "dex",
    icon: ICONS.dex,
    ringColor: COLORS.dex,
  },
  {
    id: "4mmnk-kiaaa-aaaag-qbllq-cai",
    name: "ICDex",
    type: "dex",
    icon: ICONS.dex,
    ringColor: COLORS.dex,
  },

  // ── NNS Neurons ────────────────────────────────────────────────────────
  {
    id: "yh2sk-raaaa-aaaaa-aacfq-cai",
    name: "NNS Treasury",
    type: "neuron",
    icon: ICONS.neuron,
    ringColor: COLORS.neuron,
  },
];

const CANISTER_MAP = new Map<string, KnownCanister>(
  KNOWN_CANISTERS.map((c) => [c.id.toLowerCase(), c]),
);

/** SNS token symbol → DAO name mapping */
export const SNS_TOKENS: Record<string, string> = {
  CHAT: "OpenChat",
  KINIC: "Kinic",
  WTN: "WaterNeuron",
  GOLD: "Gold DAO",
  BOOM: "BOOM DAO",
  NTN: "NTN",
  SNEED: "ICLighthouse",
  HOT: "Hot or Not",
  DRAG: "Dragginz",
  DCD: "DecideAI",
  YRAL: "YRAL",
  SONIC: "Sonic DAO",
  GLDGov: "Gold DAO Gov",
  FUNNAI: "Funnai",
};

/**
 * Look up identity info for a node by its principal or account ID.
 * Returns a NodeIdentity with type 'user' if not a known canister.
 */
export function getNodeIdentity(
  id: string,
  _transactions?: Transaction[],
): NodeIdentity {
  const entry = CANISTER_MAP.get(id.toLowerCase().trim());
  if (entry) {
    return {
      type: entry.type,
      label: entry.name,
      icon: entry.icon,
      ringColor: entry.ringColor,
    };
  }

  // Heuristic: neuron addresses often have a specific pattern
  // NNS neurons are stored at the governance canister sub-accounts
  // We use a simple heuristic: long hex strings that don't match known patterns
  const idTrimmed = id.trim();
  if (idTrimmed.length === 64 && /^[0-9a-f]+$/i.test(idTrimmed)) {
    // Could be a neuron account identifier (governance sub-account)
    // This is a best-effort heuristic only
    return {
      type: "user",
      label: "Wallet",
      icon: ICONS.user,
      ringColor: COLORS.user,
    };
  }

  return {
    type: "user",
    label: "Wallet",
    icon: ICONS.user,
    ringColor: COLORS.user,
  };
}

/**
 * Returns list of SNS token names the wallet has interacted with,
 * based on transaction token symbols.
 */
export function getSnsParticipation(
  _address: string,
  transactions: Transaction[],
): string[] {
  const tokens = new Set<string>();
  for (const tx of transactions) {
    if (tx.token && tx.token !== "ICP" && SNS_TOKENS[tx.token]) {
      tokens.add(SNS_TOKENS[tx.token]);
    }
  }
  return [...tokens];
}

/**
 * Check if an ID is a known canister.
 */
export function isKnownCanister(id: string): boolean {
  return CANISTER_MAP.has(id.toLowerCase().trim());
}
