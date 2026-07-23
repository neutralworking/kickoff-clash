import type {
  ActionCondition,
  BreakIndex,
  BreakPlan,
  ChanceToken,
  MatchReceiptEvent,
  PeriodNumber,
  ResolutionStage,
  RuntimeActionInstance,
  TeamSide,
  V7MatchState,
  V7TeamState,
} from '../../lib/match-v7/types';
import { receiptEvent } from '../runtime/receipt';
import { createRng } from '../core/rng';
import { activateAction, resetBreakActivations } from '../actions/activate';
import { rebuildOngoing, type DispatchEntry } from '../actions/dispatch';
import { appendEffects, type LedgerEffect } from '../actions/effects';
import { resolutionOrder } from './priority';
import { applyLineup } from './lineup';
import { createChances } from './chances';
import {
  conditionContextFor,
  findSource,
  sideView,
  targetContextFor,
  type SideView,
} from './context';
import { effectivePlayers, splitByZone, type CardRegistry } from './stats';

// The break resolver — the spine that turns two locked break plans into the
// next period's opening state. It sequences the whole thing deterministically:
//   1. reset the once-per-break activation flags;
//   2. in priority order (leader first, so the trailing side's board-reading
//      cards see the leader's landed cards — A1), for each side run its
//      before-lineup activations, apply its formation switch / subs / movement,
//      then its after-lineup activations;
//   3. recompute both sides' ongoing effects against the settled board;
//   4. create (not roll) the upcoming period's chances.
// It obeys the same rule as the action runtime: it produces new immutable state,
// an appended effect ledger, and an ordered receipt trail — the receipts are the
// record of what happened. Dice rolling / goal resolution is the next slice.

export type RandomPass = (
  side: TeamSide,
  condition: Extract<ActionCondition, { type: 'probability' }>,
) => boolean;

export interface BreakResolutionInput {
  state: V7MatchState;
  ledger: readonly LedgerEffect[];
  plans: Record<TeamSide, BreakPlan>;
  registry: CardRegistry;
  breakIndex: BreakIndex;
  upcomingPeriod: PeriodNumber;
  randomPass?: RandomPass;
}

export interface BreakResolution {
  state: V7MatchState;
  ledger: LedgerEffect[];
  chances: Record<TeamSide, ChanceToken[]>;
  receipts: MatchReceiptEvent[];
}

interface Board {
  player: V7TeamState;
  opponent: V7TeamState;
}

const teamOf = (board: Board, side: TeamSide): V7TeamState => (side === 'player' ? board.player : board.opponent);
const otherSide = (side: TeamSide): TeamSide => (side === 'player' ? 'opponent' : 'player');
const withTeam = (board: Board, side: TeamSide, team: V7TeamState): Board =>
  side === 'player' ? { ...board, player: team } : { ...board, opponent: team };

function resetTeamBreak(team: V7TeamState): V7TeamState {
  return {
    ...team,
    players: team.players.map((player) => ({
      ...player,
      actionInstances: resetBreakActivations(player.actionInstances),
    })),
  };
}

function findInstance(team: V7TeamState, instanceId: string): RuntimeActionInstance | undefined {
  for (const player of team.players) {
    const instance = player.actionInstances.find((entry) => entry.instanceId === instanceId);
    if (instance) return instance;
  }
  return undefined;
}

function replaceInstance(team: V7TeamState, updated: RuntimeActionInstance): V7TeamState {
  return {
    ...team,
    players: team.players.map((player) => ({
      ...player,
      actionInstances: player.actionInstances.map((instance) =>
        instance.instanceId === updated.instanceId ? updated : instance,
      ),
    })),
  };
}

function mergeInstances(team: V7TeamState, updated: readonly RuntimeActionInstance[]): V7TeamState {
  if (updated.length === 0) return team;
  const byId = new Map(updated.map((instance) => [instance.instanceId, instance]));
  return {
    ...team,
    players: team.players.map((player) => ({
      ...player,
      actionInstances: player.actionInstances.map((instance) => byId.get(instance.instanceId) ?? instance),
    })),
  };
}

interface StageRun {
  board: Board;
  ledger: LedgerEffect[];
  receipts: MatchReceiptEvent[];
}

