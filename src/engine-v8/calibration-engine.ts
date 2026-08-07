import { outOfPositionPenalty, type V8Zone } from './core';
import {
  V8_TACTICAL_DEFINITIONS,
  createTacticalInstance,
  isV8ChanceType,
  tacticalBaseCost,
  tacticalCanPlayInZone,
  tacticalPrintedAttack,
  type V8TacticalCardInstance,
  type V8TacticalType,
} from './tactical';
import {
  getV8CalibrationPlayer,
  type V8CalibrationPlayerCard,
} from './calibration-cards';

export type V8CalibrationSide = 'home' | 'away';
export type V8ModifierLifetime = 'period' | 'match';

export interface V8CalibrationStatModifier {
  id: string;
  attack: number;
  defence: number;
  lifetime: V8ModifierLifetime;
  source?: string;
}

export interface V8CalibrationRuntimePlayer {
  runtimeId: string;
  side: V8CalibrationSide;
  cardId: string;
  zone: V8Zone;
  deployedOrder: number;
  modifiers: V8CalibrationStatModifier[];
}

export type V8CalibrationHandCard =
  | { kind: 'player'; cardId: string }
  | { kind: 'tactical'; card: V8TacticalCardInstance };

export interface V8CalibrationTeamState {
  hand: V8CalibrationHandCard[];
  drawPile: string[];
  energy: number;
  deployedOrder: number;
}

export interface V8CalibrationOffsideTrap {
  id: string;
  side: V8CalibrationSide;
  zone: 'DEF';
  sourceBaresiRuntimeId?: string;
}

export interface V8CalibrationTacticalResolution {
  cardId: string;
  type: V8TacticalType;
  side: V8CalibrationSide;
  zone: V8Zone;
  cost: number;
  cancelled: boolean;
  attack: number;
  uncancellable: boolean;
  specialistBonuses: string[];
}

export type V8CalibrationEventType =
  | 'player_revealed'
  | 'player_moved'
  | 'action_triggered'
  | 'action_ignored'
  | 'action_suppressed'
  | 'modifier_changed'
  | 'tactical_generated'
  | 'tactical_modified'
  | 'tactical_played'
  | 'chance_resolved'
  | 'chance_cancelled'
  | 'period_end'
  | 'period_start'
  | 'zone_winner';

export interface V8CalibrationEvent {
  type: V8CalibrationEventType;
  text: string;
  period: number;
}

export interface V8CalibrationState {
  period: number;
  teams: Record<V8CalibrationSide, V8CalibrationTeamState>;
  players: Record<string, V8CalibrationRuntimePlayer>;
  suppressedActions: Record<string, string>;
  periodCounters: Record<string, number>;
  matchCounters: Record<string, number>;
  tacticalAttack: Record<V8CalibrationSide, Record<V8Zone, number>>;
  zoneDefenceBonus: Record<V8CalibrationSide, Record<V8Zone, number>>;
  triggerPress: Record<V8CalibrationSide, Record<V8Zone, boolean>>;
  offsideTraps: V8CalibrationOffsideTrap[];
  tacticalResolutions: V8CalibrationTacticalResolution[];
  events: V8CalibrationEvent[];
  nextGeneratedId: number;
  nextModifierId: number;
}

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const ENERGY_CURVE = [3, 5, 7, 9] as const;
const ZONE_INDEX: Record<V8Zone, number> = { DEF: 0, MID: 1, ATT: 2 };

function emptyNumbers(): Record<V8Zone, number> {
  return { DEF: 0, MID: 0, ATT: 0 };
}

function emptyFlags(): Record<V8Zone, boolean> {
  return { DEF: false, MID: false, ATT: false };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: V8CalibrationSide): V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

export function calibrationRuntimeId(side: V8CalibrationSide, cardId: string): string {
  return `${side}:${cardId}`;
}

function pushEvent(state: V8CalibrationState, type: V8CalibrationEventType, text: string): void {
  state.events.push({ type, text, period: state.period });
}

function nextGeneratedId(state: V8CalibrationState, type: V8TacticalType): string {
  const id = `${type}-${state.period}-${state.nextGeneratedId}`;
  state.nextGeneratedId += 1;
  return id;
}

function nextModifierId(state: V8CalibrationState, source: string): string {
  const id = `${source}-${state.period}-${state.nextModifierId}`;
  state.nextModifierId += 1;
  return id;
}

function counterKey(prefix: string, runtimeId: string, zone?: V8Zone): string {
  return zone ? `${prefix}:${runtimeId}:${zone}` : `${prefix}:${runtimeId}`;
}

function getCounter(state: V8CalibrationState, key: string, lifetime: 'period' | 'match' = 'period'): number {
  return (lifetime === 'period' ? state.periodCounters : state.matchCounters)[key] ?? 0;
}

function bumpCounter(state: V8CalibrationState, key: string, lifetime: 'period' | 'match' = 'period'): void {
  const bag = lifetime === 'period' ? state.periodCounters : state.matchCounters;
  bag[key] = (bag[key] ?? 0) + 1;
}

