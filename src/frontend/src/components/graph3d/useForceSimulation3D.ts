import { useCallback, useEffect, useRef } from "react";
import type { GraphEdge, GraphNode } from "../../types";

export type Node3D = {
  id: string;
  isCenter: boolean;
  txCount: number;
  depth?: number;
  identity?: import("../../types").NodeIdentity;
  isWhale?: boolean;
  isPinned?: boolean;
  netFlowICP?: number;
  clusterSize?: number;
  sparklineData?: number[];
  totalAmount: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

export function useForceSimulation3D(
  nodes: GraphNode[],
  edges: GraphEdge[],
  onSettle: (nodes: Node3D[]) => void,
): { nodes3D: React.MutableRefObject<Node3D[]>; restart: () => void } {
  const nodes3DRef = useRef<Node3D[]>([]);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const alphaRef = useRef(1.0);

  const initNodes = useCallback(() => {
    const n = nodes.length;
    return nodes.map((node, i): Node3D => {
      if (node.isCenter) {
        return { ...node, z: 0, vz: 0, x: 0, y: 0, vx: 0, vy: 0 };
      }
      // Fibonacci sphere — large initial radius so nodes start spread out
      const goldenRatio = (1 + Math.sqrt(5)) / 2;
      const theta = Math.acos(1 - (2 * (i + 0.5)) / n);
      const phi = (2 * Math.PI * i) / goldenRatio;
      const r = 55; // Wider initial spread so repulsion works from a better starting position
      return {
        ...node,
        x: r * Math.sin(theta) * Math.cos(phi),
        y: r * Math.sin(theta) * Math.sin(phi),
        z: r * Math.cos(theta),
        vx: 0,
        vy: 0,
        vz: 0,
      };
    });
  }, [nodes]);

  const runSimulation = useCallback(
    (simNodes: Node3D[], simEdges: GraphEdge[]) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      frameCountRef.current = 0;
      alphaRef.current = 1.0;

      const buildEdgeIndex = () => {
        const map = new Map<string, number>();
        simNodes.forEach((n, i) => map.set(n.id, i));
        return simEdges
          .map((e) => ({ si: map.get(e.source), ti: map.get(e.target) }))
          .filter(
            (e): e is { si: number; ti: number } =>
              e.si !== undefined && e.ti !== undefined,
          );
      };
      const edgeIndex = buildEdgeIndex();

      const tick = () => {
        const ns = simNodes;
        const count = ns.length;
        const alpha = alphaRef.current;

        const ax = new Float64Array(count);
        const ay = new Float64Array(count);
        const az = new Float64Array(count);

        // Repulsion — strong charge to spread nodes into a real constellation
        const REPULSION = 18000;
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            const dx = ns[i].x - ns[j].x;
            const dy = ns[i].y - ns[j].y;
            const dz = ns[i].z - ns[j].z;
            const distSq = dx * dx + dy * dy + dz * dz || 0.001;
            const dist = Math.sqrt(distSq);
            // Minimum distance enforcement: 3 units
            const minDist = 3;
            const effDist = Math.max(dist, minDist);
            const effDistSq = effDist * effDist;
            const force = REPULSION / (effDistSq * effDist);
            ax[i] += force * dx;
            ay[i] += force * dy;
            az[i] += force * dz;
            ax[j] -= force * dx;
            ay[j] -= force * dy;
            az[j] -= force * dz;
          }
        }

        // Spring forces — rest length 22, gentle spring
        const REST_LEN = 16;
        const SPRING_K = 0.02;
        for (const { si, ti } of edgeIndex) {
          const dx = ns[si].x - ns[ti].x;
          const dy = ns[si].y - ns[ti].y;
          const dz = ns[si].z - ns[ti].z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
          const spring = ((dist - REST_LEN) * SPRING_K) / dist;
          ax[si] -= spring * dx;
          ay[si] -= spring * dy;
          az[si] -= spring * dz;
          ax[ti] += spring * dx;
          ay[ti] += spring * dy;
          az[ti] += spring * dz;
        }

        // Weak gravity — keep constellation from drifting too far from origin
        const GRAVITY = 0.0008;
        for (let i = 0; i < count; i++) {
          if (ns[i].isCenter) {
            ns[i].x = 0;
            ns[i].y = 0;
            ns[i].z = 0;
            ns[i].vx = 0;
            ns[i].vy = 0;
            ns[i].vz = 0;
            continue;
          }
          ax[i] -= GRAVITY * ns[i].x;
          ay[i] -= GRAVITY * ns[i].y;
          az[i] -= GRAVITY * ns[i].z;

          // Integrate velocity with damping
          ns[i].vx = (ns[i].vx + ax[i] * alpha) * 0.76;
          ns[i].vy = (ns[i].vy + ay[i] * alpha) * 0.76;
          ns[i].vz = (ns[i].vz + az[i] * alpha) * 0.76;
          ns[i].x += ns[i].vx;
          ns[i].y += ns[i].vy;
          ns[i].z += ns[i].vz;
        }

        alphaRef.current *= 0.978;
        frameCountRef.current++;

        const settled =
          alphaRef.current < 0.001 || frameCountRef.current >= 700;
        if (!settled) {
          rafRef.current = requestAnimationFrame(tick);
        }
        if (frameCountRef.current % 2 === 0 || settled) {
          onSettle([...simNodes]);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [onSettle],
  );

  const restart = useCallback(() => {
    const initialized = initNodes();
    nodes3DRef.current = initialized;
    runSimulation(initialized, edges);
  }, [initNodes, edges, runSimulation]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { nodes3D: nodes3DRef, restart };
}
