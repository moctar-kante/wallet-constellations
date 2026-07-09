import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { GraphEdge, GraphNode } from "../../types";
import { EdgeLine } from "./EdgeLine";
import { NodeMesh } from "./NodeMesh";
import { useForceSimulation3D } from "./useForceSimulation3D";
import type { Node3D } from "./useForceSimulation3D";

export interface CameraControls {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

interface Scene3DProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  showLabels: boolean;
  autoRotate: boolean;
  selectedNodeId: string | null;
  onNodeClick: (node: Node3D, screenX: number, screenY: number) => void;
  onEdgeHover: (edge: GraphEdge, x: number, y: number) => void;
  onEdgeLeave: () => void;
  onEdgeClick: (edge: GraphEdge, x: number, y: number) => void;
  labels: Record<string, string>;
  favorites: Set<string>;
  onLabelEdit: (nodeId: string) => void;
  cameraRef: React.MutableRefObject<CameraControls | null>;
}

// Procedural star field — 4000 points at large radius with size variation
function StarField() {
  const geometry = useMemo(() => {
    const count = 4000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Random point on sphere shell between r=120 and r=220
      const r = 120 + Math.random() * 100;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = 2 * Math.PI * Math.random();
      positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = r * Math.cos(theta);
      sizes[i] = 0.4 + Math.random() * 1.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, []);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#c8d8ff"
        size={0.6}
        sizeAttenuation
        transparent
        opacity={0.85}
      />
    </points>
  );
}

// Subtle nebula blob in the background
function Nebula() {
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Soft radial gradient — deep blue/purple nebula
    const g1 = ctx.createRadialGradient(
      size * 0.4,
      size * 0.45,
      0,
      size * 0.4,
      size * 0.45,
      size * 0.5,
    );
    g1.addColorStop(0, "rgba(30,40,120,0.35)");
    g1.addColorStop(0.5, "rgba(50,20,80,0.18)");
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);

  if (!texture) return null;
  return (
    <mesh position={[0, 0, -90]} rotation={[0, 0, 0.4]}>
      <planeGeometry args={[180, 180]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.6}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function CameraController({
  autoRotate,
  cameraRef,
}: {
  autoRotate: boolean;
  cameraRef: React.MutableRefObject<CameraControls | null>;
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  useEffect(() => {
    cameraRef.current = {
      zoomIn: () => {
        camera.position.multiplyScalar(0.8);
      },
      zoomOut: () => {
        camera.position.multiplyScalar(1.25);
      },
      reset: () => {
        camera.position.set(0, 0, 95);
        camera.lookAt(0, 0, 0);
        if (controlsRef.current) controlsRef.current.reset();
      },
    };
  }, [camera, cameraRef]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={true}
      zoomToCursor={true}
      enableDamping={true}
      dampingFactor={0.08}
      minDistance={8}
      maxDistance={280}
      autoRotate={autoRotate}
      autoRotateSpeed={0.4}
    />
  );
}

function SceneContent(props: Scene3DProps) {
  const {
    nodes,
    edges,
    showLabels,
    autoRotate,
    selectedNodeId,
    onNodeClick,
    onEdgeHover,
    onEdgeLeave,
    onEdgeClick,
    labels,
    favorites,
    onLabelEdit,
    cameraRef,
  } = props;

  const [settled3DNodes, setSettled3DNodes] = useState<Node3D[]>([]);
  const { restart } = useForceSimulation3D(nodes, edges, setSettled3DNodes);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart when nodes/edges identity changes
  useEffect(() => {
    restart();
  }, [nodes, edges]);

  const nodeMap = useMemo(
    () => new Map(settled3DNodes.map((n) => [n.id, n])),
    [settled3DNodes],
  );

  return (
    <>
      <CameraController autoRotate={autoRotate} cameraRef={cameraRef} />

      {/* Scene lighting — keep ambient low so emissive glow pops */}
      <ambientLight intensity={0.15} />
      <pointLight position={[80, 60, 60]} intensity={0.6} color="#8899ff" />
      <pointLight position={[-60, -40, 40]} intensity={0.3} color="#6644aa" />

      {/* Richer star field */}
      <StarField />

      {/* Nebula backdrop */}
      <Nebula />

      {/* Nodes */}
      {settled3DNodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          showLabels={showLabels}
          isSelected={selectedNodeId === node.id}
          onNodeClick={onNodeClick}
          onNodeHover={() => {}}
          label={labels[node.id]}
          isFavorite={favorites.has(node.id)}
          onLabelEdit={onLabelEdit}
        />
      ))}

      {/* Curved edges — pass index for alternating arc direction */}
      {edges.map((edge, i) => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return null;
        return (
          <EdgeLine
            key={`${edge.source}-${edge.target}-${i}`}
            edge={edge}
            edgeIndex={i}
            sourcePos={new THREE.Vector3(src.x ?? 0, src.y ?? 0, src.z)}
            targetPos={new THREE.Vector3(tgt.x ?? 0, tgt.y ?? 0, tgt.z)}
            onEdgeHover={onEdgeHover}
            onEdgeLeave={onEdgeLeave}
            onEdgeClick={onEdgeClick}
          />
        );
      })}
    </>
  );
}

export function Scene3D(props: Scene3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 95], fov: 58 }}
      style={{ background: "#03060f", width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