export function createV8CalibrationState(options: {
  period?: number;
  homeEnergy?: number;
  awayEnergy?: number;
  homeDeck?: readonly string[];
  awayDeck?: readonly string[];
} = {}): V8CalibrationState {
  const period = options.period ?? 1;
  const defaultEnergy = ENERGY_CURVE[period - 1] ?? 0;

  const createTeam = (deck: readonly string[] | undefined, energy: number | undefined): V8CalibrationTeamState => {
    const ordered = [...(deck ?? [])];
    const hand = ordered.slice(0, Math.min(5, ordered.length)).map((cardId) => ({ kind: 'player' as const, cardId }));
    return {
      hand,
      drawPile: ordered.slice(hand.length),
      energy: energy ?? defaultEnergy,
      deployedOrder: 0,
    };
  };

  return {
    period,
    teams: {
      home: createTeam(options.homeDeck, options.homeEnergy),
      away: createTeam(options.awayDeck, options.awayEnergy),
    },
    players: {},
    suppressedActions: {},
    periodCounters: {},
    matchCounters: {},
    tacticalAttack: { home: emptyNumbers(), away: emptyNumbers() },
    zoneDefenceBonus: { home: emptyNumbers(), away: emptyNumbers() },
    triggerPress: { home: emptyFlags(), away: emptyFlags() },
    offsideTraps: [],
    tacticalResolutions: [],
    events: [],
    nextGeneratedId: 1,
    nextModifierId: 1,
  };
}

export function createV8CalibrationMatch(homeDeck: readonly string[], awayDeck: readonly string[]): V8CalibrationState {
  if (homeDeck.length !== 11 || awayDeck.length !== 11) throw new Error('A V8 calibration XI must contain exactly 11 players');
  return createV8CalibrationState({ homeDeck, awayDeck });
}

export function calibrationPlayersInZone(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  zone: V8Zone,
): V8CalibrationRuntimePlayer[] {
  return Object.values(state.players)
    .filter((player) => player.side === side && player.zone === zone)
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));
}

export function calibrationPlayerCard(player: V8CalibrationRuntimePlayer): V8CalibrationPlayerCard {
  return getV8CalibrationPlayer(player.cardId);
}

export function isCalibrationActionEnabled(state: V8CalibrationState, runtimeId: string): boolean {
  return !state.suppressedActions[runtimeId];
}

function rawAttack(state: V8CalibrationState, player: V8CalibrationRuntimePlayer): number {
  const card = calibrationPlayerCard(player);
  return card.printedAttack + player.modifiers.reduce((sum, modifier) => sum + modifier.attack, 0);
}

function rawDefence(state: V8CalibrationState, player: V8CalibrationRuntimePlayer): number {
  const card = calibrationPlayerCard(player);
  let defence = card.printedDefence + player.modifiers.reduce((sum, modifier) => sum + modifier.defence, 0);

  for (const makelele of calibrationPlayersInZone(state, player.side, player.zone)) {
    if (makelele.runtimeId === player.runtimeId) continue;
    if (calibrationPlayerCard(makelele).actionKey !== 'makelele_water_carrier') continue;
    if (!isCalibrationActionEnabled(state, makelele.runtimeId)) continue;
    defence += 2;
  }

  return defence;
}

export function currentCalibrationAttack(state: V8CalibrationState, runtimeId: string): number {
  const player = state.players[runtimeId];
  if (!player) throw new Error(`Unknown deployed player: ${runtimeId}`);
  return rawAttack(state, player);
}

export function currentCalibrationDefence(state: V8CalibrationState, runtimeId: string): number {
  const player = state.players[runtimeId];
  if (!player) throw new Error(`Unknown deployed player: ${runtimeId}`);
  return rawDefence(state, player);
}

export function hasReducedDefence(state: V8CalibrationState, runtimeId: string): boolean {
  const player = state.players[runtimeId];
  if (!player) throw new Error(`Unknown deployed player: ${runtimeId}`);
  return currentCalibrationDefence(state, runtimeId) < calibrationPlayerCard(player).printedDefence;
}

function effectiveStats(state: V8CalibrationState, player: V8CalibrationRuntimePlayer): { attack: number; defence: number } {
  const card = calibrationPlayerCard(player);
  const penalty = outOfPositionPenalty(card, player.zone);
  return {
    attack: currentCalibrationAttack(state, player.runtimeId) - penalty,
    defence: currentCalibrationDefence(state, player.runtimeId) - penalty,
  };
}

export function calibrationZoneTotals(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  zone: V8Zone,
): { attack: number; defence: number; power: number } {
  let attack = state.tacticalAttack[side][zone];
  let defence = state.zoneDefenceBonus[side][zone];

  for (const player of calibrationPlayersInZone(state, side, zone)) {
    const stats = effectiveStats(state, player);
    if (zone === 'DEF') defence += stats.defence;
    else if (zone === 'MID') {
      attack += stats.attack;
      defence += stats.defence;
    } else {
      attack += stats.attack;
      if (state.triggerPress[side].ATT) attack += stats.defence;
    }
  }

  return { attack, defence, power: attack + defence };
}

