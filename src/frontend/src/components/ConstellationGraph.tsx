import * as d3Force from "d3-force";
import * as d3Selection from "d3-selection";
import * as d3Zoom from "d3-zoom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "../hooks/useTheme";
import type { GraphEdge, GraphNode } from "../types";

// ─── Unified level palette ──────────────────────────────────────────────────
const LEVEL_PALETTE = {
  dark: ["#00c8ff", "#7b68ee", "#ff9800", "#4caf50", "#f06292"],
  light: ["#00c8ff", "#7b3fb0", "#c45e00", "#0e7a6e", "#2e7d32"],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Node2D extends d3Force.SimulationNodeDatum {
  id: string;
  isCenter: boolean;
  txCount: number;
  totalAmount: number;
  depth?: number;
  identity?: import("../types").NodeIdentity;
  isWhale?: boolean;
  isPinned?: boolean;
  netFlowICP?: number;
  clusterSize?: number;
  sparklineData?: number[];
  // d3 adds x, y, vx, vy, fx, fy
}

interface TooltipState {
  edge: GraphEdge;
  x: number;
  y: number;
}

interface NodeInfoState {
  node: Node2D;
  x: number;
  y: number;
}

export interface ConstellationGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  transactions?: import("../types").Transaction[];
  centralNodeId?: string;
  centerPrincipal?: string;
  onNavigate: (principal: string) => void;
  breadcrumbs?: { id: string; label: string }[];
  onBreadcrumbClick?: (index: number) => void;
  isLoading?: boolean;
  timeRange?: string;
  labels?: Record<string, string>;
  externalLabels?: Record<string, string>;
  favorites?: Set<string>;
  onLabelChange?: (id: string, label: string) => void;
  onSetLabel?: (id: string, label: string) => void;
  onFavoriteToggle?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  isFavorite?: (address: string) => boolean;
  edgeWeight?: "tx_count" | "total_amount" | string;
  maxCounterparties?: number;
  onMaxCounterpartiesChange?: (v: number) => void;
  graphDepth?: number;
  onDepthChange?: (d: number) => void;
  depthLoading?: boolean;
  txLimit?: number;
  onTxLimitChange?: (v: number) => void;
  icrcLoading?: boolean;
  showCrossEdges?: boolean;
  onShowCrossEdgesChange?: (v: boolean) => void;
  icpUsdPrice?: number;
  onPinToggle?: () => void;
  highlightNodeIds?: string[];
  highlightColor?: string;
  accentColor?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(3)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(3)}k`;
  return n.toFixed(3);
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function tokenColor(token: string): string {
  if (token === "ICP") return "rgba(85,119,255,0.85)";
  // Hash-based color for ICRC tokens
  let hash = 0;
  for (let i = 0; i < token.length; i++)
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue},70%,65%)`;
}

function nodeColor(
  node: Node2D,
  isDark: boolean,
): {
  fill: string;
  glow: string;
  ring?: string;
} {
  if (node.isCenter)
    return {
      fill: "#00c8ff",
      glow: "#00c8ff",
    };
  if (node.isWhale)
    return {
      fill: isDark ? "#ff9800" : "#b85c00",
      glow: isDark ? "#ff9800" : "#b85c00",
    };
  const id = node.identity;
  if (id) {
    switch (id.type) {
      case "sns":
        return {
          fill: isDark ? "#4caf50" : "#2a7a40",
          glow: isDark ? "#4caf50" : "#2a7a40",
        };
      case "dex":
        return {
          fill: isDark ? "#ffc107" : "#b87c00",
          glow: isDark ? "#ffc107" : "#b87c00",
        };
      case "neuron":
        return {
          fill: isDark ? "#3f51b5" : "#283593",
          glow: isDark ? "#3f51b5" : "#283593",
        };
      case "nns":
        return {
          fill: "#9c27b0",
          glow: "#9c27b0",
        };
      default:
        break;
    }
  }
  return {
    fill: isDark ? "#4a6fa5" : "#2a6496",
    glow: isDark ? "#5577ff" : "#2a6496",
  };
}

function edgeStrokeWidth(
  edge: GraphEdge,
  mode: "volume" | "count" = "volume",
): number {
  const metric =
    mode === "count"
      ? (edge.tx_count ?? 1)
      : (edge.total_amount ?? edge.tx_count ?? 1);
  return Math.min(5, Math.max(1.5, 1 + Math.log2(metric) * 0.6));
}

// quadratic bezier control point — perpendicular to midpoint, alternating
function bezierControlPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  edgeIndex: number,
): { cx: number; cy: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;
  // Bulge magnitude: 30–70px based on distance
  const bulge = Math.min(70, Math.max(30, len * 0.28));
  const sign = edgeIndex % 2 === 0 ? 1 : -1;
  return { cx: mx + px * bulge * sign, cy: my + py * bulge * sign };
}

// ─── Star field (memoised, static) ───────────────────────────────────────────

const STARS = Array.from({ length: 220 }, (_, i) => ({
  id: i,
  cx: Math.sin(i * 137.508 * (Math.PI / 180)) * 50 + 50,
  cy: Math.cos(i * 97.3 * (Math.PI / 180)) * 50 + 50,
  r: 0.5 + (i % 5) * 0.35,
  opacity: 0.2 + (i % 7) * 0.085,
}));

// ─── Legend rows (defined inside component for theme-awareness) ─────────────

// ─── Main component ───────────────────────────────────────────────────────────

