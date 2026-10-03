import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins, Trash2 } from "lucide-react";
import type { CustomTokenEntry } from "../hooks/useWallet";

interface ManageTokensSectionProps {
  tokens: CustomTokenEntry[];
  onRemove: (ledgerCanisterId: string) => void;
  onAddToken: () => void;
}

export function ManageTokensSection({
  tokens,
  onRemove,
  onAddToken,
}: ManageTokensSectionProps) {
  return (
    <section
      id="manage-tokens"
      aria-labelledby="manage-tokens-heading"
      data-ocid="manage_tokens.section"
      className="w-full"
    >
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle
              id="manage-tokens-heading"
              className="text-sm font-semibold flex items-center gap-2"
            >
              <Coins className="h-4 w-4 text-neon-blue" aria-hidden="true" />
              Manage Added Tokens
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-ocid="manage_tokens.add_button"
              onClick={onAddToken}
              className="text-xs text-neon-blue hover:text-neon-blue/80 hover:bg-neon-blue/10"
            >
              Add Token
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            ICRC-1 tokens you added by ledger canister ID. Removing one drops
            its transactions from the graph.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {tokens.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 py-8 text-center"
              data-ocid="manage_tokens.empty_state"
            >
              <Coins
                className="h-6 w-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground">
                No custom tokens added yet.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-ocid="manage_tokens.empty_add_button"
                onClick={onAddToken}
                className="text-xs text-neon-blue hover:text-neon-blue/80 hover:bg-neon-blue/10"
              >
                Add your first token
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2" data-ocid="manage_tokens.list">
              {tokens.map((token, index) => (
                <li
                  key={token.ledgerCanisterId}
                  data-ocid={`manage_tokens.item.${index + 1}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {token.symbol}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {token.ledgerCanisterId}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-ocid={`manage_tokens.remove_button.${index + 1}`}
                    onClick={() => onRemove(token.ledgerCanisterId)}
                    aria-label={`Remove ${token.symbol}`}
                    className="shrink-0 text-muted-foreground hover:text-neon-red hover:bg-neon-red/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">Remove</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
