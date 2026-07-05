/**
 * KC rebuild engine — the Phase 2 calibration fixture set.
 *
 * Acceptance (KC_REBUILD_PLAN_V1 §P2): each manager beats this set at rates
 * matching `scripts/balance_sim.py --calibrate` (bit-exact mirror), with every
 * aggregate rate inside the design band and Fortress on its own tighter leash
 * (SM §4 tuning flag — accrual engines trend dominant).
 *
 * The calibration policy is fixed and shared with the sim: play the manager's
 * native formation, no tactical cards, commit every window, substitute before
 * batches 3, 4 and 5 (feeds Tinkerman; +1 fitness is marginal for the rest).
 */

import type { SideConfig } from '../match';

/** Mid-run points target (≈ fixture 5 on the SM §8 curve). */
export const CALIBRATION_TARGET = 10;

/** Substitutions made before these batches by the calibration policy. */
export const CALIBRATION_SUB_BATCHES = [3, 4, 5];

/** Seeds per (manager × opponent) cell. */
export const CALIBRATION_SEEDS = 300;

export interface CalibrationOpponent {
  id: string;
  side: SideConfig;
}

export const CALIBRATION_OPPONENTS: CalibrationOpponent[] = [
  {
    id: 'balanced-possession',
    side: {
      posture: 'possession',
      traits: [],
      baseCharge: 2,
      engine: { id: 'opp', successes: [{ on: 'any-goal' }], contradictions: [{ on: 'conceded', reason: 'conceded' }] },
      autoCommit: true,
    },
  },
  {
    id: 'stubborn-block',
    side: {
      posture: 'deep-block',
      traits: [],
      baseCharge: 2,
      engine: { id: 'opp', successes: [{ on: 'any-goal' }], contradictions: [{ on: 'conceded', reason: 'conceded' }] },
      autoCommit: true,
    },
  },
  {
    id: 'strong-possession',
    side: {
      posture: 'possession',
      traits: [],
      baseCharge: 3,
      engine: { id: 'opp', successes: [{ on: 'any-goal' }], contradictions: [{ on: 'conceded', reason: 'conceded' }] },
      autoCommit: true,
    },
  },
];

/** Design band for every manager's aggregate beat rate across the set. */
export const CALIBRATION_BAND: [number, number] = [0.15, 0.95];

/** Fortress leash: aggregate beat rate ≤ mean(other nine) + this margin. */
export const FORTRESS_LEASH_MARGIN = 0.15;
