# Wallet Constellations – Design Brief

**Concept**: Live transaction visualization as an interactive constellation map — nodes are wallets, edges are flows, edges carry token data. Restrained blue/neutral space theme with subtle neon accents (blue/amber/green/red). Supports dark/light mode. Graph background now carries real depth via layered parallax, not lockstep motion.

## Aesthetic & Tone
Interstellar explorer UI: precise, layered, tech-forward. Restrained blue/neutral palette — understated and premium, not a generic "AI space background." No playfulness — clinical precision for finance data.

## Differentiation
Depth is created by parallax, not by animation: 2-3 background layers translate at fractions of graph pan speed while the graph moves at 100%, so panning/zooming reveals spatial separation. One semantic-token system drives page + graph canvas in lockstep for dark/light.

## Color Palette (OKLCH)
| Token | Dark | Light | Purpose |
| --- | --- | --- | --- |
| Background | 0.07 0.015 260 | 0.98 0.004 240 | Page canvas |
| Foreground | 0.94 0.01 240 | 0.12 0.03 240 | Primary text |
| Primary | 0.77 0.13 220 | 0.6 0.15 220 | Neon blue: active states, node halos |
| Accent | 0.76 0.15 65 | 0.72 0.15 65 | Neon amber: warnings, highlights |
| Card | 0.12 0.03 240 | 1 0 0 | Floating panels |
| Muted | 0.15 0.035 238 | 0.94 0.015 240 | Secondary surfaces |
| Border | 0.22 0.05 240 | 0.88 0.02 240 | Dividers, node outlines |

## Typography
Display: Plus Jakarta Sans 700 (all UI). Body: Plus Jakarta Sans 400 (default). Mono: GeistMono (account addresses, token amounts). Both bundled as `@font-face` — no CDN import.

## Parallax Depth System (Graph Background)
Replace the single static starfield/nebula SVG with 2-3 layers, each an oversized absolute-positioned SVG (`inset:-25%`, `pointer-events:none`, `will-change:transform`) translated by the zoom handler at a fraction of graph pan speed:

| Layer | Speed (% of pan) | Content | Tokens |
| --- | --- | --- | --- |
| Nebula | ~6% (near-static) | Smooth 5-stop radial nebula glow | `--graph-parallax-nebula`, `--graph-nebula-1..4`, `--graph-nebula-mid` |
| Distant stars | ~18% | Small, dim stars | `--graph-parallax-distant`, `--graph-star-distant` |
| Near stars | ~45% | Brighter, slightly larger stars | `--graph-parallax-near`, `--graph-star-near` |
| Graph | 100% | Nodes/edges in zoom transform group | — |

- Speeds live as CSS vars (`--graph-parallax-*`) read by the frontend zoom handler; layer classes expose `--graph-layer-speed`.
- No twinkle animation — depth comes from parallax motion alone.
- Nebula uses `.graph-nebula-smooth` for a smoother, more premium gradient than the legacy 3-stop `.graph-nebula`.

## Theme Consistency (Token Coverage)
All graph + chart colors route through semantic tokens in BOTH `:root` (dark) and `.light`. Canvas/WebGL reads literal values from tokens. Coverage map:

| Hardcoded source | Token(s) |
| --- | --- |
| Nebula gradient stops | `--graph-nebula-1..4`, `--graph-nebula-mid` |
| Star field fills | `--graph-star`, `--graph-star-distant`, `--graph-star-near` |
| Parallax speeds | `--graph-parallax-nebula/distant/near` |
| Non-ICP token accents (tokenColor) | `--graph-token-1..6` |
| Settings panel text | `--graph-overlay-text`, `--graph-overlay-text-dim` |
| Node info window surfaces | `--graph-overlay-bg`, `--graph-overlay-bg-strong`, `--graph-overlay-border`, `--graph-overlay-text` |
| Edge tooltip surfaces | `--graph-panel-bg`, `--graph-panel-border`, `--graph-overlay-text` |
| Legend text | `--graph-text`, `--graph-overlay-text-dim`, `--graph-legend-bg`, `--graph-legend-border` |
| Label modal surfaces | `--graph-pencil-bg`, `--graph-pencil-border`, `--graph-pencil-icon`, `--graph-btn-solid` |
| Donut/pie segments (App DONUT_COLORS) | `--chart-donut-1..6` |

## Structural Zones
| Zone | Token | Treatment |
| --- | --- | --- |
| Top bar | `bg-card/20` with `border-b-border` | Search, theme toggle, share, menu |
| Graph canvas | `bg-background` + radial gradient | Parallax layers behind, SVG constellations above |
| Status bar | `bg-muted/40` | Thin line above graph, outside frame |
| Settings panel | `bg-card/60` | Collapsible, depth-2+ toggle |
| Node label popup | `bg-card/80` | Pencil icon, 6-char max, hover edit |
| Search history | `bg-card/70` | Dropdown from search bar |
| Saved wallets | `bg-card/70` | Left sidebar, collapsible |
| Mini-map | `bg-card/50` | Corner overview, viewport indicator |
| Tooltip | `bg-card/90` | Per-token, per-direction, k/M notation |
| Activity sparkline | `bg-muted/30` | Per-node chart inline |
| Whale highlight | Glow effect | `shadow-neon` on high-volume nodes |

## Component Patterns
- **Copy button**: Pencil-like icon (small, no fill) on node hover → tooltip "Copied!" on click
- **Share link**: Icon button → copies URL with `?account=` pre-filled
- **Search history**: Dropdown, keyboard arrow nav, click to search
- **Saved wallets**: Starred items in sidebar, drag-reorder, quick-pin from any node
- **Mini-map**: SVG miniature, highlighted viewport box, click to pan
- **Cluster collapse**: Depth-N nodes with 1 connection shown as `N addresses` bubble
- **Whale detector**: Nodes with volume > percentile(95) get `shadow-neon` ring + label
- **SNS badges**: Emoji icon + text label on node (🏛 SNS, ⚙️ DEX, 🧠 Neuron)
- **Activity sparkline**: 7-day or 30-day histogram, inline under address
- **Net flow**: Arrow + amount below edge label (e.g. `→ 142.5 ICP net`)

## Motion & Animation
- Parallax: background layers translate at 6% / 18% / 45% of pan speed; graph at 100%
- Zoom: Cursor-relative (desktop), pinch-relative (mobile)
- Pan: Drag nodes or use arrow keys
- Theme toggle: CSS color transition (300ms smooth) across whole page + graph
- Glow pulse: Whale nodes glow 2s cycle
- Label edit: Fade in/out on hover

## Constraints
- No twinkle / decorative star animation — parallax alone creates depth
- No decorative animations (no bouncing, no particle effects)
- Max 1.5px edge width
- Node label max 6 chars, monospace for readability
- All token prices cached client-side (no real-time re-fetch)
- SNS/neuron detection via precompiled canister registry
- Cluster collapse only depth 2+
- Mini-map SVG renders only if graph has 30+ nodes
- No hardcoded colors in components — all via semantic tokens
- Do not touch the unused graph3d/ three.js parallel implementation

## Signature Detail
Layered parallax depth: nebulas drift at ~6% of pan speed, distant stars at ~18%, near stars at ~45%, while the graph moves at 100% — a restrained, premium sense of spatial scale beneath the constellation.