export function calibrationTeamTotals(state: V8CalibrationState, side: V8CalibrationSide): { attack: number; defence: number } {
  const defence = calibrationZoneTotals(state, side, 'DEF');
  const mid = calibrationZoneTotals(state, side, 'MID');
  const attack = calibrationZoneTotals(state, side, 'ATT');
  return {
    attack: mid.attack + attack.attack,
    defence: defence.defence + mid.defence,
  };
}

function isDefender(player: V8CalibrationRuntimePlayer): boolean {
  const card = calibrationPlayerCard(player);
  return card.position !== 'GK' && card.naturalZones.includes('DEF');
}

function sortHighestAttack(state: V8CalibrationState, players: V8CalibrationRuntimePlayer[]): V8CalibrationRuntimePlayer[] {
  return [...players].sort((a, b) =>
    currentCalibrationAttack(state, b.runtimeId) - currentCalibrationAttack(state, a.runtimeId)
    || a.deployedOrder - b.deployedOrder
    || a.runtimeId.localeCompare(b.runtimeId));
}

function sortHighestDefence(state: V8CalibrationState, players: V8CalibrationRuntimePlayer[]): V8CalibrationRuntimePlayer[] {
  return [...players].sort((a, b) =>
    currentCalibrationDefence(state, b.runtimeId) - currentCalibrationDefence(state, a.runtimeId)
    || a.deployedOrder - b.deployedOrder
    || a.runtimeId.localeCompare(b.runtimeId));
}

function sortLowestDefence(state: V8CalibrationState, players: V8CalibrationRuntimePlayer[]): V8CalibrationRuntimePlayer[] {
  return [...players].sort((a, b) =>
    currentCalibrationDefence(state, a.runtimeId) - currentCalibrationDefence(state, b.runtimeId)
    || a.deployedOrder - b.deployedOrder
    || a.runtimeId.localeCompare(b.runtimeId));
}

function opposingPlayersHere(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  zone: V8Zone,
): V8CalibrationRuntimePlayer[] {
  return calibrationPlayersInZone(state, otherSide(side), zone);
}

function iniestaIgnoresAction(state: V8CalibrationState, sourceRuntimeId: string, targetRuntimeId: string): boolean {
  const source = state.players[sourceRuntimeId];
  const target = state.players[targetRuntimeId];
  if (!source || !target || source.side === target.side) return false;
  if (calibrationPlayerCard(target).actionKey !== 'iniesta_la_croqueta') return false;
  if (!isCalibrationActionEnabled(state, targetRuntimeId)) return false;

  const key = counterKey('iniesta-protection', targetRuntimeId);
  if (getCounter(state, key) > 0) return false;
  bumpCounter(state, key);
  pushEvent(state, 'action_ignored', `${calibrationPlayerCard(target).realName} · LA CROQUETA ignores ${calibrationPlayerCard(source).actionName}.`);
  return true;
}

function applyModifierMutable(
  state: V8CalibrationState,
  targetRuntimeId: string,
  modifier: { attack?: number; defence?: number; lifetime: V8ModifierLifetime; source: string; sourceRuntimeId?: string },
): boolean {
  const target = state.players[targetRuntimeId];
  if (!target) return false;
  const attack = modifier.attack ?? 0;
  const defence = modifier.defence ?? 0;

  if (modifier.sourceRuntimeId && iniestaIgnoresAction(state, modifier.sourceRuntimeId, targetRuntimeId)) return false;

  if ((attack < 0 || defence < 0)
    && calibrationPlayerCard(target).actionKey === 'seedorf_ride_the_tackle'
    && isCalibrationActionEnabled(state, targetRuntimeId)) {
    pushEvent(state, 'action_ignored', `${calibrationPlayerCard(target).realName} · RIDE THE TACKLE prevents a stat reduction.`);
    return false;
  }

  target.modifiers.push({
    id: nextModifierId(state, modifier.source),
    attack,
    defence,
    lifetime: modifier.lifetime,
    source: modifier.source,
  });
  pushEvent(state, 'modifier_changed', `${calibrationPlayerCard(target).realName}: ${attack >= 0 ? '+' : ''}${attack} ATT, ${defence >= 0 ? '+' : ''}${defence} DEF (${modifier.lifetime}).`);
  refreshGentileSuppressionMutable(state);
  return true;
}

export function applyCalibrationModifier(
  state: V8CalibrationState,
  targetRuntimeId: string,
  modifier: { attack?: number; defence?: number; lifetime: V8ModifierLifetime; source: string; sourceRuntimeId?: string },
): V8CalibrationState {
  const next = clone(state);
  applyModifierMutable(next, targetRuntimeId, modifier);
  return next;
}

