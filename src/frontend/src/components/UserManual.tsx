import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BookOpen, ChevronDown } from "lucide-react";
import { useState } from "react";

interface ManualSection {
  id: string;
  title: string;
  body: string;
}

// Concise, non-obvious guidance only. Each section answers a question the
// interface itself does not answer on sight.
const SECTIONS: ManualSection[] = [
  {
    id: "reading-the-graph",
    title: "Reading the constellation",
    body: "Each dot is a wallet or canister. The bright center dot is the wallet you searched; every other dot is a counterparty it has transacted with. Lines are transfers between two parties, and the layout pulls connected wallets together — clusters mean those wallets trade with each other often.",
  },
  {
    id: "node-colors-sizes",
    title: "Node colors and sizes",
    body: "Color marks what a node is: blue is the center wallet, grey-blue is an ordinary counterparty, orange is a whale (over 10k ICP moved), green is an SNS or project, amber is a DEX or exchange, indigo is a neuron, and purple is NNS infrastructure. Larger dots have more activity — more transactions and volume — so the biggest dots are the busiest counterparties.",
  },
  {
    id: "edge-colors-thickness",
    title: "Edge colors, thickness, and arrows",
    body: "Blue lines carry ICP; other colors are ICRC tokens, each token getting its own color. A thicker line means a larger transaction count or amount, depending on the active weight control. Arrows show direction: down-arrow is inbound (into the center wallet), up-arrow is outbound (out of it).",
  },
  {
    id: "searching-a-wallet",
    title: "Searching a wallet",
    body: "Paste a principal ID or account ID into the search bar and press Enter. The graph, charts, and transaction table all reload for that wallet. Clicking any node re-centers the graph on that wallet and adds it to the breadcrumb trail so you can walk back.",
  },
  {
    id: "time-range",
    title: "Time range",
    body: "The time-range control in the wallet panel filters every view — graph, charts, and table — to the selected window (day through all time). It does not re-fetch data; it narrows what is already loaded, so switching ranges is instant.",
  },
  {
    id: "edge-weight",
    title: "Edge weight",
    body: "The weight control switches what line thickness encodes: transaction count or total amount. Use count to find frequent trading partners and amount to find high-value ones. The legend's thickness note always reflects the active mode.",
  },
  {
    id: "comparison-mode",
    title: "Comparison mode",
    body: "Open Compare from the top bar and enter two wallet addresses. The two constellations render side by side with shared counterparties highlighted, plus a stats panel. Exit with the back control to return to the single-wallet view.",
  },
  {
    id: "adding-a-token",
    title: "Adding a token",
    body: "The ICRC API only serves SNS-governed and chain-key tokens automatically. To track any other ICRC-1 token, open Add Token and enter its ledger canister ID; the index canister ID is optional and is auto-discovered when left blank. Its transactions merge into the graph immediately and the token appears under Manage Added Tokens.",
  },
  {
    id: "connected-state",
    title: "Connected vs. not connected",
    body: "Signing in with Internet Identity connects your account: saved wallets, labels, and added tokens sync to your profile and follow you across devices. Without signing in, the explorer still works fully, but those preferences stay only in this browser.",
  },
  {
    id: "data-coverage",
    title: "How much of the graph is loaded",
    body: "Every level is sampled, never complete. The center wallet (level 0) covers ICP and ICRC tokens; level 1 covers ICP and ICRC for its top 5 counterparties only; level 2 covers the top 3 counterparties of each level-1 wallet; level 3 covers the top 2 counterparties of each level-2 wallet. Addresses already seen are skipped, and each address is capped at 100 transactions per token. Deeper levels are therefore truncated subsets, not a full picture.",
  },
  {
    id: "what-the-numbers-cover",
    title: "What the numbers cover",
    body: "The summary numbers — Total Txs, Total In/Out, Counterparties, Daily Transaction Activity, token holdings, and highlights — are computed from the full time-filtered transaction list, meaning everything inside the selected time range, not just the subset drawn on the graph. The graph's top-counterparty cuts and depth limits only change what is drawn, never the numbers. Numbers are capped at 100 transactions per address and show as '100+' once that cap is reached. Network Breakdown is the one panel based on the plotted graph and its top-5 cut rather than the full set.",
  },
];

export function UserManual() {
  // Collapsed by default; the reader expands it when they want the guide.
  const [open, setOpen] = useState(false);

  return (
    <section
      id="user-manual"
      aria-labelledby="user-manual-heading"
      data-ocid="manual.section"
      className="w-full"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 pt-4 px-4">
            <CollapsibleTrigger
              data-ocid="manual.toggle"
              aria-expanded={open}
              className="group flex w-full items-center justify-between gap-3 rounded-md text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="min-w-0">
                <CardTitle
                  id="user-manual-heading"
                  className="text-sm font-semibold flex items-center gap-2"
                >
                  <BookOpen
                    className="h-4 w-4 text-neon-blue"
                    aria-hidden="true"
                  />
                  User Manual
                </CardTitle>
                <span className="block text-xs text-muted-foreground mt-1">
                  How to read the constellation and use the explorer.
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground ${
                  open ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                {SECTIONS.map((section) => (
                  <div key={section.id} data-ocid={`manual.item.${section.id}`}>
                    <h3 className="text-xs font-semibold text-foreground mb-1.5">
                      {section.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {section.body}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </section>
  );
}
