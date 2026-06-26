# Kickoff Clash — Design System

> **Canonical visual source of truth.** This document supersedes the legacy
> casino/felt-and-leather look. Everything ships in the **refreshed Sensible
> Soccer** style: bold flat colour blocks, hard high-contrast pixel edges,
> chunky display type, sprite-like player chips, bright pitch greens, kit-red
> and kit-blue accents — modernised for a phone, not a literal retro clone.
>
> Tokens live in `src/app/globals.css` (`@theme inline`). Fonts are wired in
> `src/app/layout.tsx`. **Change the look at the token layer, never with one-off
> hexes in components.** The legacy token names are retained as aliases so the
> whole app moves together.

---

## Brand & Voice

Kickoff Clash is a Balatro-style football-management roguelike: players are
cards, your XI is your hand, chemistry is synergy, managers are jokers.

- **Mood:** a slick team-management cockpit — confident, tactile, a little
  arcade. Top-down pixel footy brought into modern, high-craft form.
- **Tone of copy:** terse, punchy, sporting. Headings and labels are UPPERCASE
  pixel. Flavour lines are short italic quotes ("Concede nothing, punish
  everything."). No marketing fluff, no exclamation spam.
- **Craft bar:** impeccable. Pixel-perfect alignment, consistent rhythm,
  deliberate margins and motion. Nothing placed by eyeball.

---

## Color

Deep night-pitch surfaces, hard `--ink-black` borders, one bright turf green,
and a tight accent set (warm amber/gold + kit red/blue). High contrast and
legible on a phone in one hand.

### Foundation

| Token | Hex | Intent |
|---|---|---|
| `--ink-black` | `#07100b` | Hard pixel border / drop-shadow. The defining edge of the system. |
| `--line-white` | `#f2f6ef` | Pitch-line white; brightest text and hairlines. |
| `--pitch-bright` | `#1f9d4f` | Bold flat turf for pixel surfaces (pitch stripes, chips). |
| `--pitch-stripe` | `#1a8a45` | Alternate mow stripe. |
| `--kit-red` | `#e8362f` | Primary kit-red accent / home kit / CTA. Also `--danger`. |
| `--kit-blue` | `#2f7fe0` | Away-kit blue accent / secondary CTA. |

### Surfaces

| Token | Hex | Intent |
|---|---|---|
| `--felt` | `#0a160e` | App background — deep night pitch. |
| `--felt-light` | `#0f1f15` | Raised background band. |
| `--surface` / `--leather` | `#122a1b` | Default panel / card surface. (`--leather` aliases this.) |
| `--surface-raised` / `--leather-light` | `#18371f` | Hovered / elevated surface. |

### Borders

| Token | Hex | Intent |
|---|---|---|
| `--border` | `#2c5238` | Default hairline border on dark surfaces. |
| `--border-strong` | → `--ink-black` | Hard pixel edge for chips, packs, buttons. |

### Accents (warm)

| Token | Hex | Intent |
|---|---|---|
| `--amber` | `#ff7a1f` | Primary warm accent / main CTA. |
| `--amber-soft` | `#e0600f` | CTA gradient base. |
| `--amber-glow` | `rgba(255,122,31,.4)` | Glow halo behind warm CTAs. |
| `--gold` | `#f5c542` | Legendary / highlight gold; trait pills, dividers. |
| `--gold-glow` | `rgba(245,197,66,.35)` | Glow halo for gold. |

### Pitch (legacy names → bright turf)

| Token | Hex | Intent |
|---|---|---|
| `--pitch-green` | `#1f9d4f` | Primary turf. |
| `--pitch-dark` | `#14723a` | Shaded turf. |
| `--pitch-light` | `#34c46a` | Highlight turf / positive commentary. |

### Semantic

| Token | Hex | Intent |
|---|---|---|
| `--success` | `#34c46a` | Win / positive deltas. |
| `--danger` | `#e8362f` | Loss / negative — unified with `--kit-red`. |
| `--warning` | `#f5c542` | Caution / unified with `--gold`. |

### Text

| Token | Hex | Intent |
|---|---|---|
| `--cream` | `#f2f6ef` | Primary text. |
| `--cream-soft` | `#c3d2c0` | Secondary text. |
| `--dust` | `#88a08c` | Muted / caption text. |
| `--ink` | `#5a7561` | Disabled / faint text on dark. |

**Contrast law:** body text uses `--cream` / `--cream-soft` on surfaces; never
place `--dust` or `--ink` text on `--felt` for anything that must be read.
Position/rarity colours (gold, purple, kit-blue, grey) ring the player chips —
ratings are always `--line-white` for legibility.

---

## Typography

Two roles: a **pixel display face** for everything structural, a **legible sans**
for running text. A serif carries short flavour quotes.

| Variable | Font | Role |
|---|---|---|
| `--font-pixel` / `--font-display` | **Silkscreen** | Canonical display: headings, labels, buttons, numbers, tabs. `--font-display` aliases `--font-pixel` so existing `var(--font-display)` headings inherit the pixel look automatically. |
| `--font-heavy` | Archivo Black | Heavy non-pixel fallback for oversized hero type where pixel glyphs get too wide for a phone. |
| `--font-body` | DM Sans | Running text, descriptions, stat readouts. The default `body` family. |
| `--font-flavour` | Playfair Display (italic) | Short flavour quotes only. |

### Scale (mobile-first)

| Use | Size | Family | Notes |
|---|---|---|---|
| Hero title | `clamp(34px, 12vw, 56px)` | pixel | `textShadow: 0 3px 0 var(--ink-black)`. Never `text-7xl` raw — pixel glyphs overflow a phone. |
| Screen heading | 16–22px | pixel | UPPERCASE, `letter-spacing: .01em`. |
| Section label | 9–13px | pixel | UPPERCASE, used on tabs, chips, pills. |
| Button | 14–16px | pixel | UPPERCASE. |
| Body | 11–14px | sans | `line-height: 1.4`. |
| Caption | 9–11px | sans / muted | `--dust`. |
| Flavour | 10–13px italic | serif | quoted. |

**Pixel sizing law:** Silkscreen is wide and monospaced-feeling. At a 390px
viewport keep pixel headings ≤ ~56px and prefer `clamp()`. Verify no horizontal
overflow on every pixel heading.

---

## Spacing & Layout

The radius rhythm is tight — pixel surfaces want hard, small corners.

| Token | Value |
|---|---|
| `--radius-sm` | `4px` |
| `--radius` | `8px` |
| `--radius-lg` | `12px` |

Spacing scale (Tailwind units, 4px base): use `4 / 8 / 12 / 16 / 24 / 32`.
Avoid arbitrary in-between values; if a gap feels wrong, change the rhythm, not
one margin.

### Mobile-first / no-scroll laws (binding)

- Design for a phone held in one hand, **390×844**. Desktop is an afterthought.
- **No page scroll.** Root is `height: 100dvh` + `overflow: hidden`, a flex
  column where one region (`flex-1 min-h-0`) absorbs slack and the rest are
  fixed. Assert `document.documentElement.scrollHeight <= innerHeight + 2` in
  every state.
- Long lists live in **bottom-sheet overlays** or **paginated pages** that may
  scroll *internally* — the page never does. (See the manager picker sheet and
  the pack pager.)
- Touch targets ≥ 40px. No hover-only affordances. Respect
  `env(safe-area-inset-*)`.

---

## Components

Shared pixel patterns. Reuse these; do not reinvent per screen.

### Pixel edge

The signature treatment. A hard offset shadow in `--ink-black` gives the
flat-sprite, stacked-pixel feel.

```css
.pixel-edge { box-shadow: 0 2px 0 0 var(--ink-black), 0 3px 0 0 rgba(0,0,0,.35); }
```

Buttons extend it: `border: 2px solid var(--ink-black)` +
`box-shadow: 0 4px 0 0 var(--ink-black), 0 6px 18px var(--amber-glow)`.

### Primary CTA

Amber gradient, ink-black border, pixel uppercase label, hard drop shadow.
`linear-gradient(135deg, var(--amber), var(--amber-soft))`, text `--cream`.
Secondary CTA: kit-blue fill or gold-outlined `--surface`.

### Player chip (sprite token)

A flat circle ringed in its position/rarity colour, rating in `--line-white`
pixel/sans, name caption beneath in `--dust`/`--cream-soft`. On the pitch the
chip is a solid kit-colour disc with the shirt number. `image-rendering:
pixelated` (`.pixelated`) for any sprite art.

### Panel / surface

`--surface` fill, `--border` hairline (or `--ink-black` for a hard edge),
`--radius` corners. Raised/hover state → `--surface-raised`.

### Pill / tag

Small `--radius-lg` capsule, gold or accent outline, pixel uppercase label
(e.g. trait pills `High Risk`, `Low Block`).

### Bottom-sheet overlay

Dimmed scrim (`rgba(0,0,0,.5)`), sheet pinned to the bottom with
`rounded-t-[16px]`, `--felt`/`--surface` fill, accent top border, internal
scroll, max-height ~62%. Used for player/manager pickers.

### Pitch backdrop

`.pitch-stripes` repeating mow stripes (`--pitch-bright` / `--pitch-stripe`) for
pack stages; subtle box/centre-circle lines (`--line-white` at low alpha) for
the match and team-select pitches.

---

## Cards

The card is the atom of Kickoff Clash. Players are cards, gaffers are cards,
tactics are cards — and like Marvel Snap / Balatro they read as **real playing
cards** and **tap to expand** into a full-card overlay. One reusable family
powers every screen, so the look never drifts.

Source: `src/components/cards/`
- `cardTokens.ts` — the single source of truth for rarity/position/durability
  colours, position long-labels, tactic-category accents, nation flags + codes,
  and `lastName`. Every screen imports these; never hardcode the maps again.
- `GameCard.tsx` — the playing card. `<GameCard model={…} size="grid|full" …>`.
- `CardModal.tsx` — the expanded full-card overlay.

### The frame (shared)

Every card is a true **2.5 : 3.5 playing-card** rectangle: hard
`--ink-black` border (2px grid / 3px full), `--radius-sm` (grid) / `--radius`
(full) corners, a flat night-pitch gradient fill
(`--surface-raised → --surface → #0c1d12`), and the signature stacked pixel drop
shadow. An **accent rail** runs across the top and bottom of every card — this
colour is the card's identity:

- **PLAYER** → rarity colour (`Common` grey, `Rare` kit-blue, `Epic` purple,
  `Legendary` gold).
- **MANAGER** → `--kit-red`.
- **TACTIC** → category colour (`attacking` kit-red, `defensive` kit-blue,
  `specialist` gold).

`selected` adds an accent inset ring; `dimmed` drops opacity to ~0.42 for
ineligible picks. Ratings are always `--line-white` (contrast law).

### The three variants

All three share the frame but carry a variant-specific **pixel-art sprite**
(flat CSS/SVG blocks, `shapeRendering: crispEdges`, no image assets) and body.

- **PLAYER** — position tab (left) + big rating (right); a pixel kit-and-head
  sprite in the kit colour with an accent crest block; surname; archetype +
  nation flag/code.
- **MANAGER** — `GAFFER` tab + nation; a pixel suit-and-tie sprite (tie in
  accent); name; italic philosophy flavour; trait pills.
- **TACTIC** — category tab; a pixel chevron / tactic-board sprite; name;
  effect (line-clamped at grid size).

### Expand interaction

Tapping **any** card opens `CardModal`: a dimmed scrim
(`rgba(0,0,0,.66)` + 2px blur, `z-index: 60`) with a close control (top-right,
40px), the same card rendered at `size="full"` (animated in with `hero-pop`),
and the **full detail** below in stacked `--surface` panels. The page never
scrolls — only the detail column scrolls internally
(`overscroll-behavior: contain`). Closes on backdrop tap, the × control, or
**Escape**.

Detail shown:
- **Player** — rating, long position, nation, archetype (+ secondary), durability,
  role/theme chips, ability, strengths (green) / weaknesses (red) tags, character
  tags (gold), bio, and the quirk as a flavour line.
- **Manager** — name, nation (+flag), philosophy flavour, trait pills. (Never the
  legacy `effect` text.)
- **Tactic** — name, category, effect, flavour, and any contradiction note.

Each screen owns its own `modal` state and renders one `<CardModal>`; tokens
that have another primary action (place / remove / select) carry a small **`i`
info pip** so inspect is always available without breaking that action:
- Pack reveal: the whole card taps to inspect (managers also get a PICK button).
- Team-select sheets: the card taps to place/pick; the `i` pip inspects.
- Team-select pitch: tapping a placed chip **removes** it; the `i` pip inspects.
- Match pitch: planning-mode your-XI chips show an `i` pip that inspects (tap
  still selects/subs; rivals are not full cards, so they don't expand).

### Motion

`GameCard` reuses `chip-reveal` (staggered grid entrance via the `delay` prop);
`CardModal` reuses `hero-pop` for the card and `scrim-fade` for the scrim. No
new keyframes were needed.

---

## Motion

Snappy and GPU-cheap: prefer `transform` / `opacity` over reflow. Durations
150–350ms. Keyframes live in `globals.css` — reuse and extend, don't add ad-hoc.

| Keyframe / class | Use | Duration |
|---|---|---|
| `pack-idle` | Sealed pack breathing wobble (invite a tap). | 2.2s loop |
| `pack-rip` / `pack-flash` | Pack jolts, flares, tears off-screen. | 0.62s |
| `chip-reveal` | Revealed chips snap up from below, staggered. | 0.34s |
| `hero-pop` | Spotlight hero-card flip. | 0.4s |
| `card-appear` / `dealIn` | Cards fade-rise into place. | 0.3–0.45s |
| `scorePop` | Post-match score number pop. | 0.4s |
| `pulseButton` / `advance-btn-pulse` | Glow pulse on the active advance CTA. | 1.5s loop |
| `phase-fade-in` | Phase-to-phase crossfade. | 0.3s |
| `pack-rarity-flash` | Epic/Legendary screen flash on pull. | 0.45s |

**Easing:** snappy reveals use `cubic-bezier(0.22, 1, 0.36, 1)`; bouncy hero
pops use `cubic-bezier(0.34, 1.56, 0.64, 1)`. Respect reduced-motion intent —
keep core state changes legible without animation.

---

## Verification (definition of done for any UI work)

1. `npx tsc --noEmit` and `npm run lint` clean.
2. `NEXT_PUBLIC_BASE_PATH=/kickoff-clash npm run build` succeeds.
3. Drive headless at **390×844** (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`):
   assert no page scroll, capture `pageerror` / ≥400 responses (none), and
   **open the screenshots and look** — alignment, contrast, overflow, clipping.
