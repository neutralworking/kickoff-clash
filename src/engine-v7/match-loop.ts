import {
  BREAK_ENERGY,
  type BreakIndex,
  type BreakPlan,
  type MatchReceiptEvent,
  type PeriodNumber,
  type TeamSide,
  type V7MatchState,
} from '../lib/match-v7/types';
import { createRng } from './core/rng';
import type { LedgerEffect } from './actions/effects';
import { resolveBreak, type RandomPass } from './resolve/break';
import { resolvePeriod, FINAL_PERIOD, type PeriodSnapshot } from './resolve/period';
import { processBoundary } from './resolve/boundary';
import { createChances } from './resolve/chances';
import { effectivePlayers, splitByZone, type CardRegistry } from './resolve/stats';
import type { RerollPolicy } from './resolve/rerolls';

// The match loop — a pure orchestration layer over the break resolver and period
// resolver. It plays period 1, then repeats { resolve the following break →
// resolve the next period → process the boundary } until the final period ends.
// Every step returns new immutable state, an appended effect ledger and ordered
// receipts, so the whole match replays byte-for-byte from a seed + the supplied
// break plans. It never advances past the final period and never resolves a
// period twice.

export interface MatchLoopInput {
  state: V7MatchState;
  ledger?: readonly LedgerEffect[];
  registry: CardRegistry;
  /** Locked break plans keyed by break index (1..3). Missing breaks are no-ops. */
  breakPlans?: Partial<Record<BreakIndex, Record<TeamSide, BreakPlan>>>;
  policy?: RerollPolicy;
  randomPass?: RandomPass;
}

export interface MatchLoopResult {
  state: V7MatchState;
  ledger: LedgerEffect[];
  snapshots: PeriodSnapshot[];
  receipts: MatchReceiptEvent[];
  finalScore: Record<TeamSide, number>;
  matchOver: boolean;
}

function emptyPlan(side: TeamSide, breakIndex: BreakIndex): BreakPlan {
  const energy = BREAK_ENERGY[breakIndex];
  return {
    side,
    breakIndex,
    outgoingCardIds: [],
    incomingAssignments: [],
    finalSlotAssignments: {},
    activations: [],
    submittedBudget: {
      breakIndex,
      baseEnergy: energy,
      guaranteedModifiers: [],
      availableEnergy: energy,
      incomingCosts: [],
      netIncomingCost: 0,
      legalAtSubmission: true,
    },
    scannerRevealState: 'none',
    locked: true,
  };
}

/** Create both sides' chances for a period from the current board + ledger. */
export function boardChances(
  state: V7MatchState,
  ledger: readonly LedgerEffect[],
  registry: CardRegistry,
  period: PeriodNumber,
): Record<TeamSide, ReturnType<typeof createChances>['tokens']> {
  const playerActive = splitByZone(effectivePlayers(state.player, registry, ledger)).active;
  const opponentActive = splitByZone(effectivePlayers(state.opponent, registry, ledger)).active;
  return {
    player: createChances('player', period, playerActive, opponentActive, createRng(state.seed, `chance:player:${period}`)).tokens,
    opponent: createChances('opponent', period, opponentActive, playerActive, createRng(state.seed, `chance:opponent:${period}`)).tokens,
  };
}

export function playMatch(input: MatchLoopInput): MatchLoopResult {
  const { registry, policy } = input;
  const breakPlans = input.breakPlans ?? {};

  let current = input.state;
  let ledger: LedgerEffect[] = [...(input.ledger ?? [])];
  const snapshots: PeriodSnapshot[] = [];
  const receipts: MatchReceiptEvent[] = [];

  // Period 1 opens from the initial board; later periods open from their break.
  let chances = boardChances(current, ledger, registry, current.period);
  let matchOver = false;

  while (current.period <= FINAL_PERIOD) {
    const period = current.period;

    const periodResult = resolvePeriod({ state: current, ledger, chances, registry, ...(policy ? { policy } : {}) });
    current = periodResult.state;
    ledger = periodResult.ledger;
    snapshots.push(periodResult.snapshot);
    receipts.push(...periodResult.receipts);

    const boundary = processBoundary(current, ledger, registry);
    current = boundary.state;
    ledger = boundary.ledger;
    receipts.push(...boundary.receipts);
    matchOver = boundary.matchOver;
    if (matchOver) break;

    const breakIndex = period as BreakIndex;
    const upcomingPeriod = (period + 1) as PeriodNumber;
    const plans = breakPlans[breakIndex] ?? { player: emptyPlan('player', breakIndex), opponent: emptyPlan('opponent', breakIndex) };
    const breakResult = resolveBreak({
      state: current,
      ledger,
      plans,
      registry,
      breakIndex,
      upcomingPeriod,
      ...(input.randomPass ? { randomPass: input.randomPass } : {}),
    });
    current = breakResult.state;
    ledger = breakResult.ledger;
    chances = breakResult.chances;
    receipts.push(...breakResult.receipts);
  }

  return {
    state: current,
    ledger,
    snapshots,
    receipts,
    finalScore: { player: current.player.score, opponent: current.opponent.score },
    matchOver,
  };
}
