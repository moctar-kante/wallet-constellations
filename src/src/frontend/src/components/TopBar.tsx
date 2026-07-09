import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Star, X } from "lucide-react";
import { useState } from "react";
import type { TimeRange } from "../types";

interface TopBarProps {
  onSearch: (principal: string) => void;
  onReset: () => void;
  loading: boolean;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
}

export function TopBar({
  onSearch,
  onReset,
  loading,
  timeRange,
  onTimeRangeChange,
}: TopBarProps) {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleClear = () => {
    setInputValue("");
    onReset();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo + Title – clickable to reset */}
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-3 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          data-ocid="wallet.link"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-neon-blue/30 bg-neon-blue/10">
            <Star className="h-4 w-4 text-neon-blue" fill="currentColor" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold text-foreground leading-tight">
              Wallet Constellations
            </div>
            <div className="text-xs text-muted-foreground leading-tight">
              ICP Wallet Visualizer
            </div>
          </div>
        </button>

        {/* Search strip */}
        <div className="flex flex-1 items-center gap-2 mx-4 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              data-ocid="wallet.search_input"
              placeholder="Enter Principal ID or Account ID…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`pl-9 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-neon-blue/50 focus:border-neon-blue/50 ${
                inputValue ? "pr-8" : ""
              }`}
            />
            {inputValue && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                data-ocid="wallet.close_button"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Explorer selector (disabled) */}
          <Select disabled defaultValue="ledger">
            <SelectTrigger
              className="w-[130px] bg-muted/50 border-border text-muted-foreground opacity-60"
              data-ocid="wallet.select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ledger">ICP Ledger</SelectItem>
            </SelectContent>
          </Select>

          {/* Time range */}
          <Select
            value={timeRange}
            onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
          >
            <SelectTrigger
              className="w-[90px] bg-muted/50 border-border text-foreground"
              data-ocid="wallet.tab"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Button
            data-ocid="wallet.primary_button"
            onClick={handleSubmit}
            disabled={loading || !inputValue.trim()}
            className="bg-neon-blue/20 border border-neon-blue/40 text-neon-blue hover:bg-neon-blue/30 hover:border-neon-blue/60 shrink-0"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-1 hidden sm:inline">Visualize</span>
          </Button>
        </div>

        {/* Right icons placeholder */}
        <div className="shrink-0 w-10" />
      </div>
    </header>
  );
}
