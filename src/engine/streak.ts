/**
 * KC rebuild engine — streaks with per-engine contradiction resets (SM §6).
 *
 * An EngineDef states, as data, what extends a side's streak (its engine
 * successes) and what contradicts it (the thing the engine exists to prevent).
 * Resets carry a REASON — the streak-break event must teach the win condition
 * ("Streak broken: conceded"). No point subtraction on concede (⚗️ A/B'd:
 * reset-only, equal bite). Per-match only; never persists across matches in v1.
 */

import type { WindowKind } from './contexts';

export type StreakSuccess =
  | { on: 'window-goal'; window: WindowKind } // a goal scored via that window kind
  | { on: 'any-goal' }
  | { on: 'clean-batch' }                     // a batch ending goal-free against you
  | { on: 'substitution' };                   // an own substitution (Tinkerman fuel)

export type StreakContradiction =
  | { on: 'conceded'; reason: string }
  | { on: 'turnover-conceded'; reason: string } // opp converts a transition against you
  | { on: 'batch-conceded'; reason: string };   // any batch in which you conceded

/** A manager engine's streak definition — pure data (law 4). */
export interface EngineDef {
  id: string;
  successes: StreakSuccess[];
  contradictions: StreakContradiction[];
}

/** Does a goal scored by this side via `window` extend its streak? */
export function extendsOnGoal(def: EngineDef, window: WindowKind): boolean {
  return def.successes.some(
    (s) => s.on === 'any-goal' || (s.on === 'window-goal' && s.window === window)
  );
}

export function extendsOnCleanBatch(def: EngineDef): boolean {
  return def.successes.some((s) => s.on === 'clean-batch');
}

export function extendsOnSubstitution(def: EngineDef): boolean {
  return def.successes.some((s) => s.on === 'substitution');
}

/** The reason string if conceding via `window` contradicts this engine, else null. */
export function contradictionOnConcede(def: EngineDef, window: WindowKind): string | null {
  for (const c of def.contradictions) {
    if (c.on === 'conceded') return c.reason;
    if (c.on === 'turnover-conceded' && window === 'transition') return c.reason;
  }
  return null;
}

export function contradictionOnBatchConceded(def: EngineDef): string | null {
  const c = def.contradictions.find((x) => x.on === 'batch-conceded');
  return c ? c.reason : null;
}
