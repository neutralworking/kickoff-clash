/**
 * The funnel model (docs/FUNNEL_MODEL_V1.md): possession yields chances, chances
 * yield goals; pressing kills possession, destruction kills chances, defence
 * prevents goals.
 *
 * TWO-STAT (Snap-scale) card model: every card carries ATK and DEF, integers
 * −1..20, derived deterministically from BRS + a skillset split + pillar shading
 * (`deriveStats` — computed on read so legacy saves and generated opponents get
 * stats for free). ATK feeds the card's skillset ATTACKING lane; DEF feeds the
 * counter-lane of the band it stands in (ATT→pressing, MID→destruction,
 * DEF+GK→defence): what you are decides how you attack, where you stand decides
 * how you defend. Commander tech cards spread across all six lanes as leadership.
 */

import type { Card } from './scoring';

/** The six lanes. These ARE the dispatcher's ZoneName values (verbs.ts). */
export type FunnelLane =
  | 'possession'
  | 'creation'
  | 'finishing'
  | 'pressing'
  | 'destruction'
  | 'defence';

export const FUNNEL_LANES: FunnelLane[] = [
  'possession', 'creation', 'finishing', 'pressing', 'destruction', 'defence',
];

/** The three ATTACKING lanes (where a card's ATK can land). */
export type AttackLane = 'possession' | 'creation' | 'finishing';
/** The three COUNTER lanes (where a card's DEF lands, by band). */
export type CounterLane = 'pressing' | 'destruction' | 'defence';

/** Commander cards return this instead of a lane: their stats spread across all six. */
export type LaneAssignment = AttackLane | 'leadership';

/** Skillset → ATTACKING lane: where the card's ATK lands. Defensive skillsets attack
 *  through possession (win it back, keep it simple — the GK's distribution included).
 *  Opponent XIs use the same skillset names. */
export const LANE_OF_SKILLSET: Record<string, LaneAssignment> = {
  Passer: 'possession',
  Controller: 'possession',
  Engine: 'possession',
  Destroyer: 'possession',
  Powerhouse: 'possession',
  Cover: 'possession',
  Shotstopper: 'possession',
  Creator: 'creation',
  Dribbler: 'creation',
  Sprinter: 'creation',
  Striker: 'finishing',
  Target: 'finishing',
  Commander: 'leadership',
};

/** Position fallback for cards whose archetype misses the table (e.g. the opponent
 *  generator's bare 'GK'). Keeps every XI resolvable through the same funnel. */
const LANE_OF_POSITION: Record<string, AttackLane> = {
  GK: 'possession',
  CD: 'possession',
  WD: 'possession',
  DM: 'possession',
  CM: 'possession',
  WM: 'creation',
  AM: 'creation',
  WF: 'creation',
  CF: 'finishing',
};

export function laneOfCard(card: Pick<Card, 'archetype' | 'position'>): LaneAssignment {
  return LANE_OF_SKILLSET[card.archetype] ?? LANE_OF_POSITION[card.position] ?? 'possession';
}

/** Where DEF lands: the counter-lane of the band the card stands in. Forwards press,
 *  midfielders break up play, the back line (and GK) prevents goals. */
export const DEF_LANE_OF_BAND: Record<'ATT' | 'MID' | 'DEF', CounterLane> = {
  ATT: 'pressing',
  MID: 'destruction',
  DEF: 'defence',
};

/** Weight of a Commander's stats in EACH of the six lanes. Six lanes at 0.18 sums to
 *  1.08× a specialist's single-lane contribution — the leadership premium. */
export const LEAD_SPREAD = 0.18;

/** ATK-lane × band fit: full value in the lane's home band, less out of band. The
 *  formation decides how many slots each band offers — that's the squad puzzle.
 *  (DEF needs no fit table: the band IS the assignment.) */
