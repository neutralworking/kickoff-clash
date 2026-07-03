# Kickoff Clash — Design System

> **Canonical visual source of truth.** This document supersedes the legacy
> casino/felt-and-leather look, the earlier night-pitch dark-mode pass, AND
> the short-lived cream/parchment "sticker album pages" misreading. The real
> reference is the 1995 Panini Merlin Premier League album **COVER**: an
> ornate black background with gold foil embossed lettering, crest artwork,
> and border. Everything ships **black-and-gold**: true near-black surfaces,
> gold foil as the dominant, load-bearing accent (borders, dividers, headers,
> CTAs, glass chrome, glow halos), hard high-contrast `--ink-black`
> sticker-cutout edges, chunky display type, sprite-like player chips, and one
> bright turf green held in reserve for the pitch itself — a premium
> trophy-case/treasure-chest feel, modernised for a phone, not a literal
> retro clone.
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

**1995 Panini Merlin sticker-album COVER: black-and-gold.** True near-black
surfaces dominate — this is a dark-mode system again, a trophy case/treasure
chest, not a paper collectible — with **gold foil as the primary, dominant
accent**: borders, dividers, headers, CTA treatments and glow halos all lean
gold before anything else. Kit-red and kit-blue are flat poster primaries held
firmly secondary (badges, kit accents, rare-rarity ring) so they never compete
with gold for attention. One bright turf green stays held in reserve for the
pitch itself. Hard `--ink-black` sticker-cutout borders remain the defining
edge. High contrast and legible on a phone in one hand.

### Foundation

| Token | Hex | Intent |
|---|---|---|
| `--ink-black` | `#0b0703` | Hard pixel border / drop-shadow — the "sticker cutout" edge, true near-black. The defining edge of the system. |
| `--line-white` | `#fbf7ec` | Warm ivory white. Brightest text/highlight — use ONLY on saturated or dark fills (kit badges, ink-black chips), or directly on a black surface where it's the loudest possible signal. |
| `--pitch-bright` | `#1f9d4f` | Bold flat turf, reserved for the pitch itself (pitch stripes, the team-select/match pitch). Not a general surface colour. |
| `--pitch-stripe` | `#1a8a45` | Alternate mow stripe. |
| `--kit-red` | `#e0332d` | Secondary kit-red accent / home kit — flat poster red. Also `--danger`. Never the dominant accent — that's gold now. |
| `--kit-blue` | `#2b74e0` | Secondary away-kit blue accent — flat poster blue. |

### Surfaces

| Token | Hex | Intent |
|---|---|---|
| `--felt` | `#120d07` | App background — true near-black with a whisper of warmth toward gold (the "case" the cards sit in). |
| `--felt-light` | `#1a130a` | Raised background band. |
| `--surface` / `--leather` | `#221a0f` | Default panel / card surface. (`--leather` aliases this.) |
| `--surface-raised` / `--leather-light` | `#2f2415` | Hovered / elevated surface — the lightest step, still firmly dark. |

Surfaces get progressively **lighter** as they elevate (felt → surface →
surface-raised) — genuine depth in a trophy case, not a flat wash. The ramp
is warm-neutral toward gold, deliberately NOT toward the old night-pitch
green (green being the dominant tone was the original complaint) and NOT
toward the cream/parchment overcorrection that followed it.

### Borders

| Token | Hex | Intent |
|---|---|---|
| `--border` | `#5c4526` | Default hairline border on dark surfaces — a dim bronze-gold line, part of the gold family without competing with full-strength `--gold`. |
| `--border-strong` | → `--ink-black` | Hard pixel edge for chips, packs, buttons. |

### Accents (warm)

| Token | Hex | Intent |
|---|---|---|
| `--amber` | `#ff7a1f` | Warm accent — flat poster orange, secondary to gold (used for some CTA glows/pulses). |
| `--amber-soft` | `#e0600f` | CTA gradient base. |
| `--amber-glow` | `rgba(255,122,31,.42)` | Glow halo behind warm CTAs. |
| `--gold` | `#e8b23a` | **THE dominant accent.** Foil gold on black — borders, dividers, headers, CTA treatments, glow halos, the Legendary rarity ramp. Brighter/richer than either the night-pitch original or the cream-pass "reads as text on cream" deepened value, because it now needs to read as glowing foil against true black. |
| `--gold-glow` | `rgba(232,178,60,.55)` | Glow halo for gold — the foil-catching-light halo, stronger now that gold is load-bearing everywhere, not just Legendary. |

### Pitch (legacy names → bright turf)

| Token | Hex | Intent |
|---|---|---|
| `--pitch-green` | `#1f9d4f` | Primary turf. |
| `--pitch-dark` | `#14723a` | Shaded turf. |
| `--pitch-light` | `#2fae63` | Highlight turf / positive commentary. |

Pitch tokens are unchanged from the cream pass — demoting green to "just the
pitch, not the whole app" was already correct and stays correct here.

### Semantic

