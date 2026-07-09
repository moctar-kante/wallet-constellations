import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Loader2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "../types";

// --- Force simulation types ---
type SimNode = GraphNode & { x: number; y: number; vx: number; vy: number };

// Colors (raw hex for SVG drawing context – allowed per design-system rules)
const COLOR_CENTER = "#4AA8FF";
const COLOR_EDGE = "#66C7FF";
const COLOR_TEXT = "#9FB0C8";
const COLOR_STAR = "#ffffff";

const REPULSION = 7000;
const SPRING_LEN = 190;
const SPRING_K = 0.05;
const GRAVITY = 0.004;
const DAMPING = 0.76;

function runStep(
  nodes: SimNode[],
  edges: GraphEdge[],
  cx: number,
  cy: number,
  alpha: number,
  w: number,
  h: number,
) {
  const padding = 50;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].isCenter) continue;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[i].x - nodes[j].x || 0.001;
      const dy = nodes[i].y - nodes[j].y || 0.001;
      const dist2 = dx * dx + dy * dy + 1;
      const dist = Math.sqrt(dist2);
      const f = (REPULSION * alpha) / dist2;
      nodes[i].vx += (f * dx) / dist;
      nodes[i].vy += (f * dy) / dist;
    }
  }
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const tgt = nodes.find((n) => n.id === edge.target);
    if (!src || !tgt) continue;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const f = (dist - SPRING_LEN) * SPRING_K * alpha;
    if (!src.isCenter) {
      src.vx += (f * dx) / dist;
      src.vy += (f * dy) / dist;
    }
    if (!tgt.isCenter) {
      tgt.vx -= (f * dx) / dist;
      tgt.vy -= (f * dy) / dist;
    }
  }
  for (const n of nodes) {
    if (n.isCenter) {
      n.x = cx;
      n.y = cy;
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx += (cx - n.x) * GRAVITY * alpha;
    n.vy += (cy - n.y) * GRAVITY * alpha;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(padding, Math.min(w - padding, n.x));
    n.y = Math.max(padding, Math.min(h - padding, n.y));
  }
}

function shortenId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}\u2026${id.slice(-4)}`;
}

// Format token amounts: always 3 decimals, k for thousands, M for millions
function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(3)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(3)}k`;
  return n.toFixed(3);
}

// Seeded star positions for consistent renders
const STARS = (() => {
  let s = 42;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return Array.from({ length: 180 }, (_, idx) => ({
    idx,
    x: rand() * 100,
    y: rand() * 100,
    r: rand() * 1.3 + 0.3,
    op: rand() * 0.5 + 0.1,
  }));
})();

interface TooltipState {
  screenX: number;
  screenY: number;
  node: SimNode;
}

interface HoveredEdge {
  edgeKey: string;
  screenX: number;
  screenY: number;
}

interface ConstellationGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerPrincipal: string;
  onNavigate: (principal: string) => void;
  edgeWeight: "tx_count" | "total_amount";
  maxCounterparties: number;
  onMaxCounterpartiesChange: (v: number) => void;
  isEmpty?: boolean;
  graphDepth: number;
  onDepthChange: (d: number) => void;
  depthLoading?: boolean;
  txLimit: number;
  onTxLimitChange: (v: number) => void;
  icrcLoading?: boolean;
  showCrossEdges: boolean;
  onShowCrossEdgesChange: (v: boolean) => void;
}

