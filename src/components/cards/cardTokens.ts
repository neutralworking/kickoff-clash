/**
 * Kickoff Clash — Card system shared tokens.
 *
 * Single source of truth for the reusable GameCard / CardModal family. Every
 * screen that renders a card (PackReveal, TeamSelect, Match) imports these maps
 * so the look stays one family. Colours map onto DESIGN.md tokens; raw hexes
 * here are the position/rarity ring palette already used across the app —
 * centralised so we change them once.
 */

import type { Card } from '../../lib/scoring';
import { pickDefiningTraits, SIGNATURE_OVERRIDES } from '../../lib/defining-traits';
import { traitCopy, type TraitCopy } from '../../lib/trait-copy';

export const PIXEL = 'var(--font-pixel, monospace)';

// Rarity rings the card; ratings stay --line-white for legibility (contrast law).
// HARD CONSTRAINT: this is a flat Record<string,string> consumed across the app
// as RARITY_COLOR[x] → string. Do NOT change its shape. The glass/sheen/glow
// companions below are ADDITIVE.
export const RARITY_COLOR: Record<string, string> = {
  Common: '#9aa0a8',
  Rare: '#3d7bd6',
  Epic: '#a855f7',
  Legendary: '#e8a23a',
};

// -- Glass-frame companions (additive; do not consume in place of RARITY_COLOR) --

/**
 * Per-rarity glass treatment for the GameCard frame. Common is matte/quiet;
 * higher tiers escalate the sheen strength and (Epic/Legendary) add a glow halo.
 * `glow` references the canonical `--glow-*` tokens from globals.css; `null`
 * means no glow ring (matte). `sheen` keys the diagonal gloss strength.
 */
export interface RarityGlass {
  /** A 3-value rim-light ramp [shadow, base, highlight] used on the inner frame edges. */
  ramp: [string, string, string];
  /** The `.glow-edge` colour token, or null for no glow (Common/Rare). */
  glow: string | null;
  /** Diagonal sheen opacity multiplier applied to the frame sweep. 0 = none. */
  sheen: number;
  /** Whether this tier earns the animated foil sheen (Legendary only). */
  foil: boolean;
}

export const RARITY_GLASS: Record<string, RarityGlass> = {
  Common: { ramp: ['#5e646c', '#9aa0a8', '#c4c9cf'], glow: null, sheen: 0, foil: false },
  Rare: { ramp: ['#1f4f93', '#3d7bd6', '#7fb0ee'], glow: null, sheen: 0.5, foil: false },
  Epic: { ramp: ['#6d2fb0', '#a855f7', '#d3a8ff'], glow: 'var(--glow-epic)', sheen: 0.85, foil: false },
  Legendary: { ramp: ['#a9711a', '#e8a23a', '#ffd97a'], glow: 'var(--glow-legendary)', sheen: 1, foil: true },
};

/** Quick lookup: the outer glow token for a rarity (null = no glow ring). */
export const RARITY_GLOW: Record<string, string | null> = {
  Common: null,
  Rare: null,
  Epic: 'var(--glow-epic)',
  Legendary: 'var(--glow-legendary)',
};

/** Quick lookup: the diagonal-sheen strength (0–1) for a rarity. */
export const RARITY_SHEEN: Record<string, number> = {
  Common: 0,
  Rare: 0.5,
  Epic: 0.85,
  Legendary: 1,
};

// ---------------------------------------------------------------------------
// Defining-trait pill palette (CARDS_V1 §4). A card carries N defining traits
// (N = rarity), each with a `kind` from trait-copy.ts. This is the single source
// of truth for how a kind reads on a pill: an accent colour the pill borders +
// tints in, so a `cross` always looks like a cross, an `aura` like an aura, etc.
// Two attacking-threat kinds (cross/shot/setpiece/poach) skew warm; the denials
// (tackle/offside) skew cool; the persistent lifts (aura/engine) skew gold. The
// `bg` is a low-alpha wash of `color` so the pill stays quiet behind the label.
// ---------------------------------------------------------------------------
export interface TraitPillStyle {
  /** Pill border + glyph colour. */
  color: string;
  /** Low-alpha fill behind the pill (a wash of `color`). */
  bg: string;
}