export function ConstellationGraph({
  nodes,
  edges,
  onNavigate,
  breadcrumbs = [],
  onBreadcrumbClick,
  isLoading = false,
  externalLabels,
  labels: _labelsLegacy,
  favorites: _favoritesLegacy,
  onLabelChange: _onLabelChange,
  onSetLabel,
  onFavoriteToggle: _onFavoriteToggle,
  onToggleFavorite,
  isFavorite,
  maxCounterparties,
  onMaxCounterpartiesChange,
  graphDepth,
  onDepthChange,
  depthLoading,
  showCrossEdges,
  onShowCrossEdgesChange,
}: ConstellationGraphProps) {
  // ── Merged state helpers ──
  const labels: Record<string, string> = externalLabels ?? _labelsLegacy ?? {};
  const favorites: Set<string> = _favoritesLegacy ?? new Set<string>();
  const checkFavorite = isFavorite ?? ((id: string) => favorites.has(id));

  const handleLabelEditCb = (id: string, lbl: string) => {
    if (onSetLabel) onSetLabel(id, lbl);
    else if (_onLabelChange) _onLabelChange(id, lbl);
  };
  const handleFavoriteToggle = (id: string) => {
    if (onToggleFavorite) onToggleFavorite(id);
    else if (_onFavoriteToggle) _onFavoriteToggle(id);
  };

  // ── UI state ──
  const { theme, setTheme } = useTheme();
  // Keep theme in sync with other hook instances via storage events
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "icpath_theme" &&
        (e.newValue === "dark" || e.newValue === "light")
      ) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setTheme]);
  const isDark = theme === "dark";
  const LEGEND_ITEMS = [
    { dark: "#00c8ff", light: "#00c8ff", label: "Center wallet" },
    { dark: "#4a6fa5", light: "#2a6496", label: "Counterparty" },
    { dark: "#ff9800", light: "#b85c00", label: "Whale: > 10k ICP" },
    { dark: "#4caf50", light: "#2a7a40", label: "SNS / Project" },
    { dark: "#ffc107", light: "#b87c00", label: "DEX / Exchange" },
    { dark: "#3f51b5", light: "#283593", label: "Neuron" },
    { dark: "#9c27b0", light: "#9c27b0", label: "NNS" },
  ];
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [minEdgeVolume, setMinEdgeVolume] = useState(0);
  const [_selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfoState | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<TooltipState | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [colorByLevel, setColorByLevel] = useState(false);
  const [edgeWeightMode, setEdgeWeightMode] = useState<"volume" | "count">(
    "volume",
  );

  const nodeInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const isMobile = "ontouchstart" in window;

  // Refs for click-outside handlers
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsToggleRef = useRef<HTMLButtonElement | null>(null);
  const edgeTooltipRef = useRef<HTMLDivElement | null>(null);
  const nodeInfoRef = useRef<HTMLDivElement | null>(null);

  // Click-outside: Settings panel
  useEffect(() => {
    if (!settingsPanelOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(target) &&
        settingsToggleRef.current &&
        !settingsToggleRef.current.contains(target)
      ) {
        setSettingsPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsPanelOpen]);

  // Click-outside: Edge tooltip
  useEffect(() => {
    if (!edgeTooltip) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (edgeTooltipRef.current && !edgeTooltipRef.current.contains(target)) {
        if (edgeLeaveTimerRef.current) clearTimeout(edgeLeaveTimerRef.current);
        setEdgeTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [edgeTooltip]);

  // Click-outside: Node info box
  useEffect(() => {
    if (!nodeInfo) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (nodeInfoRef.current && !nodeInfoRef.current.contains(target)) {
        if (nodeInfoTimeoutRef.current)
          clearTimeout(nodeInfoTimeoutRef.current);
        setNodeInfo(null);
        setSelectedNodeId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [nodeInfo]);

  // ── Simulation state ──
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const [simNodes, setSimNodes] = useState<Node2D[]>([]);
  const simRef = useRef<d3Force.Simulation<Node2D, undefined> | null>(null);
  const simNodesRef = useRef<Node2D[]>([]);
  const zoomRef = useRef<d3Zoom.ZoomBehavior<SVGSVGElement, unknown> | null>(
    null,
  );
  const [transform, setTransform] = useState<d3Zoom.ZoomTransform>(
    d3Zoom.zoomIdentity,
  );

  // Convert GraphNode → Node2D for d3 simulation
  const initialNodes = useMemo<Node2D[]>(() => {
    return nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * 2 * Math.PI;
      const radius = n.isCenter
        ? 0
        : n.depth === 2
          ? 320 + Math.random() * 60
          : n.depth === 3
            ? 460 + Math.random() * 60
            : 180 + Math.random() * 60;
      return {
        ...n,
        depth: n.depth ?? 0,
        x: n.isCenter ? 0 : radius * Math.cos(angle),
        y: n.isCenter ? 0 : radius * Math.sin(angle),
        vx: 0,
        vy: 0,
        fx: n.isCenter ? 0 : undefined,
        fy: n.isCenter ? 0 : undefined,
      };
    });
  }, [nodes]);

  // ── D3 Force simulation ──
  useEffect(() => {
    if (initialNodes.length === 0) {
      setSimNodes([]);
      return;
    }

    // Deep-copy so d3 can mutate positions
    const nd: Node2D[] = initialNodes.map((n) => ({ ...n }));

    const linkData = edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    const sim = d3Force
      .forceSimulation<Node2D>(nd)
      .force(
        "link",
        d3Force
          .forceLink<Node2D, d3Force.SimulationLinkDatum<Node2D>>(linkData)
          .id((d) => d.id)
          .distance(110)
          .strength(0.4),
      )
      .force("charge", d3Force.forceManyBody<Node2D>().strength(-420))
      .force("center", d3Force.forceCenter<Node2D>(0, 0).strength(0.05))
      .force(
        "collide",
        d3Force.forceCollide<Node2D>().radius((d) => (d.isCenter ? 30 : 22)),
      )
      .alphaDecay(0.08)
      .velocityDecay(0.45)
      .stop();

    // Pre-run simulation silently so the first frame shows settled positions
    sim.tick(200);
    setSimNodes([...nd]);

    // Attach tick listener and restart for remaining warm settling
    sim.on("tick", () => {
      setSimNodes([...nd]);
    });
    sim.restart();

    simRef.current = sim;

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [initialNodes, edges]);

  // Keep simNodesRef in sync
  useEffect(() => {
    simNodesRef.current = simNodes;
  }, [simNodes]);

  // Re-paint D3 elements when theme or color mode changes (Bug 1 & 2)
  useEffect(() => {
    if (!gRef.current || simNodesRef.current.length === 0) return;

    const g = d3Selection.select(gRef.current);
    const levelPalette = isDark ? LEVEL_PALETTE.dark : LEVEL_PALETTE.light;

    // Update node circles — select all groups with data-node-id, then their first circle
    g.selectAll<SVGCircleElement, unknown>("circle").each(function () {
      const circle = d3Selection.select<SVGCircleElement, unknown>(this);
      const parent = circle.node()?.parentElement;
      if (!parent) return;

      const nodeId = parent.getAttribute("data-node-id");
      if (!nodeId) return;

      const node = simNodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      if (circle.attr("data-role") === "node-fill") {
        // Main node circle
        const fill = colorByLevel
          ? levelPalette[(node.depth ?? 0) % levelPalette.length]
          : nodeColor(node, isDark).fill;
        circle.attr("fill", fill);
      } else if (circle.attr("data-role") === "node-glow") {
        // Glow halo
        if (colorByLevel) {
          const levelCol =
            levelPalette[(node.depth ?? 0) % levelPalette.length];
          circle.attr("fill", `${levelCol}4d`); // ~30% opacity tint
        } else {
          const { glow } = nodeColor(node, isDark);
          circle.attr("fill", glow);
        }
      }
    });

    // Update edge paths
    g.selectAll<SVGPathElement, unknown>("path").each(function () {
      const path = d3Selection.select<SVGPathElement, unknown>(this);
      if (path.attr("stroke") === "transparent") return;
      path.attr("stroke", isDark ? "rgba(100,140,220,0.55)" : "#888888");
    });

    // Update text labels
    g.selectAll<SVGTextElement, unknown>("text").each(function () {
      const text = d3Selection.select<SVGTextElement, unknown>(this);
      if (text.attr("fontSize") === "9") {
        text.attr("fill", isDark ? "rgba(180,200,240,0.75)" : "#111111");
      }
    });
  }, [isDark, colorByLevel]);

  // ── Node ID → position map ──
  const nodeMap = useMemo(() => {
    const m = new Map<string, Node2D>();
    for (const n of simNodes) m.set(n.id, n);
    return m;
  }, [simNodes]);

  // ── D3 Zoom setup ──
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3Selection.select(
      svgRef.current,
    ) as unknown as d3Selection.Selection<
      SVGSVGElement,
      unknown,
      null,
      undefined
    >;

    const zoom = d3Zoom
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (event: d3Zoom.D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(event.transform);
      });

    zoom(svg);
    zoomRef.current = zoom;

    // Initial fit — center with slight zoom
    const w = svgRef.current.clientWidth || 800;
    const h = svgRef.current.clientHeight || 600;
    svg.call(
      zoom.transform,
      d3Zoom.zoomIdentity.translate(w / 2, h / 2).scale(0.85),
    );

    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3Selection.select(
      svgRef.current,
    ) as unknown as d3Selection.Selection<
      SVGSVGElement,
      unknown,
      null,
      undefined
    >;
    zoomRef.current.scaleBy(svg, 1.3);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3Selection.select(
      svgRef.current,
    ) as unknown as d3Selection.Selection<
      SVGSVGElement,
      unknown,
      null,
      undefined
    >;
    zoomRef.current.scaleBy(svg, 1 / 1.3);
  }, []);

  const handleFitView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || simNodes.length === 0) return;
    const svg = d3Selection.select(
      svgRef.current,
    ) as unknown as d3Selection.Selection<
      SVGSVGElement,
      unknown,
      null,
      undefined
    >;
    const w = svgRef.current.clientWidth || 800;
    const h = svgRef.current.clientHeight || 600;
    const xs = simNodes.map((n) => n.x ?? 0);
    const ys = simNodes.map((n) => n.y ?? 0);
    const minX = Math.min(...xs) - 40;
    const maxX = Math.max(...xs) + 40;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 40;
    const scale = Math.min(
      (0.9 * w) / (maxX - minX),
      (0.9 * h) / (maxY - minY),
      4,
    );
    const tx = w / 2 - scale * ((minX + maxX) / 2);
    const ty = h / 2 - scale * ((minY + maxY) / 2);
    svg.call(
      zoomRef.current.transform,
      d3Zoom.zoomIdentity.translate(tx, ty).scale(scale),
    );
  }, [simNodes]);

  // ── Node interactions ──
  const handleNodeClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent, node: Node2D) => {
      e.stopPropagation();
      setSelectedNodeId(node.id);
      setEdgeTooltip(null);
      if (nodeInfoTimeoutRef.current) clearTimeout(nodeInfoTimeoutRef.current);

      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

      const tooltipW = 230;
      const tooltipH = 270;
      const rawX = clientX + 14;
      const rawY = clientY - 14;
      const cx =
        rawX + tooltipW > window.innerWidth ? clientX - tooltipW - 10 : rawX;
      const cy =
        rawY + tooltipH > window.innerHeight ? clientY - tooltipH - 10 : rawY;
      setNodeInfo({ node, x: cx, y: cy });
    },
    [],
  );

  const handleNodeInfoMouseLeave = useCallback(() => {
    if (isMobile) return;
    nodeInfoTimeoutRef.current = setTimeout(() => {
      setNodeInfo(null);
      setSelectedNodeId(null);
    }, 3000);
  }, [isMobile]);

  const handleNodeInfoMouseEnter = useCallback(() => {
    if (nodeInfoTimeoutRef.current) clearTimeout(nodeInfoTimeoutRef.current);
  }, []);

  // ── Edge interactions ──
  const handleEdgeEnter = useCallback(
    (e: React.MouseEvent, edge: GraphEdge, key: string) => {
      // Cancel any pending close timer so switching edges works cleanly
      if (edgeLeaveTimerRef.current) {
        clearTimeout(edgeLeaveTimerRef.current);
        edgeLeaveTimerRef.current = null;
      }
      setHoveredEdgeKey(key);
      const tooltipW = 250;
      const tooltipH = 230;
      const x = e.clientX;
      const y = e.clientY;
      const cx =
        x + 14 + tooltipW > window.innerWidth ? x - tooltipW - 14 : x + 14;
      const cy =
        y - 14 + tooltipH > window.innerHeight ? y - tooltipH - 14 : y - 14;
      setEdgeTooltip({ edge, x: cx, y: cy });
    },
    [],
  );

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdgeKey(null);
    if (isMobile) return;
    // Start grace-period timer — tooltip stays open 3s so user can interact
    if (edgeLeaveTimerRef.current) clearTimeout(edgeLeaveTimerRef.current);
    edgeLeaveTimerRef.current = setTimeout(() => {
      setEdgeTooltip(null);
      edgeLeaveTimerRef.current = null;
    }, 3000);
  }, [isMobile]);

  const handleEdgeTap = useCallback(
    (e: React.TouchEvent, edge: GraphEdge, key: string) => {
      e.stopPropagation();
      // Cancel any pending close timer
      if (edgeLeaveTimerRef.current) {
        clearTimeout(edgeLeaveTimerRef.current);
        edgeLeaveTimerRef.current = null;
      }
      const touch = e.changedTouches[0];
      const tooltipW = 250;
      const tooltipH = 230;
      const x = touch.clientX;
      const y = touch.clientY;
      const cx =
        x + 14 + tooltipW > window.innerWidth ? x - tooltipW - 14 : x + 14;
      const cy =
        y - 14 + tooltipH > window.innerHeight ? y - tooltipH - 14 : y - 14;
      setHoveredEdgeKey(key);
      // On mobile tooltip is permanent — no auto-close
      setEdgeTooltip({ edge, x: cx, y: cy });
    },
    [],
  );

  // ── Label edit ──
  const handleLabelEdit = useCallback(
    (nodeId: string) => {
      setEditingLabel(nodeId);
      setLabelInput(labels[nodeId] || "");
    },
    [labels],
  );

  const handleLabelSave = useCallback(() => {
    if (editingLabel) {
      handleLabelEditCb(editingLabel, labelInput.slice(0, 6));
      setEditingLabel(null);
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  }, [editingLabel, labelInput, handleLabelEditCb]);

  // ── Edge tooltip content ──
  const renderEdgeTooltipContent = (edge: GraphEdge) => {
    const tokens = Array.from(
      new Set([
        ...Object.keys(edge.inAmountByToken || {}),
        ...Object.keys(edge.outAmountByToken || {}),
      ]),
    );
    if (tokens.length === 0)
      return (
        <div style={{ color: "#7799cc", fontSize: 11 }}>No token data</div>
      );
    return tokens.map((token) => {
      const inAmt = edge.inAmountByToken?.[token] || 0;
      const outAmt = edge.outAmountByToken?.[token] || 0;
      const inCnt = edge.inCountByToken?.[token] || 0;
      const outCnt = edge.outCountByToken?.[token] || 0;
      return (
        <div key={token} style={{ marginBottom: 5 }}>
          <span
            style={{ color: tokenColor(token), fontWeight: 700, fontSize: 11 }}
          >
            {token}
          </span>
          {inAmt > 0 && (
            <div style={{ color: "#44ff88", fontSize: 11, paddingLeft: 8 }}>
              ↓ {formatAmount(inAmt)}
              <span style={{ opacity: 0.7 }}> ({inCnt})</span>
            </div>
          )}
          {outAmt > 0 && (
            <div style={{ color: "#ffaa44", fontSize: 11, paddingLeft: 8 }}>
              ↑ {formatAmount(outAmt)}
              <span style={{ opacity: 0.7 }}> ({outCnt})</span>
            </div>
          )}
        </div>
      );
    });
  };

  // ── SVG rendering ──
  const svgTransform = `translate(${transform.x},${transform.y}) scale(${transform.k})`;

  return (
    <div
      data-ocid="graph.canvas_target"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: isDark ? "#070b14" : "#f0f4ff",
      }}
    >
      {/* Star field background canvas */}
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient
            id={isDark ? "nebula1" : "nebula1-light"}
            cx="40%"
            cy="45%"
            r="50%"
          >
            <stop
              offset="0%"
              stopColor={isDark ? "#1e2878" : "#a8b8ff"}
              stopOpacity={isDark ? 0.35 : 0.12}
            />
            <stop
              offset="50%"
              stopColor={isDark ? "#321450" : "#c8d0ff"}
              stopOpacity={isDark ? 0.18 : 0.06}
            />
            <stop
              offset="100%"
              stopColor={isDark ? "#000" : "#fff"}
              stopOpacity={0}
            />
          </radialGradient>
          <radialGradient
            id={isDark ? "nebula2" : "nebula2-light"}
            cx="70%"
            cy="65%"
            r="40%"
          >
            <stop
              offset="0%"
              stopColor={isDark ? "#0a2a50" : "#b0c8e8"}
              stopOpacity={isDark ? 0.28 : 0.08}
            />
            <stop
              offset="100%"
              stopColor={isDark ? "#000" : "#fff"}
              stopOpacity={0}
            />
          </radialGradient>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={isDark ? "url(#nebula1)" : "url(#nebula1-light)"}
        />
        <rect
          width="100%"
          height="100%"
          fill={isDark ? "url(#nebula2)" : "url(#nebula2-light)"}
        />
        {STARS.map((s) => (
          <circle
            key={s.id}
            cx={`${s.cx}%`}
            cy={`${s.cy}%`}
            r={s.r}
            fill={isDark ? "white" : "#8899bb"}
            opacity={s.opacity}
          />
        ))}
      </svg>

      {/* Main graph SVG */}
      <svg
        ref={svgRef}
        role="img"
        aria-label="Wallet transaction graph"
        tabIndex={-1}
        onKeyDown={() => {}}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor: "grab",
          outline: "none",
          border: "none",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none" as const,
          WebkitUserSelect: "none" as const,
        }}
        onClick={() => {
          setNodeInfo(null);
          setSelectedNodeId(null);
          setEdgeTooltip(null);
        }}
      >
        <defs>
          {/* Glow filters */}
          <filter id="glow-center" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-whale" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter
            id="glow-default"
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-hover" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Transform group for zoom/pan */}
        <g ref={gRef} transform={svgTransform}>
          {/* Edges — filtered by minEdgeVolume */}
          {edges
            .filter(
              (edge) =>
                (edge.total_amount ?? 0) >= minEdgeVolume ||
                minEdgeVolume === 0,
            )
            .map((edge, i) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (
                !src ||
                !tgt ||
                src.x == null ||
                src.y == null ||
                tgt.x == null ||
                tgt.y == null
              )
                return null;

              const x1 = src.x;
              const y1 = src.y;
              const x2 = tgt.x;
              const y2 = tgt.y;
              const { cx: cpx, cy: cpy } = bezierControlPoint(
                x1,
                y1,
                x2,
                y2,
                i,
              );
              const pathD = `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;

              const edgeKey = `${edge.source}-${edge.target}-${i}`;
              const isHovered = hoveredEdgeKey === edgeKey;
              const strokeW = edgeStrokeWidth(edge, edgeWeightMode);

              const tokenKeys = Object.keys(edge.inAmountByToken || {}).concat(
                Object.keys(edge.outAmountByToken || {}),
              );
              const primaryToken = tokenKeys[0] || "ICP";
              const stroke = isHovered
                ? isDark
                  ? "rgba(180,210,255,0.85)"
                  : "rgba(60,100,180,0.7)"
                : // Use tokenColor() for both dark and light mode — same vivid palette
                  tokenColor(primaryToken).startsWith("hsl")
                  ? isDark
                    ? tokenColor(primaryToken).replace("65%)", "70%)")
                    : tokenColor(primaryToken).replace("65%)", "50%)")
                  : tokenColor(primaryToken);

              return (
                <g key={edgeKey}>
                  {/* Visible edge */}
                  <path
                    d={pathD}
                    stroke={stroke}
                    strokeWidth={isHovered ? strokeW + 1 : strokeW}
                    fill="none"
                    strokeOpacity={isHovered ? 0.9 : 0.55}
                    style={{
                      transition:
                        "stroke 0.2s, stroke-opacity 0.2s, stroke-width 0.2s",
                    }}
                    pointerEvents="none"
                  />
                  {/* Wide invisible hit area */}
                  <path
                    d={pathD}
                    stroke="transparent"
                    strokeWidth={14}
                    fill="none"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => handleEdgeEnter(e, edge, edgeKey)}
                    onMouseLeave={handleEdgeLeave}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdgeEnter(e, edge, edgeKey);
                    }}
                    onKeyDown={() => {}}
                    role="button"
                    tabIndex={0}
                    onTouchStart={(e) => handleEdgeTap(e, edge, edgeKey)}
                  />
                </g>
              );
            })}

          {/* Nodes */}
          {simNodes.map((node) => {
            if (node.x == null || node.y == null) return null;
            const levelPalette = isDark
              ? LEVEL_PALETTE.dark
              : LEVEL_PALETTE.light;
            const resolvedColor = (n: GraphNode) =>
              colorByLevel
                ? levelPalette[
                    ((n as GraphNode & { depth?: number }).depth ?? 0) %
                      levelPalette.length
                  ]
                : nodeColor(n, isDark).fill;
            const { glow } = nodeColor(node, isDark);
            const fill = resolvedColor(node);
            const r = node.isCenter ? 22 : 16;
            const isHovered = hoveredNodeId === node.id;
            const scale = isHovered ? 1.15 : 1;
            const filterId = node.isCenter
              ? "glow-center"
              : isHovered
                ? "glow-hover"
                : node.isWhale
                  ? "glow-whale"
                  : "glow-default";
            const customLabel = labels[node.id];
            const isFav = checkFavorite(node.id);
            const nodeLabel = truncateAddress(node.id);

            return (
              <g
                key={node.id}
                data-node-id={node.id}
                transform={`translate(${node.x},${node.y}) scale(${scale})`}
                style={{
                  cursor: "pointer",
                  transition: "transform 0.15s ease",
                  outline: "none",
                }}
                onClick={(e) => handleNodeClick(e, node)}
                onKeyDown={() => {}}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                {/* Glow halo */}
                <circle
                  data-role="node-glow"
                  r={r + 4}
                  fill={glow}
                  opacity={node.isCenter ? 0.22 : 0.12}
                  filter={`url(#${filterId})`}
                />

                {/* Main node circle */}
                <circle
                  data-role="node-fill"
                  r={r}
                  fill={fill}
                  opacity={0.92}
                  filter={`url(#${filterId})`}
                  stroke={glow}
                  strokeWidth={1}
                  strokeOpacity={0.7}
                  strokeDasharray="none"
                />

                {/* Favorite star */}
                {isFav && (
                  <text
                    y={-r - 5}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#ffcc00"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    ★
                  </text>
                )}

                {/* Identity badge */}
                {node.identity && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={node.isCenter ? 13 : 10}
                    fill="white"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {node.identity.icon}
                  </text>
                )}

                {/* Custom label pill */}
                {customLabel && showLabels && (
                  <g transform={`translate(0,${-r - 16})`}>
                    <rect
                      x={-18}
                      y={-9}
                      width={36}
                      height={13}
                      rx={3}
                      fill="rgba(0,100,200,0.75)"
                      stroke="rgba(100,180,255,0.5)"
                      strokeWidth={0.8}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="8"
                      fill="#ccddff"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {customLabel}
                    </text>
                  </g>
                )}

                {/* Address label below node */}
                {showLabels && (
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fill={isDark ? "rgba(180,200,240,0.75)" : "#111111"}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {nodeLabel}
                  </text>
                )}

                {/* Pencil icon on hover */}
                {isHovered && (
                  <g
                    transform={`translate(${r + 2}, ${-r - 2})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLabelEdit(node.id);
                    }}
                    onKeyDown={() => {}}
                    style={{ cursor: "text" }}
                  >
                    <circle
                      r={8}
                      fill="rgba(20,40,80,0.85)"
                      stroke="rgba(100,160,255,0.5)"
                      strokeWidth={0.8}
                    />
                    {/* Pencil SVG path (no fill) */}
                    <path
                      d="M-3 2 L0 -3 L3 2 L0 3 Z M0 -3 L2 -5 L5 -2 L3 2 Z"
                      fill="none"
                      stroke="#aaccff"
                      strokeWidth={0.9}
                      strokeLinejoin="round"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isDark
              ? "rgba(7,11,20,0.72)"
              : "rgba(240,244,255,0.72)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div style={{ color: "#4488ff", fontSize: 15, letterSpacing: 1 }}>
            Loading constellation…
          </div>
        </div>
      )}

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div
          data-ocid="graph.breadcrumbs"
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            display: "flex",
            gap: 5,
            flexWrap: "wrap",
            zIndex: 20,
            maxWidth: "70%",
          }}
        >
          {breadcrumbs.map((crumb, i) => (
            <button
              key={crumb.id}
              type="button"
              data-ocid={`graph.breadcrumb.item.${i + 1}`}
              onClick={() => onBreadcrumbClick?.(i)}
              style={{
                background: "rgba(20,30,60,0.88)",
                border: "1px solid rgba(60,80,140,0.7)",
                color: i === breadcrumbs.length - 1 ? "#88bbff" : "#7799cc",
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 11,
                cursor: "pointer",
                fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
              }}
            >
              {crumb.label || truncateAddress(crumb.id)}
            </button>
          ))}
        </div>
      )}

      {/* Settings toggle */}
      <button
        ref={settingsToggleRef}
        type="button"
        data-ocid="graph.settings_toggle"
        onClick={() => setSettingsPanelOpen((v) => !v)}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: isDark ? "rgba(15,22,50,0.92)" : "rgba(240,242,248,0.95)",
          border: isDark
            ? "1px solid rgba(60,80,140,0.6)"
            : "1px solid rgba(180,190,220,0.6)",
          color: isDark ? "#7799cc" : "#334466",
          padding: "5px 11px",
          borderRadius: 5,
          fontSize: 12,
          cursor: "pointer",
          zIndex: 20,
          letterSpacing: 0.3,
        }}
      >
        {settingsPanelOpen ? "✕ Close" : "⚙ Settings"}
      </button>

      {/* Settings panel */}
      {settingsPanelOpen && (
        <div
          ref={settingsPanelRef}
          data-ocid="graph.settings_panel"
          style={{
            position: "absolute",
            top: 42,
            right: 10,
            background: isDark
              ? "rgba(8,13,36,0.97)"
              : "rgba(255,255,255,0.97)",
            border: isDark
              ? "1px solid rgba(60,80,140,0.65)"
              : "1px solid rgba(180,190,220,0.65)",
            borderRadius: 8,
            padding: 14,
            width: 210,
            zIndex: 20,
            boxShadow: isDark
              ? "0 4px 24px rgba(0,30,100,0.35)"
              : "0 4px 24px rgba(0,30,100,0.12)",
          }}
        >
          <div
            style={{
              color: isDark ? "#5577aa" : "#1a1a2e",
              fontSize: 10,
              marginBottom: 12,
              fontWeight: 700,
              letterSpacing: 1.2,
            }}
          >
            SETTINGS
          </div>

          {/* Show labels */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: isDark ? "#aaccff" : "#1a1a2e",
              fontSize: 12,
              marginBottom: 12,
              cursor: "pointer",
            }}
          >
            <input
              data-ocid="graph.settings.show_labels.checkbox"
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              style={{ accentColor: "#4488ff" }}
            />
            Show labels
          </label>

          {/* Max nodes slider */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: isDark ? "#8aaacf" : "#1a1a2e",
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <span>Max nodes</span>
              <span
                style={{
                  color: isDark ? "#aaccff" : "#1a1a2e",
                  fontWeight: 600,
                }}
              >
                {maxCounterparties ?? 20}
              </span>
            </div>
            <input
              data-ocid="graph.settings.max_nodes.input"
              type="range"
              min={5}
              max={50}
              step={5}
              value={maxCounterparties ?? 20}
              onChange={(e) =>
                onMaxCounterpartiesChange?.(Number(e.target.value))
              }
              style={{ width: "100%", accentColor: "#4488ff" }}
            />
          </div>

          {/* Min edge volume slider */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: isDark ? "#8aaacf" : "#1a1a2e",
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <span>Min edge volume</span>
              <span
                style={{
                  color: isDark ? "#aaccff" : "#1a1a2e",
                  fontWeight: 600,
                }}
              >
                {minEdgeVolume === 0 ? "All" : formatAmount(minEdgeVolume)}
              </span>
            </div>
            <input
              data-ocid="graph.settings.min_edge_volume.input"
              type="range"
              min={0}
              max={500}
              step={10}
              value={minEdgeVolume}
              onChange={(e) => setMinEdgeVolume(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#4488ff" }}
            />
          </div>

          {/* Depth level */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                color: isDark ? "#8aaacf" : "#1a1a2e",
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              Depth level
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {([1, 2, 3] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  data-ocid={`graph.settings.depth_${d}.button`}
                  onClick={() => onDepthChange?.(d)}
                  style={{
                    flex: 1,
                    background:
                      (graphDepth ?? 1) === d
                        ? "rgba(40,80,200,0.75)"
                        : "rgba(20,30,70,0.55)",
                    border: `1px solid ${(graphDepth ?? 1) === d ? "rgba(80,140,255,0.7)" : "rgba(50,70,130,0.4)"}`,
                    color:
                      (graphDepth ?? 1) === d
                        ? isDark
                          ? "#cce0ff"
                          : "#1a1a2e"
                        : isDark
                          ? "#7799bb"
                          : "#1a1a2e",
                    borderRadius: 4,
                    fontSize: 12,
                    padding: "4px 0",
                    cursor: depthLoading ? "not-allowed" : "pointer",
                    fontWeight: (graphDepth ?? 1) === d ? 700 : 400,
                    opacity: depthLoading ? 0.6 : 1,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {depthLoading && (graphDepth ?? 1) === d ? "…" : d}
                </button>
              ))}
            </div>
          </div>

          {/* Full network toggle — only at depth 2+ */}
          {(graphDepth ?? 1) >= 2 && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: isDark ? "#aaccff" : "#1a1a2e",
                fontSize: 12,
                marginBottom: 12,
                cursor: "pointer",
              }}
            >
              <input
                data-ocid="graph.settings.full_network.checkbox"
                type="checkbox"
                checked={showCrossEdges ?? false}
                onChange={(e) => onShowCrossEdgesChange?.(e.target.checked)}
                style={{ accentColor: "#4488ff" }}
              />
              Full network
            </label>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              fontSize: "13px",
              color: isDark ? "#aaccff" : "#1a1a2e",
            }}
          >
            <input
              type="checkbox"
              checked={colorByLevel}
              onChange={(e) => setColorByLevel(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span>Color by level</span>
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
              marginTop: "4px",
              color: isDark ? "#aaccff" : "#1a1a2e",
            }}
          >
            <span>Weight by</span>
            <button
              type="button"
              onClick={() => setEdgeWeightMode("volume")}
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                border: "1px solid currentColor",
                opacity: edgeWeightMode === "volume" ? 1 : 0.4,
                cursor: "pointer",
                background: "transparent",
                color: "inherit",
                fontSize: "12px",
              }}
            >
              Volume
            </button>
            <button
              type="button"
              onClick={() => setEdgeWeightMode("count")}
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                border: "1px solid currentColor",
                opacity: edgeWeightMode === "count" ? 1 : 0.4,
                cursor: "pointer",
                background: "transparent",
                color: "inherit",
                fontSize: "12px",
              }}
            >
              Count
            </button>
          </div>

          {/* Fit to screen */}
          <button
            type="button"
            data-ocid="graph.settings.fit_to_screen.button"
            onClick={handleFitView}
            style={{
              width: "100%",
              background: "rgba(20,40,90,0.7)",
              border: "1px solid rgba(60,80,160,0.5)",
              color: "#aaccff",
              padding: "5px 0",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
              marginTop: 2,
            }}
          >
            Fit to screen
          </button>
        </div>
      )}

      {/* Zoom buttons */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          right: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 20,
        }}
      >
        <button
          type="button"
          data-ocid="graph.zoom_in_button"
          onClick={handleZoomIn}
          style={{
            width: 34,
            height: 34,
            background: isDark
              ? "rgba(15,22,50,0.92)"
              : "rgba(240,242,248,0.95)",
            border: isDark
              ? "1px solid rgba(60,80,140,0.6)"
              : "1px solid rgba(180,190,220,0.6)",
            color: isDark ? "#aaccff" : "#334466",
            borderRadius: 5,
            fontSize: 20,
            cursor: "pointer",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
        <button
          type="button"
          data-ocid="graph.zoom_out_button"
          onClick={handleZoomOut}
          style={{
            width: 34,
            height: 34,
            background: isDark
              ? "rgba(15,22,50,0.92)"
              : "rgba(240,242,248,0.95)",
            border: isDark
              ? "1px solid rgba(60,80,140,0.6)"
              : "1px solid rgba(180,190,220,0.6)",
            color: isDark ? "#aaccff" : "#334466",
            borderRadius: 5,
            fontSize: 20,
            cursor: "pointer",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          −
        </button>
        <button
          type="button"
          data-ocid="graph.fit_button"
          onClick={handleFitView}
          title="Fit to screen"
          style={{
            width: 34,
            height: 34,
            background: isDark
              ? "rgba(15,22,50,0.92)"
              : "rgba(240,242,248,0.95)",
            border: isDark
              ? "1px solid rgba(60,80,140,0.6)"
              : "1px solid rgba(180,190,220,0.6)",
            color: isDark ? "#7799cc" : "#556688",
            borderRadius: 5,
            fontSize: 13,
            cursor: "pointer",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⊡
        </button>
      </div>

      {/* Node info window */}
      {nodeInfo && (
        <div
          ref={nodeInfoRef}
          data-ocid="graph.node_info.dialog"
          onMouseEnter={handleNodeInfoMouseEnter}
          onMouseLeave={handleNodeInfoMouseLeave}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={() => {}}
          style={{
            position: "fixed",
            left: nodeInfo.x,
            top: nodeInfo.y,
            width: 224,
            background: isDark
              ? "rgba(8,13,36,0.98)"
              : "rgba(255,255,255,0.97)",
            border: isDark
              ? "1px solid rgba(60,100,200,0.55)"
              : "1px solid rgba(180,190,220,0.55)",
            borderRadius: 9,
            padding: 14,
            zIndex: 100,
            color: isDark ? "#ccddff" : "#1a1a2e",
            boxShadow: isDark
              ? "0 4px 32px rgba(0,80,200,0.18)"
              : "0 4px 32px rgba(0,80,200,0.08)",
          }}
        >
          {/* Close button (always shown, accessible on all devices) */}
          <button
            type="button"
            data-ocid="graph.node_info.close_button"
            onClick={() => {
              setNodeInfo(null);
              setSelectedNodeId(null);
            }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "none",
              border: "none",
              color: isDark ? "#5577aa" : "#4466aa",
              fontSize: 15,
              cursor: "pointer",
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>

          <div
            style={{
              fontSize: 10,
              color: isDark ? "#4466aa" : "#5577aa",
              marginBottom: 5,
              letterSpacing: 1,
            }}
          >
            WALLET
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              marginBottom: 10,
              wordBreak: "break-all",
              color: isDark ? "#99bbee" : "#334466",
              lineHeight: 1.4,
            }}
          >
            {truncateAddress(nodeInfo.node.id)}
          </div>

          {/* Copy address */}
          <button
            type="button"
            data-ocid="graph.node_info.copy_button"
            onClick={() => {
              navigator.clipboard.writeText(nodeInfo.node.id).catch(() => {});
              setCopiedNodeId(nodeInfo.node.id);
              toast.success("Address copied!", { duration: 2000 });
              setTimeout(() => setCopiedNodeId(null), 2000);
            }}
            style={{
              width: "100%",
              background: "rgba(20,40,90,0.55)",
              border: "1px solid rgba(50,80,160,0.5)",
              color: copiedNodeId === nodeInfo.node.id ? "#44ff88" : "#aaccff",
              padding: "4px 0",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
              marginBottom: 7,
              transition: "color 0.2s",
            }}
          >
            {copiedNodeId === nodeInfo.node.id
              ? "✓ Copied!"
              : "📋 Copy address"}
          </button>

          {/* Label edit */}
          {editingLabel === nodeInfo.node.id ? (
            <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
              <input
                data-ocid="graph.node_info.label_input"
                value={labelInput}
                maxLength={6}
                placeholder="Label…"
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLabelSave()}
                style={{
                  flex: 1,
                  background: "rgba(20,40,100,0.75)",
                  border: "1px solid rgba(80,120,220,0.5)",
                  color: "#fff",
                  padding: "3px 7px",
                  borderRadius: 4,
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <button
                type="button"
                data-ocid="graph.node_info.label_save_button"
                onClick={handleLabelSave}
                style={{
                  background: "#1a3a80",
                  border: "none",
                  color: "#fff",
                  padding: "3px 9px",
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-ocid="graph.node_info.label_button"
              onClick={() => handleLabelEdit(nodeInfo.node.id)}
              style={{
                width: "100%",
                background: "rgba(20,40,90,0.55)",
                border: "1px solid rgba(50,80,160,0.5)",
                color: "#aaccff",
                padding: "4px 0",
                borderRadius: 4,
                fontSize: 11,
                cursor: "pointer",
                marginBottom: 7,
                textAlign: "left",
                paddingLeft: 8,
              }}
            >
              ✏{" "}
              {labels[nodeInfo.node.id]
                ? `"${labels[nodeInfo.node.id]}"`
                : "Add label"}
            </button>
          )}

          {/* Favorite toggle */}
          <button
            type="button"
            data-ocid="graph.node_info.favorite_button"
            onClick={() => handleFavoriteToggle(nodeInfo.node.id)}
            style={{
              width: "100%",
              background: "rgba(20,40,90,0.55)",
              border: "1px solid rgba(50,80,160,0.5)",
              color: checkFavorite(nodeInfo.node.id) ? "#ffcc00" : "#aaccff",
              padding: "4px 0",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
              marginBottom: 7,
            }}
          >
            {checkFavorite(nodeInfo.node.id)
              ? "★ Favorited"
              : "☆ Add to favorites"}
          </button>

          {/* Explore button */}
          <button
            type="button"
            data-ocid="graph.node_info.explore_button"
            onClick={() => {
              onNavigate(nodeInfo.node.id);
              setNodeInfo(null);
              setSelectedNodeId(null);
            }}
            style={{
              width: "100%",
              background: "rgba(20,60,180,0.8)",
              border: "1px solid rgba(80,120,240,0.6)",
              color: "#ffffff",
              padding: "6px 0",
              borderRadius: 5,
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            Explore wallet →
          </button>
        </div>
      )}

      {/* Edge tooltip */}
      {edgeTooltip && (
        <div
          ref={edgeTooltipRef}
          data-ocid="graph.edge_tooltip"
          onMouseEnter={() => {
            // Mouse entered tooltip — cancel pending close timer
            if (edgeLeaveTimerRef.current) {
              clearTimeout(edgeLeaveTimerRef.current);
              edgeLeaveTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            if (isMobile) return;
            // Restart close timer when leaving tooltip box
            if (edgeLeaveTimerRef.current)
              clearTimeout(edgeLeaveTimerRef.current);
            edgeLeaveTimerRef.current = setTimeout(() => {
              setEdgeTooltip(null);
              edgeLeaveTimerRef.current = null;
            }, 3000);
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={() => {}}
          style={{
            position: "fixed",
            left: edgeTooltip.x,
            top: edgeTooltip.y,
            background: isDark
              ? "rgba(8,13,36,0.98)"
              : "rgba(255,255,255,0.97)",
            border: isDark
              ? "1px solid rgba(60,100,200,0.55)"
              : "1px solid rgba(180,190,220,0.55)",
            borderRadius: 8,
            padding: "10px 12px",
            maxWidth: 240,
            zIndex: 100,
            fontSize: 12,
            maxHeight: 260,
            overflowY: "auto",
            boxShadow: isDark
              ? "0 4px 24px rgba(0,60,160,0.2)"
              : "0 4px 24px rgba(0,60,160,0.08)",
          }}
        >
          {/* Close button always visible */}
          <button
            type="button"
            data-ocid="graph.edge_tooltip.close_button"
            onClick={() => {
              if (edgeLeaveTimerRef.current)
                clearTimeout(edgeLeaveTimerRef.current);
              setEdgeTooltip(null);
            }}
            style={{
              position: "absolute",
              top: 6,
              right: 7,
              background: "none",
              border: "none",
              color: isDark ? "#5577aa" : "#4466aa",
              fontSize: 14,
              cursor: "pointer",
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>
          <div
            style={{
              color: isDark ? "#4466aa" : "#5577aa",
              fontSize: 10,
              marginBottom: 7,
              letterSpacing: 1,
              paddingRight: 16,
            }}
          >
            TRANSACTION TOKENS
          </div>
          {renderEdgeTooltipContent(edgeTooltip.edge)}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 10,
          background: isDark ? "rgba(7,11,28,0.88)" : "rgba(255,255,255,0.92)",
          border: isDark
            ? "1px solid rgba(40,60,120,0.5)"
            : "1px solid rgba(180,190,220,0.5)",
          borderRadius: 7,
          padding: "8px 12px",
          fontSize: 10,
          color: isDark ? "#7799cc" : "#334466",
          zIndex: 10,
          lineHeight: 1.7,
        }}
      >
        {LEGEND_ITEMS.map((item) => {
          const swatchColor = isDark ? item.dark : item.light;
          return (
            <div
              key={item.label}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: swatchColor,
                  display: "inline-block",
                  flexShrink: 0,
                  boxShadow: isDark ? `0 0 6px ${swatchColor}` : "none",
                  border: isDark ? "none" : "1px solid rgba(0,0,0,0.15)",
                }}
              />
              <span style={{ color: isDark ? "#7799cc" : "#1a1a2e" }}>
                {item.label}
              </span>
            </div>
          );
        })}
        <div
          style={{
            marginTop: 4,
            borderTop: "1px solid rgba(60,80,140,0.3)",
            paddingTop: 4,
            fontSize: 9,
          }}
        >
          ↓ Inbound&nbsp;&nbsp;↑ Outbound
        </div>
      </div>

      {/* Level-color legend (only when colorByLevel is on) */}
      {colorByLevel && (
        <div
          data-ocid="graph.level_legend"
          style={{
            position: "absolute",
            bottom: 10,
            left: 150,
            background: isDark
              ? "rgba(7,11,28,0.88)"
              : "rgba(255,255,255,0.92)",
            border: isDark
              ? "1px solid rgba(40,60,120,0.5)"
              : "1px solid rgba(180,190,220,0.5)",
            borderRadius: 7,
            padding: "8px 12px",
            fontSize: 10,
            color: isDark ? "#7799cc" : "#334466",
            zIndex: 10,
            lineHeight: 1.7,
          }}
        >
          {(isDark ? LEVEL_PALETTE.dark : LEVEL_PALETTE.light)
            .slice(0, 4)
            .map((color, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static list with fixed order
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                {/* Circle with depth number visible inside */}
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fff",
                    boxShadow: isDark ? `0 0 5px ${color}80` : "none",
                    border: isDark ? "none" : "1px solid rgba(0,0,0,0.15)",
                  }}
                >
                  {i}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: isDark ? "#a0b4c8" : "#1a1a2e",
                    fontWeight: 500,
                  }}
                >
                  {i === 0 ? "Center" : `Depth ${i}`}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Inline label edit modal (when editing from pencil icon outside info window) */}
      {editingLabel && editingLabel !== nodeInfo?.node.id && (
        <div
          data-ocid="graph.label_modal"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            background: isDark
              ? "rgba(8,13,36,0.99)"
              : "rgba(255,255,255,0.99)",
            border: isDark
              ? "1px solid rgba(60,100,200,0.6)"
              : "1px solid rgba(180,190,220,0.6)",
            borderRadius: 9,
            padding: 20,
            zIndex: 200,
            boxShadow: isDark
              ? "0 8px 48px rgba(0,40,140,0.3)"
              : "0 8px 48px rgba(0,40,140,0.1)",
          }}
        >
          <div style={{ color: "#aaccff", marginBottom: 10, fontSize: 13 }}>
            Set label (max 6 chars)
          </div>
          <input
            data-ocid="graph.label_modal.input"
            value={labelInput}
            maxLength={6}
            placeholder="Label…"
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLabelSave()}
            style={{
              background: "rgba(20,40,100,0.75)",
              border: "1px solid rgba(80,120,220,0.5)",
              color: "#fff",
              padding: "5px 10px",
              borderRadius: 4,
              fontSize: 14,
              width: 140,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              data-ocid="graph.label_modal.save_button"
              onClick={handleLabelSave}
              style={{
                background: "#1a3a80",
                border: "none",
                color: "#fff",
                padding: "5px 14px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Save
            </button>
            <button
              type="button"
              data-ocid="graph.label_modal.cancel_button"
              onClick={() => setEditingLabel(null)}
              style={{
                background: "none",
                border: "1px solid rgba(60,80,160,0.5)",
                color: "#aaccff",
                padding: "5px 14px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pulse ring keyframes injected via style tag */}
      <style>{`
        @keyframes pulseRing {
          0%, 100% { opacity: 0.7; r: ${"var(--pr, 24)"}; }
          50% { opacity: 0.3; }
        }
        svg g, svg circle, svg path, svg text {
          -webkit-tap-highlight-color: transparent;
          outline: none;
        }
        svg:focus, svg g:focus {
          outline: none;
          box-shadow: none;
        }
      `}</style>
    </div>
  );
}
