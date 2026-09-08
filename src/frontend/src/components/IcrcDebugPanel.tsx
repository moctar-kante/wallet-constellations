import type { IcrcDebugState } from "../hooks/useWallet";

interface IcrcDebugPanelProps {
  debugState: IcrcDebugState | undefined;
  onClose: () => void;
}

export function IcrcDebugPanel({ debugState, onClose }: IcrcDebugPanelProps) {
  return (
    <div
      style={{ pointerEvents: "none" }}
      className="fixed bottom-4 right-4 z-50 w-80"
    >
      <div
        style={{ pointerEvents: "auto" }}
        className="rounded-lg border border-border bg-[#0A0F1C]/95 shadow-2xl text-[11px] font-mono text-foreground overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#0E1626]">
          <span className="text-neon-blue font-semibold text-xs">
            ICRC Debug Panel
          </span>
          <button
            type="button"
            data-ocid="debug.close_button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-base leading-none"
            aria-label="Close debug panel"
          >
            ✕
          </button>
        </div>

        {/* Content — scrollable */}
        <div
          className="overflow-y-auto p-3 space-y-3"
          style={{ maxHeight: "420px" }}
        >
          {!debugState ? (
            <div className="text-muted-foreground">
              No data yet. Run a search to populate.
            </div>
          ) : (
            <>
              {/* Token list summary */}
              <section>
                <div className="text-neon-amber font-semibold mb-1 uppercase tracking-wide">
                  Token List
                </div>
                <div className="space-y-0.5 text-muted-foreground">
                  <div>
                    Count:{" "}
                    <span className="text-foreground">
                      {debugState.tokenListCount}
                    </span>
                  </div>
                  <div>
                    Source:{" "}
                    <span
                      className={
                        debugState.tokenListSource === "fresh"
                          ? "text-neon-green"
                          : debugState.tokenListSource === "cached"
                            ? "text-neon-blue"
                            : "text-neon-amber"
                      }
                    >
                      {debugState.tokenListSource}
                    </span>
                  </div>
                  <div>
                    Fetched:{" "}
                    <span className="text-foreground">
                      {new Date(
                        debugState.tokenListTimestamp,
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </section>

              {/* Transaction counts */}
              <section>
                <div className="text-neon-amber font-semibold mb-1 uppercase tracking-wide">
                  Transaction Counts
                </div>
                <div className="space-y-0.5 text-muted-foreground">
                  <div>
                    ICP:{" "}
                    <span className="text-foreground">
                      {debugState.icpTxCount}
                    </span>
                  </div>
                  <div>
                    ICRC total:{" "}
                    <span className="text-foreground">
                      {debugState.icrcTotalTxCount}
                    </span>
                  </div>
                  <div>
                    Merged:{" "}
                    <span className="text-foreground">
                      {debugState.mergedTxCount}
                    </span>
                  </div>
                </div>
              </section>

              {/* Graph stats */}
              <section>
                <div className="text-neon-amber font-semibold mb-1 uppercase tracking-wide">
                  Graph
                </div>
                <div className="space-y-0.5 text-muted-foreground">
                  <div>
                    ICRC counterparty nodes:{" "}
                    <span className="text-foreground">
                      {debugState.icrcCounterpartyCount}
                    </span>
                  </div>
                  <div>
                    Unconditionally included:{" "}
                    <span className="text-foreground">
                      {debugState.icrcUnconditionalCount}
                    </span>
                  </div>
                </div>
              </section>

              {/* Per-token results */}
              {debugState.perToken.length > 0 && (
                <section>
                  <div className="text-neon-amber font-semibold mb-1 uppercase tracking-wide">
                    Per-Token ({debugState.perToken.length} queried)
                  </div>
                  <div className="space-y-0.5">
                    {debugState.perToken.map((entry, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                        key={i}
                        className={`flex gap-1 items-baseline ${
                          entry.resultCount > 0
                            ? "text-neon-green"
                            : entry.error
                              ? "text-red-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        <span className="font-semibold min-w-[48px]">
                          {entry.symbol}
                        </span>
                        <span className="text-[10px] opacity-70">
                          {entry.canisterId.slice(0, 8)}
                        </span>
                        <span className="ml-auto text-right">
                          {entry.resultCount > 0
                            ? `${entry.resultCount} tx (${entry.addressFormat})`
                            : entry.error
                              ? entry.error.slice(0, 20)
                              : "0"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="text-[10px] text-muted-foreground border-t border-border pt-2">
                Updated: {new Date(debugState.lastUpdated).toLocaleTimeString()}
                <br />
                Press Shift+D to hide
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