export const TRAIT_KIND_STYLE: Record<string, TraitPillStyle> = {
  cross: { color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' }, // whipped delivery — warm amber
  shot: { color: '#e23b35', bg: 'rgba(226,59,53,0.14)' }, // long strike — kit red
  setpiece: { color: '#f5c542', bg: 'rgba(245,197,66,0.13)' }, // dead-ball — gold
  poach: { color: '#ff7a1f', bg: 'rgba(255,122,31,0.15)' }, // six-yard pounce — hot amber
  tackle: { color: '#3d7bd6', bg: 'rgba(61,123,214,0.16)' }, // big tackle — kit blue
  offside: { color: '#7fb0ee', bg: 'rgba(127,176,238,0.14)' }, // sprung trap — pale blue
  aura: { color: '#a855f7', bg: 'rgba(168,85,247,0.15)' }, // leadership lift — epic purple
  engine: { color: '#34c46a', bg: 'rgba(52,196,106,0.14)' }, // late surge — engine green
};

/** Pill style for a trait kind, with a neutral cream fallback for unknowns. */
export function traitPillStyle(kind: string): TraitPillStyle {
  return TRAIT_KIND_STYLE[kind] ?? { color: 'var(--cream-soft)', bg: 'rgba(195,210,192,0.12)' };
}

/**
 * A resolved defining trait, ready to render: the mechanical record's name carries
 * across (for keys), plus the player-facing copy and the kind's pill style. The
 * resolution is deterministic — a bespoke signature loadout if the card has one,
 * else the seeded pick (N = rarity). Both come from the read-only trait layer.
 */
export interface ResolvedTrait {
  /** Stable key for React lists (the trait's mechanical name). */
  name: string;
  copy: TraitCopy;
  style: TraitPillStyle;
  /** True for a hand-authored signature/legend trait — these sort first. */
  signature: boolean;
}

/**
 * A compact, ALL-CAPS label for the dense `grid` trait rail. The full label
 * ("Engine Room", "Poacher's Instinct", "Offside Trap") would mush at gallery
 * width, so we collapse multi-word names to their identifying word and clip a
 * long single word. The pixel font (Silkscreen) renders A–Z reliably, so a TEXT
 * label is legible where the obscure glyph-only chip was not — this is the fix
 * for "cards don't show their traits": the player reads a WORD, not a tofu box.
 */
const SHORT_TRAIT_LABEL: Record<string, string> = {
  Postman: 'POSTMAN',
  Sniper: 'SNIPER',
  Deadeye: 'DEADEYE',
  Leadership: 'LEADER',
  Stopper: 'STOPPER',
  'Offside Trap': 'OFFSIDE',
  "Poacher's Instinct": 'POACHER',
  'Engine Room': 'ENGINE',
  'Right Flank': 'FLANK',
  'Box Presence': 'BOX',
  'Big Game': 'BIG GAME',
  Organiser: 'ORGANISE',
};

/** Short uppercase rail label for a defining trait (compact `grid` card). */
export function shortTraitLabel(name: string, fallbackLabel: string): string {
  if (SHORT_TRAIT_LABEL[name]) return SHORT_TRAIT_LABEL[name];
  const first = fallbackLabel.split(/[\s'’-]/)[0].toUpperCase();
  return first.slice(0, 8);
}

/**
 * The card's DEFINING traits, resolved for display. Signature-override cards keep
 * their bespoke loadout (rarity count intentionally overridden) and their traits
 * are surfaced first as the marquee identity; everyone else gets the seeded pick.
 * Pure render selection — the magnitudes/order come straight from the trait layer.
 */
export function definingTraitsFor(card: Card): ResolvedTrait[] {
  const override = SIGNATURE_OVERRIDES[card.id];
  const records = override ?? pickDefiningTraits(card);
  const isSignature = override != null;
  return records.map((r) => {
    const copy = traitCopy(r.name);
    return { name: r.name, copy, style: traitPillStyle(copy.kind), signature: isSignature };
  });
}

// Position family → accent colour, shared by every card surface.
export const POSITION_COLOR: Record<string, string> = {
  GK: '#e8621a',
  CD: '#3d7bd6',
  WD: '#3d7bd6',
  DM: '#22c55e',
  CM: '#22c55e',
  WM: '#22c55e',
  AM: '#a855f7',
  WF: '#f59e0b',
  CF: '#e23b35',
};

// Long-form position labels for the expanded card.
export const POSITION_LABEL: Record<string, string> = {
  GK: 'Goalkeeper',
  CD: 'Centre-Back',
  WD: 'Full-Back',
  DM: 'Defensive Mid',
  CM: 'Central Mid',
  WM: 'Wide Mid',
  AM: 'Attacking Mid',
  WF: 'Winger',
  CF: 'Forward',
};

// ---------------------------------------------------------------------------
// Per-role player SPRITE scheme (Tier-A #2). Distinct-per-role identity from a
// BOUNDED asset count: one of 7 body silhouettes (drawn once, top-left lit) is
// selected by role, tinted by POSITION_COLOR[position], and stamped with a tiny
// per-role emblem prop. So: sprite = BODY[roleToBody(role)] + EMBLEM[role].
//
// The 7 bodies cover every tacticalRole in role-transforms.ts AND every `role`
// string in kc_cards.json (23 live roles). New/unknown roles fall back by the
// card's pitch position (`positionToBody`), so nothing ever renders bodyless.
// ---------------------------------------------------------------------------

export type BodyKind =
  | 'keeper'      // GK — gloves + big frame, must survive grid size
  | 'centreback'  // sweeper/stopper CB — tall, square-shouldered, arms crossed
  | 'fullback'    // full-back / wing-back — leaner, one arm out (overlap)
  | 'holding'     // holding / box-to-box mid — balanced, planted stance
  | 'playmaker'   // playmaker / creator / #10 — poised, chest open, ball at feet
  | 'winger'      // wide attacker — dynamic, leaning forward (running)
  | 'striker';    // striker / target — front-on, arms wide, coiled

// role → body silhouette. Covers ROLE_TRANSFORMS keys, their aliases, and the
// authentic kc_cards.json role names. Order groups by family for readability.
export const ROLE_TO_BODY: Record<string, BodyKind> = {
  // --- Keepers ---
  Distributor: 'keeper',
  Torwart: 'keeper',
  'Sweeper Keeper': 'keeper',
  'Ball-Playing GK': 'keeper',
  // --- Centre-backs ---
  Sweeper: 'centreback',
  Stopper: 'centreback',
  Colossus: 'centreback',
  Centrale: 'centreback',
  Zagueiro: 'centreback',
  Libero: 'centreback',
  'Auxiliary CB': 'centreback',
  // --- Full-backs / wide defenders ---
  Fullback: 'fullback',
  'Wing-back': 'fullback',
  Lateral: 'fullback',
  Fluidificante: 'fullback',
  Tornante: 'fullback',
  // --- Holding / box-to-box mids ---
  Anchor: 'holding',
  Regista: 'holding',
  Metodista: 'holding',
  Volante: 'holding',
  'Segundo Volante': 'holding',
  Pivote: 'holding',
  Tuttocampista: 'holding',
  Relayeur: 'holding',
  Mezzala: 'holding',
  // --- Playmakers / creators / #10 ---
  Playmaker: 'playmaker',
  'Wide Playmaker': 'playmaker',
  Trequartista: 'playmaker',
  Enganche: 'playmaker',
  Fantasista: 'playmaker',
  Invertido: 'playmaker',
  Inventor: 'playmaker',
  Mediapunta: 'playmaker',
  'Half-Space Creator': 'playmaker',
  // --- Wingers / wide attackers ---
  'Inverted Winger': 'winger',
  Winger: 'winger',
  Extremo: 'winger',
  // --- Strikers / targets ---
  'Prima Punta': 'striker',
  'Seconda Punta': 'striker',
  'Vertical Forward': 'striker',
  Poacher: 'striker',
  'Falso Nove': 'striker',
};

// Pitch-position → body fallback (for any role not in ROLE_TO_BODY).
const POSITION_TO_BODY: Record<string, BodyKind> = {
  GK: 'keeper',
  CD: 'centreback',
  WD: 'fullback',
  DM: 'holding',
  CM: 'holding',
  WM: 'winger',
  AM: 'playmaker',
  WF: 'winger',
  CF: 'striker',
};

/** Resolve a card's body silhouette: role first, else pitch position, else holding. */
export function roleToBody(role: string | undefined, position: string): BodyKind {
  if (role && ROLE_TO_BODY[role]) return ROLE_TO_BODY[role];
  return POSITION_TO_BODY[position] ?? 'holding';
}

/**
 * A tiny per-role emblem: 1–5 pixel rects on the 24×24 grid, stamped on the
 * sprite's chest/shoulder as a role motif. `fill` is 'accent' | 'white' | 'ink'
 * | a hex, resolved at draw time (accent = the rarity/position accent passed in).
 * Kept deliberately small (a crest-sized mark) so it reads without fighting the
 * body silhouette. Roles that share a motif family share an emblem.
 */
export interface EmblemRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: 'accent' | 'white' | 'ink' | 'shade';
}

// A handful of shared motifs, then the role→motif map. Motifs sit around the
// upper chest (y 12–17) so they never collide with the head or the shorts.
const EMBLEM_MOTIFS: Record<string, EmblemRect[]> = {
  // Diamond (playmaker vision) — a lit 2px diamond.
  diamond: [
    { x: 11, y: 13, w: 2, h: 2, fill: 'accent' },
    { x: 10, y: 14, w: 1, h: 1, fill: 'accent' },
    { x: 13, y: 14, w: 1, h: 1, fill: 'accent' },
    { x: 11, y: 13, w: 1, h: 1, fill: 'white' },
  ],
  // Arrow up (direct / vertical threat).
  arrowUp: [
    { x: 11, y: 12, w: 2, h: 4, fill: 'accent' },
    { x: 10, y: 13, w: 1, h: 1, fill: 'accent' },
    { x: 13, y: 13, w: 1, h: 1, fill: 'accent' },
    { x: 11, y: 12, w: 1, h: 1, fill: 'white' },
  ],
  // Chevron (winger cut-in).
  chevron: [
    { x: 10, y: 15, w: 1, h: 1, fill: 'accent' },
    { x: 11, y: 14, w: 1, h: 1, fill: 'accent' },
    { x: 12, y: 13, w: 1, h: 1, fill: 'white' },
    { x: 13, y: 14, w: 1, h: 1, fill: 'accent' },
    { x: 14, y: 15, w: 1, h: 1, fill: 'accent' },
  ],
  // Shield (stopper / defensive).
  shield: [
    { x: 10, y: 13, w: 4, h: 2, fill: 'accent' },
    { x: 11, y: 15, w: 2, h: 1, fill: 'accent' },
    { x: 10, y: 13, w: 4, h: 1, fill: 'white' },
    { x: 12, y: 15, w: 1, h: 1, fill: 'shade' },
  ],
  // Bar (anchor / holding — a planted crossbar).
  anchorBar: [
    { x: 10, y: 14, w: 4, h: 1, fill: 'accent' },
    { x: 11, y: 13, w: 2, h: 3, fill: 'accent' },
    { x: 11, y: 13, w: 1, h: 1, fill: 'white' },
  ],
  // Gloves (keeper).
  gloves: [
    { x: 9, y: 14, w: 2, h: 2, fill: 'white' },
    { x: 13, y: 14, w: 2, h: 2, fill: 'white' },
    { x: 9, y: 14, w: 2, h: 1, fill: 'accent' },
    { x: 13, y: 14, w: 2, h: 1, fill: 'accent' },
  ],
  // Overlap (fullback — a small forward dash).
  dash: [
    { x: 10, y: 14, w: 3, h: 1, fill: 'accent' },
    { x: 12, y: 13, w: 1, h: 1, fill: 'white' },
    { x: 12, y: 15, w: 1, h: 1, fill: 'accent' },
  ],
  // Target ring (target man / poacher — a small crosshair).
  target: [
    { x: 11, y: 13, w: 2, h: 1, fill: 'accent' },
    { x: 11, y: 15, w: 2, h: 1, fill: 'accent' },
    { x: 10, y: 14, w: 1, h: 1, fill: 'accent' },
    { x: 13, y: 14, w: 1, h: 1, fill: 'accent' },
    { x: 11, y: 14, w: 2, h: 1, fill: 'white' },
  ],
  // Spark (creator / fantasista — a 4-point twinkle).
  spark: [
    { x: 11, y: 12, w: 2, h: 1, fill: 'white' },
    { x: 11, y: 15, w: 2, h: 1, fill: 'accent' },
    { x: 10, y: 13, w: 1, h: 2, fill: 'accent' },
    { x: 13, y: 13, w: 1, h: 2, fill: 'accent' },
    { x: 11, y: 13, w: 2, h: 2, fill: 'accent' },
  ],
  // Wings (sweeper keeper / distribution keeper distinctions handled by tint).
  boot: [
    { x: 10, y: 15, w: 4, h: 1, fill: 'accent' },
    { x: 10, y: 14, w: 2, h: 1, fill: 'white' },
    { x: 13, y: 14, w: 1, h: 1, fill: 'accent' },
  ],
};

/** role → emblem motif. Falls back to the position family motif, else a plain bar. */
export const ROLE_EMBLEM: Record<string, keyof typeof EMBLEM_MOTIFS> = {
  // keepers
  Distributor: 'boot',        // starts attacks with distribution
  Torwart: 'gloves',
  'Sweeper Keeper': 'gloves',
  'Ball-Playing GK': 'boot',
  // centre-backs
  Sweeper: 'shield',
  Stopper: 'shield',
  Colossus: 'shield',
  Centrale: 'shield',
  Zagueiro: 'shield',
  Libero: 'boot',             // ball-playing libero
  'Auxiliary CB': 'shield',
  // full-backs
  Fullback: 'dash',
  'Wing-back': 'dash',
  Lateral: 'dash',
  Fluidificante: 'dash',
  Tornante: 'chevron',
  // holding / b2b
  Anchor: 'anchorBar',
  Regista: 'diamond',         // deep creator
  Metodista: 'anchorBar',
  Volante: 'anchorBar',
  'Segundo Volante': 'anchorBar',
  Pivote: 'anchorBar',
  Tuttocampista: 'arrowUp',   // box to box
  Relayeur: 'arrowUp',
  Mezzala: 'arrowUp',
  // playmakers / creators
  Playmaker: 'diamond',
  'Wide Playmaker': 'diamond',
  Trequartista: 'spark',
  Enganche: 'diamond',
  Fantasista: 'spark',
  Invertido: 'diamond',
  Inventor: 'spark',
  Mediapunta: 'diamond',
  'Half-Space Creator': 'diamond',
  // wingers
  'Inverted Winger': 'chevron',
  Winger: 'chevron',
  Extremo: 'chevron',
  // strikers
  'Prima Punta': 'target',
  'Seconda Punta': 'spark',
  'Vertical Forward': 'arrowUp',
  Poacher: 'target',
  'Falso Nove': 'diamond',
};

const POSITION_EMBLEM: Record<string, keyof typeof EMBLEM_MOTIFS> = {
  GK: 'gloves',
  CD: 'shield',
  WD: 'dash',
  DM: 'anchorBar',
  CM: 'arrowUp',
  WM: 'chevron',
  AM: 'diamond',
  WF: 'chevron',
  CF: 'target',
};

/** Resolve a role's emblem rects: role first, else position family, else a bar. */
export function roleEmblem(role: string | undefined, position: string): EmblemRect[] {
  const key = (role && ROLE_EMBLEM[role]) || POSITION_EMBLEM[position] || 'anchorBar';
  return EMBLEM_MOTIFS[key] ?? EMBLEM_MOTIFS.anchorBar;
}

// Durability → readable label + colour. Backed by scoring.ts Durability union.
export const DURABILITY_META: Record<string, { label: string; color: string }> = {
  glass: { label: 'Glass', color: '#fca5a5' },
  fragile: { label: 'Fragile', color: '#f6b765' },
  standard: { label: 'Standard', color: 'var(--cream-soft)' },
  iron: { label: 'Iron', color: '#9fc7e8' },
  titanium: { label: 'Titanium', color: '#cfe3f5' },
  phoenix: { label: 'Phoenix', color: '#f6a25a' },
};

// Tactic category → accent, matching PackReveal's existing palette.
export const TACTIC_CAT_COLOR: Record<string, string> = {
  attacking: 'var(--kit-red)',
  defensive: 'var(--kit-blue)',
  specialist: 'var(--gold)',
};

// ---------------------------------------------------------------------------
// Bespoke TACTIC icons (Tier-A #3). All 16 share the CHALKBOARD base (the family
// signature — a green board with a lit top rail + halfway line, drawn by the
// sprite), and each supplies its own chalk SCENE as a list of pixel rects. The
// scene draws inside the board's inner area (x 5–19, y 5–19 on the 24×24 grid).
// `fill` resolves at draw time: 'accent' = the category accent, 'chalk' = chalk
// white, 'ink' = the seated dark shadow, 'ball' = a bright ball dot. ≤6 colours.
// TacticSprite dispatches on tactic.id and falls back to a chevron.
// ---------------------------------------------------------------------------

export interface ChalkRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: 'accent' | 'chalk' | 'ink' | 'ball';
}

// Small helpers for readable scenes.
const dot = (x: number, y: number, fill: ChalkRect['fill'] = 'chalk'): ChalkRect => ({ x, y, w: 2, h: 2, fill });
const pip = (x: number, y: number, fill: ChalkRect['fill'] = 'chalk'): ChalkRect => ({ x, y, w: 1, h: 1, fill });

export const TACTIC_ICON: Record<string, ChalkRect[]> = {
  // high_line — a defensive line pushed HIGH + an up-arrow driving it up.
  high_line: [
    { x: 6, y: 9, w: 12, h: 1, fill: 'accent' }, // the pushed-up line
    dot(6, 8), dot(10, 8), dot(14, 8), // back line dots on it
    { x: 11, y: 11, w: 2, h: 5, fill: 'chalk' }, // arrow shaft up
    { x: 10, y: 12, w: 1, h: 1, fill: 'chalk' }, { x: 13, y: 12, w: 1, h: 1, fill: 'chalk' },
    { x: 11, y: 10, w: 2, h: 1, fill: 'accent' }, // arrow head
  ],
  // press_high — three arrows CONVERGING on a high ball.
  press_high: [
    dot(11, 6, 'ball'), // the high ball
    { x: 7, y: 11, w: 1, h: 3, fill: 'accent' }, { x: 7, y: 10, w: 2, h: 1, fill: 'chalk' }, // left arrow up-right
    { x: 11, y: 12, w: 2, h: 3, fill: 'accent' }, { x: 11, y: 11, w: 2, h: 1, fill: 'chalk' }, // centre arrow up
    { x: 16, y: 11, w: 1, h: 3, fill: 'accent' }, { x: 15, y: 10, w: 2, h: 1, fill: 'chalk' }, // right arrow up-left
  ],
  // wing_play — ball hugging the touchline + a cross arc into the middle.
  wing_play: [
    { x: 6, y: 6, w: 1, h: 11, fill: 'chalk' }, // touchline hugging left
    dot(5, 14, 'ball'), // ball wide low
    pip(8, 10, 'accent'), pip(10, 8, 'accent'), pip(13, 7, 'accent'), pip(16, 8, 'accent'), // cross arc
    dot(16, 12, 'chalk'), // target in the box
  ],
  // narrow — a tight central triangle of 3 dots.
  narrow: [
    dot(11, 7), // apex
    dot(8, 14), dot(14, 14), // base
    pip(10, 10, 'accent'), pip(13, 10, 'accent'), pip(11, 13, 'accent'), // connecting triangle lines
    pip(12, 10, 'accent'),
  ],
  // low_block — a solid brick wall across the bottom.
  low_block: [
    { x: 5, y: 14, w: 14, h: 2, fill: 'accent' },
    { x: 5, y: 16, w: 14, h: 2, fill: 'accent' },
    // mortar lines (ink) — offset courses read as bricks
    pip(9, 14, 'ink'), pip(13, 14, 'ink'), pip(17, 14, 'ink'),
    pip(7, 16, 'ink'), pip(11, 16, 'ink'), pip(15, 16, 'ink'),
    { x: 5, y: 14, w: 14, h: 1, fill: 'chalk' }, // lit top course
  ],
  // sit_deep — a deep flat block + a small counter-arrow breaking out.
  sit_deep: [
    { x: 5, y: 15, w: 14, h: 2, fill: 'accent' }, // deep block
    dot(7, 15, 'chalk'), dot(11, 15, 'chalk'), dot(15, 15, 'chalk'),
    { x: 12, y: 8, w: 1, h: 5, fill: 'chalk' }, // counter arrow shaft
    { x: 11, y: 8, w: 3, h: 1, fill: 'accent' }, { x: 12, y: 7, w: 1, h: 1, fill: 'accent' }, // arrow head up
  ],
  // fortress — a castle battlement (gold via accent = specialist? it's defensive; use chalk crenellations on accent wall).
  fortress: [
    { x: 6, y: 12, w: 12, h: 5, fill: 'accent' }, // wall body
    // crenellations on top
    { x: 6, y: 10, w: 2, h: 2, fill: 'accent' }, { x: 10, y: 10, w: 2, h: 2, fill: 'accent' }, { x: 14, y: 10, w: 2, h: 2, fill: 'accent' },
    { x: 6, y: 10, w: 12, h: 1, fill: 'chalk' }, // lit battlement top
    { x: 6, y: 16, w: 12, h: 1, fill: 'ink' }, // shadowed base
    pip(11, 13, 'ink'), pip(12, 13, 'ink'), { x: 11, y: 14, w: 2, h: 3, fill: 'ink' }, // gate
  ],
  // counter_attack — one long fast arrow box-to-box (diagonal).
  counter_attack: [
    pip(6, 16, 'chalk'), pip(8, 14, 'chalk'), pip(10, 12, 'chalk'), pip(12, 10, 'chalk'), pip(14, 8, 'chalk'), // shaft
    { x: 14, y: 7, w: 3, h: 1, fill: 'accent' }, { x: 16, y: 7, w: 1, h: 3, fill: 'accent' }, // arrow head
    dot(5, 16, 'ball'), // starting ball deep
  ],
  // possession — a ring of passing arrows (a circle of dots).
  possession: [
    dot(11, 6), dot(15, 8), dot(16, 12), dot(14, 15), dot(9, 15), dot(6, 12), dot(7, 8), // ring
    { x: 11, y: 11, w: 2, h: 2, fill: 'accent' }, // ball in the middle
    pip(11, 11, 'chalk'),
  ],
  // set_piece — a corner flag + a delivery arc to a header dot.
  set_piece: [
    { x: 6, y: 8, w: 1, h: 9, fill: 'chalk' }, // flag pole
    { x: 7, y: 8, w: 3, h: 2, fill: 'accent' }, // flag
    pip(10, 9, 'chalk'), pip(12, 7, 'chalk'), pip(14, 7, 'chalk'), pip(16, 9, 'chalk'), // delivery arc
    dot(16, 12, 'ball'), // header target
    pip(16, 11, 'accent'), // header contact
  ],
  // dark_arts — a sly mask / wink.
  dark_arts: [
    { x: 8, y: 9, w: 8, h: 3, fill: 'accent' }, // mask band
    { x: 8, y: 9, w: 8, h: 1, fill: 'chalk' }, // lit top
    pip(10, 10, 'ink'), // left eye slit
    { x: 13, y: 10, w: 2, h: 1, fill: 'ink' }, // wink (closed eye)
    { x: 9, y: 14, w: 6, h: 1, fill: 'chalk' }, // sly grin
    pip(9, 13, 'chalk'), pip(14, 13, 'chalk'),
  ],
  // youth_policy — a sapling / academy shirt + an up-chevron.
  youth_policy: [
    { x: 11, y: 11, w: 2, h: 5, fill: 'chalk' }, // stem
    { x: 8, y: 9, w: 3, h: 2, fill: 'accent' }, { x: 13, y: 9, w: 3, h: 2, fill: 'accent' }, // leaves
    { x: 10, y: 7, w: 4, h: 2, fill: 'accent' }, // top bud
    { x: 10, y: 7, w: 4, h: 1, fill: 'chalk' }, // lit bud
    pip(10, 15, 'accent'), pip(11, 14, 'accent'), pip(12, 13, 'chalk'), pip(13, 14, 'accent'), pip(14, 15, 'accent'), // up-chevron below
  ],
  // overload_left — a cluster of dots + arrows on the LEFT.
  overload_left: [
    dot(6, 8, 'accent'), dot(6, 12, 'accent'), dot(8, 10, 'accent'), dot(6, 15, 'accent'),
    { x: 9, y: 11, w: 3, h: 1, fill: 'chalk' }, { x: 11, y: 10, w: 1, h: 1, fill: 'chalk' }, { x: 11, y: 12, w: 1, h: 1, fill: 'chalk' }, // arrow pushing left→right? threat piled left
    { x: 5, y: 6, w: 1, h: 12, fill: 'ink' }, // left touchline emphasis
  ],
  // overload_right — mirror on the RIGHT.
  overload_right: [
    dot(16, 8, 'accent'), dot(16, 12, 'accent'), dot(14, 10, 'accent'), dot(16, 15, 'accent'),
    { x: 12, y: 11, w: 3, h: 1, fill: 'chalk' }, { x: 12, y: 10, w: 1, h: 1, fill: 'chalk' }, { x: 12, y: 12, w: 1, h: 1, fill: 'chalk' },
    { x: 18, y: 6, w: 1, h: 12, fill: 'ink' }, // right touchline emphasis
  ],
  // route_one — one long VERTICAL over-the-top arrow bypassing the midfield line.
  route_one: [
    { x: 6, y: 13, w: 12, h: 1, fill: 'ink' }, // the midfield line being bypassed
    pip(7, 13, 'chalk'), pip(11, 13, 'chalk'), pip(15, 13, 'chalk'),
    { x: 11, y: 7, w: 2, h: 9, fill: 'chalk' }, // long vertical shaft
    { x: 10, y: 8, w: 1, h: 1, fill: 'accent' }, { x: 13, y: 8, w: 1, h: 1, fill: 'accent' },
    { x: 11, y: 6, w: 2, h: 1, fill: 'accent' }, // arrow head at top
  ],
  // man_marking — paired dots with connecting shadow lines.
  man_marking: [
    dot(7, 8, 'accent'), dot(10, 8, 'chalk'), pip(9, 9, 'ink'), // pair 1 (marker+man)
    dot(14, 12, 'accent'), dot(11, 12, 'chalk'), pip(13, 13, 'ink'), // pair 2
    dot(8, 15, 'accent'), dot(11, 15, 'chalk'), pip(10, 16, 'ink'), // pair 3
  ],
};

/**
 * Investment ladder → Boardroom identity. One gold-family frame; each ladder is
 * distinguished by its tab label, a secondary accent, and a one-line summary of
 * what unlocking it buys. All three share the Boardroom crest (gold) on the card.
 */
export const INVESTMENT_META: Record<
  string,
  { tab: string; accent: string; kicker: string }
> = {
  stadium: { tab: 'STADIUM', accent: 'var(--gold)', kicker: 'Gate revenue' },
  academy: { tab: 'ACADEMY', accent: 'var(--success)', kicker: 'Youth intake' },
  boxoffice: { tab: 'BOX OFFICE', accent: 'var(--amber)', kicker: 'Goals → cash' },
};

// ---------------------------------------------------------------------------
// MANAGER (gaffer) identity (Tier-A #4). Every gaffer used to render the same
// suit-blob; now the sprite is a proper half-body bust differentiated by the
// gaffer's PRIMARY trait — a tie/pocket-square tint + a small prop (clipboard /
// whistle / scarf / rosette). The trait TAGS are also coloured by meaning on
// both the grid card and the modal (defensive-blue / attacking-red / etc.),
// keyed on the trait string, with a sane neutral fallback.
// ---------------------------------------------------------------------------

export type ManagerProp = 'clipboard' | 'whistle' | 'scarf' | 'rosette' | 'shield' | 'none';

export interface ManagerTraitStyle {
  /** Tag + tie/pocket-square colour. */
  color: string;
  /** Low-alpha wash behind the tag. */
  bg: string;
  /** The bust's differentiating prop (drawn once per prop). */
  prop: ManagerProp;
}

// Meaning families:
//   defensive → kit blue · attacking → kit red · possession/patient → gold ·
//   youth/chemistry/people → engine green · risk/dark → epic purple.
export const MANAGER_TRAIT_STYLE: Record<string, ManagerTraitStyle> = {
  // defensive
  'Low Block': { color: '#3d7bd6', bg: 'rgba(61,123,214,0.16)', prop: 'shield' },
  'Counter-Punch': { color: '#3d7bd6', bg: 'rgba(61,123,214,0.16)', prop: 'shield' },
  // attacking / direct
  'Direct Play': { color: '#e23b35', bg: 'rgba(226,59,53,0.16)', prop: 'clipboard' },
  'Aerial Targets': { color: '#e23b35', bg: 'rgba(226,59,53,0.16)', prop: 'clipboard' },
  // possession / patient
  Possession: { color: '#f5c542', bg: 'rgba(245,197,66,0.14)', prop: 'clipboard' },
  'Patient Build-up': { color: '#f5c542', bg: 'rgba(245,197,66,0.14)', prop: 'clipboard' },
  // people / motivation
  Motivator: { color: '#34c46a', bg: 'rgba(52,196,106,0.15)', prop: 'whistle' },
  'Leaders Thrive': { color: '#34c46a', bg: 'rgba(52,196,106,0.15)', prop: 'whistle' },
  // youth
  'Youth Project': { color: '#34c46a', bg: 'rgba(52,196,106,0.15)', prop: 'rosette' },
  'Raw Talent': { color: '#34c46a', bg: 'rgba(52,196,106,0.15)', prop: 'rosette' },
  // chemistry / squad
  'Team Cohesion': { color: '#2fc7b0', bg: 'rgba(47,199,176,0.15)', prop: 'scarf' },
  Chemistry: { color: '#2fc7b0', bg: 'rgba(47,199,176,0.15)', prop: 'scarf' },
  'Scouting Network': { color: '#2fc7b0', bg: 'rgba(47,199,176,0.15)', prop: 'clipboard' },
  'Squad Depth': { color: '#2fc7b0', bg: 'rgba(47,199,176,0.15)', prop: 'clipboard' },
  // risk / dark
  'High Risk': { color: '#a855f7', bg: 'rgba(168,85,247,0.16)', prop: 'rosette' },
  'Backs Mavericks': { color: '#a855f7', bg: 'rgba(168,85,247,0.16)', prop: 'rosette' },
};

/** Style for a manager trait tag, with a neutral kit-red-family fallback. */
export function managerTraitStyle(trait: string): ManagerTraitStyle {
  return (
    MANAGER_TRAIT_STYLE[trait] ?? {
      color: 'var(--kit-red)',
      bg: 'rgba(232,54,47,0.14)',
      prop: 'none',
    }
  );
}

/**
 * The gaffer bust's differentiating accent + prop, resolved from the PRIMARY
 * trait (traits[0]). This tints the tie + pocket-square and selects the prop, so
 * a "Low Block" gaffer (blue tie, shield) never reads the same as a "Motivator"
 * (green tie, whistle).
 */
export function managerAccent(traits: string[]): { tie: string; prop: ManagerProp } {
  const s = managerTraitStyle(traits[0] ?? '');
  return { tie: s.color, prop: s.prop };
}

/** Compact money label, e.g. 22000 → "£22k", 1500 → "£1.5k", 500 → "£500". */
export function formatCash(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    const s = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '');
    return `£${s}k`;
  }
  return `£${n}`;
}

