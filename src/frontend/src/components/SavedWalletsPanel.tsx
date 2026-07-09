import { Bookmark, Clock, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  clearSearchHistory,
  getSavedWallets,
  getSearchHistory,
  getWalletLabels,
} from "../hooks/useWallet";
import type { SavedWallet, SearchHistoryEntry } from "../types";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

interface SavedWalletsPanelProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (address: string) => void;
  onUnpin: (address: string) => void;
  /** Provide so panel can refresh pinned state when star is toggled externally */
  refreshTrigger?: number;
  /** External saved wallets (from useUserData). Falls back to localStorage if not provided. */
  savedWallets?: SavedWallet[];
  /** External labels (from useUserData). Falls back to localStorage if not provided. */
  labels?: Record<string, string>;
}

export function SavedWalletsPanel({
  open,
  onClose,
  onNavigate,
  onUnpin,
  refreshTrigger,
  savedWallets: externalWallets,
  labels: externalLabels,
}: SavedWalletsPanelProps) {
  const [pins, setPins] = useState<SavedWallet[]>(
    () => externalWallets ?? getSavedWallets(),
  );
  const [labels, setLabels] = useState<Record<string, string>>(
    externalLabels ?? {},
  );
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

  const refresh = useCallback(() => {
    setPins(externalWallets ?? getSavedWallets());
    setLabels(externalLabels ?? getWalletLabels());
    setHistory(getSearchHistory());
  }, [externalWallets, externalLabels]);

  // Sync from external props when they change
  useEffect(() => {
    if (externalWallets !== undefined) setPins(externalWallets);
  }, [externalWallets]);

  useEffect(() => {
    if (externalLabels !== undefined) setLabels(externalLabels);
  }, [externalLabels]);

  // Refresh when panel opens or external trigger fires
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional refresh on external trigger
  useEffect(() => {
    refresh();
  }, [refreshTrigger]);

  const handleUnpin = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUnpin(address);
    setPins((prev) => prev.filter((p) => p.address !== address));
  };

  const handleRowClick = (address: string) => {
    onClose();
    onNavigate(address);
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    setHistory([]);
  };

  const recentHistory = history.slice(0, 5);

  return (
    <>
      {/* Backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 sm:hidden"
          onClick={onClose}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          role="presentation"
        />
      )}

      {/* Sliding panel */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-card border-r border-border shadow-2xl
          transition-transform duration-300 ease-in-out
          w-72 sm:w-64
          ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Saved wallets panel"
        role="complementary"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-neon-blue" fill="currentColor" />
            <span className="text-sm font-semibold text-foreground">
              Saved Wallets
            </span>
            {pins.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neon-blue/15 text-neon-blue font-bold">
                {pins.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close saved wallets"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Saved wallets list */}
        <div className="flex-1 overflow-y-auto">
          {pins.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-8 pb-4 gap-3 px-4 text-center">
              <Bookmark className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                No saved wallets yet.
                <br />
                Hover a node and click the{" "}
                <Bookmark className="inline h-3 w-3 mb-0.5" /> icon to pin it.
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {pins.map((pin) => {
                const lbl = pin.label ?? labels[pin.address.toLowerCase()];
                return (
                  <li key={pin.address}>
                    <button
                      type="button"
                      data-ocid="wallet.saved_wallet_item"
                      onClick={() => handleRowClick(pin.address)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left group"
                    >
                      {/* Amber bookmark — click to unpin */}
                      <button
                        type="button"
                        aria-label="Unpin wallet"
                        className="shrink-0 text-neon-amber hover:text-muted-foreground transition-colors"
                        onClick={(e) => handleUnpin(pin.address, e)}
                      >
                        <Bookmark className="h-3.5 w-3.5" fill="currentColor" />
                      </button>

                      {/* Address + label */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-xs text-foreground truncate">
                            {shortAddr(pin.address)}
                          </span>
                          {lbl && (
                            <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-neon-blue/15 text-neon-blue font-semibold">
                              {lbl}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                          <span className="text-[10px] text-muted-foreground/60">
                            pinned {relativeTime(pin.pinnedAt)}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Recent searches section */}
          <div className="border-t border-border mt-1">
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Searches
              </span>
              {recentHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  data-ocid="wallet.clear_history"
                >
                  Clear
                </button>
              )}
            </div>

            {recentHistory.length === 0 ? (
              <p className="px-3 pb-3 text-xs text-muted-foreground/60">
                No recent searches
              </p>
            ) : (
              <ul className="pb-1">
                {recentHistory.map((entry) => {
                  const entryLabel =
                    entry.label ?? labels[entry.address.toLowerCase()];
                  return (
                    <li key={entry.address}>
                      <button
                        type="button"
                        data-ocid="wallet.history_item"
                        onClick={() => handleRowClick(entry.address)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                      >
                        <Clock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-xs text-foreground truncate">
                              {shortAddr(entry.address)}
                            </span>
                            {entryLabel && (
                              <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-neon-blue/15 text-neon-blue font-semibold">
                                {entryLabel}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground/60">
                            {relativeTime(entry.searchedAt)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Footer hint */}
        {pins.length > 0 && (
          <div className="shrink-0 px-3 py-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground/60">
              Click a row to explore that wallet
            </p>
          </div>
        )}
      </div>
    </>
  );
}