function generateTacticalMutable(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  type: V8TacticalType,
  generatedBy: string,
  options: Parameters<typeof createTacticalInstance>[2] = {},
): V8TacticalCardInstance {
  const card = createTacticalInstance(type, nextGeneratedId(state, type), {
    ...options,
    generatedBy,
  });
  state.teams[side].hand.push({ kind: 'tactical', card });
  pushEvent(state, 'tactical_generated', `${getV8CalibrationPlayer(generatedBy).realName} generates ${card.name}${card.attModifier ? ` (+${card.attModifier} ATT)` : ''}.`);
  return card;
}

export function addCalibrationTacticalToHand(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  type: V8TacticalType,
  options: Parameters<typeof createTacticalInstance>[2] = {},
): { state: V8CalibrationState; card: V8TacticalCardInstance } {
  const next = clone(state);
  const card = createTacticalInstance(type, nextGeneratedId(next, type), options);
  next.teams[side].hand.push({ kind: 'tactical', card });
  return { state: next, card };
}

function modifyFirstCrossInHandMutable(state: V8CalibrationState, side: V8CalibrationSide, amount: number): boolean {
  const hand = state.teams[side].hand;
  const found = hand.find((entry) => entry.kind === 'tactical' && entry.card.type === 'cross');
  if (!found || found.kind !== 'tactical') return false;
  found.card.attModifier += amount;
  pushEvent(state, 'tactical_modified', `${found.card.name} in hand gains +${amount} ATT.`);
  return true;
}

function refreshGentileSuppressionMutable(state: V8CalibrationState): void {
  const previous = state.suppressedActions;
  state.suppressedActions = {};

  const gentiles = Object.values(state.players)
    .filter((player) => calibrationPlayerCard(player).actionKey === 'gentile_man_marker')
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const gentile of gentiles) {
    const targets = sortHighestAttack(state, opposingPlayersHere(state, gentile.side, gentile.zone));
    const target = targets[0];
    if (!target) continue;
    if (iniestaIgnoresAction(state, gentile.runtimeId, target.runtimeId)) continue;
    state.suppressedActions[target.runtimeId] = gentile.runtimeId;
  }

  for (const [targetId, sourceId] of Object.entries(state.suppressedActions)) {
    if (previous[targetId] === sourceId) continue;
    const target = state.players[targetId];
    const source = state.players[sourceId];
    if (target && source) pushEvent(state, 'action_suppressed', `${calibrationPlayerCard(source).realName} · MAN MARKER suppresses ${calibrationPlayerCard(target).realName}.`);
  }
}

export function refreshCalibrationSuppression(state: V8CalibrationState): V8CalibrationState {
  const next = clone(state);
  refreshGentileSuppressionMutable(next);
  return next;
}

function runOnRevealMutable(
  state: V8CalibrationState,
  player: V8CalibrationRuntimePlayer,
  firstFriendlyHereBeforeReveal: boolean,
): void {
  if (!isCalibrationActionEnabled(state, player.runtimeId)) return;
  const card = calibrationPlayerCard(player);
  const opponents = opposingPlayersHere(state, player.side, player.zone);
  pushEvent(state, 'action_triggered', `${card.realName} · ${card.actionName}.`);

  switch (card.actionKey) {
    case 'di_maria_rabona':
      if (!modifyFirstCrossInHandMutable(state, player.side, 3)) generateTacticalMutable(state, player.side, 'cross', card.id);
      break;
    case 'beckham_bend_it':
      generateTacticalMutable(state, player.side, 'cross', card.id, { attModifier: 2 });
      break;
    case 'dzajic_left_foot_whip':
      generateTacticalMutable(state, player.side, 'cross', card.id);
      generateTacticalMutable(state, player.side, 'cross', card.id);
      break;
    case 'valderrama_pause_and_slip': {
      const hasAttPlayer = calibrationPlayersInZone(state, player.side, 'ATT').length > 0;
      generateTacticalMutable(state, player.side, 'through_ball', card.id, { attModifier: hasAttPlayer ? 2 : 0 });
      break;
    }
    case 'charlton_thunderball':
      generateTacticalMutable(state, player.side, 'long_shot', card.id, { metadata: { bonusAttInMid: 2 } });
      break;
    case 'eriksen_whipped_delivery': {
      const attackingCentreBacks = calibrationPlayersInZone(state, player.side, 'ATT')
        .filter((friendly) => calibrationPlayerCard(friendly).position.includes('CB')).length;
      generateTacticalMutable(state, player.side, 'corner', card.id, { attModifier: attackingCentreBacks });
      break;
    }
    case 'duff_knock_and_run': {
      const target = sortHighestDefence(state, opponents)[0];
      if (target) applyModifierMutable(state, target.runtimeId, { defence: -2, lifetime: 'period', source: card.actionName, sourceRuntimeId: player.runtimeId });
      applyModifierMutable(state, player.runtimeId, { attack: 2, lifetime: 'period', source: card.actionName });
      break;
    }
    case 'garrincha_joy_of_the_people': {
      const target = sortHighestDefence(state, opponents.filter(isDefender))[0];
      if (!target) break;
      const wasReduced = hasReducedDefence(state, target.runtimeId);
      applyModifierMutable(state, target.runtimeId, { defence: -2, lifetime: 'period', source: card.actionName, sourceRuntimeId: player.runtimeId });
      if (wasReduced) applyModifierMutable(state, player.runtimeId, { attack: 4, lifetime: 'period', source: card.actionName });
      break;
    }
    case 'okocha_stepover': {
      const target = sortLowestDefence(state, opponents.filter(isDefender))[0];
      if (!target) break;
      const wasReduced = hasReducedDefence(state, target.runtimeId);
      applyModifierMutable(state, target.runtimeId, { defence: -2, lifetime: 'period', source: card.actionName, sourceRuntimeId: player.runtimeId });
      if (wasReduced) generateTacticalMutable(state, player.side, 'penalty', card.id);
      break;
    }
    case 'neymar_rainbow_flick':
      if (opponents.filter(isDefender).some((target) => hasReducedDefence(state, target.runtimeId))) {
        generateTacticalMutable(state, player.side, 'penalty', card.id);
      }
      break;
    case 'ronaldo_flip_flap':
      if (opponents.filter(isDefender).some((target) => currentCalibrationDefence(state, target.runtimeId) <= calibrationPlayerCard(target).printedDefence - 3)) {
        generateTacticalMutable(state, player.side, 'penalty', card.id, { attModifier: 2 });
      }
      break;
    case 'bremner_crunching_tackle': {
      const target = sortHighestAttack(state, opponents)[0];
      if (target) applyModifierMutable(state, target.runtimeId, { attack: -3, lifetime: 'period', source: card.actionName, sourceRuntimeId: player.runtimeId });
      break;
    }
    case 'baresi_step_up':
      generateTacticalMutable(state, player.side, 'offside_trap', card.id, { metadata: { baresiPlayerId: player.runtimeId } });
      break;
    case 'park_three_lungs':
      generateTacticalMutable(state, player.side, 'trigger_press', card.id, { metadata: { freeThroughPeriod: state.period } });
      break;
    case 'sinclair_arrive_unmarked':
      if (firstFriendlyHereBeforeReveal) applyModifierMutable(state, player.runtimeId, { attack: 4, lifetime: 'match', source: card.actionName });
      break;
    default:
      break;
  }
}

