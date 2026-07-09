import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";

function shortenId(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}\u2026${id.slice(-4)}`;
}

interface BreadcrumbNavProps {
  historyStack: string[];
  currentPrincipal: string;
  onBack: () => void;
  onReset: () => void;
  onJumpTo: (index: number) => void;
}

export function BreadcrumbNav({
  historyStack,
  currentPrincipal,
  onBack,
  onReset,
  onJumpTo,
}: BreadcrumbNavProps) {
  if (historyStack.length === 0) return null;

  return (
    <div className="sticky top-[60px] z-30 flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 text-xs text-muted-foreground">
      <Button
        data-ocid="wallet.secondary_button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="h-6 px-2 text-xs text-neon-blue hover:text-neon-blue/80 hover:bg-neon-blue/10"
      >
        <ArrowLeft className="h-3 w-3 mr-1" />
        Back
      </Button>

      <div className="flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          data-ocid="wallet.link"
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Home className="h-3 w-3" />
        </button>
        {historyStack.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: history positions are stable indices
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button
              type="button"
              data-ocid="wallet.link"
              onClick={() => onJumpTo(i)}
              className="font-mono opacity-60 hover:opacity-100 hover:text-foreground cursor-pointer transition-colors"
            >
              {shortenId(p)}
            </button>
          </span>
        ))}
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-neon-blue">
          {shortenId(currentPrincipal)}
        </span>
      </div>
    </div>
  );
}
