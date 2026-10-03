import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface AddTokenResult {
  symbol: string;
  decimals: number;
  count: number;
  /** Index canister used for history, or null when the direct-ledger path ran. */
  indexCanisterId: string | null;
  /** True when the index was discovered via ICRC-106 rather than supplied. */
  indexDiscovered: boolean;
}

interface AddTokenModalProps {
  onAddToken: (
    ledgerCanisterId: string,
    indexCanisterId?: string,
  ) => Promise<AddTokenResult>;
  onClose: () => void;
}

const CANISTER_ID_PATTERN = /^[a-z0-9-]{5,63}$/;

export function AddTokenModal({ onAddToken, onClose }: AddTokenModalProps) {
  const [canisterId, setCanisterId] = useState("");
  const [indexCanisterId, setIndexCanisterId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddTokenResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open as a true modal so the browser provides a focus trap and inert
  // background content. The `open` attribute alone does not trap focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
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
  const trimmedIndex = indexCanisterId.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (!CANISTER_ID_PATTERN.test(trimmed)) {
      setError("That doesn't look like a valid canister ID.");
      return;
    }
    if (trimmedIndex && !CANISTER_ID_PATTERN.test(trimmedIndex)) {
      setError("The index canister ID is malformed.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const added = await onAddToken(trimmed, trimmedIndex || undefined);
      setResult(added);
      setSubmitting(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add this token.",
      );
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center m-0 w-full h-full max-w-none max-h-none bg-transparent border-0"
      aria-label="Add token by canister ID"
      data-ocid="add_token.dialog"
    >
      {/* Backdrop — dismisses the modal on click; Escape also closes it. */}
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm cursor-default"
        onClick={onClose}
        aria-label="Close add token modal"
        tabIndex={-1}
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

        {result ? (
          <div className="space-y-4">
            <div
              className="rounded-md border border-neon-green/40 bg-neon-green/10 px-3 py-2.5 text-xs text-foreground"
              data-ocid="add_token.success_state"
            >
              <div className="font-medium">
                Added {result.symbol} — {result.count} transaction
                {result.count === 1 ? "" : "s"} loaded.
              </div>
              <div className="mt-1 text-muted-foreground">
                {result.indexCanisterId ? (
                  <>
                    Index canister:{" "}
                    <span className="font-mono text-foreground">
                      {result.indexCanisterId}
                    </span>
                    {result.indexDiscovered ? " (discovered via ICRC-106)" : ""}
                  </>
                ) : (
                  "No index canister available — history read directly from the ledger."
                )}
              </div>
            </div>
            <Button
              type="button"
              onClick={onClose}
              data-ocid="add_token.close_button"
              className="w-full bg-neon-blue/20 border border-neon-blue/40 text-neon-blue hover:bg-neon-blue/30 hover:border-neon-blue/60"
            >
              Done
            </Button>
          </div>
        ) : (
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
                Add any ICRC-1 ledger by its canister ID. The ICRC API only
                serves SNS-governed and chain-key tokens automatically — this
                manual flow covers the rest.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="add-token-index"
                className="text-xs font-medium text-muted-foreground"
              >
                Index Canister ID{" "}
                <span className="font-normal">(optional)</span>
              </Label>
              <Input
                id="add-token-index"
                data-ocid="add_token.index_input"
                placeholder="Leave blank to auto-discover"
                value={indexCanisterId}
                onChange={(e) => setIndexCanisterId(e.target.value)}
                className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-neon-blue/50 focus:border-neon-blue/50 font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                When omitted, the ledger is asked for its index principal
                (ICRC-106). If none is set, history is read directly from the
                ledger.
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
        )}
      </div>
    </dialog>
  );
}
