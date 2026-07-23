import type { BreakIndex, PeriodNumber } from '../../lib/match-v7/types';
import type { LedgerEffect } from './effects';

// Temporary effects leave the ledger at a period/break boundary. Expiry is a
// pure function of the effect's lifetime and the boundary being crossed, so a
// replay with the same sequence of boundaries removes exactly the same records.

export type PeriodBoundary =
  | { type: 'break_end'; period: PeriodNumber; breakIndex: BreakIndex }
  | { type: 'period_end'; period: PeriodNumber }
  | { type: 'match_end' };

/** Does an effect survive the given boundary? */
export function effectSurvives(effect: LedgerEffect, boundary: PeriodBoundary): boolean {
  const life = effect.lifetime;

  if (boundary.type === 'match_end') {
    // The final whistle clears everything.
    return false;
  }

  if (boundary.type === 'break_end') {
    switch (life.kind) {
      case 'immediate':
        return false;
      case 'break':
        return !(life.period === boundary.period && life.breakIndex === boundary.breakIndex);
      default:
        // period / while_active / until_used / match all outlive a break.
        return true;
    }
  }

  // period_end
  switch (life.kind) {
    case 'immediate':
      return false;
    case 'break':
      // A break sits before the following period, so its window is over.
      return life.period > boundary.period;
    case 'period':
      return life.untilPeriod > boundary.period;
    default:
      // while_active / until_used / match survive a period end.
      return true;
  }
}

/** Partition a ledger into survivors and the records that expired at a boundary. */
export function expireLedger(
  ledger: readonly LedgerEffect[],
  boundary: PeriodBoundary,
): { survivors: LedgerEffect[]; expired: LedgerEffect[] } {
  const survivors: LedgerEffect[] = [];
  const expired: LedgerEffect[] = [];
  for (const effect of ledger) {
    (effectSurvives(effect, boundary) ? survivors : expired).push(effect);
  }
  return { survivors, expired };
}
