import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitCompareArrows, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ComparisonModeModalProps {
  onCompare: (addr1: string, addr2: string) => void;
  onClose: () => void;
}

export function ComparisonModeModal({
  onCompare,
  onClose,
}: ComparisonModeModalProps) {
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const input1Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input1Ref.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canCompare = addr1.trim().length > 0 && addr2.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCompare) return;
    onCompare(addr1.trim(), addr2.trim());
    onClose();
  };

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex items-center justify-center m-0 w-full h-full max-w-none max-h-none bg-transparent border-0"
      aria-label="Compare wallets"
      data-ocid="compare.dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neon-blue/30 bg-neon-blue/10">
              <GitCompareArrows className="h-4 w-4 text-neon-blue" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Compare Wallets
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison modal"
            data-ocid="compare.close_button"
            className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Wallet 1 */}
          <div className="space-y-1.5">
            <Label
              htmlFor="compare-addr1"
              className="text-xs font-medium text-muted-foreground"
            >
              Wallet 1
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-neon-blue/70" />
              <Input
                id="compare-addr1"
                ref={input1Ref}
                data-ocid="compare.wallet1_input"
                placeholder="Enter principal or account ID"
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                className="pl-7 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-neon-blue/50 focus:border-neon-blue/50 font-mono text-sm"
              />
            </div>
          </div>

          {/* VS divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-[11px] font-semibold text-muted-foreground/60 tracking-widest uppercase">
              vs
            </span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Wallet 2 */}
          <div className="space-y-1.5">
            <Label
              htmlFor="compare-addr2"
              className="text-xs font-medium text-muted-foreground"
            >
              Wallet 2
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#FFB300]/70" />
              <Input
                id="compare-addr2"
                data-ocid="compare.wallet2_input"
                placeholder="Enter principal or account ID"
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                className="pl-7 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-[#FFB300]/50 focus:border-[#FFB300]/50 font-mono text-sm"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              data-ocid="compare.cancel_button"
              className="flex-1 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canCompare}
              data-ocid="compare.submit_button"
              className="flex-1 bg-neon-blue/20 border border-neon-blue/40 text-neon-blue hover:bg-neon-blue/30 hover:border-neon-blue/60 disabled:opacity-40"
            >
              <GitCompareArrows className="h-4 w-4 mr-1.5" />
              Compare
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
