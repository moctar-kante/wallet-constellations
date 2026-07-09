import { useEffect, useState } from "react";
import {
  checkExplorerReachable,
  checkIcExplorerReachable,
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

  useEffect(() => {
    setExplorerStatus("checking");
    checkExplorerReachable().then((ok) =>
      setExplorerStatus(ok ? "ok" : "error"),
    );
  }, []);

  useEffect(() => {
    setIcExplorerStatus("checking");
    checkIcExplorerReachable().then((ok) =>
      setIcExplorerStatus(ok ? "ok" : "error"),
    );
  }, []);

  useEffect(() => {
    setParserStatus(testParser() ? "ok" : "error");
  }, []);

  const rows = [
    { label: "Explorer", status: explorerStatus },
    { label: "IC Explorer", status: icExplorerStatus },
    { label: "Parser", status: parserStatus },
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
        </div>
      ))}
    </div>
  );
}
