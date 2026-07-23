import type { MatchReceiptEvent, PeriodNumber, TeamSide, V7MatchState } from '../../lib/match-v7/types';
import { receiptEvent } from '../runtime/receipt';
import { expireLedger, type PeriodBoundary } from '../actions/expiry';
import type { LedgerEffect } from '../actions/effects';
import { computePriority } from './priority';
import { effectivePlayers, splitByZone, type CardRegistry } from './stats';
import { FINAL_PERIOD } from './period';

// End-of-period boundary processing. Expire the period-scoped effects (match
// effects survive), recompute priority for the next break from the settled
// board (V6 spec B5), and report whether the match is over. It does not advance
// the period counter — the break resolver does that as it rolls into the next
// period; the final period simply has no break after it. Guarding against
// resolving beyond the final period lives in `resolvePeriod` + the match loop.

export interface BoundaryResult {
  state: V7MatchState;
  ledger: LedgerEffect[];
  expired: LedgerEffect[];
  priority: TeamSide;
  matchOver: boolean;
  receipts: MatchReceiptEvent[];
}

export function processBoundary(
  state: V7MatchState,
  ledger: readonly LedgerEffect[],
  registry: CardRegistry,
  finalPeriod: PeriodNumber = FINAL_PERIOD,
): BoundaryResult {
  const period = state.period;
  const boundary: PeriodBoundary = { type: 'period_end', period };
  const { survivors, expired } = expireLedger(ledger, boundary);

  const playerActive = splitByZone(effectivePlayers(state.player, registry, survivors)).active;
  const opponentActive = splitByZone(effectivePlayers(state.opponent, registry, survivors)).active;
  const priority = computePriority(playerActive, opponentActive, state.priority);

  const matchOver = period >= finalPeriod;

  const receipts: MatchReceiptEvent[] = [];
  for (const effect of expired) {
    receipts.push(
      receiptEvent({
        id: `rcpt:expired:${period}:${effect.id}`,
        period,
        phase: 'period_boundary',
        eventType: 'effect_expired',
        message: `${effect.actionName} effect expired at the end of period ${period}.`,
        side: effect.side,
        sourceId: effect.sourceCardId,
        actionName: effect.actionName,
        data: { effectId: effect.id },
      }),
    );
  }
  receipts.push(
    receiptEvent({
      id: `rcpt:period_end:${period}`,
      period,
      phase: 'period_boundary',
      eventType: 'period_end',
      message: matchOver ? `Full time after period ${period}.` : `End of period ${period}.`,
      data: { matchOver, playerScore: state.player.score, opponentScore: state.opponent.score },
    }),
  );
  if (!matchOver) {
    receipts.push(
      receiptEvent({
        id: `rcpt:priority:${period}`,
        period,
        phase: 'period_boundary',
        eventType: 'priority_set',
        message: `${priority} has priority for the next break.`,
        side: priority,
        data: { priority, previousPriority: state.priority },
      }),
    );
  }

  const nextState: V7MatchState = {
    ...state,
    priority,
    previousPriority: state.priority,
    receipt: [...state.receipt, ...receipts],
  };

  return { state: nextState, ledger: survivors, expired, priority, matchOver, receipts };
}
