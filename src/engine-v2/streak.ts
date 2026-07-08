/**
 * KC six-contest engine (NW-139 Fork A) — streaks with contradiction resets.
 *
 * A side's engine states, as data, what EXTENDS its streak (its successes) and
 * what CONTRADICTS it (the thing the engine exists to prevent). A reset carries
 * a REASON so the break event teaches the win condition ("Streak broken:
 * conceded"). Per-match only; never persists across matches in v1.
 *
 * Scoring couples to the streak: goal points = streak-mult × goal-value
 * (CARD_SYSTEM_V2 loop). The mult is capped so a hot run rewards without
 * running away.
 */

import type { Contest } from './contests';

export type StreakSuccess =
  | { on: 'any-goal' }
  | { on: 'contest-goal'; via: Contest } // a goal scored through that contest lane
  | { on: 'clean-batch' };

export type StreakContradiction =
  | { on: 'conceded'; reason: string }
  | { on: 'turnover-conceded'; reason: string } // opp scores off a BREAK transition
  | { on: 'batch-conceded'; reason: string };

/** A side's engine streak definition — pure data (law 4). */
export interface EngineDef {
  id: string;
  successes: StreakSuccess[];
  contradictions: StreakContradiction[];
}

/** A default engine: any goal extends, any concede resets. */
export const BALANCED_ENGINE: EngineDef = {
  id: 'balanced',
  successes: [{ on: 'any-goal' }],
  contradictions: [{ on: 'conceded', reason: 'conceded' }],
};

export function extendsOnGoal(def: EngineDef, via: Contest): boolean {
  return def.successes.some((s) => s.on === 'any-goal' || (s.on === 'contest-goal' && s.via === via));
}

export function extendsOnCleanBatch(def: EngineDef): boolean {
  return def.successes.some((s) => s.on === 'clean-batch');
}

/** Reason string if conceding (optionally via a BREAK transition) contradicts. */
export function contradictionReason(def: EngineDef, viaTransition: boolean): string | null {
  for (const c of def.contradictions) {
    if (c.on === 'conceded') return c.reason;
    if (c.on === 'turnover-conceded' && viaTransition) return c.reason;
  }
  return null;
}

/** Streak → scoring multiplier: 1 + 0.5·streak, capped at 3× (CARD_SYSTEM_V2 loop). */
export function streakMult(streak: number): number {
  return Math.min(3, 1 + 0.5 * streak);
}
