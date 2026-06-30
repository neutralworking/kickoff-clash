/**
 * Kickoff Clash — Defining-trait PLAYER-FACING COPY (display-only, single source of truth).
 *
 * The mechanics live in `defining-traits.ts` (TraitRecord — verbs, magnitudes, conditions).
 * This module is the *words & visual category* a player reads/sees for each defining trait:
 * the on-card pill (card-designer) and the in-match firing animation (designer) BOTH read
 * from here so the fiction never drifts between the two surfaces.
 *
 * `kind` buckets a trait into a visual family — it drives BOTH the pill icon/colour AND the
 * pitch animation a firing plays (a `moment` flash vs an `aura` glow; see match-v5 TraitEvent).
 * Keyed by the trait's `name` (exact match with defining-traits.ts). Pure data, no imports.
 */

export type TraitKind =
  | 'cross'    // a whipped delivery into the box        (moment — ball arcs to the far post)
  | 'shot'     // a speculative strike from distance      (moment — long-range effort)
  | 'setpiece' // a dead-ball threat                       (moment — free-kick / corner flag)
  | 'poach'    // a six-yard-box goal threat               (moment — tap-in pounce)
  | 'tackle'   // a timed last-ditch challenge             (moment — STOP shield)
  | 'offside'  // a sprung offside trap                    (moment — linesman's flag)
  | 'aura'     // an ongoing leadership / positional lift  (aura   — persistent glow)
  | 'engine';  // a late-game surge                        (aura   — builds as the clock runs)

export interface TraitCopy {
  /** Short display label for the pill (usually the trait name itself). */
  label: string;
  /** One-line, player-facing description of the ACTION (Marvel-Snap voice — what it DOES). */
  blurb: string;
  /** Visual family — picks the pill icon/colour and the pitch animation. */
  kind: TraitKind;
  /** A single glyph for the pill / animation marker (emoji-free; renders in the pixel font). */
  glyph: string;
}

/** name → copy. Every trait authored in defining-traits.ts (incl. signature overrides). */
export const TRAIT_COPY: Record<string, TraitCopy> = {
  Postman: {
    label: 'Postman',
    blurb: "Always delivers — whips a guaranteed cross into the box when a target's up top.",
    kind: 'cross', glyph: '✦',
  },
  Sniper: {
    label: 'Sniper',
    blurb: 'Cracks a speculative long shot — a real chance from distance.',
    kind: 'shot', glyph: '➴',
  },
  Deadeye: {
    label: 'Deadeye',
    blurb: 'Dead-ball threat — manufactures a set-piece chance every spell.',
    kind: 'setpiece', glyph: '⚑',
  },
  Leadership: {
    label: 'Leadership',
    blurb: 'Marshals the back line — lifts every defender, the weakest most.',
    kind: 'aura', glyph: '◎',
  },
  Stopper: {
    label: 'Stopper',
    blurb: 'Times the big tackle — snuffs out the opposition attack.',
    kind: 'tackle', glyph: '⊘',
  },
  'Offside Trap': {
    label: 'Offside Trap',
    blurb: 'Springs the trap when the line holds — flags them offside, chance gone.',
    kind: 'offside', glyph: '⚐',
  },
  "Poacher's Instinct": {
    label: "Poacher's Instinct",
    blurb: 'Lurks in the six-yard box — a guaranteed poacher chance while attacking.',
    kind: 'poach', glyph: '◣',
  },
  'Engine Room': {
    label: 'Engine Room',
    blurb: 'Engine that never quits — grows stronger from the hour mark.',
    kind: 'engine', glyph: '⛭',
  },
  // --- signature-override traits (showcase legends) ---
  'Right Flank': {
    label: 'Right Flank',
    blurb: 'Owns the right touchline — a bigger threat from a wide berth.',
    kind: 'aura', glyph: '◎',
  },
  'Box Presence': {
    label: 'Box Presence',
    blurb: 'Commands the area — a heavyweight goal threat in the box.',
    kind: 'poach', glyph: '◣',
  },
  'Big Game': {
    label: 'Big Game',
    blurb: 'Turns up when it matters — deadlier as the clock runs down.',
    kind: 'engine', glyph: '⛭',
  },
  Organiser: {
    label: 'Organiser',
    blurb: 'Organises the unit — steadies the whole defence while it defends.',
    kind: 'aura', glyph: '◎',
  },
};

/** Safe lookup — unknown trait names fall back to a neutral aura descriptor. */
export function traitCopy(name: string): TraitCopy {
  return (
    TRAIT_COPY[name] ?? { label: name, blurb: '', kind: 'aura', glyph: '◆' }
  );
}
