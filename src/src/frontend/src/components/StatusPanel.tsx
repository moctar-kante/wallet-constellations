import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useActor } from "../hooks/useActor";
import {
  checkExplorerReachable,
  testParser,
} from "../services/explorerService";

type StatusLevel = "ok" | "error" | "checking" | "unavailable";

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
    case "unavailable":
      return "Unavailable";
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
    case "unavailable":
      return "text-neon-amber";
    default:
      return "text-neon-amber";
  }
}

export function StatusPanel() {
  const { actor, isFetching } = useActor();
  const [explorerStatus, setExplorerStatus] = useState<StatusLevel>("checking");
  const [parserStatus, setParserStatus] = useState<StatusLevel>("checking");

  const pingQuery = useQuery({
    queryKey: ["status-ping"],
    queryFn: async () => {
      if (!actor) throw new Error("no actor");
      return actor.ping();
    },
    enabled: !!actor && !isFetching,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    setExplorerStatus("checking");
    checkExplorerReachable().then((ok) =>
      setExplorerStatus(ok ? "ok" : "error"),
    );
  }, []);

  useEffect(() => {
    setParserStatus(testParser() ? "ok" : "error");
  }, []);

  const backendStatus: StatusLevel = isFetching
    ? "checking"
    : pingQuery.isSuccess
      ? "ok"
      : pingQuery.isError
        ? "unavailable"
        : "checking";

  const rows = [
    { label: "Frontend", status: "ok" as StatusLevel },
    { label: "Backend", status: backendStatus },
    { label: "Explorer", status: explorerStatus },
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