| Token | Hex | Intent |
|---|---|---|
| `--success` | `#34c46a` | Win / positive deltas — a bright flat green, legible on black. |
| `--danger` | `#e0332d` | Loss / negative — unified with `--kit-red`. |
| `--warning` | `#e8b23a` | Caution / unified with `--gold`. |

### Text

| Token | Hex | Intent |
|---|---|---|
| `--cream` | `#f2ead6` | Primary text — warm ivory, near-white. (Restored to light-on-dark: surfaces are black again, so this is the brightest primary-copy token.) |
| `--cream-soft` | `#c9bb95` | Secondary text — warm parchment-gold grey. |
| `--dust` | `#9a8b6a` | Muted / caption text — dim warm taupe. |
| `--ink` | `#5c5340` | Disabled / faint text on dark surfaces — dim, deliberately low-contrast (disabled reads as unavailable). |

**Contrast law (restored for the black-surface system):** body text uses
`--cream` / `--cream-soft` on `--felt` / `--surface` / `--surface-raised` —
`--line-white` is reserved for the loudest signals: text sitting on a
saturated fill (kit badges, gold chips, `--ink-black` tabs) or the single
brightest number on a screen (e.g. a hero scoreline). `--dust` / `--ink` stay
legible-but-quiet captions on the dark surfaces; they were never meant to
carry primary copy. Position/rarity colours (gold, purple, kit-blue, grey)
ring the player chips — ratings are always `--line-white` **on their coloured
badge**, or `--cream` where a rating sits directly on a card/panel surface.

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

Chrome panels are **glass** (see *Glass chrome* below): `.glass-surface` /
`.glass-raised` + `.sheen`, with the accent rail glowing. Hard-edged **pixel**
tokens (chips, packs, card faces) keep the flat `--surface` fill + `--ink-black`
edge + pixel-edge drop — those are content, not chrome.

### Pill / tag

Small `--radius-lg` capsule, gold or accent outline, pixel uppercase label
(e.g. trait pills `High Risk`, `Low Block`).

### Bottom-sheet overlay

Backdrop-blurred dimmed scrim (`rgba(2,9,5,.62)` + a small `backdrop-filter`
blur), sheet pinned to the bottom with `rounded-t-[var(--radius-lg)]`, a
**`.glass-raised` + `.sheen`** frosted-glass panel at `--depth-3`, internal
scroll, max-height ~62–82dvh. Used for player/manager pickers.

### Pitch backdrop

`.pitch-stripes` repeating mow stripes (`--pitch-bright` / `--pitch-stripe`) for
pack stages; subtle box/centre-circle lines (`--line-white` at low alpha) for
the match and team-select pitches.

---

## Glass chrome (depth layer)

> **Canonical.** This is the **depth layer that sits ON TOP of the pixel
> system** above — it supersedes the pure-flat framing while keeping the pixel
> identity intact. The rule is one sentence: **glass shell, pixel content.**

The app **SHELL** — panels, HUD, tab bars, buttons, sheets, scrims, phase
backgrounds — is premium **frosted glass with depth**, re-grounded for a
black backdrop (a gold-foil-on-black cover feel, not a parchment one):
translucent near-black fills over a blurred backdrop, a bright warm-gold top
inner-highlight (the foil sheen), a soft diagonal sheen, a tight accent/rarity
glow, and a real elevation-shadow hierarchy. Gold is the load-bearing glass
accent — the default `.glass-border` and `.glow-edge` halo both read gold, so
every panel/HUD/sheet in the shell inherits the cover's gold-on-black chrome
without needing a per-component override. The **CONTENT** — cards,
player/gaffer/tactic sprites, the pitch, scoreline glyphs, Silkscreen type —
stays crisp **pixel art**. Depth lives *under* and *around* the pixels (frame,
glow, shadow); it **never blurs or soft-shadows a sprite or an `--ink-black`
pixel edge** — that is the cardinal sin. The card is where the two meet: a
glassy frame wrapping a pixel interior.

### Tokens (in `globals.css` `@theme`)

| Token | Value | Intent |
|---|---|---|
| `--glass-fill` | `rgba(20,15,8,.58)` | Translucent `--surface` fill for `.glass-surface`. |
| `--glass-fill-strong` | `rgba(28,21,11,.80)` | Denser fill for raised glass. |
| `--glass-border` | `rgba(232,178,60,.20)` | Gold-foil hairline edge — gold as chrome everywhere, not just rarity. |
| `--glass-highlight` | `rgba(255,240,205,.24)` | Bright warm-gold top inner-highlight (the "lit glass"/foil-sheen tell). |
| `--glass-fallback` / `--glass-fallback-strong` | `#221a0f` / `#2f2415` | Opaque fills where `backdrop-filter` is unsupported. |
| `--purple` | `#8b5cf6` | Epic rarity hue (also the card Epic accent). |
| `--glow-soft` | `rgba(232,178,60,.26)` | Neutral focus halo (default for `.glow-edge`) — gold, the dominant accent. |
| `--glow-rare` | `rgba(43,116,224,.55)` | Rare halo (kit-blue). |
| `--glow-epic` | `rgba(139,92,246,.55)` | Epic halo (purple). |
| `--glow-legendary` | `rgba(232,178,60,.60)` | Legendary halo (gold) — the hero glow, strongest in the set. |