export function revealCalibrationPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): V8CalibrationState {
  const next = clone(state);
  const runtimeId = calibrationRuntimeId(side, cardId);
  if (next.players[runtimeId]) throw new Error(`${cardId} is already deployed for ${side}`);
  if (calibrationPlayersInZone(next, side, zone).length >= 4) throw new Error(`${zone} is full`);

  const firstFriendlyHereBeforeReveal = calibrationPlayersInZone(next, side, zone).length === 0;
  next.teams[side].deployedOrder += 1;
  next.players[runtimeId] = {
    runtimeId,
    side,
    cardId,
    zone,
    deployedOrder: next.teams[side].deployedOrder,
    modifiers: [],
  };
  pushEvent(next, 'player_revealed', `${getV8CalibrationPlayer(cardId).realName} reveals in ${zone}.`);

  // Ongoing suppression is established as soon as the card is deployed. A newly revealed card
  // can therefore lose its On Reveal if an active Gentile immediately marks it.
  refreshGentileSuppressionMutable(next);
  runOnRevealMutable(next, next.players[runtimeId]!, firstFriendlyHereBeforeReveal);
  refreshGentileSuppressionMutable(next);
  return next;
}

export function seedCalibrationPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): V8CalibrationState {
  const next = clone(state);
  const runtimeId = calibrationRuntimeId(side, cardId);
  if (next.players[runtimeId]) throw new Error(`${cardId} is already deployed for ${side}`);
  if (calibrationPlayersInZone(next, side, zone).length >= 4) throw new Error(`${zone} is full`);
  next.teams[side].deployedOrder += 1;
  next.players[runtimeId] = {
    runtimeId,
    side,
    cardId,
    zone,
    deployedOrder: next.teams[side].deployedOrder,
    modifiers: [],
  };
  refreshGentileSuppressionMutable(next);
  return next;
}

export function moveCalibrationPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  toZone: V8Zone,
): V8CalibrationState {
  const next = clone(state);
  const runtimeId = calibrationRuntimeId(side, cardId);
  const player = next.players[runtimeId];
  if (!player) throw new Error(`${cardId} is not deployed`);
  if (player.zone === toZone) throw new Error('Player is already in that zone');
  if (calibrationPlayersInZone(next, side, toZone).length >= 4) throw new Error(`${toZone} is full`);
  if (!isCalibrationActionEnabled(next, runtimeId)) throw new Error('Player has no active movement Action');

  const card = calibrationPlayerCard(player);
  if (card.actionKey !== 'cafu_pendolino' && card.actionKey !== 'beckenbauer_der_kaiser') throw new Error('Player is not Moveable');
  const moveKey = counterKey('move', runtimeId);
  if (getCounter(next, moveKey) > 0) throw new Error('Player has already moved this period');

  const fromZone = player.zone;
  player.zone = toZone;
  bumpCounter(next, moveKey);
  pushEvent(next, 'player_moved', `${card.realName} moves ${fromZone} → ${toZone}.`);

  if (card.actionKey === 'cafu_pendolino' && ZONE_INDEX[toZone] > ZONE_INDEX[fromZone]) {
    generateTacticalMutable(next, side, 'cross', card.id);
  }
  if (card.actionKey === 'beckenbauer_der_kaiser') {
    applyModifierMutable(next, runtimeId, { attack: 2, defence: 2, lifetime: 'period', source: card.actionName });
  }

  refreshGentileSuppressionMutable(next);
  return next;
}