function runStage(
  board: Board,
  ledger: LedgerEffect[],
  side: TeamSide,
  stage: ResolutionStage,
  input: BreakResolutionInput,
): StageRun {
  const { registry, breakIndex, upcomingPeriod, randomPass } = input;
  const plan = input.plans[side];
  const coords = { period: upcomingPeriod, breakIndex };
  const enemy = otherSide(side);
  const receipts: MatchReceiptEvent[] = [];

  const activations = plan.activations
    .filter((activation) => activation.stage === stage)
    .sort((a, b) => a.order - b.order);

  let currentBoard = board;
  let currentLedger = ledger;

  for (const planned of activations) {
    const ownTeam = teamOf(currentBoard, side);
    const enemyTeam = teamOf(currentBoard, enemy);
    const instance = findInstance(ownTeam, planned.actionInstanceId);
    if (!instance) continue;
    const action = registry.actions.get(instance.printedActionId);
    if (!action) continue;

    const ownView = sideView(ownTeam, registry, currentLedger);
    const enemyView = sideView(enemyTeam, registry, currentLedger);
    const source = findSource(ownView, instance.currentOwnerCardId);
    if (!source) continue;

    if (ownView.suppressedCardIds.has(instance.currentOwnerCardId)) {
      receipts.push(
        receiptEvent({
          id: `rcpt:${side}:${instance.instanceId}:${upcomingPeriod}:${breakIndex}:suppressed`,
          period: upcomingPeriod,
          phase: 'break_activation',
          eventType: 'action_blocked',
          message: `${action.name} is suppressed (emergency goalkeeper).`,
          side,
          sourceId: instance.currentOwnerCardId,
          actionName: action.name,
          data: { reason: 'suppressed' },
        }),
      );
      continue;
    }

    const perPass = randomPass ? (condition: Extract<ActionCondition, { type: 'probability' }>) => randomPass(side, condition) : undefined;
    const conditionContext = conditionContextFor(source, ownView, enemyView, {
      period: upcomingPeriod,
      ...(perPass ? { randomPass: perPass } : {}),
    });
    const targetContext = targetContextFor(source, ownView, enemyView, {
      ...(planned.selectedTargetIds ? { selectedPlayerIds: planned.selectedTargetIds } : {}),
      ...(planned.selectedSector ? { selectedSector: planned.selectedSector } : {}),
      ...(planned.selectedSlotKey ? { selectedSlotKey: planned.selectedSlotKey } : {}),
    });

    const result = activateAction(instance, action, {
      side,
      coords,
      effectivePeriod: upcomingPeriod,
      conditionContext,
      targetContext,
    });

    currentBoard = withTeam(currentBoard, side, replaceInstance(ownTeam, result.instance));
    currentLedger = appendEffects(currentLedger, result.effects);
    receipts.push(result.receipt);
  }

  return { board: currentBoard, ledger: currentLedger, receipts };
}

function ongoingEntries(
  team: V7TeamState,
  ownView: SideView,
  enemyView: SideView,
  input: BreakResolutionInput,
): DispatchEntry[] {
  const entries: DispatchEntry[] = [];
  for (const player of team.players) {
    if (player.zone !== 'active') continue;
    if (ownView.suppressedCardIds.has(player.cardId)) continue;
    const source = findSource(ownView, player.cardId);
    if (!source) continue;
    for (const instance of player.actionInstances) {
      const action = input.registry.actions.get(instance.printedActionId);
      if (!action || action.timing !== 'ongoing') continue;
      entries.push({
        instance,
        action,
        conditionContext: conditionContextFor(source, ownView, enemyView, { period: input.upcomingPeriod }),
        targetContext: targetContextFor(source, ownView, enemyView),
      });
    }
  }
  return entries;
}

export function resolveBreak(input: BreakResolutionInput): BreakResolution {
  const { state, registry, breakIndex, upcomingPeriod } = input;

  let board: Board = {
    player: resetTeamBreak(state.player),
    opponent: resetTeamBreak(state.opponent),
  };
  let ledger: LedgerEffect[] = [...input.ledger];
  const receipts: MatchReceiptEvent[] = [];

  // 1–2. Each side, in priority order, resolves its whole locked sequence.
  for (const side of resolutionOrder(state.priority)) {
    const before = runStage(board, ledger, side, 'before_lineup_changes', input);
    board = before.board;
    ledger = before.ledger;
    receipts.push(...before.receipts);

    const lineup = applyLineup(teamOf(board, side), input.plans[side], registry, { period: upcomingPeriod, breakIndex });
    board = withTeam(board, side, lineup.team);
    receipts.push(...lineup.receipts);

    const after = runStage(board, ledger, side, 'after_lineup_changes', input);
    board = after.board;
    ledger = after.ledger;
    receipts.push(...after.receipts);
  }

  // 3. Recompute ongoing effects for both sides against the settled board.
  for (const side of ['player', 'opponent'] as const) {
    const ownTeam = teamOf(board, side);
    const enemyTeam = teamOf(board, otherSide(side));
    const ownView = sideView(ownTeam, registry, ledger);
    const enemyView = sideView(enemyTeam, registry, ledger);
    const rebuilt = rebuildOngoing(ledger, ongoingEntries(ownTeam, ownView, enemyView, input), side, {
      period: upcomingPeriod,
      breakIndex: 0,
    });
    ledger = rebuilt.ledger;
    board = withTeam(board, side, mergeInstances(ownTeam, rebuilt.instances));
    receipts.push(...rebuilt.receipts);
  }

  // 4. Create the upcoming period's chances from the settled board.
  const playerActive = splitByZone(effectivePlayers(board.player, registry, ledger)).active;
  const opponentActive = splitByZone(effectivePlayers(board.opponent, registry, ledger)).active;
  const chances: Record<TeamSide, ChanceToken[]> = {
    player: createChances('player', upcomingPeriod, playerActive, opponentActive, createRng(state.seed, `chance:player:${upcomingPeriod}`)).tokens,
    opponent: createChances('opponent', upcomingPeriod, opponentActive, playerActive, createRng(state.seed, `chance:opponent:${upcomingPeriod}`)).tokens,
  };

  const nextState: V7MatchState = {
    ...state,
    period: upcomingPeriod,
    breakIndex: 0,
    previousPriority: state.priority,
    player: board.player,
    opponent: board.opponent,
    receipt: [...state.receipt, ...receipts],
    resolutionDepth: 0,
  };

  return { state: nextState, ledger, chances, receipts };
}