/**
 * Nation → flag emoji. The full pool spans 60+ nations; we map the well-known
 * ones and otherwise fall back to a short nation code chip (rendered by the
 * card), which is cleaner and more pixel-consistent than a generic globe.
 */
const NATION_FLAG: Record<string, string> = {
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  Wales: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
  France: '\u{1F1EB}\u{1F1F7}',
  Sweden: '\u{1F1F8}\u{1F1EA}',
  Portugal: '\u{1F1F5}\u{1F1F9}',
  Brazil: '\u{1F1E7}\u{1F1F7}',
  Germany: '\u{1F1E9}\u{1F1EA}',
  Spain: '\u{1F1EA}\u{1F1F8}',
  Italy: '\u{1F1EE}\u{1F1F9}',
  Argentina: '\u{1F1E6}\u{1F1F7}',
  Netherlands: '\u{1F1F3}\u{1F1F1}',
  Belgium: '\u{1F1E7}\u{1F1EA}',
  Croatia: '\u{1F1ED}\u{1F1F7}',
  Denmark: '\u{1F1E9}\u{1F1F0}',
  Norway: '\u{1F1F3}\u{1F1F4}',
  Poland: '\u{1F1F5}\u{1F1F1}',
  Japan: '\u{1F1EF}\u{1F1F5}',
  'South Korea': '\u{1F1F0}\u{1F1F7}',
  USA: '\u{1F1FA}\u{1F1F8}',
  Mexico: '\u{1F1F2}\u{1F1FD}',
  Uruguay: '\u{1F1FA}\u{1F1FE}',
  Colombia: '\u{1F1E8}\u{1F1F4}',
  Chile: '\u{1F1E8}\u{1F1F1}',
  Nigeria: '\u{1F1F3}\u{1F1EC}',
  Senegal: '\u{1F1F8}\u{1F1F3}',
  Morocco: '\u{1F1F2}\u{1F1E6}',
  Egypt: '\u{1F1EA}\u{1F1EC}',
  Ghana: '\u{1F1EC}\u{1F1ED}',
  Cameroon: '\u{1F1E8}\u{1F1F2}',
  Ireland: '\u{1F1EE}\u{1F1EA}',
  Irish: '\u{1F1EE}\u{1F1EA}',
  Austria: '\u{1F1E6}\u{1F1F9}',
  Serbia: '\u{1F1F7}\u{1F1F8}',
  Turkey: '\u{1F1F9}\u{1F1F7}',
  Russia: '\u{1F1F7}\u{1F1FA}',
  Iceland: '\u{1F1EE}\u{1F1F8}',
  Finland: '\u{1F1EB}\u{1F1EE}',
  'Czech Republic': '\u{1F1E8}\u{1F1FF}',
  Slovakia: '\u{1F1F8}\u{1F1F0}',
  Bulgaria: '\u{1F1E7}\u{1F1EC}',
  Australia: '\u{1F1E6}\u{1F1FA}',
  Canada: '\u{1F1E8}\u{1F1E6}',
  Peru: '\u{1F1F5}\u{1F1EA}',
  Ecuador: '\u{1F1EA}\u{1F1E8}',
  Paraguay: '\u{1F1F5}\u{1F1FE}',
  'Ivory Coast': '\u{1F1E8}\u{1F1EE}',
  Mali: '\u{1F1F2}\u{1F1F1}',
  Algeria: '\u{1F1E9}\u{1F1FF}',
  'South Africa': '\u{1F1FF}\u{1F1E6}',
  Jamaica: '\u{1F1EF}\u{1F1F2}',
  Georgia: '\u{1F1EC}\u{1F1EA}',
  Israel: '\u{1F1EE}\u{1F1F1}',
  'New Zealand': '\u{1F1F3}\u{1F1FF}',
  Estonia: '\u{1F1EA}\u{1F1EA}',
  Latvia: '\u{1F1F1}\u{1F1FB}',
  Benin: '\u{1F1E7}\u{1F1EF}',
  'DR Congo': '\u{1F1E8}\u{1F1E9}',
  'Costa Rica': '\u{1F1E8}\u{1F1F7}',
  'Northern Ireland': '\u{1F3F4}\u{E0067}\u{E0062}\u{E006E}\u{E0069}\u{E0072}\u{E007F}',
  'Trinidad & Tobago': '\u{1F1F9}\u{1F1F9}',
  Bermuda: '\u{1F1E7}\u{1F1F2}',
};

