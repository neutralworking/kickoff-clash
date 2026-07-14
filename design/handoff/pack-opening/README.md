# Handoff: Pack Opening — Player Card Redesign

> **Owner decision (2026-07-14, post-handoff, supersedes the "portrait style
> still open" line below):** build the card exactly as specced here (1C Foil
> Premium — structure, rarity tiers, foil/glow, iconography, grid, flow), but
> **keep the game's EXISTING player picture style for the portrait window** —
> do not port the prototype's procedural vector/pixel portraits. The pixel-vs-
> vector axis is closed: current in-game portraits win.

## Overview
A redesign of the **Player Pack opening** screen for Kickoff Clash (Balatro-style football roguelike). A sealed pack is tapped, tears open, and nine player cards cascade in with rarity flares, settling into a **three-row × three-column grid** on a mobile screen. The headline work is a **new player-card design** and a **rarity system that reads instantly from card colour**. Three visual directions were explored; **1C (Foil Premium)** is the lead. The same card/grid/flow language should now be applied across the rest of the app.

## About the Design Files
The file in this bundle (`Pack Opening.dc.html`) is a **design reference created in HTML/React** — a prototype showing intended look and behaviour, **not production code to copy directly**. The card art (portraits, class icons) is drawn procedurally with inline SVG + canvas so the prototype is self-contained. Your task is to **recreate these designs in the Kickoff Clash codebase** (Next.js 16 + React 19 + Tailwind v4, per the design system) using its established components and tokens — not to ship this HTML. The procedural avatar/icon logic *can* be ported near-verbatim (it's plain React/SVG), but layout and styling should use the app's real patterns.

It renders as a Design Component; ignore the `DCLogic`/`x-dc` wrapper — the meaningful code is the `class Component` logic (data, palettes, `tier()`, `classIcon()`, `vectorAvatar()`, `drawPixel()`, `buildCard()`, `buildPhone()`).

## Fidelity
**High-fidelity.** Final colours, typography, spacing, iconography, card composition, and interaction/animation timings are all specified below and in the file. Recreate pixel-faithfully using the codebase's design system (`colors_and_type_v2.css` tokens).

## The three directions (pick 1C as the base)
All three share the exact same card structure, rarity system, flow, and icons — they differ only in portrait style and surface:
- **1A — Pixel Sticker**: pixel-art canvas portraits, on the dark phone.
- **1B — Pitch Vector**: procedural vector portraits, on the dark phone.
- **1C — Foil Premium (LEAD)**: procedural vector portraits, dark phone, strongest rarity glow/foil. Ship this one.

Portrait style is the only axis still open (pixel vs vector). Everything else is locked.

## Screens / Views

### Player Pack (single mobile screen, 418 × 966 inside the device bezel)
- **Purpose**: The player reviews the nine drawn players, taps any card to inspect/buy/sell/improve, then advances with **NEXT PACK →**.
- **Layout** (flex column, top→bottom), background `#070907`→`#0a0f0b` dark radial (phone screen stays dark):
  1. **Status bar** — 30px tall, `9:41` left, signal glyphs right. Text `--cream`.
  2. **Header** — centered. Step dots (3, first active = wide pill `--gold-hi`, rest `rgba(244,236,216,0.22)`). Title `PLAYER PACK` (`--font-display` Bebas Neue, 30px, `--gold-hi`, letter-spacing .08em, drop shadow). Sub `PACK 1 / 3` (`--font-arcade` Bungee, 11px, `--amber`, letter-spacing .16em).
  3. **Info line** — one line only: “Tap any card to inspect.” 11.5px `--cream-soft`, in a hairline gold-tinted pill (`border rgba(212,160,53,0.28)`, `bg rgba(212,160,53,0.06)`), margin `12px 14px 0`, radius 8, padding `8px 12px`. (There used to be two info boxes + a “The squad” caption — both removed.)
  4. **Grid** — `display:grid; grid-template-columns:repeat(3,1fr); align-items:start; gap:7px; padding:8px 12px 4px`. Nine cards, three rows.
  5. **Footer** — `NEXT PACK →` button, full width, `--font-arcade` 17px, ink `#1a0f08`, bg `linear-gradient(180deg,var(--amber-hi),var(--amber))`, radius 10, `box-shadow:0 5px 0 #a3560a, 0 0 24px rgba(245,158,11,0.45)`. Padding `8px 14px 14px`.
- **Replay control** — small circular `↻` button, `position:absolute; top:42; right:12`, 32×32, replays the reveal animation. (Prototype-only affordance; production may not need it.)
- **Device bezel** — outer 440px wrap, radius 46, padding 11, `linear-gradient(160deg,#2a2a2e,#101012)`, big soft shadow. This is prototype chrome — in-app the screen is the whole viewport.

## The Player Card (the hero unit — spec precisely)
Fixed size: **height 234px**, width = grid cell (~124px at 418 screen). `border-radius: 13px` (1C) / 11px (others). `padding: 7px`. `display:flex; flex-direction:column; overflow:hidden`. **Every card is the same size regardless of rarity or number of actions.**

Vertical stack inside:
1. **Top row** (space-between):
   - **Class badge** — 34×34 circle, `background:linear-gradient(160deg, <classColor>, <classColor>bb)`, ring `box-shadow:0 0 0 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.45)`. Holds a 23px class icon (see Iconography). Icon colour is dark `#241a06` on the light class badges (Finisher, Engine), else `#fff`.
   - **Position pill** — `background:<posColor>`, `#fff` text, `--font-display` 15px, letter-spacing .06em, padding `2px 8px`, radius 5.
2. **Portrait** — height 52px, `flex-shrink:0`, radius 8, `overflow:hidden`, margin `5px 0 4px`. Background = a recessed window on the card fill (dark tiers → faint light window, light tiers → faint dark window). The portrait art is zoomed toward the head with only a sliver of a **neutral** jersey (see Portraits). A rarity **flare** (radial glow) animates once on reveal; Legendary adds a floating ✦ spark.
3. **Name** — `--font-display`, 18px, uppercase, centered, `flex-shrink:0`, colour = tier ink, ellipsis if long.
4. **Role** — 9.5px, weight 600, centered, colour = tier sub. E.g. “Inverted Winger”, “Trequartista”, “Target Man”.
5. **Action chip(s)** — one chip normally; **Legendary carries two, kept on one line** (smaller font 6.5px, so the card never changes size). Chip: `background:<classColor>22`, `border:1px solid <classColor>`, uppercase, 8px (6.5 when two), radius 5.
6. **Spacer** (flex:1).
7. **Fitness** — label `FITNESS` (8px, letter-spacing .14em, tier-sub colour) + big value `100%` (`--font-stat` Anton, 12.5px, coloured by level: ≥95 `#22c55e`, ≥80 `#f59e0b`, else `#ef4444`). Below: a 5px track (`rgba(0,0,0,0.12)` on light tiers / `rgba(255,255,255,0.12)` on dark) with a coloured fill + soft glow. “Fitness” was previously hard to read — it’s now explicit and prominent.
8. **Two numbers** — two 34px circles, **no ATK/DEF labels** (colour encodes them): left `#e63946` (attack), right `#3aa0ff` (defence). `border:2.5px solid <col>`, `background:<col>22`, `box-shadow:0 0 10px <col>55, inset 0 0 8px <col>22`. Number `--font-stat`, 20px, tier-ink colour. These are the visual anchor of the card.
9. **Bottom rarity stripe** (1A pixel variant only) — 4px full-width bar in tier edge colour.

Card `box-shadow` stacks a base drop shadow + a **tier glow** (stronger by rarity) + a `inset 0 0 0 1px <edge>66` metallic rim. Border: `2.5px solid <tier.edge>`.

## Rarity system — Bronze / Silver / Gold / Onyx
Rarity must read **instantly from the whole card’s colour + border + glow** (not a small badge). The entire card fill is the tier colour. Distribution in a pack: mostly Common, ~one Rare, ~one Epic, ~one Legendary.

| Rarity | Tier name | Card fill (gradient 165°) | Border/edge | Text ink | Sub text | Glow | Light? |
|---|---|---|---|---|---|---|---|
| Common | **Bronze** | `#8a5220 → #5c3413 → #3d220c` | `#d68b3c` | `#fbe9d2` | `#e4b184` | `rgba(198,125,55,0.6)` | no |
| Rare | **Silver** | `#d3dae3 → #9aa5b4 → #737e8c` | `#ffffff` | `#1b2029` | `#3f4854` | `rgba(210,220,235,0.75)` | yes |
| Epic | **Gold** | `#ffd85c → #eab21f → #b47d10` | `#fff2b0` | `#3a2604` | `#6b4a0c` | `rgba(245,197,66,0.85)` | yes |
| Legendary | **Onyx** | `#26262f → #131319 → #050506` | `#f5c542` | `#fdf3d4` | `#e0bd63` | `rgba(245,197,66,0.95)` | no |

`light: true` tiers use dark ink and a dark fitness track; dark tiers use light ink and a light track. A subtle brushed-metal diagonal sheen overlays each card (`linear-gradient(115deg, transparent 36%, <edge>55 49%, transparent 60%)`, mix-blend `overlay`/`screen`, opacity .55). Glow intensity in the box-shadow scales: Common < Epic < Legendary.

## Iconography — player classes (six)
Custom inline-SVG glyphs (32×32 viewBox), NOT emoji — each must read as its football role. Rendered white, or dark `#241a06` on the light gold/amber badges (Finisher, Engine).

| Class | Meaning | Icon | Class colour |
|---|---|---|---|
| **Creator** | vision / assists | glowing **lightbulb** with idea-rays | `#a855f7` |
| **Destroyer** | breaks up play | **crossed swords** (guards + pommels) | `#ef4444` |
| **Engine** | box-to-box, tireless | **sprinting figure** | `#f59e0b` |
| **Controller** | dictates tempo | **metronome** | `#3aa0ff` |
| **Finisher** | scores goals | **ball buried in the goal net** (not a plain football) | `#f5c542` |
| **Wall** | defends | brick-fill **shield** | `#22c55e` |

Exact SVG paths are in `classIcon(cls, size, col)` in the file — port them directly.

## Position colours (pill)
GK `#f97316` · CD/WD `#3b82f6` · DM/CM/WM `#22c55e` · AM `#a855f7` · WF `#eab308` · CF `#ef4444`.

## Portraits
Two procedural styles (both self-contained, deterministic from a hash of `id + name`):

- **Vector (`vectorAvatar`, used in 1B/1C)** — inline SVG head-and-shoulders, **zoomed toward the face** (`viewBox 16 6 68 70`) so only a sliver of shoulder shows. Features: skin tone, hair colour + shape, optional beard, glasses, earring, hat, headband. **Head shape varies** across five archetypes (oval / round / square / long / heart — different `rx/ry/jaw/chin`) and **head size varies** per player (scale 0.90–1.16). Face has cheek shading + a hair-highlight strand. The **jersey is deliberately neutral dark grey** (`#33383f`) — real club kit is applied *after* the player signs to the user’s club, so kit is intentionally not shown here.
- **Pixel (`drawPixel`, used in 1A)** — 16×18 canvas grid, `image-rendering:pixelated`, same feature set. (Not yet given the head-zoom treatment — open question below.)

## Interactions & Behavior
- **Reveal flow**: phase `sealed` → `open`. Sealed shows a foil-shimmering pack card (`packPulse` 1.7s loop, “TAP TO OPEN” hint). On open: a white flash (`flashWhite` .6s), then all nine cards **cascade/deal in** with `dealIn` (per-card `animation-delay = index × 70ms × speedMult`, easing `cubic-bezier(.22,1,.36,1)`), each firing a one-shot rarity **flare** glow (`flareGlow`), Legendary adding a floating ✦ (`sparkFloat`). Auto-plays on load (staggered per variant); `↻` replays.
- **Speed** is tweakable: `revealSpeed` ∈ {relaxed 1.5×, normal 1×, rapid 0.55×}.
- Cards are tappable (inspect/buy/sell/improve) — wire to the app’s existing card-inspect modal.
- Motion rules (from the design system): smooth, expo-out, never bouncy/shaky — “cards settling on felt”.

## State Management
- Per-screen: `phase` (`sealed` | `open`) and a `nonce` that increments on each open to re-key cards so the entrance animation replays. In production, reveal state is transient screen state; slide/step position is otherwise URL/host-driven.
- Tweakable props (exposed on the root component): `revealSpeed` (enum), `autoReveal` (bool), `sparkles` (bool). These map to real feature toggles, not styling.

## Design Tokens
Use the bound `colors_and_type_v2.css`:
- **Fonts**: `--font-display` Bebas Neue (titles, names, position pill), `--font-stat` Anton (all numbers), `--font-arcade` Bungee (PACK x/y, CTA, badges), `--font-body` Oswald (labels/body).
- **Accents**: `--amber #f59e0b`, `--amber-hi #fbbf24`, `--gold #d4a035`, `--gold-hi #f5c542`.
- **Text**: `--cream #f4ecd8`, `--cream-soft #d8cfb9`, `--dust #8a8173`.
- **Semantic**: win `#22c55e`, draw/warn `#f59e0b`, loss `#ef4444`.
- **Numbers**: attack `#e63946`, defence `#3aa0ff`.
- **Rarity tiers**: see the Bronze/Silver/Gold/Onyx table above.
- **Radii**: card 11–13, chips/badges 5, pills 5. **Card height 234 fixed.** Grid gap 7, padding `8px 12px 4px`.

## Assets
None external. All portrait art and class icons are generated in code (SVG paths + canvas). No photography (matches the design system: cards are typographic/illustrative, no player photos). Fonts load from Google Fonts via the design-system stylesheet.

## Files
- `Pack Opening.dc.html` — the full prototype. Read the `class Component` block for: `players` (sample roster + data shape), `tier()`, `rarityColor()/posColor()/classColor()/fitColor()`, `classIcon()`, `vectorAvatar()`, `drawPixel()`, `portraitBg()`, `rarityDecor()`, `buildCard()`, `buildPack()`, `buildPhone()`.
- `screenshots/1a-pixel-sticker.png` — 1A variant (pixel portraits).
- `screenshots/1b-pitch-vector.png` — 1B variant (vector portraits).
- `screenshots/1c-foil-premium.png` — **1C lead variant**, top of grid (Bronze/Silver/Gold rarities visible).
- `screenshots/1c-lower-rows.png` — 1C lower rows incl. the Onyx Legendary (Silva) with two action chips.

## Open questions for the next session
- **Portrait style**: pixel (1A) vs vector (1B/1C). Lead is vector (1C). Decide before scaling to other screens.
- **Pixel head-zoom**: the vector portraits were zoomed toward the head; the pixel variant hasn’t had that treatment yet.
- **Applying the system app-wide**: the card, rarity ladder, class icons, and reveal motion should now propagate to the hand/XI, shop, match, and post-match screens.

## Data shape (per player)
```
{ id, name, pos, cls, role, action, action2?, n1 /*attack*/, n2 /*defence*/, fit /*0-100*/, rarity /*Common|Rare|Epic|Legendary*/ }
```
`action2` is only present on Legendary cards (renders the second action chip on the same line).