function activeSpecialists(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  zone: V8Zone,
  actionKey: V8CalibrationPlayerCard['actionKey'],
): V8CalibrationRuntimePlayer[] {
  return calibrationPlayersInZone(state, side, zone)
    .filter((player) => calibrationPlayerCard(player).actionKey === actionKey && isCalibrationActionEnabled(state, player.runtimeId));
}

export function previewCalibrationTacticalCost(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
): number {
  let cost = tacticalBaseCost(card, state.period);
  if (card.type !== 'long_shot') return cost;

  const unusedLloyd = activeSpecialists(state, side, zone, 'lloyd_halfway_hit')
    .find((player) => getCounter(state, counterKey('lloyd-free-long-shot', player.runtimeId, zone), 'match') === 0);
  if (unusedLloyd) cost = 0;
  return cost;
}

function consumeLloydDiscountMutable(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
): void {
  if (card.type !== 'long_shot') return;
  const unusedLloyd = activeSpecialists(state, side, zone, 'lloyd_halfway_hit')
    .find((player) => getCounter(state, counterKey('lloyd-free-long-shot', player.runtimeId, zone), 'match') === 0);
  if (!unusedLloyd) return;
  bumpCounter(state, counterKey('lloyd-free-long-shot', unusedLloyd.runtimeId, zone), 'match');
}

function chanceSpecialistsMutable(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
): { bonus: number; uncancellable: boolean; labels: string[] } {
  let bonus = 0;
  let uncancellable = !card.cancellable;
  const labels: string[] = [];

  if (card.type === 'cross') {
    for (const wambach of activeSpecialists(state, side, zone, 'wambach_diving_header')) {
      const amount = zone === 'ATT' ? 4 : 3;
      bonus += amount;
      labels.push(`${calibrationPlayerCard(wambach).actionName} +${amount}`);
    }
    for (const ada of activeSpecialists(state, side, zone, 'hegerberg_front_post_dart')) {
      const key = counterKey('ada-first-cross', ada.runtimeId, zone);
      if (getCounter(state, key) > 0) continue;
      bumpCounter(state, key);
      bonus += 4;
      uncancellable = true;
      labels.push('FRONT-POST DART +4 · uncancellable');
    }
  }

  if (card.type === 'through_ball') {
    for (const morgan of activeSpecialists(state, side, zone, 'morgan_curved_run')) {
      uncancellable = true;
      const key = counterKey('morgan-first-through-ball', morgan.runtimeId, zone);
      if (getCounter(state, key) === 0) {
        bumpCounter(state, key);
        bonus += 1;
        labels.push('CURVED RUN +1 · uncancellable');
      } else {
        labels.push('CURVED RUN · uncancellable');
      }
    }
    for (const shevchenko of activeSpecialists(state, side, zone, 'shevchenko_runs_in_behind')) {
      const key = counterKey('shevchenko-first-through-ball', shevchenko.runtimeId, zone);
      if (getCounter(state, key) > 0) continue;
      bumpCounter(state, key);
      bonus += 4;
      labels.push('RUNS IN BEHIND +4');
    }
  }

  if (card.type === 'long_shot') {
    for (const lloyd of activeSpecialists(state, side, zone, 'lloyd_halfway_hit')) {
      bonus += 4;
      labels.push(`${calibrationPlayerCard(lloyd).actionName} +4`);
    }
  }

  if (card.type === 'corner') {
    for (const ramos of activeSpecialists(state, side, zone, 'ramos_93rd_minute')) {
      const amount = state.period === 4 ? 5 : 3;
      bonus += amount;
      labels.push(`${calibrationPlayerCard(ramos).actionName} +${amount}`);
    }
  }

  if (card.type === 'penalty') {
    for (const panenka of activeSpecialists(state, side, zone, 'panenka_chipped_penalty')) {
      bonus += 3;
      uncancellable = true;
      labels.push(`${calibrationPlayerCard(panenka).actionName} +3 · uncancellable`);
    }
  }

  return { bonus, uncancellable, labels };
}

