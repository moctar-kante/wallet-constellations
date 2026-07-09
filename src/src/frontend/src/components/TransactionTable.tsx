import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Transaction } from "../types";

const PAGE_SIZE = 20;

function shortenId(id: string) {
  if (!id || id.length <= 14) return id || "—";
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

interface TransactionTableProps {
  transactions: Transaction[];
  principal: string;
  onNavigate: (p: string) => void;
}

export function TransactionTable({
  transactions,
  principal,
  onNavigate,
}: TransactionTableProps) {
  const [page, setPage] = useState(0);
  const principalLower = principal.toLowerCase();
  const total = transactions.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const slice = transactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs text-muted-foreground font-medium">
                Date
              </TableHead>
              <TableHead className="text-xs text-muted-foreground font-medium">
                From
              </TableHead>
              <TableHead className="text-xs text-muted-foreground font-medium">
                To
              </TableHead>
              <TableHead className="text-xs text-muted-foreground font-medium text-right">
                Amount (ICP)
              </TableHead>
              <TableHead className="text-xs text-muted-foreground font-medium text-right">
                Block
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((tx, i) => {
              const isIncoming = tx.to.toLowerCase() === principalLower;
              const isOutgoing = tx.from.toLowerCase() === principalLower;
              const globalIdx = page * PAGE_SIZE + i + 1;
              return (
                <TableRow
                  key={`${tx.blockIndex}-${i}`}
                  data-ocid="wallet.row"
                  className="border-border hover:bg-muted/20 transition-colors"
                >
                  <TableCell className="text-xs text-muted-foreground py-2">
                    {formatDate(tx.timestamp)}
                  </TableCell>
                  <TableCell className="py-2">
                    <button
                      type="button"
                      data-ocid={`wallet.item.${globalIdx}`}
                      onClick={() => tx.from && onNavigate(tx.from)}
                      className="font-mono text-xs text-neon-blue hover:text-neon-blue/70 transition-colors"
                      title={tx.from}
                      disabled={!tx.from}
                    >
                      {shortenId(tx.from)}
                    </button>
                  </TableCell>
                  <TableCell className="py-2">
                    <button
                      type="button"
                      data-ocid={`wallet.item.${globalIdx}`}
                      onClick={() => tx.to && onNavigate(tx.to)}
                      className="font-mono text-xs text-neon-blue hover:text-neon-blue/70 transition-colors"
                      title={tx.to}
                      disabled={!tx.to}
                    >
                      {shortenId(tx.to)}
                    </button>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span
                      className={`text-xs font-mono font-medium ${
                        isIncoming
                          ? "text-neon-green"
                          : isOutgoing
                            ? "text-neon-red"
                            : "text-foreground"
                      }`}
                    >
                      {isIncoming ? "+" : isOutgoing ? "-" : ""}
                      {tx.amount.toFixed(4)}
                    </span>
                    {(isIncoming || isOutgoing) && (
                      <Badge
                        variant="outline"
                        className={`ml-1.5 text-[10px] px-1 py-0 ${
                          isIncoming
                            ? "border-neon-green/40 text-neon-green"
                            : "border-neon-red/40 text-neon-red"
                        }`}
                      >
                        {isIncoming ? "IN" : "OUT"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs text-muted-foreground font-mono">
                      {tx.blockIndex}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {slice.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-xs text-muted-foreground py-8"
                  data-ocid="wallet.empty_state"
                >
                  No transactions in this time range
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{" "}
            {total}
          </span>
          <div className="flex gap-1">
            <Button
              data-ocid="wallet.pagination_prev"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              data-ocid="wallet.pagination_next"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
