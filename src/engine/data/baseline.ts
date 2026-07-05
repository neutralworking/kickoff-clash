/**
 * KC rebuild engine — v1 baseline numbers (SYNERGY_MODEL_V1 §6, ⚗️ layer).
 *
 * ALL balance numbers live here, not in logic (KC_REBUILD_PLAN_V1 › data over
 * code). `scripts/balance_sim.py` mirrors these constants — change them in
 * BOTH places or the distribution acceptance tests will fail, by design.
 */

import type { Posture, WindowKind, ClockBand } from '../contexts';

/** Step-resolved shape: 6 batches × 3 increments = 18 resolution events (⚗️ 9 was too swingy). */
export const BATCHES = 6;
export const INCREMENTS_PER_BATCH = 3;

/** Energy budget per match (SM §6, v1). Spent by tactical plays; surplus → cash. */
export const ENERGY_BUDGET = 5;

/** Substitutions per match; a sub restores a little squad fitness (fresh legs). */
export const SUBS_BUDGET = 3;
export const FITNESS_RESTORE_PER_SUB = 1;

/** Window resolution: charge + d(die) ≥ threshold → converted. */
export const WINDOW_THRESHOLD = 6;

/** Die ladder; variance verbs step the index (SM §6 — d4 default, d4→d8 has real teeth). */
export const DIE_LADDER = [2, 4, 8, 12] as const;
export const DEFAULT_DIE_INDEX = 1; // d4

/** Each goal banks streak-mult × goal-value points ("Counter ×3 — 6 pts" ⇒ value 2). */
export const GOAL_VALUE = 2;

/** Clock bands over batches (SM §2 states): 1–2 early, 3–4 mid, 5–6 late. */
export function clockBand(batch: number): ClockBand {
  if (batch <= 2) return 'early';
  if (batch <= 4) return 'mid';
  return 'late';
}

/** Early-whistle surplus → cash hook (economy converts downstream; SM §6). */
export const SURPLUS_CASH_PER_BATCH = 100;
export const SURPLUS_CASH_PER_ENERGY = 50;

/**
 * Posture matchup matrix (SM §3): per-increment window-generation probability
 * for the side holding `own` posture against `opp`. The matrix IS the opponent
 * system — deep-block vs possession elevates MY transition rate and THEIR
 * set-piece rate, exactly the SM example.
 */
export const MATCHUP_MATRIX: Record<Posture, Record<Posture, Record<WindowKind, number>>> = {
  'deep-block': {
    possession: { transition: 0.34, 'set-piece': 0.08 },
    'deep-block': { transition: 0.12, 'set-piece': 0.1 },
  },
  possession: {
    'deep-block': { transition: 0.1, 'set-piece': 0.22 },
    possession: { transition: 0.16, 'set-piece': 0.12 },
  },
};