function cancellationAttemptsMutable(
  state: V8CalibrationState,
  attackingSide: V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
): { attempted: boolean; successfulBaresiRuntimeId?: string; labels: string[] } {
  const defendingSide = otherSide(attackingSide);
  let attempted = false;
  let successfulBaresiRuntimeId: string | undefined;
  const labels: string[] = [];

  if (card.type === 'through_ball') {
    const trapIndex = state.offsideTraps.findIndex((trap) => trap.side === defendingSide && trap.zone === zone);
    if (trapIndex >= 0) {
      const [trap] = state.offsideTraps.splice(trapIndex, 1);
      attempted = true;
      successfulBaresiRuntimeId = trap?.sourceBaresiRuntimeId;
      labels.push('OFFSIDE TRAP');
    }
  }

  for (const schmeichel of activeSpecialists(state, defendingSide, zone, 'schmeichel_starfish')) {
    const key = counterKey('schmeichel-first-chance', schmeichel.runtimeId, zone);
    if (getCounter(state, key) > 0) continue;
    bumpCounter(state, key);
    attempted = true;
    labels.push('STARFISH');
  }

  return { attempted, successfulBaresiRuntimeId, labels };
}

function removeTacticalFromHandMutable(state: V8CalibrationState, side: V8CalibrationSide, cardId: string): void {
  const index = state.teams[side].hand.findIndex((entry) => entry.kind === 'tactical' && entry.card.id === cardId);
  if (index >= 0) state.teams[side].hand.splice(index, 1);
}

export function playCalibrationTactical(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean } = {},
): V8CalibrationState {
  const next = clone(state);
  const handEntry = next.teams[side].hand.find((entry) => entry.kind === 'tactical' && entry.card.id === cardId);
  if (!handEntry || handEntry.kind !== 'tactical') throw new Error(`Tactical card ${cardId} is not in hand`);
  const card = handEntry.card;
  if (!tacticalCanPlayInZone(card, zone)) throw new Error(`${card.name} cannot be played in ${zone}`);

  const cost = previewCalibrationTacticalCost(next, side, card, zone);
  if (!options.ignoreEnergy && next.teams[side].energy < cost) throw new Error('Not enough energy');
  if (!options.ignoreEnergy) next.teams[side].energy -= cost;
  consumeLloydDiscountMutable(next, side, card, zone);
  pushEvent(next, 'tactical_played', `${side.toUpperCase()} plays ${card.name} in ${zone} for ${cost} Energy.`);

  if (card.type === 'offside_trap') {
    next.offsideTraps.push({
      id: card.id,
      side,
      zone: 'DEF',
      sourceBaresiRuntimeId: typeof card.metadata.baresiPlayerId === 'string' ? card.metadata.baresiPlayerId : undefined,
    });
    removeTacticalFromHandMutable(next, side, card.id);
    return next;
  }

  if (card.type === 'trigger_press') {
    next.triggerPress[side][zone] = true;
    removeTacticalFromHandMutable(next, side, card.id);
    return next;
  }

  if (!isV8ChanceType(card.type)) throw new Error(`Unsupported Tactical type: ${card.type}`);

  // Protection and first-card specialist state are snapped at play time, before cancellation.
  const specialists = chanceSpecialistsMutable(next, side, card, zone);
  const cancellation = cancellationAttemptsMutable(next, side, card, zone);
  const cancelled = cancellation.attempted && !specialists.uncancellable;
  let attack = 0;

  if (cancelled) {
    pushEvent(next, 'chance_cancelled', `${card.name} is cancelled by ${cancellation.labels.join(' + ')}.`);
    if (card.type === 'through_ball' && cancellation.successfulBaresiRuntimeId) {
      const baresi = next.players[cancellation.successfulBaresiRuntimeId];
      if (baresi) {
        next.zoneDefenceBonus[baresi.side][baresi.zone] += 2;
        pushEvent(next, 'action_triggered', `${calibrationPlayerCard(baresi).realName} · STEP UP: +2 DEF in ${baresi.zone} this period.`);
      }
    }
  } else {
    attack = tacticalPrintedAttack(card, zone) + specialists.bonus;
    next.tacticalAttack[side][zone] += attack;
    pushEvent(next, 'chance_resolved', `${card.name} resolves in ${zone} for +${attack} ATT${specialists.labels.length ? ` (${specialists.labels.join(', ')})` : ''}.`);
  }

  next.tacticalResolutions.push({
    cardId: card.id,
    type: card.type,
    side,
    zone,
    cost,
    cancelled,
    attack,
    uncancellable: specialists.uncancellable,
    specialistBonuses: specialists.labels,
  });
  removeTacticalFromHandMutable(next, side, card.id);
  return next;
}

export function calibrationZoneWinner(state: V8CalibrationState, zone: V8Zone): V8CalibrationSide | 'draw' {
  const home = calibrationZoneTotals(state, 'home', zone).power;
  const away = calibrationZoneTotals(state, 'away', zone).power;
  if (home === away) return 'draw';
  return home > away ? 'home' : 'away';
}

function drawTwoMutable(state: V8CalibrationState, side: V8CalibrationSide): void {
  const team = state.teams[side];
  const drawn = team.drawPile.splice(0, 2);
  team.hand.push(...drawn.map((cardId) => ({ kind: 'player' as const, cardId })));
}

