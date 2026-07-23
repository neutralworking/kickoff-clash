import type { ActionCondition, PeriodNumber, TeamSide, V7TeamState } from '../../lib/match-v7/types';
import type { ConditionContext, ConditionPlayerView } from '../actions/conditions';
import type { TargetContext } from '../actions/targets';
import type { LedgerEffect } from '../actions/effects';
import { effectivePlayers, splitByZone, type CardRegistry, type EffectivePlayer } from './stats';

// Bridge from the resolver's runtime/effective world to the action runtime's
// read-only view types. Activations and dispatch evaluate conditions and
// targets against these views, which are rebuilt from live state at the instant
// each side resolves — so a card revealed second sees the board the priority
// side just changed (V6 spec A1).

export function toPlayerView(player: EffectivePlayer): ConditionPlayerView {
  return {
    cardId: player.cardId,
    ...(player.slotKey ? { slotKey: player.slotKey } : {}),
    ...(player.position ? { position: player.position } : {}),
    ...(player.sector ? { sector: player.sector } : {}),
    attack: player.attack,
    defence: player.defence,
    cost: player.cost,
    partnerCardIds: player.partnerCardIds,
  };
}

export interface SideView {
  side: TeamSide;
  formationKey: string;
  score: number;
  active: ConditionPlayerView[];
  bench: ConditionPlayerView[];
  /** Cards whose actions are suppressed (emergency goalkeepers). */
  suppressedCardIds: Set<string>;
}

/** Build a full read-only view of one side from live state + the effect ledger. */
export function sideView(team: V7TeamState, registry: CardRegistry, ledger: readonly LedgerEffect[]): SideView {
  const players = effectivePlayers(team, registry, ledger);
  const { active, bench } = splitByZone(players);
  return {
    side: team.side,
    formationKey: registry.formations.get(team.formationId)?.formationKey ?? team.formationId,
    score: team.score,
    active: active.map(toPlayerView),
    bench: bench.map(toPlayerView),
    suppressedCardIds: new Set(players.filter((player) => player.actionsSuppressed).map((player) => player.cardId)),
  };
}

export function findSource(view: SideView, cardId: string): ConditionPlayerView | undefined {
  return view.active.find((player) => player.cardId === cardId) ?? view.bench.find((player) => player.cardId === cardId);
}

export interface ConditionContextOptions {
  period: PeriodNumber;
  randomPass?: (condition: Extract<ActionCondition, { type: 'probability' }>) => boolean;
}

export function conditionContextFor(
  source: ConditionPlayerView,
  own: SideView,
  enemy: SideView,
  options: ConditionContextOptions,
): ConditionContext {
  return {
    period: options.period,
    ownScore: own.score,
    enemyScore: enemy.score,
    formationKey: own.formationKey,
    source,
    ownActive: own.active,
    occupiedSlotKeys: own.active.map((player) => player.slotKey).filter((slotKey): slotKey is string => Boolean(slotKey)),
    ...(options.randomPass ? { randomPass: options.randomPass } : {}),
  };
}

export interface TargetSelection {
  selectedPlayerIds?: string[];
  selectedSector?: TargetContext['selectedSector'];
  selectedSlotKey?: string;
}

export function targetContextFor(
  source: ConditionPlayerView,
  own: SideView,
  enemy: SideView,
  selection: TargetSelection = {},
): TargetContext {
  return {
    source,
    ownActive: own.active,
    enemyActive: enemy.active,
    ownBench: own.bench,
    enemyBench: enemy.bench,
    ...(selection.selectedPlayerIds ? { selectedPlayerIds: selection.selectedPlayerIds } : {}),
    ...(selection.selectedSector ? { selectedSector: selection.selectedSector } : {}),
    ...(selection.selectedSlotKey ? { selectedSlotKey: selection.selectedSlotKey } : {}),
  };
}