/** Returns a flag emoji for the nation, or null if we should fall back to a code.
 *  Every nation in the live pool is a real footballing country (see transform.ts /
 *  generate-cards.ts) and is mapped here, so players show a real flag like the gaffers. */
export function nationFlag(nation?: string): string | null {
  if (!nation) return null;
  return NATION_FLAG[nation] ?? null;
}

/** Short uppercase code — only reached for a nation with no mapped flag (all live
 *  pool + gaffer nations have flags, so this is just a safety fallback). */
export function nationCode(nation?: string): string {
  if (!nation) return '';
  const first = nation.split('/')[0].trim();
  const letters = first.replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 3).toUpperCase();
}

/** Display surname (last token of the name). */
export function lastName(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1];
}

/**
 * "Where a player can operate" — the set of pitch positions whose formation slots
 * accept a card of position P. This is the inverse of run.ts's
 * SLOT_ELIGIBLE_POSITIONS, collapsed onto pitch-position labels and frozen here so
 * the card layer stays self-contained (no import of run/economy logic). Used by
 * CardModal to show eligible positions as small chips. The card's own position is
 * always first.
 */
export const ELIGIBLE_POSITIONS: Record<string, string[]> = {
  GK: ['GK'],
  CD: ['CD', 'DM', 'CM'],
  WD: ['WD', 'WM'],
  DM: ['DM', 'CM', 'CD'],
  CM: ['CM', 'DM', 'AM'],
  WM: ['WM', 'WD', 'WF'],
  AM: ['AM', 'CM', 'WF', 'CF'],
  WF: ['WF', 'WM', 'AM', 'CF'],
  CF: ['CF', 'AM', 'WF'],
};

/** Eligible operating positions for a card, own position first, de-duplicated. */
export function eligiblePositions(position: string): string[] {
  const list = ELIGIBLE_POSITIONS[position] ?? [position];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [position, ...list]) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/**
 * Fitness pip model. `fitness` is 1–6 (MATCH_ENGINE §3.1); we render it as a small
 * crisp pixel meter. Returns the filled-pip count, total, and a band colour.
 */
export function fitnessMeter(fitness: number): { filled: number; total: number; color: string } {
  const total = 6;
  const filled = Math.max(0, Math.min(total, Math.round(fitness)));
  const color =
    filled >= 5 ? 'var(--success)' : filled >= 3 ? 'var(--gold)' : filled >= 1 ? '#f6b765' : 'var(--danger)';
  return { filled, total, color };
}