### Elevation system

A three-step layered-shadow scale; height **and** spread rise together so a
"raised" surface is genuinely *higher*, not just lighter. Genuine dark drop
shadows on black — pairs with the hard `--ink-black` pixel-edge drop on pixel
tokens.

| Token | Use |
|---|---|
| `--depth-1` | Resting glass chips/tiles. |
| `--depth-2` | Raised panels, CTAs, the title crest. |
| `--depth-3` | Floating sheets / modals over a scrim. |

### Classes

| Class | What it does |
|---|---|
| `.glass-surface` | Translucent `--glass-fill` + `backdrop-filter: blur(12px) saturate()`, 1px `--glass-border`, inset top highlight. Resting glass. |
| `.glass-raised` | Stronger fill + blur, `--depth-2`. Raised glass (panels, sheets). |
| `.sheen` / `.sheen-strong` | A `::before` diagonal gloss sweep (`pointer-events:none`). Strong variant for CTAs/heroes. Host needs `position` + `overflow:hidden`; content sits at `z-index:2`. |
| `.glow-edge` | Outer accent glow ring driven by `--glow`. Callers set the colour: `style={{ '--glow': 'var(--glow-legendary)' }}`. |
| `.depth-1` / `.depth-2` / `.depth-3` | Elevation utilities mapping to the tokens. |
| `.kc-app-bg` | The glassy black-and-gold app background (a faint gold sheen near the top — foil catching light — a whisper of turf glow, and a dark edge vignette deepening to true black over `--felt`). Use in place of `background: var(--felt)` on a phase root. |

The `.phase-*` shells were re-grounded to read as glassy black-and-gold (a
phase-accent top sheen + a dark edge vignette over `--felt`), without fighting
pixel content; `.phase-reveal` (the pack-opening hero moment) leans hardest
into the gold vignette since it's where the foil payoff lands. `.pixel-edge`,
`.pitch-stripes`, `.pixelated` are unchanged — that is the pixel layer.

### Backdrop-filter fallback (binding)

Every glass class includes `-webkit-backdrop-filter` and an
`@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
block that swaps the translucent fill for the opaque `--glass-fallback*` colour,
so where blur is unsupported the surface is solid (never see-through onto raw
background). The highlight and border are retained so the look survives.

### Performance

`backdrop-filter` blur is GPU-accelerated but **not free**. Keep blur radii
**modest (8–16px)** and avoid stacking many large blurred layers in one view —
prefer a few glass panels over a glass-on-glass-on-glass pileup.

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
(full) corners, a flat near-black gradient fill
(`--surface-raised → --surface → --felt`), and the signature stacked pixel drop
shadow. An **accent rail** runs across the top and bottom of every card — this
colour is the card's identity:

- **PLAYER** → rarity colour (`Common` grey, `Rare` kit-blue, `Epic` purple,
  `Legendary` gold).
- **MANAGER** → `--kit-red`.
- **TACTIC** → category colour (`attacking` kit-red, `defensive` kit-blue,
  `specialist` gold).

`selected` adds an accent inset ring; `dimmed` drops opacity to ~0.42 for
ineligible picks. Ratings sit directly on the card's dark surface fill, so
they read in `--cream` (bright ivory) — `--line-white` is reserved for a
rating that sits on a saturated/dark badge fill instead (contrast law).

### The three variants

All three share the frame but carry a variant-specific **pixel-art sprite**
(flat CSS/SVG blocks, `shapeRendering: crispEdges`, no image assets) and body.

- **PLAYER** — the sprite is a SMALL CORNER BADGE (top-left), not a centre-stage
  hero: a pixel kit-and-head portrait in a hard-bordered tile, sized to leave
  the header room to breathe even at the tightest grid width. Beside it, the
  nation (flag + code) in a genuinely shrinkable column (`minWidth: 0` +
  `overflow: hidden` down to the glyph) so it clips before it can ever overlap
  the rating; top-right, the big rating (`flexShrink: 0`) with a quiet OVR
  caption at `full` only — durability lives in the expanded view (CardModal,
  a tappable row directly below FITNESS, with a mechanics-grounded explainer;
  ROLE gets the same tap-to-open treatment). Below the header, an ATTRIBUTES
  row of "can operate" position
  chips (own slot filled, alternates outlined — `grid` caps at 3 for a
  guaranteed single line, `full` shows every eligible slot). Then the nameplate
  (surname + role), the fitness meter, and the defining-trait pill rail — the
  same data stack CardModal's detail panel expands on, now legible on the card
  face itself instead of hidden behind a tap.
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
