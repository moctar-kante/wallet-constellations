import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bookmark,
  Check,
  Clock,
  GitCompareArrows,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  Moon,
  Search,
  Star,
  Sun,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Theme } from "../hooks/useTheme";
import {
  clearSearchHistory,
  getSearchHistory,
  getWalletLabels,
} from "../hooks/useWallet";

import type { SearchHistoryEntry } from "../types";

interface TopBarProps {
  onSearch: (principal: string) => void;
  onReset: () => void;
  loading: boolean;
  currentPrincipal?: string;
  theme?: Theme;
  onToggleTheme?: () => void;
  onToggleSavedPanel?: () => void;
  savedPanelOpen?: boolean;
  onOpenCompare?: () => void;
  // Auth props
  isLoggedIn?: boolean;
  authPrincipal?: string | null;
  authLoading?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortPrincipal(p: string): string {
  if (p.length <= 12) return p;
  return `${p.slice(0, 5)}…${p.slice(-3)}`;
}

export function TopBar({
  onSearch,
  onReset,
  loading,
  currentPrincipal,
  theme,
  onToggleTheme,
  onToggleSavedPanel,
  savedPanelOpen,
  onOpenCompare,
  isLoggedIn = false,
  authPrincipal = null,
  authLoading = false,
  onLogin,
  onLogout,
}: TopBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [walletLabels, setWalletLabels] = useState<Record<string, string>>({});
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const authMenuRef = useRef<HTMLDivElement>(null);

  const refreshHistory = () => {
    setSearchHistory(getSearchHistory());
    setWalletLabels(getWalletLabels());
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
      if (
        authMenuRef.current &&
        !authMenuRef.current.contains(e.target as Node)
      ) {
        setAuthMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setHistoryOpen(false);
    onSearch(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") setHistoryOpen(false);
  };

  const handleClear = () => {
    setInputValue("");
    setHistoryOpen(false);
    onReset();
  };

  const handleFocus = () => {
    refreshHistory();
    setHistoryOpen(true);
  };

  const handleHistorySelect = (address: string) => {
    setInputValue(address);
    setHistoryOpen(false);
    onSearch(address);
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    setSearchHistory([]);
  };

  const handleShare = async () => {
    if (!currentPrincipal) return;
    const url = `${window.location.origin}${window.location.pathname}?address=${encodeURIComponent(currentPrincipal)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const tmp = document.createElement("input");
      tmp.value = url;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      document.body.removeChild(tmp);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  const shortAddr = (addr: string) =>
    addr.length > 20 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;

  const emptyHistory =
    historyOpen && searchHistory.length === 0 && !inputValue.trim();

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
              ref={inputRef}
              data-ocid="wallet.search_input"
              placeholder="Enter Principal ID or Account ID…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
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

            {/* Search history dropdown */}
            {historyOpen && (searchHistory.length > 0 || emptyHistory) && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-xl z-50 overflow-hidden"
                data-ocid="wallet.search_history"
              >
                {searchHistory.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>No recent searches</span>
                  </div>
                ) : (
                  <>
                    <div className="max-h-64 overflow-y-auto">
                      {searchHistory.map((entry) => {
                        const lbl = entry.label ?? walletLabels[entry.address];
                        return (
                          <button
                            key={entry.address}
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors text-xs"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleHistorySelect(entry.address);
                            }}
                            data-ocid="wallet.history_item"
                          >
                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-mono text-foreground flex-1 truncate">
                              {shortAddr(entry.address)}
                            </span>
                            {lbl && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-blue/15 text-neon-blue font-semibold shrink-0">
                                {lbl}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/60 shrink-0">
                              {relativeTime(entry.searchedAt)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-border px-3 py-1.5">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleClearHistory();
                        }}
                        data-ocid="wallet.clear_history"
                      >
                        Clear history
                      </button>
                    </div>
                  </>
                )}
              </div>
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

        {/* Right: saved wallets + theme toggle + share + auth */}
        <div className="shrink-0 flex items-center gap-2">
          {/* Saved wallets toggle */}
          {onToggleSavedPanel && (
            <button
              type="button"
              onClick={onToggleSavedPanel}
              title={savedPanelOpen ? "Close saved wallets" : "Saved wallets"}
              aria-label={
                savedPanelOpen
                  ? "Close saved wallets panel"
                  : "Open saved wallets panel"
              }
              data-ocid="wallet.saved_wallets_toggle"
              className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all duration-200 ${
                savedPanelOpen
                  ? "border-neon-blue/50 bg-neon-blue/10 text-neon-blue"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70"
              }`}
            >
              <Bookmark
                className="h-4 w-4"
                fill={savedPanelOpen ? "currentColor" : "none"}
              />
            </button>
          )}

          {/* Theme toggle */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              data-ocid="wallet.theme_toggle"
              className="flex items-center justify-center w-9 h-9 rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-200"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Share link */}
          {currentPrincipal && (
            <button
              type="button"
              onClick={handleShare}
              title={shareCopied ? "Link copied!" : "Copy share link"}
              aria-label="Copy share link for this wallet"
              data-ocid="wallet.share_button"
              className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all duration-200 ${
                shareCopied
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70"
              }`}
            >
              {shareCopied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Compare button */}
          {onOpenCompare && (
            <button
              type="button"
              onClick={onOpenCompare}
              title="Compare two wallets side by side"
              aria-label="Open wallet comparison"
              data-ocid="wallet.compare_button"
              className="flex items-center gap-1.5 px-2.5 h-9 rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-200 text-xs font-medium"
            >
              <GitCompareArrows className="h-4 w-4" />
              <span className="hidden sm:inline">Compare</span>
            </button>
          )}

          {/* Auth button */}
          {onLogin && (
            <div className="relative" ref={authMenuRef}>
              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => setAuthMenuOpen((o) => !o)}
                  title="Account"
                  aria-label="Account menu"
                  data-ocid="wallet.toggle"
                  className="flex items-center gap-1.5 px-2.5 h-9 rounded-full border border-neon-blue/40 bg-neon-blue/10 text-neon-blue hover:bg-neon-blue/20 transition-all duration-200 text-xs font-medium"
                >
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline font-mono">
                    {authPrincipal
                      ? shortPrincipal(authPrincipal)
                      : "Connected"}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLogin}
                  disabled={authLoading}
                  title="Connect with Internet Identity"
                  aria-label="Connect with Internet Identity"
                  data-ocid="wallet.toggle"
                  className="flex items-center gap-1.5 px-2.5 h-9 rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-200 text-xs font-medium disabled:opacity-50"
                >
                  {authLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogIn className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Connect</span>
                </button>
              )}

              {/* Logged-in dropdown */}
              {isLoggedIn && authMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-popover border border-border rounded-md shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <div className="text-[10px] text-muted-foreground mb-0.5">
                      Connected as
                    </div>
                    <div className="font-mono text-xs text-foreground break-all">
                      {authPrincipal}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMenuOpen(false);
                      onLogout?.();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    data-ocid="wallet.button"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
