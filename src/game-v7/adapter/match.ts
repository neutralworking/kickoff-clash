import {
  appendEffects,
  autoMapFormation,
  computePriority,
  conditionContextFor,
  dispatchGameStart,
  effectivePlayers,
  findSource,
  rebuildOngoing,
  sideView,
  slotByKey,
  splitByZone,
  targetContextFor,
  type BreakIndex,
  type CardRegistry,
  type DispatchEntry,
  type LedgerEffect,
  type MatchReceiptEvent,
  type PeriodNumber,
  type PositionCode,
  type RuntimeActionInstance,
  type RuntimePlayerState,
  type Sector,
  type TeamSide,
  type V7ActionDefinition,
  type V7ManagerCard,
  type V7MatchState,
  type V7PlayerCard,
  type V7TeamState,
} from '@/engine-v7';
import type { FixtureSquad, V7Fixture } from '../fixtures';
import { buildRuntimeInstances } from './actions';
import { err, ok, type AdapterResult } from './result';

// Match adaptation: build the V7 registry + initial match state from a fixture,
// fire the kickoff (game-start + first ongoing rebuild), and translate engine
// state into a plain UI view model so presentation code never imports engine
// runtime types.

export interface GameRegistry extends CardRegistry {
  managers: Map<string, V7ManagerCard>;
}

export type MatchResult = 'VICTORY' | 'DRAW' | 'DEFEAT';

