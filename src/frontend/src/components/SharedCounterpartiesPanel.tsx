import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { SharedCounterparty } from "../types";

interface SharedCounterpartiesPanelProps {
  counterparties: SharedCounterparty[];
  addr1: string;
  addr2: string;
}

type SortKey = "combined" | "wallet1" | "wallet2";

function shortenAddr(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function getStoredLabel(addr: string): string | undefined {
  try {
    const labels: Record<string, string> = JSON.parse(
      localStorage.getItem("wallet-labels") ?? "{}",
    );
    return labels[addr] ?? labels[addr.toLowerCase()];
  } catch {
    return undefined;
  }
}

export function SharedCounterpartiesPanel({
  counterparties,
  addr1,
  addr2,
}: SharedCounterpartiesPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>("combined");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...counterparties];
    arr.sort((a, b) => {
      let diff = 0;
      if (sortKey === "combined") {
        diff =
          b.txCountWallet1 +
          b.txCountWallet2 -
          (a.txCountWallet1 + a.txCountWallet2);
      } else if (sortKey === "wallet1") {
        diff = b.txCountWallet1 - a.txCountWallet1;
      } else {
        diff = b.txCountWallet2 - a.txCountWallet2;
      }
      return sortAsc ? -diff : diff;
    });
    return arr;
  }, [counterparties, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const shortAddr1 = shortenAddr(addr1);
  const shortAddr2 = shortenAddr(addr2);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-[#00FF88]" />
        <h3 className="text-sm font-semibold text-foreground">
          Shared Counterparties
        </h3>
        <span className="text-xs text-muted-foreground">
          ({counterparties.length})
        </span>
      </div>

      {counterparties.length === 0 ? (
        <div
          className="flex items-center justify-center py-8 text-sm text-muted-foreground"
          data-ocid="compare.shared_empty_state"
        >
          No common counterparties found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Address
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">
                  <button
                    type="button"
                    className="flex items-center justify-end gap-1 w-full cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("wallet1")}
                    data-ocid="compare.sort_wallet1"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full bg-neon-blue/70"
                      title="Wallet 1"
                    />
                    {shortAddr1}
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">
                  <button
                    type="button"
                    className="flex items-center justify-end gap-1 w-full cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("wallet2")}
                    data-ocid="compare.sort_wallet2"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full bg-[#FFB300]/70"
                      title="Wallet 2"
                    />
                    {shortAddr2}
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">
                  <button
                    type="button"
                    className="flex items-center justify-end gap-1 w-full cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("combined")}
                    data-ocid="compare.sort_combined"
                  >
                    Combined
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </button>
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                  Tokens
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((cp, idx) => {
                const label = cp.label ?? getStoredLabel(cp.address);
                const allTokens = [
                  ...new Set([...cp.tokensWallet1, ...cp.tokensWallet2]),
                ];
                const sharedTokens = cp.tokensWallet1.filter((t) =>
                  cp.tokensWallet2.includes(t),
                );

                return (
                  <tr
                    key={cp.address}
                    className="border-b border-border/60 hover:bg-muted/30 transition-colors"
                    data-ocid={`compare.shared_item.${idx + 1}`}
                  >
                    {/* Address */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="font-mono text-foreground/80 truncate max-w-[120px] md:max-w-[180px]"
                          title={cp.address}
                        >
                          {shortenAddr(cp.address)}
                        </span>
                        {label && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-neon-blue/15 text-neon-blue font-bold shrink-0">
                            {label}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Tx count wallet 1 */}
                    <td className="px-3 py-2 text-right tabular-nums text-neon-blue/90">
                      {cp.txCountWallet1}
                    </td>
                    {/* Tx count wallet 2 */}
                    <td className="px-3 py-2 text-right tabular-nums text-[#FFB300]/90">
                      {cp.txCountWallet2}
                    </td>
                    {/* Combined */}
                    <td className="px-3 py-2 text-right tabular-nums text-foreground font-medium">
                      {cp.txCountWallet1 + cp.txCountWallet2}
                    </td>
                    {/* Tokens */}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {allTokens.slice(0, 5).map((token) => {
                          const isShared = sharedTokens.includes(token);
                          return (
                            <Badge
                              key={token}
                              variant="outline"
                              className={`text-[9px] px-1 py-0 h-4 border-0 ${
                                isShared
                                  ? "bg-[#00FF88]/15 text-[#00FF88]"
                                  : "bg-muted/50 text-muted-foreground"
                              }`}
                            >
                              {token}
                            </Badge>
                          );
                        })}
                        {allTokens.length > 5 && (
                          <span className="text-[9px] text-muted-foreground/60">
                            +{allTokens.length - 5}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