export function endV8CalibrationPeriod(state: V8CalibrationState): V8CalibrationState {
  const next = clone(state);
  const midWinner = calibrationZoneWinner(next, 'MID');
  for (const zone of ZONES) {
    const winner = calibrationZoneWinner(next, zone);
    pushEvent(next, 'zone_winner', `${zone}: ${winner === 'draw' ? 'draw' : `${winner.toUpperCase()} wins`}.`);
  }

  for (const side of ['home', 'away'] as const) {
    if (midWinner !== side) continue;
    for (const litmanen of activeSpecialists(next, side, 'MID', 'litmanen_killer_pass')) {
      generateTacticalMutable(next, side, 'through_ball', calibrationPlayerCard(litmanen).id, { attModifier: 1 });
    }
  }

  pushEvent(next, 'period_end', `Period ${next.period} ends.`);

  for (const player of Object.values(next.players)) {
    player.modifiers = player.modifiers.filter((modifier) => modifier.lifetime === 'match');
  }
  next.periodCounters = {};
  next.tacticalAttack = { home: emptyNumbers(), away: emptyNumbers() };
  next.zoneDefenceBonus = { home: emptyNumbers(), away: emptyNumbers() };
  next.triggerPress = { home: emptyFlags(), away: emptyFlags() };
  next.offsideTraps = [];
  next.tacticalResolutions = [];

  if (next.period < 4) {
    next.period += 1;
    const energy = ENERGY_CURVE[next.period - 1] ?? 0;
    for (const side of ['home', 'away'] as const) {
      next.teams[side].energy = energy;
      drawTwoMutable(next, side);
    }
    pushEvent(next, 'period_start', `Period ${next.period} starts with ${energy} Energy.`);
  }

  refreshGentileSuppressionMutable(next);
  return next;
}

export function calibrationHandTacticals(state: V8CalibrationState, side: V8CalibrationSide): V8TacticalCardInstance[] {
  return state.teams[side].hand
    .filter((entry): entry is Extract<V8CalibrationHandCard, { kind: 'tactical' }> => entry.kind === 'tactical')
    .map((entry) => entry.card);
}

export function calibrationHandPlayers(state: V8CalibrationState, side: V8CalibrationSide): V8CalibrationPlayerCard[] {
  return state.teams[side].hand
    .filter((entry): entry is Extract<V8CalibrationHandCard, { kind: 'player' }> => entry.kind === 'player')
    .map((entry) => getV8CalibrationPlayer(entry.cardId));
}

export function removeCalibrationPlayerFromHand(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  options: { ignoreEnergy?: boolean } = {},
): V8CalibrationState {
  const next = clone(state);
  const index = next.teams[side].hand.findIndex((entry) => entry.kind === 'player' && entry.cardId === cardId);
  if (index < 0) throw new Error(`${cardId} is not in hand`);
  const card = getV8CalibrationPlayer(cardId);
  if (!options.ignoreEnergy && next.teams[side].energy < card.cost) throw new Error('Not enough energy');
  if (!options.ignoreEnergy) next.teams[side].energy -= card.cost;
  next.teams[side].hand.splice(index, 1);
  return next;
}

export function spendCalibrationTacticalFromHand(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): { state: V8CalibrationState; card: V8TacticalCardInstance; cost: number } {
  const next = clone(state);
  const index = next.teams[side].hand.findIndex((entry) => entry.kind === 'tactical' && entry.card.id === cardId);
  if (index < 0) throw new Error(`${cardId} is not in hand`);
  const entry = next.teams[side].hand[index];
  if (!entry || entry.kind !== 'tactical') throw new Error(`${cardId} is not a Tactical card`);
  if (!tacticalCanPlayInZone(entry.card, zone)) throw new Error(`${entry.card.name} cannot be played in ${zone}`);
  const cost = previewCalibrationTacticalCost(next, side, entry.card, zone);
  if (next.teams[side].energy < cost) throw new Error('Not enough energy');
  next.teams[side].energy -= cost;
  consumeLloydDiscountMutable(next, side, entry.card, zone);
  const [removed] = next.teams[side].hand.splice(index, 1);
  if (!removed || removed.kind !== 'tactical') throw new Error('Failed to remove Tactical card');
  return { state: next, card: removed.card, cost };
}

export function resolveCommittedCalibrationTactical(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
  paidCost: number,
): V8CalibrationState {
  const next = clone(state);
  // Put the already-paid instance back into a temporary hand slot so the canonical resolver owns
  // cancellation/specialist semantics without charging Energy a second time.
  next.teams[side].hand.push({ kind: 'tactical', card });
  const resolved = playCalibrationTactical(next, side, card.id, zone, { ignoreEnergy: true });
  const latest = resolved.tacticalResolutions[resolved.tacticalResolutions.length - 1];
  if (latest) latest.cost = paidCost;
  return resolved;
}

export function tacticalDefinition(type: V8TacticalType) {
  return V8_TACTICAL_DEFINITIONS[type];
}