export function buildRegistry(fixture: V7Fixture): GameRegistry {
  return {
    cards: new Map(fixture.cards.map((card) => [card.id, card])),
    actions: new Map(fixture.actions.map((action) => [action.id, action])),
    formations: new Map(fixture.formations.map((formation) => [formation.id, formation])),
    managers: new Map([fixture.home.manager, fixture.away.manager].map((manager) => [manager.id, manager])),
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

function buildTeamState(
  side: TeamSide,
  squad: FixtureSquad,
  registry: GameRegistry,
  seed: number,
): AdapterResult<V7TeamState> {
  const formation = registry.formations.get(squad.formationId);
  if (!formation) return err('unknown_formation', `Unknown formation "${squad.formationId}".`, { side });

  const xiCards: V7PlayerCard[] = [];
  for (const cardId of squad.startingXI) {
    const card = registry.cards.get(cardId);
    if (!card) return err('unknown_card', `Starting XI references unknown card "${cardId}".`, { side });
    xiCards.push(card);
  }

  const mapping = autoMapFormation(
    formation,
    xiCards.map((card, index) => ({ card, deploymentOrder: index })),
    seed,
  );
  if (mapping.unmappedCardIds.length > 0 || mapping.emptySlotKeys.length > 0) {
    return err('incomplete_lineup', `${side} XI does not fill ${formation.formationKey}.`, {
      unmapped: mapping.unmappedCardIds,
      empty: mapping.emptySlotKeys,
    });
  }

  const players: RuntimePlayerState[] = [];
  let order = 0;
  for (const [slotKey, cardId] of Object.entries(mapping.assignments)) {
    const card = registry.cards.get(cardId)!;
    const instances = buildRuntimeInstances(card, registry.actions);
    if (!instances.ok) return instances;
    const sector = slotByKey(formation, slotKey)?.sector ?? card.naturalSector;
    players.push({
      cardId,
      deploymentOrder: order++,
      zone: 'active',
      currentSlotKey: slotKey,
      currentSector: sector,
      periodsParticipated: [],
      mandatoryRemoval: false,
      actionInstances: instances.value,
      activeEffectIds: [],
      accumulatedStacks: {},
      currentCost: card.printedCost,
    });
  }

  for (const cardId of squad.benchIds) {
    const card = registry.cards.get(cardId);
    if (!card) return err('unknown_card', `Bench references unknown card "${cardId}".`, { side });
    const instances = buildRuntimeInstances(card, registry.actions);
    if (!instances.ok) return instances;
    players.push({
      cardId,
      deploymentOrder: order++,
      zone: 'bench',
      periodsParticipated: [],
      mandatoryRemoval: false,
      actionInstances: instances.value,
      activeEffectIds: [],
      accumulatedStacks: {},
      currentCost: card.printedCost,
    });
  }

  return ok({ side, managerId: squad.manager.id, formationId: squad.formationId, players, score: 0, cumulativeGrossChances: 0 });
}

function gameStartEntries(team: V7TeamState, enemy: V7TeamState, registry: GameRegistry, ledger: readonly LedgerEffect[]): DispatchEntry[] {
  const ownView = sideView(team, registry, ledger);
  const enemyView = sideView(enemy, registry, ledger);
  const entries: DispatchEntry[] = [];
  for (const player of team.players) {
    if (player.zone !== 'active') continue;
    const source = findSource(ownView, player.cardId);
    if (!source) continue;
    for (const instance of player.actionInstances) {
      const action = registry.actions.get(instance.printedActionId);
      if (!action || action.timing !== 'game_start') continue;
      entries.push({
        instance,
        action,
        conditionContext: conditionContextFor(source, ownView, enemyView, { period: 1 }),
        targetContext: targetContextFor(source, ownView, enemyView),
      });
    }
  }
  return entries;
}

function ongoingEntries(team: V7TeamState, enemy: V7TeamState, registry: GameRegistry, ledger: readonly LedgerEffect[]): DispatchEntry[] {
  const ownView = sideView(team, registry, ledger);
  const enemyView = sideView(enemy, registry, ledger);
  const entries: DispatchEntry[] = [];
  for (const player of team.players) {
    if (player.zone !== 'active') continue;
    if (ownView.suppressedCardIds.has(player.cardId)) continue;
    const source = findSource(ownView, player.cardId);
    if (!source) continue;
    for (const instance of player.actionInstances) {
      const action = registry.actions.get(instance.printedActionId);
      if (!action || action.timing !== 'ongoing') continue;
      entries.push({
        instance,
        action,
        conditionContext: conditionContextFor(source, ownView, enemyView, { period: 1 }),
        targetContext: targetContextFor(source, ownView, enemyView),
      });
    }
  }
  return entries;
}

/** Fire the kickoff: game-start actions, then the opening ongoing rebuild. */
export function dispatchKickoff(
  state: V7MatchState,
  registry: GameRegistry,
): { state: V7MatchState; ledger: LedgerEffect[]; receipts: MatchReceiptEvent[] } {
  let ledger: LedgerEffect[] = [];
  const receipts: MatchReceiptEvent[] = [];
  let player = state.player;
  let opponent = state.opponent;

  for (const side of ['player', 'opponent'] as const) {
    const own = side === 'player' ? player : opponent;
    const enemy = side === 'player' ? opponent : player;
    const result = dispatchGameStart(gameStartEntries(own, enemy, registry, ledger), side);
    ledger = appendEffects(ledger, result.effects);
    receipts.push(...result.receipts);
    const merged = mergeInstances(own, result.instances);
    if (side === 'player') player = merged;
    else opponent = merged;
  }

  for (const side of ['player', 'opponent'] as const) {
    const own = side === 'player' ? player : opponent;
    const enemy = side === 'player' ? opponent : player;
    const rebuilt = rebuildOngoing(ledger, ongoingEntries(own, enemy, registry, ledger), side, { period: 1, breakIndex: 0 });
    ledger = rebuilt.ledger;
    receipts.push(...rebuilt.receipts);
    const merged = mergeInstances(own, rebuilt.instances);
    if (side === 'player') player = merged;
    else opponent = merged;
  }

  return { state: { ...state, player, opponent }, ledger, receipts };
}

export interface InitialMatch {
  state: V7MatchState;
  ledger: LedgerEffect[];
  registry: GameRegistry;
  receipts: MatchReceiptEvent[];
}

/** Build the initial V7 match state (both teams + kickoff) from a fixture. */
export function buildInitialMatch(fixture: V7Fixture): AdapterResult<InitialMatch> {
  const registry = buildRegistry(fixture);
  const player = buildTeamState('player', fixture.home, registry, fixture.seed);
  if (!player.ok) return player;
  const opponent = buildTeamState('opponent', fixture.away, registry, fixture.seed);
  if (!opponent.ok) return opponent;

  const playerActive = splitByZone(effectivePlayers(player.value, registry, [])).active;
  const opponentActive = splitByZone(effectivePlayers(opponent.value, registry, [])).active;
  const priority = computePriority(playerActive, opponentActive);

  const kickoffState: V7MatchState = {
    seed: fixture.seed,
    period: 1,
    breakIndex: 0,
    priority,
    player: player.value,
    opponent: opponent.value,
    receipt: [],
    resolutionDepth: 0,
  };

  const kicked = dispatchKickoff(kickoffState, registry);
  return ok({ state: kicked.state, ledger: kicked.ledger, registry, receipts: kicked.receipts });
}

// ── UI view model ─────────────────────────────────────────────────────────────

export interface UiPlayerView {
  cardId: string;
  name: string;
  shortName: string;
  position?: PositionCode;
  sector?: Sector;
  slotKey?: string;
  attack: number;
  defence: number;
  outOfPosition: boolean;
  emergencyGoalkeeper: boolean;
}

export interface UiActionView {
  instanceId: string;
  cardId: string;
  cardName: string;
  actionName: string;
  displayText: string;
  timing: string;
  remainingCharges: number | null;
  disabled: boolean;
  usedThisBreak: boolean;
}

export interface UiTeamView {
  side: TeamSide;
  managerName: string;
  formationName: string;
  score: number;
  active: UiPlayerView[];
  bench: UiPlayerView[];
  actions: UiActionView[];
}

export interface UiMatchView {
  seed: number;
  period: PeriodNumber;
  breakIndex: 0 | BreakIndex;
  phaseLabel: string;
  priority: TeamSide;
  player: UiTeamView;
  opponent: UiTeamView;
  result: MatchResult | null;
}

const SECTOR_RANK: Record<Sector, number> = { left: 0, centre: 1, right: 2 };

function teamView(state: V7MatchState, side: TeamSide, registry: GameRegistry, ledger: readonly LedgerEffect[]): UiTeamView {
  const team = side === 'player' ? state.player : state.opponent;
  const eff = effectivePlayers(team, registry, ledger);
  const byId = new Map(eff.map((player) => [player.cardId, player]));
  const nameOf = (cardId: string) => registry.cards.get(cardId)?.name ?? cardId;
  const shortOf = (cardId: string) => registry.cards.get(cardId)?.shortName ?? nameOf(cardId);

  const toView = (cardId: string): UiPlayerView => {
    const e = byId.get(cardId);
    return {
      cardId,
      name: nameOf(cardId),
      shortName: shortOf(cardId),
      ...(e?.position ? { position: e.position } : {}),
      ...(e?.sector ? { sector: e.sector } : {}),
      ...(e?.slotKey ? { slotKey: e.slotKey } : {}),
      attack: e?.attack ?? registry.cards.get(cardId)?.printedAttack ?? 0,
      defence: e?.defence ?? registry.cards.get(cardId)?.printedDefence ?? 0,
      outOfPosition: e?.outOfPosition ?? false,
      emergencyGoalkeeper: e?.emergencyGoalkeeper ?? false,
    };
  };

  const active = team.players
    .filter((player) => player.zone === 'active')
    .map((player) => toView(player.cardId))
    .sort((a, b) => (SECTOR_RANK[a.sector ?? 'centre'] - SECTOR_RANK[b.sector ?? 'centre']) || a.name.localeCompare(b.name));
  const bench = team.players.filter((player) => player.zone === 'bench').map((player) => toView(player.cardId));

  const actions: UiActionView[] = [];
  for (const player of team.players) {
    if (player.zone !== 'active') continue;
    for (const instance of player.actionInstances) {
      const action = registry.actions.get(instance.printedActionId);
      if (!action) continue;
      actions.push({
        instanceId: instance.instanceId,
        cardId: player.cardId,
        cardName: shortOf(player.cardId),
        actionName: action.name,
        displayText: action.displayText,
        timing: action.timing,
        remainingCharges: instance.remainingCharges ?? null,
        disabled: instance.disabledUntil !== undefined,
        usedThisBreak: instance.activationCountThisBreak > 0,
      });
    }
  }

  return {
    side,
    managerName: registry.managers.get(team.managerId)?.name ?? team.managerId,
    formationName: registry.formations.get(team.formationId)?.formationKey ?? team.formationId,
    score: team.score,
    active,
    bench,
    actions,
  };
}

export function toMatchView(
  state: V7MatchState,
  ledger: readonly LedgerEffect[],
  registry: GameRegistry,
  options: { phaseLabel: string; result: MatchResult | null },
): UiMatchView {
  return {
    seed: state.seed,
    period: state.period,
    breakIndex: state.breakIndex,
    phaseLabel: options.phaseLabel,
    priority: state.priority,
    player: teamView(state, 'player', registry, ledger),
    opponent: teamView(state, 'opponent', registry, ledger),
    result: options.result,
  };
}
