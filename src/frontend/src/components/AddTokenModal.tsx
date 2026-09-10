import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AddTokenModalProps {
  onAddToken: (canisterId: string) => Promise<void>;
  onClose: () => void;
}

export function AddTokenModal({ onAddToken, onClose }: AddTokenModalProps) {
  const [canisterId, setCanisterId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = canisterId.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAddToken(trimmed);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add this token.",
      );
      setSubmitting(false);
    }
  };

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex items-center justify-center m-0 w-full h-full max-w-none max-h-none bg-transparent border-0"
      aria-label="Add token by canister ID"
      data-ocid="add_token.dialog"
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
              <Coins className="h-4 w-4 text-neon-blue" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Add Token
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add token modal"
            data-ocid="add_token.close_button"
            className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="add-token-canister"
              className="text-xs font-medium text-muted-foreground"
            >
              Ledger Canister ID
            </Label>
            <Input
              id="add-token-canister"
              ref={inputRef}
              data-ocid="add_token.input"
              placeholder="e.g. mxzaz-hqaaa-aaaar-qaada-cai"
              value={canisterId}
              onChange={(e) => setCanisterId(e.target.value)}
              className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-neon-blue/50 focus:border-neon-blue/50 font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Add any ICRC-1 ledger by its canister ID. The ICRC API only serves
              SNS-governed and chain-key tokens automatically — this manual flow
              covers the rest.
            </p>
          </div>

          {error && (
            <div
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400"
              data-ocid="add_token.error_state"
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
              data-ocid="add_token.cancel_button"
              className="flex-1 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-ocid="add_token.submit_button"
              className="flex-1 bg-neon-blue/20 border border-neon-blue/40 text-neon-blue hover:bg-neon-blue/30 hover:border-neon-blue/60 disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4 mr-1.5" />
                  Add Token
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