export const LANE_BAND: Record<AttackLane, { ATT: number; MID: number; DEF: number }> = {
  possession:  { ATT: 0.5,  MID: 1.0,  DEF: 0.85 },
  creation:    { ATT: 1.0,  MID: 1.0,  DEF: 0.25 },
  finishing:   { ATT: 1.0,  MID: 0.5,  DEF: 0.1 },
};

// ---------------------------------------------------------------------------
// The two-stat derivation (−1..20)
// ---------------------------------------------------------------------------

/** DEF's share of a skillset's identity: the budget split between the two stats. */
const DEF_SHARE: Record<string, number> = {
  Striker: 0.12,
  Target: 0.22,
  Dribbler: 0.10,
  Creator: 0.15,
  Sprinter: 0.35,
  Passer: 0.28,
  Controller: 0.35,
  Engine: 0.5,
  Commander: 0.5,
  Powerhouse: 0.68,
  Destroyer: 0.82,
  Cover: 0.9,
  Shotstopper: 0.95,
  GK: 0.95, // the opponent generator's bare keeper archetype
};

const clampStat = (v: number) => Math.max(-1, Math.min(20, v));

/**
 * BRS (52–95) → {atk, def} on the Snap scale. Specialists convert their budget into
 * one big number; generalists split it. Pillars shade each stat ±1 (technical→ATK,
 * physical→DEF), which is also how the −1 floor happens: a soft, low-rarity card with
 * a bad physical pillar defends at −1 — an actual liability while it's on the pitch.
 * Pure function of the card's own data — same result for a fresh draw, an old save,
 * or a generated opponent.
 */
export function deriveStats(
  card: Pick<Card, 'archetype' | 'position' | 'power' | 'pillars'>,
): { atk: number; def: number } {
  const share = DEF_SHARE[card.archetype]
    ?? (['GK', 'CD', 'WD', 'DM'].includes(card.position) ? 0.8 : 0.25);
  const s = Math.max(0, Math.min(1, (card.power - 50) / 45)); // BRS 52–95 → 0..1
  // Budget floor 5.75 (was 3.45): the scale saturates at power ≤50, and generated
  // cup-opener opponents sit right on that floor — at 3.45 an opener XI was nearly
  // stat-less (Σ ATK ~15). Ceiling unchanged (23 at power 95).
  const budget = (5 + 15 * s) * 1.15;                          // total stat points
  const shade = (pillar: number | undefined) =>
    pillar === undefined ? 0 : pillar >= 58 ? 1 : pillar < 46 ? -1 : 0;
  const atk = clampStat(Math.round(budget * (1 - share)) + shade(card.pillars?.technical));
  const def = clampStat(Math.round(budget * share) + shade(card.pillars?.physical));
  return { atk, def };
}

/** Fitness-scaled live stats — the numbers the match actually plays with. */
export function liveStats(
  card: Pick<Card, 'archetype' | 'position' | 'power' | 'pillars'>,
  fitnessFactor: number,
): { atk: number; def: number } {
  const { atk, def } = deriveStats(card);
  // Negative stats stay negative (a liability doesn't improve by being tired).
  return {
    atk: atk > 0 ? atk * fitnessFactor : atk,
    def: def > 0 ? def * fitnessFactor : def,
  };
}

/** Display copy — factual one-liners, read by the card surfaces and tooltips. */
export const LANE_COPY: Record<FunnelLane | 'leadership', { label: string; blurb: string }> = {
  possession:  { label: 'Possession',  blurb: 'Keeps the ball. More possession means more chances.' },
  creation:    { label: 'Creation',    blurb: 'Turns possession into chances.' },
  finishing:   { label: 'Finishing',   blurb: 'Turns chances into goals.' },
  pressing:    { label: 'Pressing',    blurb: 'Wins the ball back — cuts the opponent’s possession.' },
  destruction: { label: 'Destruction', blurb: 'Breaks up play — cuts the opponent’s chances.' },
  defence:     { label: 'Defence',     blurb: 'Stops chances becoming goals.' },
  leadership:  { label: 'Leadership',  blurb: 'Lifts every part of the team a little.' },
};
