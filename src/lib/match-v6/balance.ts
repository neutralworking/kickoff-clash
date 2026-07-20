/**
 * Kickoff Clash V6 — balance / config.
 *
 * ONE exported object so the whole prototype can be tuned without touching
 * engine code (handoff §3). Superset of the handoff's `V6_BALANCE`, with the
 * spec-decision additions called out (`docs/KC_V6_SPEC_DECISIONS.md`):
 *   • outOfPositionPenalty (A3) — a card played outside its natural sector
 *     loses this many ATT/DEF, mirroring the live game's wrong-flank −2/−2.
 *   • actionChanceCapBonus — "action-created chances may exceed the natural
 *     cap by one" (handoff §"ATT/DEF chance resolution").
 * Conversion is d6-only (A2): the only scoring lever is dice count × scoring
 * faces × rerolls. There is no guaranteed-goal path.
 */

import type { Die } from './types';

export const V6_BALANCE = {
  periods: 4,
  /** Shared energy at breaks 1, 2 (half-time), 3. Does not carry over. */
  energyByBreak: [3, 5, 7],
  /** Every this-many ATT makes a chance; every this-many opposing DEF cancels one. */
  threshold: 5,
  /** Soft cap on NATURAL chance dice per sector per period. */
  naturalChanceCapPerSector: 4,
  /** Action-created chances may push a sector this far past the natural cap. */
  actionChanceCapBonus: 1,
  /** Default scoring faces for a d6 chance — only a 6 by default. */
  naturalGoalFaces: [6] as Die[],
  benchSize: 7,
  startingXI: 11,
  /** Spec A3 — flat penalty for a card in a non-natural sector. Tunable. */
  outOfPositionPenalty: { attack: 2, defence: 2 },
  /** Defensive cap on the reaction chain depth (spec B6; primary guard is the instance-id set). */
  maxEventDepth: 4,
} as const;

export type V6Balance = typeof V6_BALANCE;

/**
 * Printed-stat budget guide by cost (handoff §"Printed stat budget"). A guide
 * for fixture generation, NOT an engine validation rule.
 */
export const STAT_BUDGET_BY_COST: Readonly<Record<number, number>> = {
  1: 3,
  2: 5,
  3: 7,
  4: 9,
  5: 11,
  6: 13,
};

/** Player-facing labels for each trigger prefix (handoff §"Action timing prefixes"). */
export const TRIGGER_LABELS: Readonly<Record<string, string>> = {
  game_start: 'Game Start',
  on_reveal: 'On Reveal',
  ongoing: 'Ongoing',
  when_subbed_off: 'When Subbed Off',
  when_subbed_on: 'When Subbed On',
  on_bench: 'On Bench',
};