function getNodeGradient(node: SimNode): string {
  if (node.isCenter) return "url(#center-grad)";
  const depth = node.depth ?? 1;
  if (depth === 2) return "url(#node-grad-green)";
  if (depth === 3) return "url(#node-grad-purple)";
  return "url(#node-grad)";
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export function ConstellationGraph({
  nodes: propNodes,
  edges: propEdges,
  onNavigate,
  edgeWeight,
  maxCounterparties,
  onMaxCounterpartiesChange,
  isEmpty = false,
  graphDepth,
  onDepthChange,
  depthLoading = false,
  txLimit,
  onTxLimitChange,
  icrcLoading = false,
  showCrossEdges,
  onShowCrossEdgesChange,
}: ConstellationGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(520);
  const simRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>(propEdges);
  edgesRef.current = propEdges;
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  widthRef.current = width;
  heightRef.current = height;
  const propNodesRef = useRef(propNodes);
  propNodesRef.current = propNodes;
  const [, forceRender] = useState(0);
  const rafRef = useRef(0);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredEdgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [edgeMode, setEdgeMode] = useState<"tx_count" | "total_amount">(
    edgeWeight,
  );
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);

  // Unified transform state: translate + scale
  const [transform, setTransform] = useState<Transform>({
    x: 0,
    y: 0,
    scale: 1,
  });

  // Drag state
  const isDragging = useRef(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, tx: 0, ty: 0 });
  const dragMoved = useRef(false);
  const pointerDownOnNode = useRef(false);

  // Pinch state
  const lastTouchDist = useRef<number | null>(null);
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null);
  // Single-finger pan
  const lastSingleTouch = useRef<{ x: number; y: number } | null>(null);

  // Track resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.offsetWidth);
      setHeight(el.offsetHeight);
    });
    ro.observe(el);
    setWidth(el.offsetWidth);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom — toward cursor
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.909;
    setTransform((prev) => {
      const newScale = Math.min(4, Math.max(0.25, prev.scale * factor));
      const f = newScale / prev.scale;
      return {
        scale: newScale,
        x: mx - (mx - prev.x) * f,
        y: my - (my - prev.y) * f,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Mouse drag — document-level move/up
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      if (!dragMoved.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        dragMoved.current = true;
      }
      if (dragMoved.current) {
        setTransform((prev) => ({
          ...prev,
          x: dragStart.current.tx + dx,
          y: dragStart.current.ty + dy,
        }));
      }
    };
    const onUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const nodeKey = propNodes.map((n) => n.id).join(",");

  const runSim = () => {
    cancelAnimationFrame(rafRef.current);
    const w = widthRef.current;
    const h = heightRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const pn = propNodesRef.current;
    const nonCenter = pn.filter((n) => !n.isCenter);
    simRef.current = pn.map((n, i) => {
      if (n.isCenter) return { ...n, x: cx, y: cy, vx: 0, vy: 0 };
      const angle = (2 * Math.PI * (i - 1)) / Math.max(nonCenter.length, 1);
      const rad = Math.min(w, h) * 0.28;
      return {
        ...n,
        x: cx + rad * Math.cos(angle),
        y: cy + rad * Math.sin(angle),
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
      };
    });

    let alpha = 1.0;
    let frame = 0;
    const tick = () => {
      runStep(simRef.current, edgesRef.current, cx, cy, alpha, w, h);
      alpha *= 0.981;
      frame++;
      if (frame % 2 === 0) forceRender((c) => c + 1);
      if (alpha > 0.004 && frame < 600) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        forceRender((c) => c + 1);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // Restart sim when nodes or dimensions change
  // biome-ignore lint/correctness/useExhaustiveDependencies: runSim reads from refs intentionally
  useEffect(() => {
    runSim();
    return () => cancelAnimationFrame(rafRef.current);
  }, [nodeKey, width, height]);

  // Clear tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  const showTooltipForTouch = (
    node: SimNode,
    screenX: number,
    screenY: number,
  ) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltip({ screenX, screenY, node });
    tooltipTimerRef.current = setTimeout(() => setTooltip(null), 2500);
  };

  const ns = simRef.current;

  const maxWeight = useMemo(() => {
    const vals = propEdges.map((e) =>
      edgeMode === "tx_count" ? e.tx_count : e.total_amount,
    );
    return Math.max(...vals, 1);
  }, [propEdges, edgeMode]);

  // Welcome decorative stars if empty
  const decorStars = useMemo(() => {
    if (!isEmpty) return [];
    let s2 = 99;
    const r2 = () => {
      s2 = (s2 * 1664525 + 1013904223) & 0x7fffffff;
      return s2 / 0x7fffffff;
    };
    return Array.from({ length: 30 }, (_, idx) => ({
      idx,
      x: r2() * 100,
      y: r2() * 100,
      r: r2() * 3 + 1,
      op: r2() * 0.4 + 0.15,
    }));
  }, [isEmpty]);

  // Find hovered edge data for tooltip
  const hoveredEdgeData = useMemo(() => {
    if (!hoveredEdge) return null;
    return (
      propEdges.find(
        (e) =>
          `${e.source}|${e.target}` === hoveredEdge.edgeKey ||
          `${e.target}|${e.source}` === hoveredEdge.edgeKey,
      ) ?? null
    );
  }, [hoveredEdge, propEdges]);

  // Settings panel bg: slightly opaque so it reads clearly over the graph
  const settingsBg = "bg-card/92 border border-border backdrop-blur-sm";

  // Zoom toward viewport center (for +/- buttons)
  const zoomToCenter = (delta: number) => {
    setTransform((prev) => {
      const cx = width / 2;
      const cy = height / 2;
      const newScale = Math.min(4, Math.max(0.25, prev.scale + delta));
      const f = newScale / prev.scale;
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * f,
        y: cy - (cy - prev.y) * f,
      };
    });
  };

  return (
    // Outer wrapper — no overflow-hidden so legend popover renders freely
    <div className="relative w-full h-full" data-ocid="wallet.canvas_target">
      {/* Graph canvas — overflow-hidden for SVG clipping */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-card"
        style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
        onMouseDown={(e) => {
          // Only start drag if not on a node
          if (pointerDownOnNode.current) return;
          isDragging.current = true;
          dragMoved.current = false;
          dragStart.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            tx: transform.x,
            ty: transform.y,
          };
        }}
      >
        <svg
          width={width}
          height={height}
          className="absolute inset-0"
          style={{
            display: "block",
            touchAction: "none",
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
          }}
          role="img"
          aria-label="ICP wallet transaction network constellation"
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
              const rect = containerRef.current!.getBoundingClientRect();
              lastPinchMid.current = {
                x:
                  (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
              };
              lastSingleTouch.current = null;
            } else if (e.touches.length === 1) {
              lastSingleTouch.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
              };
              lastTouchDist.current = null;
              lastPinchMid.current = null;
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2 && lastTouchDist.current !== null) {
              e.preventDefault();
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const rect = containerRef.current!.getBoundingClientRect();
              const midX =
                (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
              const midY =
                (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
              const ratio = dist / lastTouchDist.current;
              const prevMid = lastPinchMid.current ?? { x: midX, y: midY };
              setTransform((prev) => {
                const newScale = Math.min(
                  4,
                  Math.max(0.25, prev.scale * ratio),
                );
                const f = newScale / prev.scale;
                // Zoom toward pinch midpoint + pan by midpoint delta
                const panDx = midX - prevMid.x;
                const panDy = midY - prevMid.y;
                return {
                  scale: newScale,
                  x: midX - (midX - prev.x) * f + panDx,
                  y: midY - (midY - prev.y) * f + panDy,
                };
              });
              lastTouchDist.current = dist;
              lastPinchMid.current = { x: midX, y: midY };
            } else if (
              e.touches.length === 1 &&
              lastSingleTouch.current !== null
            ) {
              e.preventDefault();
              const dx = e.touches[0].clientX - lastSingleTouch.current.x;
              const dy = e.touches[0].clientY - lastSingleTouch.current.y;
              setTransform((prev) => ({
                ...prev,
                x: prev.x + dx,
                y: prev.y + dy,
              }));
              lastSingleTouch.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
              };
            }
          }}
          onTouchEnd={() => {
            lastTouchDist.current = null;
            lastPinchMid.current = null;
            lastSingleTouch.current = null;
          }}
        >
          <defs>
            <filter
              id="glow-center"
              x="-80%"
              y="-80%"
              width="260%"
              height="260%"
            >
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-node" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-edge" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="center-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7DD3FF" stopOpacity="1" />
              <stop offset="60%" stopColor="#4AA8FF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#2280DD" stopOpacity="0.6" />
            </radialGradient>
            <radialGradient id="node-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#88D8FF" stopOpacity="1" />
              <stop offset="100%" stopColor="#4AA8FF" stopOpacity="0.7" />
            </radialGradient>
            <radialGradient id="node-grad-green" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6FFFB4" stopOpacity="1" />
              <stop offset="100%" stopColor="#3FE08C" stopOpacity="0.7" />
            </radialGradient>
            <radialGradient id="node-grad-purple" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E0B0FF" stopOpacity="1" />
              <stop offset="100%" stopColor="#C084FC" stopOpacity="0.7" />
            </radialGradient>
          </defs>

          {/* Background stars */}
          {STARS.map((star) => (
            <circle
              key={star.idx}
              cx={(star.x / 100) * width}
              cy={(star.y / 100) * height}
              r={star.r}
              fill={COLOR_STAR}
              opacity={star.op * 0.35}
            />
          ))}

          {/* Decorative stars when empty */}
          {isEmpty &&
            decorStars.map((star) => (
              <circle
                key={star.idx}
                cx={(star.x / 100) * width}
                cy={(star.y / 100) * height}
                r={star.r}
                fill={COLOR_CENTER}
                opacity={star.op}
              />
            ))}

          {/* Edges */}
          {ns.length > 0 &&
            propEdges.map((edge) => {
              const src = ns.find((n) => n.id === edge.source);
              const tgt = ns.find((n) => n.id === edge.target);
              if (!src || !tgt) return null;
              const w =
                edgeMode === "tx_count" ? edge.tx_count : edge.total_amount;
              const ratio = w / maxWeight;
              const opacity = 0.35 + 0.45 * ratio;
              const strokeW = 1.5 + 4 * ratio;
              const dx = tgt.x - src.x;
              const dy = tgt.y - src.y;
              const cpx = (src.x + tgt.x) / 2 + dy * 0.22;
              const cpy = (src.y + tgt.y) / 2 - dx * 0.22;
              const pathD = `M${src.x},${src.y} Q${cpx},${cpy} ${tgt.x},${tgt.y}`;
              const edgeKey = `${edge.source}|${edge.target}`;
              return (
                <g key={edgeKey}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={COLOR_EDGE}
                    strokeWidth={strokeW}
                    opacity={opacity}
                    filter="url(#glow-edge)"
                  />
                  {/* Transparent hit area for hover/touch */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="white"
                    strokeWidth={12}
                    opacity={0}
                    style={{ cursor: "crosshair" }}
                    onMouseEnter={(e) => {
                      if (hoveredEdgeTimerRef.current)
                        clearTimeout(hoveredEdgeTimerRef.current);
                      hoveredEdgeTimerRef.current = null;
                      setHoveredEdge({
                        edgeKey,
                        screenX: e.clientX,
                        screenY: e.clientY,
                      });
                    }}
                    onMouseMove={(e) =>
                      setHoveredEdge((prev) =>
                        prev
                          ? {
                              ...prev,
                              screenX: e.clientX,
                              screenY: e.clientY,
                            }
                          : prev,
                      )
                    }
                    onMouseLeave={() => {
                      if (hoveredEdgeTimerRef.current)
                        clearTimeout(hoveredEdgeTimerRef.current);
                      hoveredEdgeTimerRef.current = setTimeout(
                        () => setHoveredEdge(null),
                        10000,
                      );
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (touch) {
                        setHoveredEdge({
                          edgeKey,
                          screenX: touch.clientX,
                          screenY: touch.clientY,
                        });
                        hoveredEdgeTimerRef.current = setTimeout(
                          () => setHoveredEdge(null),
                          10000,
                        );
                      }
                    }}
                  />
                </g>
              );
            })}

          {/* Nodes */}
          {ns.map((node) => {
            const isCenter = node.isCenter;
            const r = isCenter
              ? 26
              : Math.max(7, Math.min(18, 7 + node.txCount * 0.8));
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                style={{ cursor: isCenter ? "default" : "pointer" }}
                onMouseDown={() => {
                  pointerDownOnNode.current = true;
                  // Reset after a tick so container mousedown check works
                  setTimeout(() => {
                    pointerDownOnNode.current = false;
                  }, 0);
                }}
                onClick={() => {
                  if (!isCenter && !dragMoved.current) onNavigate(node.id);
                }}
                onKeyDown={(e) => {
                  if (!isCenter && (e.key === "Enter" || e.key === " ")) {
                    onNavigate(node.id);
                  }
                }}
                onTouchStart={(e) => {
                  if (!isCenter) {
                    e.preventDefault();
                    const touch = e.touches[0];
                    if (touch) {
                      showTooltipForTouch(node, touch.clientX, touch.clientY);
                    }
                    onNavigate(node.id);
                  }
                }}
                role={isCenter ? undefined : "button"}
                tabIndex={isCenter ? undefined : 0}
                onMouseEnter={(e) =>
                  setTooltip({ screenX: e.clientX, screenY: e.clientY, node })
                }
                onMouseLeave={() => setTooltip(null)}
                onMouseMove={(e) =>
                  setTooltip((t) =>
                    t ? { ...t, screenX: e.clientX, screenY: e.clientY } : null,
                  )
                }
                data-ocid={isCenter ? "wallet.canvas_target" : "wallet.button"}
              >
                {isCenter ? (
                  <>
                    <circle
                      r={r + 18}
                      fill="none"
                      stroke={COLOR_CENTER}
                      strokeWidth={0.8}
                      opacity={0.15}
                    />
                    <circle
                      r={r + 10}
                      fill="none"
                      stroke={COLOR_CENTER}
                      strokeWidth={0.8}
                      opacity={0.25}
                    />
                    <circle
                      r={r}
                      fill="url(#center-grad)"
                      filter="url(#glow-center)"
                    />
                  </>
                ) : (
                  <circle
                    r={r}
                    fill={getNodeGradient(node)}
                    fillOpacity={0.85}
                    filter="url(#glow-node)"
                  />
                )}
                <text
                  y={r + 14}
                  textAnchor="middle"
                  fill={COLOR_TEXT}
                  fontSize="10"
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  pointerEvents="none"
                >
                  {shortenId(node.id)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Controls overlay */}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          {/* Toggle button */}
          <button
            type="button"
            data-ocid="wallet.toggle"
            onClick={() => setSettingsOpen((o) => !o)}
            className={`self-end flex items-center gap-1 text-xs px-2 py-1 rounded ${settingsBg} text-muted-foreground hover:text-foreground transition-colors`}
            title={settingsOpen ? "Collapse settings" : "Expand settings"}
          >
            {settingsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>Settings</span>
          </button>

          {settingsOpen && (
            <>
              {/* Depth selector */}
              <div className={`${settingsBg} rounded p-2`}>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                  Depth
                  {depthLoading && (
                    <Loader2 className="h-3 w-3 animate-spin ml-1" />
                  )}
                </div>
                <div className="flex gap-1">
                  {([1, 2, 3] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      data-ocid="wallet.toggle"
                      onClick={() => onDepthChange(d)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        graphDepth === d
                          ? "bg-neon-blue/20 border-neon-blue/50 text-neon-blue"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Full network toggle — only visible at depth 2+ */}
              {graphDepth >= 2 && (
                <div className={`${settingsBg} rounded p-2`}>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showCrossEdges}
                      onChange={(e) => onShowCrossEdgesChange(e.target.checked)}
                      className="w-3 h-3 accent-neon-blue"
                    />
                    <span className="text-xs text-muted-foreground">
                      Full network
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-1.5">
                <button
                  type="button"
                  data-ocid="wallet.toggle"
                  onClick={() => setEdgeMode("tx_count")}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    edgeMode === "tx_count"
                      ? "bg-neon-blue/20 border-neon-blue/50 text-neon-blue"
                      : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Count
                </button>
                <button
                  type="button"
                  data-ocid="wallet.toggle"
                  onClick={() => setEdgeMode("total_amount")}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    edgeMode === "total_amount"
                      ? "bg-neon-amber/20 border-neon-amber/50 text-neon-amber"
                      : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Volume
                </button>
              </div>

              {/* Max counterparties slider */}
              <div className={`${settingsBg} rounded p-2 w-36`}>
                <div className="text-xs text-muted-foreground mb-1.5">
                  Nodes: {maxCounterparties}
                </div>
                <Slider
                  min={5}
                  max={50}
                  step={5}
                  value={[maxCounterparties]}
                  onValueChange={([v]) => onMaxCounterpartiesChange(v)}
                  className="w-full"
                />
              </div>

              {/* Tx limit slider */}
              <div className={`${settingsBg} rounded p-2 w-36`}>
                <div className="text-xs text-muted-foreground mb-1.5">
                  Tx Limit: {txLimit}
                </div>
                <Slider
                  min={100}
                  max={1000}
                  step={100}
                  value={[txLimit]}
                  onValueChange={([v]) => onTxLimitChange(v)}
                  className="w-full"
                />
              </div>

              <Button
                data-ocid="wallet.secondary_button"
                size="sm"
                variant="ghost"
                onClick={runSim}
                className={`h-7 px-2 text-xs text-muted-foreground hover:text-foreground ${settingsBg}`}
                title="Reset layout"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </>
          )}
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 z-10">
          <button
            type="button"
            onClick={() => zoomToCenter(0.25)}
            className={`flex items-center justify-center w-7 h-7 rounded ${settingsBg} text-muted-foreground hover:text-foreground transition-colors text-sm font-bold`}
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomToCenter(-0.25)}
            className={`flex items-center justify-center w-7 h-7 rounded ${settingsBg} text-muted-foreground hover:text-foreground transition-colors text-sm font-bold`}
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ICRC loading indicator */}
        {icrcLoading && (
          <div
            className={`absolute bottom-10 left-3 flex items-center gap-1.5 text-xs text-muted-foreground ${settingsBg} rounded px-2 py-1`}
            data-ocid="wallet.loading_state"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading tokens…</span>
          </div>
        )}
      </div>

      {/* Legend button — outside overflow-hidden so popover renders freely */}
      <div className="absolute bottom-3 right-3 z-20">
        <button
          type="button"
          data-ocid="wallet.button"
          className={`flex items-center justify-center w-7 h-7 rounded-full ${settingsBg} text-muted-foreground hover:text-foreground transition-colors`}
          title="Graph legend"
          onClick={() => setLegendOpen((o) => !o)}
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {legendOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-popover border border-border rounded-lg p-3 shadow-xl text-xs z-20">
            <div className="font-semibold text-foreground mb-2 text-sm">
              How to read this graph
            </div>

            <div className="space-y-2 text-muted-foreground">
              <div>
                <div className="font-medium text-foreground mb-0.5">
                  Node colors (dots)
                </div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#4AA8FF] shrink-0" />
                  <span>
                    <strong className="text-foreground">Blue (large)</strong> —
                    your wallet (the center)
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#88D8FF] shrink-0" />
                  <span>
                    <strong className="text-foreground">Light blue</strong> —
                    wallets that transacted directly with you (depth 1)
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#3FE08C] shrink-0" />
                  <span>
                    <strong className="text-foreground">Green</strong> —
                    2nd-degree connections (depth 2)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#C084FC] shrink-0" />
                  <span>
                    <strong className="text-foreground">Purple</strong> —
                    3rd-degree connections (depth 3)
                  </span>
                </div>
              </div>

              <div>
                <div className="font-medium text-foreground mb-0.5">
                  Lines (edges)
                </div>
                <div>
                  <strong className="text-foreground">Thicker line</strong> =
                  more transactions or higher ICP volume between those two
                  wallets
                </div>
                <div className="mt-0.5">
                  <strong className="text-foreground">Full network</strong> =
                  toggle in settings to also show connections between
                  non-adjacent nodes
                </div>
              </div>

              <div>
                <div className="font-medium text-foreground mb-0.5">
                  Hover a line to see
                </div>
                <div>
                  <span className="text-green-400">↓</span> — tokens{" "}
                  <strong className="text-foreground">received</strong> into
                  your wallet (inbound)
                </div>
                <div>
                  <span className="text-orange-400">↑</span> — tokens{" "}
                  <strong className="text-foreground">sent</strong> from your
                  wallet (outbound)
                </div>
                <div className="mt-0.5">
                  Amounts use <strong className="text-foreground">k</strong>{" "}
                  (thousands) and <strong className="text-foreground">M</strong>{" "}
                  (millions) with 3 decimals.
                </div>
                <div className="mt-0.5">
                  <strong className="text-foreground">(n)</strong> = number of
                  transactions (tx / txs) in that direction
                </div>
              </div>

              <div>
                <div className="font-medium text-foreground mb-0.5">
                  Navigation
                </div>
                <div>
                  <strong className="text-foreground">Click a node</strong> to
                  navigate to that wallet.{" "}
                  <strong className="text-foreground">Drag</strong> to pan.{" "}
                  <strong className="text-foreground">Scroll / pinch</strong> to
                  zoom toward cursor.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Node tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.screenX + 14,
            top: tooltip.screenY - 14,
          }}
        >
          <div className="font-mono text-foreground mb-1 max-w-[220px] break-all">
            {tooltip.node.id}
          </div>
          <div className="text-muted-foreground">
            Transactions:{" "}
            <span className="text-foreground">{tooltip.node.txCount}</span>
          </div>
          {!tooltip.node.isCenter && (
            <div className="text-neon-blue mt-0.5">Click to explore →</div>
          )}
        </div>
      )}

      {/* Edge hover tooltip */}
      {hoveredEdge && hoveredEdgeData && (
        <div
          className="fixed z-50 pointer-events-none bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-lg min-w-[160px]"
          style={{
            left: hoveredEdge.screenX + 14,
            top: hoveredEdge.screenY - 14,
          }}
        >
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {(() => {
              const allTokens = new Set<string>([
                ...Object.keys(hoveredEdgeData.inAmountByToken),
                ...Object.keys(hoveredEdgeData.outAmountByToken),
              ]);
              // ICP first, rest alphabetically
              const sorted = [...allTokens].sort((a, b) => {
                if (a === "ICP") return -1;
                if (b === "ICP") return 1;
                return a.localeCompare(b);
              });
              return sorted.map((token) => {
                const inAmt = hoveredEdgeData.inAmountByToken[token] ?? 0;
                const outAmt = hoveredEdgeData.outAmountByToken[token] ?? 0;
                const inCnt = hoveredEdgeData.inCountByToken[token] ?? 0;
                const outCnt = hoveredEdgeData.outCountByToken[token] ?? 0;
                return (
                  <div
                    key={token}
                    className="flex items-baseline gap-1 whitespace-nowrap"
                  >
                    <span className="text-foreground font-medium">
                      {token}:
                    </span>
                    {inCnt > 0 ? (
                      <span className="text-green-400">
                        &#x2193; {fmt(inAmt)} ({inCnt})
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">
                        &#x2193; —
                      </span>
                    )}
                    <span className="text-muted-foreground/50">/</span>
                    {outCnt > 0 ? (
                      <span className="text-orange-400">
                        &#x2191; {fmt(outAmt)} ({outCnt})
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">
                        &#x2191; —
                      </span>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
