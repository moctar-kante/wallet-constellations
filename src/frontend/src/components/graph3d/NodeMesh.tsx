import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Node3D } from "./useForceSimulation3D";

interface NodeMeshProps {
  node: Node3D;
  showLabels: boolean;
  isSelected: boolean;
  onNodeClick: (node: Node3D, screenX: number, screenY: number) => void;
  onNodeHover: (node: Node3D | null) => void;
  label?: string;
  isFavorite?: boolean;
  onLabelEdit: (nodeId: string) => void;
}

function getNodeAppearance(node: Node3D): {
  color: THREE.Color;
  emissive: THREE.Color;
  radius: number;
  emissiveIntensity: number;
} {
  if (node.isCenter) {
    return {
      color: new THREE.Color("#ddeeff"),
      emissive: new THREE.Color("#4488ff"),
      radius: 1.4,
      emissiveIntensity: 2.0,
    };
  }
  if (node.isWhale) {
    return {
      color: new THREE.Color("#ffbb44"),
      emissive: new THREE.Color("#ff8800"),
      radius: 0.65,
      emissiveIntensity: 1.2,
    };
  }
  if (node.identity?.type === "sns") {
    return {
      color: new THREE.Color("#44ffaa"),
      emissive: new THREE.Color("#00cc66"),
      radius: 0.52,
      emissiveIntensity: 1.0,
    };
  }
  if (node.identity?.type === "dex") {
    return {
      color: new THREE.Color("#ffcc44"),
      emissive: new THREE.Color("#ffaa00"),
      radius: 0.52,
      emissiveIntensity: 1.0,
    };
  }
  if (node.identity?.type === "neuron") {
    return {
      color: new THREE.Color("#bb66ff"),
      emissive: new THREE.Color("#8800ff"),
      radius: 0.48,
      emissiveIntensity: 0.9,
    };
  }
  return {
    color: new THREE.Color("#88aeff"),
    emissive: new THREE.Color("#3355cc"),
    radius: 0.42,
    emissiveIntensity: 0.8,
  };
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function createGlowTexture(hexColor: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, `${hexColor}cc`);
  grad.addColorStop(0.35, `${hexColor}44`);
  grad.addColorStop(1, `${hexColor}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function NodeMesh({
  node,
  showLabels,
  isSelected,
  onNodeClick,
  onNodeHover,
  label,
  isFavorite,
  onLabelEdit,
}: NodeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const { color, emissive, radius, emissiveIntensity } =
    getNodeAppearance(node);

  const emissiveHex = `#${emissive.getHexString()}`;
  const glowTexture = useMemo(
    () => createGlowTexture(emissiveHex),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emissiveHex],
  );

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const t = clock.getElapsedTime();

    if (node.isWhale) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
      mat.emissiveIntensity = emissiveIntensity * (0.7 + 0.5 * pulse);
      meshRef.current.scale.setScalar(
        hovered ? 1.2 + 0.08 * pulse : 1 + 0.08 * pulse,
      );
    } else if (node.isCenter) {
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.9);
      mat.emissiveIntensity = emissiveIntensity * (0.85 + 0.25 * breathe);
      meshRef.current.scale.setScalar(hovered ? 1.1 : 1);
    } else {
      mat.emissiveIntensity = hovered
        ? emissiveIntensity * 1.6
        : emissiveIntensity;
      meshRef.current.scale.setScalar(hovered ? 1.2 : 1);
    }
  });

  const displayLabel =
    label || (node.identity?.label ?? null) || (isFavorite ? "★" : null);
  const addressShort = shortenAddress(node.id);
  const pos: [number, number, number] = [node.x ?? 0, node.y ?? 0, node.z];

  return (
    <>
      {/* Sprite glow halo — additive blending for constellation look */}
      <sprite position={pos} scale={[radius * 5.5, radius * 5.5, 1]}>
        <spriteMaterial
          map={glowTexture}
          blending={THREE.AdditiveBlending}
          transparent
          opacity={node.isCenter ? 0.9 : 0.55}
          depthWrite={false}
        />
      </sprite>

      {/* Main sphere */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: R3F mesh is not a DOM element */}
      <mesh
        ref={meshRef}
        position={pos}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onNodeHover(node);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onNodeHover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onNodeClick(node, e.nativeEvent.clientX, e.nativeEvent.clientY);
        }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>

      {/* Point light for center node to light surrounding edges */}
      {node.isCenter && (
        <pointLight
          position={pos}
          color="#6699ff"
          intensity={4}
          distance={55}
          decay={2}
        />
      )}

      {/* Selection ring */}
      {isSelected && (
        <mesh position={pos}>
          <sphereGeometry args={[radius * 1.65, 16, 16]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#88aaff"
            emissiveIntensity={0.6}
            transparent
            opacity={0.18}
            wireframe
          />
        </mesh>
      )}

      {/* Address + custom label */}
      {showLabels && (
        <Html
          position={[
            (node.x ?? 0) + radius + 0.5,
            (node.y ?? 0) + radius * 0.35,
            node.z,
          ]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            {displayLabel && (
              <span
                style={{
                  color: "#ffeebb",
                  fontSize: node.isCenter ? "13px" : "11px",
                  fontWeight: 700,
                  textShadow: "0 0 8px #ffaa44, 0 1px 3px #000",
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
              >
                {displayLabel}
              </span>
            )}
            <span
              style={{
                color: node.isCenter ? "#cce4ff" : "#7a9dcc",
                fontSize: node.isCenter ? "11px" : "9px",
                fontFamily: "monospace",
                textShadow: "0 1px 4px #000, 0 0 6px rgba(60,100,220,0.4)",
                whiteSpace: "nowrap",
                letterSpacing: "0.03em",
              }}
            >
              {addressShort}
            </span>
          </div>
        </Html>
      )}

      {/* Hover pencil icon (no fill) */}
      {hovered && (
        <Html
          position={[
            (node.x ?? 0) - radius - 0.2,
            (node.y ?? 0) + radius + 0.4,
            node.z,
          ]}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLabelEdit(node.id);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#aaaaaa",
              fontSize: "13px",
              padding: "2px",
              lineHeight: 1,
            }}
            aria-label="Edit label"
          >
            ✏
          </button>
        </Html>
      )}
    </>
  );
}
