import { useEffect, useState } from "react";
import {
  checkExplorerReachable,
  checkIcExplorerReachable,
  getLastIcExplorerError,
  testParser,
} from "../services/explorerService";

type StatusLevel = "ok" | "error" | "checking";

function StatusDot({ status }: { status: StatusLevel }) {
  const color =
    status === "ok"
      ? "bg-neon-green"
      : status === "error"
        ? "bg-neon-red"
        : "bg-neon-amber";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color} ${
        status === "checking" ? "animate-pulse-glow" : ""
      }`}
    />
  );
}

function statusLabel(status: StatusLevel): string {
  switch (status) {
    case "ok":
      return "Online";
    case "error":
      return "Offline";
    default:
      return "Checking\u2026";
  }
}

function statusColor(status: StatusLevel): string {
  switch (status) {
    case "ok":
      return "text-neon-green";
    case "error":
      return "text-neon-red";
    default:
      return "text-neon-amber";
  }
}

export function StatusPanel() {
  const [explorerStatus, setExplorerStatus] = useState<StatusLevel>("checking");
  const [parserStatus, setParserStatus] = useState<StatusLevel>("checking");
  const [icExplorerStatus, setIcExplorerStatus] =
    useState<StatusLevel>("checking");
  // Actual reject reason from the IC Explorer reachability probe (actor-missing
  // vs proxy-reject vs PROXY_ERROR message). Surfaced next to the dot so the
  // user can see why the proxy is offline instead of just a red dot.
  const [icExplorerError, setIcExplorerError] = useState<string | null>(null);

  useEffect(() => {
    setExplorerStatus("checking");
    checkExplorerReachable().then((ok) =>
      setExplorerStatus(ok ? "ok" : "error"),
    );
  }, []);

  useEffect(() => {
    setIcExplorerStatus("checking");
    checkIcExplorerReachable().then((ok) => {
      setIcExplorerStatus(ok ? "ok" : "error");
      setIcExplorerError(ok ? null : getLastIcExplorerError());
    });
  }, []);

  useEffect(() => {
    setParserStatus(testParser() ? "ok" : "error");
  }, []);

  const rows = [
    { label: "Explorer", status: explorerStatus, error: null as string | null },
    {
      label: "IC Explorer",
      status: icExplorerStatus,
      error: icExplorerError,
    },
    { label: "Parser", status: parserStatus, error: null as string | null },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap" data-ocid="wallet.panel">
      {rows.map((row, i) => (
        <div key={row.label} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-border text-xs select-none mr-1.5">|</span>
          )}
          <StatusDot status={row.status} />
          <span className="text-xs text-muted-foreground">{row.label}</span>
          <span className={`text-xs font-medium ${statusColor(row.status)}`}>
            {statusLabel(row.status)}
          </span>
          {row.error && (
            <span
              className="text-[10px] text-neon-red/80 max-w-[180px] truncate"
              title={row.error}
              data-ocid="wallet.ic_explorer.error_state"
            >
              {row.error}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
