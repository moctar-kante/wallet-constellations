# Wallet Constellations – Design Brief

**Concept**: Live transaction visualization as an interactive constellation map — nodes are wallets, edges are flows, edges carry token data. Dark space theme with neon accents (blue/amber/green/red). Supports dark/light mode. All 5 feature batches integrated.

## Aesthetic & Tone
Interstellar explorer UI: precise, layered, tech-forward. Neon against deep space. Restrained animation. No playfulness — clinical precision for finance data.

## Palette (OKLCH)
| Token | Dark | Light | Purpose |
| --- | --- | --- | --- |
| Background | 0.07 0.015 260 | 0.98 0.004 240 | Page canvas |
| Primary | 0.77 0.13 220 | 0.6 0.15 220 | Neon blue: active states, node halos |
| Accent | 0.76 0.15 65 | 0.72 0.15 65 | Neon amber: warnings, highlights |
| Success | 0.83 0.18 155 | 0.6 0.18 155 | Neon green: inbound edges |
| Destructive | 0.65 0.2 20 | 0.55 0.2 20 | Neon red: outbound edges |
| Card | 0.12 0.03 240 | 1 0 0 | Floating panels (search, labels, saved wallets) |
| Muted | 0.15 0.035 238 | 0.94 0.015 240 | Secondary surfaces |
| Border | 0.22 0.05 240 | 0.88 0.02 240 | Dividers, node outlines |

## Typography
Display: Plus Jakarta Sans 700 (all UI). Body: Plus Jakarta Sans 400 (default). Mono: GeistMono (account addresses, token amounts).

## Structural Zones
| Zone | Token | Treatment |
| --- | --- | --- |
| Top bar | `bg-card/20` with `border-b-border` | Search, theme toggle, share, menu |
| Graph canvas | `bg-background` + radial gradient | SVG constellations, nodes, edges, tooltips |
| Status bar | `bg-muted/40` | Thin line above graph, outside frame |
| Settings panel | `bg-card/60` | Collapsible, less transparent, depth-2+ toggle |
| Node label popup | `bg-card/80` | Pencil icon, 6-char max, hover edit |
| Search history | `bg-card/70` | Dropdown from search bar |
| Saved wallets | `bg-card/70` | Left sidebar, collapsible |
| Mini-map | `bg-card/50` | Corner overview, viewport indicator |
| Tooltip | `bg-card/90` | Per-token, per-direction, k/M notation, 3 decimals |
| Activity sparkline | `bg-muted/30` | Per-node chart inline |
| Whale highlight | Glow effect | `shadow-neon` on high-volume nodes |

## Component Patterns
- **Copy button**: Pencil-like icon (small, no fill) on node hover → tooltip "Copied!" on click
- **Share link**: Icon button (share symbol) → copies URL with `?account=` pre-filled
- **Search history**: Dropdown, keyboard arrow nav, click to search
- **Saved wallets**: Starred items in sidebar, drag-reorder, quick-pin from any node
- **Mini-map**: SVG miniature, highlighted viewport box, click to pan
- **Cluster collapse**: Depth-N nodes with 1 connection shown as `N addresses` bubble, click to expand
- **Whale detector**: Nodes with volume > percentile(95) get `shadow-neon` ring + label
- **SNS badges**: Emoji icon + text label on node (e.g. 🏛 SNS, ⚙️ DEX, 🧠 Neuron)
- **Activity sparkline**: 7-day or 30-day histogram, inline under address
- **Net flow**: Arrow + amount below edge label (e.g. `→ 142.5 ICP net`)

## Motion & Animation
- Zoom: Cursor-relative (desktop), pinch-relative (mobile)
- Pan: Drag nodes or use arrow keys
- Theme toggle: CSS color transition (300ms smooth)
- Glow pulse: Whale nodes glow 2s cycle
- Label edit: Fade in/out on hover

## Constraints
- No decorative animations (no bouncing, no particle effects)
- Max 1.5px edge width
- Node label max 6 chars, monospace for readability
- All token prices cached client-side (no real-time re-fetch)
- SNS/neuron detection via precompiled canister registry
- Cluster collapse only depth 2+
- Mini-map SVG renders only if graph has 30+ nodes

## Signature Detail
Neon rings on whale nodes pulsing gently. Breadcrumb trail of searched wallets as subtle timeline above graph. Node labels in small caps to signal they're metadata, not addresses.
