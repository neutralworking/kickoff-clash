/**
 * The funnel model (docs/FUNNEL_MODEL_V1.md): possession yields chances, chances
 * yield goals; pressing kills possession, destruction kills chances, defence
 * prevents goals. Every card feeds exactly ONE lane — its skillset decides which —
 * except Commander tech cards, whose power spreads across all six as leadership.
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

/** Commander cards return this instead of a lane: their power spreads across all six. */
export type LaneAssignment = FunnelLane | 'leadership';

/** Skillset → lane (FUNNEL_MODEL_V1 table). Opponent XIs use the same skillset names. */
export const LANE_OF_SKILLSET: Record<string, LaneAssignment> = {
  Passer: 'possession',
  Controller: 'possession',
  Engine: 'possession',
  Creator: 'creation',
  Dribbler: 'creation',
  Striker: 'finishing',
  Target: 'finishing',
  Sprinter: 'pressing',
  Destroyer: 'destruction',
  Powerhouse: 'destruction',
  Cover: 'defence',
  Shotstopper: 'defence',
  Commander: 'leadership',
};

/** Position fallback for cards whose archetype misses the table (e.g. the opponent
 *  generator's bare 'GK'). Keeps every XI resolvable through the same funnel. */
const LANE_OF_POSITION: Record<string, FunnelLane> = {
  GK: 'defence',
  CD: 'defence',
  WD: 'destruction',
  DM: 'destruction',
  CM: 'possession',
  WM: 'creation',
  AM: 'creation',
  WF: 'creation',
  CF: 'finishing',
};

export function laneOfCard(card: Pick<Card, 'archetype' | 'position'>): LaneAssignment {
  return LANE_OF_SKILLSET[card.archetype] ?? LANE_OF_POSITION[card.position] ?? 'possession';
}

/** Weight of a Commander's power in EACH of the six lanes. Six lanes at 0.18 sums to
 *  1.08× a specialist's single-lane contribution — the leadership premium. */
export const LEAD_SPREAD = 0.18;

/** Lane × band fit: full power in the lane's home band, less out of band. The
 *  formation decides how many slots each band offers — that's the squad puzzle. */
export const LANE_BAND: Record<FunnelLane, { ATT: number; MID: number; DEF: number }> = {
  possession:  { ATT: 0.5,  MID: 1.0,  DEF: 0.7 },
  creation:    { ATT: 1.0,  MID: 1.0,  DEF: 0.25 },
  finishing:   { ATT: 1.0,  MID: 0.5,  DEF: 0.1 },
  pressing:    { ATT: 1.0,  MID: 0.85, DEF: 0.3 },
  destruction: { ATT: 0.3,  MID: 1.0,  DEF: 0.9 },
  defence:     { ATT: 0.1,  MID: 0.6,  DEF: 1.0 },
};

/** Display copy — factual one-liners, read by the card surfaces and tooltips. */
export const LANE_COPY: Record<LaneAssignment, { label: string; blurb: string }> = {
  possession:  { label: 'Possession',  blurb: 'Keeps the ball. More possession means more chances.' },
  creation:    { label: 'Creation',    blurb: 'Turns possession into chances.' },
  finishing:   { label: 'Finishing',   blurb: 'Turns chances into goals.' },
  pressing:    { label: 'Pressing',    blurb: 'Wins the ball back — cuts the opponent’s possession.' },
  destruction: { label: 'Destruction', blurb: 'Breaks up play — cuts the opponent’s chances.' },
  defence:     { label: 'Defence',     blurb: 'Stops chances becoming goals.' },
  leadership:  { label: 'Leadership',  blurb: 'Lifts every part of the team a little.' },
};
