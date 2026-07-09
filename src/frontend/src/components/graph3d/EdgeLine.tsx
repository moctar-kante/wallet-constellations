import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { GraphEdge } from "../../types";

interface EdgeLineProps {
  edge: GraphEdge;
  sourcePos: THREE.Vector3;
  targetPos: THREE.Vector3;
  edgeIndex: number;
  onEdgeHover: (edge: GraphEdge, x: number, y: number) => void;
  onEdgeLeave: () => void;
  onEdgeClick: (edge: GraphEdge, x: number, y: number) => void;
}

function getEdgeColor(edge: GraphEdge): THREE.Color {
  const tokens = Object.keys(edge.inAmountByToken || {}).concat(
    Object.keys(edge.outAmountByToken || {}),
  );
  const primaryToken = tokens.find((t) => t === "ICP") || tokens[0] || "ICP";
  if (primaryToken === "ICP") return new THREE.Color("#5577ff");
  const palette = [
    "#ff6644",
    "#44ff88",
    "#ffcc00",
    "#ff44cc",
    "#00ccff",
    "#aa44ff",
  ];
  let hash = 0;
  for (let i = 0; i < primaryToken.length; i++) {
    hash = (hash * 31 + primaryToken.charCodeAt(i)) & 0xffffffff;
  }
  return new THREE.Color(palette[Math.abs(hash) % palette.length]);
}

export function EdgeLine({
  edge,
  sourcePos,
  targetPos,
  edgeIndex,
  onEdgeHover,
  onEdgeLeave,
  onEdgeClick,
}: EdgeLineProps) {
  const color = getEdgeColor(edge);
  const tubeRef = useRef<THREE.Mesh>(null);
  const { clock } = useThree();

  // Build a QuadraticBezierCurve3 arc — NO straight lines
  const { curve } = useMemo(() => {
    const mid = new THREE.Vector3()
      .addVectors(sourcePos, targetPos)
      .multiplyScalar(0.5);
    const edgeVec = new THREE.Vector3().subVectors(targetPos, sourcePos);
    const edgeLen = edgeVec.length();

    // Perpendicular axis for the arc bulge
    const up = new THREE.Vector3(0, 1, 0);
    let perp = new THREE.Vector3().crossVectors(edgeVec, up).normalize();
    if (perp.lengthSq() < 0.01) {
      perp = new THREE.Vector3()
        .crossVectors(edgeVec, new THREE.Vector3(1, 0, 0))
        .normalize();
    }

    // Alternate bulge direction and add Z variation for 3D depth
    const curveDir = edgeIndex % 2 === 0 ? 1 : -1;
    const zDir = edgeIndex % 3 === 0 ? 1 : -1;
    const offsetAmount = edgeLen * 0.38;
    const controlPoint = mid
      .clone()
      .addScaledVector(perp, offsetAmount * curveDir);
    controlPoint.z += zDir * edgeLen * 0.12;

    const bezierCurve = new THREE.QuadraticBezierCurve3(
      sourcePos,
      controlPoint,
      targetPos,
    );
    return { curve: bezierCurve };
  }, [sourcePos, targetPos, edgeIndex]);

  const tubeRadius = Math.max(
    0.04,
    Math.min(0.12, (edge.tx_count || 1) * 0.015),
  );

  const tubeGeometry = useMemo(
    () => new THREE.TubeGeometry(curve, 28, tubeRadius, 6, false),
    [curve, tubeRadius],
  );

  // Wider invisible tube for hit detection
  const hitGeometry = useMemo(
    () =>
      new THREE.TubeGeometry(
        curve,
        12,
        Math.max(0.5, tubeRadius * 5),
        4,
        false,
      ),
    [curve, tubeRadius],
  );

  // Animated shimmer — pulsing emissive intensity
  useFrame(() => {
    if (tubeRef.current) {
      const mat = tubeRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity =
        0.45 + 0.3 * Math.sin(clock.getElapsedTime() * 1.1 + edgeIndex * 0.8);
    }
  });

  return (
    <>
      {/* Visible curved tube arc */}
      <mesh ref={tubeRef} geometry={tubeGeometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.55}
          transparent
          opacity={0.78}
          depthWrite={false}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      {/* Transparent hit-area tube */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: R3F mesh is not a DOM element */}
      <mesh
        geometry={hitGeometry}
        onPointerOver={(e) => {
          e.stopPropagation();
          onEdgeHover(edge, e.nativeEvent.clientX, e.nativeEvent.clientY);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onEdgeLeave();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onEdgeClick(edge, e.nativeEvent.clientX, e.nativeEvent.clientY);
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}
