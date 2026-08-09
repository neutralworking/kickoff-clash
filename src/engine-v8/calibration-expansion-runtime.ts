export * from './calibration-runtime';

import { getV8CalibrationPlayer } from './calibration-cards';
import type { V8Zone } from './core';
import { isV8ChanceType, type V8TacticalCardInstance } from './tactical';
import * as base from './calibration-runtime';

const ZONE_INDEX: Record<V8Zone, number> = { DEF: 0, MID: 1, ATT: 2 };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: base.V8CalibrationSide): base.V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

function adjacent(a: V8Zone, b: V8Zone): boolean {
  return Math.abs(ZONE_INDEX[a] - ZONE_INDEX[b]) === 1;
}

function laudrupMoveKey(runtimeId: string): string {
  return `laudrup-gliding-run:${runtimeId}`;
}

function laudrupProtectionKey(runtimeId: string): string {
  return `laudrup-gliding-run-protection:${runtimeId}`;
}

function maradonaMoveKey(runtimeId: string): string {
  return `maradona-slalom-run:${runtimeId}`;
}

function maradonaProtectionKey(runtimeId: string): string {
  return `maradona-slalom-run-protection:${runtimeId}`;
}

function bergkampFirstTouchKey(runtimeId: string): string {
  return `bergkamp-first-touch:${runtimeId}`;
}

function zoneCode(zone: V8Zone): number {
  return ZONE_INDEX[zone] + 1;
}

function zoneFromCode(value: number): V8Zone | undefined {
  return value === 1 ? 'DEF' : value === 2 ? 'MID' : value === 3 ? 'ATT' : undefined;
}

function davidsFollowKey(runtimeId: string): string {
  return `davids-pitbull:${runtimeId}`;
}

function applyDavidsPursuit(
  state: base.V8CalibrationState,
  movingSide: base.V8CalibrationSide,
  movingCardId: string,
  fromZone: V8Zone,
  toZone: V8Zone,
): base.V8CalibrationState {
  const movingCard = getV8CalibrationPlayer(movingCardId);
  if (!movingCard.naturalZones.includes('MID')) return state;

  let next = state;
  const movingRuntimeId = base.calibrationRuntimeId(movingSide, movingCardId);
  const candidates = base.calibrationPlayersInZone(next, otherSide(movingSide), fromZone)
    .filter((player) =>
      player.cardId === 'davids'
      && base.isCalibrationActionEnabled(next, player.runtimeId)
      && (next.periodCounters[davidsFollowKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  const davids = candidates.find((player) => base.calibrationPlayersInZone(next, player.side, toZone).length < 4);
  if (!davids) return next;

  next = clone(next);
  const liveDavids = next.players[davids.runtimeId]!;
  liveDavids.zone = toZone;
  next.periodCounters[davidsFollowKey(liveDavids.runtimeId)] = 1;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer('davids').realName} · PITBULL follows ${movingCard.realName}.`,
  });
  next.events.push({
    type: 'player_moved',
    period: next.period,
    text: `${getV8CalibrationPlayer('davids').realName} follows ${fromZone} → ${toZone}.`,
  });
  next = base.applyCalibrationModifier(next, movingRuntimeId, {
    attack: -2,
    lifetime: 'period',
    source: 'PITBULL',
    sourceRuntimeId: liveDavids.runtimeId,
  });
  return base.refreshCalibrationSuppression(next);
}

function moveLaudrup(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  toZone: V8Zone,
): base.V8CalibrationState {
  let next = clone(state);
  const runtimeId = base.calibrationRuntimeId(side, 'brian-laudrup');
  const player = next.players[runtimeId];
  if (!player) throw new Error('brian-laudrup is not deployed');
  if (player.zone === toZone) throw new Error('Player is already in that zone');
  if (!adjacent(player.zone, toZone)) throw new Error('GLIDING RUN moves one adjacent zone');
  if (base.calibrationPlayersInZone(next, side, toZone).length >= 4) throw new Error(`${toZone} is full`);
  if (!base.isCalibrationActionEnabled(next, runtimeId)) throw new Error('Player has no active movement Action');
  if ((next.periodCounters[laudrupMoveKey(runtimeId)] ?? 0) > 0) throw new Error('Player has already moved this period');

  const from = player.zone;
  player.zone = toZone;
  next.periodCounters[laudrupMoveKey(runtimeId)] = 1;
  next.periodCounters[laudrupProtectionKey(runtimeId)] = zoneCode(toZone);
  next.events.push({
    type: 'player_moved',
    period: next.period,
    text: `${getV8CalibrationPlayer('brian-laudrup').realName} · GLIDING RUN ${from} → ${toZone}.`,
  });
  return base.refreshCalibrationSuppression(next);
}

function moveMaradona(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  toZone: V8Zone,
): base.V8CalibrationState {
  let next = clone(state);
  const runtimeId = base.calibrationRuntimeId(side, 'maradona');
  const player = next.players[runtimeId];
  if (!player) throw new Error('maradona is not deployed');
  if (player.zone === toZone) throw new Error('Player is already in that zone');
  if (!adjacent(player.zone, toZone)) throw new Error('SLALOM RUN moves one adjacent zone');
  if (!getV8CalibrationPlayer('maradona').naturalZones.includes(toZone)) throw new Error('SLALOM RUN can only move between natural zones');
  if (base.calibrationPlayersInZone(next, side, toZone).length >= 4) throw new Error(`${toZone} is full`);
  if (!base.isCalibrationActionEnabled(next, runtimeId)) throw new Error('Player has no active movement Action');
  if ((next.matchCounters[maradonaMoveKey(runtimeId)] ?? 0) > 0) throw new Error('Player has already moved this match');

  const from = player.zone;
  player.zone = toZone;
  next.matchCounters[maradonaMoveKey(runtimeId)] = 1;
  next.events.push({
    type: 'player_moved',
    period: next.period,
    text: `${getV8CalibrationPlayer('maradona').realName} · SLALOM RUN ${from} → ${toZone}.`,
  });

  if (from === 'MID' && toZone === 'ATT') {
    next = base.applyCalibrationModifier(next, runtimeId, {
      attack: 4,
      lifetime: 'period',
      source: 'SLALOM RUN',
    });
    next.periodCounters[maradonaProtectionKey(runtimeId)] = zoneCode('ATT');
  }
  return base.refreshCalibrationSuppression(next);
}

/**
 * Movement listener layer: GLIDING RUN and SLALOM RUN own their movement allowances; PITBULL reacts
 * to opposing midfielder movement produced by this runtime and follows into the destination.
 */
export function moveCalibrationPlayer(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  cardId: string,
  toZone: V8Zone,
): base.V8CalibrationState {
  const runtimeId = base.calibrationRuntimeId(side, cardId);
  const fromZone = state.players[runtimeId]?.zone;
  if (!fromZone) throw new Error(`${cardId} is not deployed`);

  let next = cardId === 'brian-laudrup'
    ? moveLaudrup(state, side, toZone)
    : cardId === 'maradona'
      ? moveMaradona(state, side, toZone)
      : base.moveCalibrationPlayer(state, side, cardId, toZone);

  next = applyDavidsPursuit(next, side, cardId, fromZone, toZone);
  return next;
}

interface ActiveChanceProtection {
  player: base.V8CalibrationRuntimePlayer;
  counterKey: string;
  actionName: string;
}

function activeChanceProtection(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  zone: V8Zone,
): ActiveChanceProtection | undefined {
  const protections: ActiveChanceProtection[] = [];
  for (const player of Object.values(state.players)) {
    if (player.side !== side || !base.isCalibrationActionEnabled(state, player.runtimeId)) continue;
    if (player.cardId === 'brian-laudrup') {
      const key = laudrupProtectionKey(player.runtimeId);
      if (zoneFromCode(state.periodCounters[key] ?? 0) === zone) {
        protections.push({ player, counterKey: key, actionName: 'GLIDING RUN' });
      }
    }
    if (player.cardId === 'maradona') {
      const key = maradonaProtectionKey(player.runtimeId);
      if (zoneFromCode(state.periodCounters[key] ?? 0) === zone) {
        protections.push({ player, counterKey: key, actionName: 'SLALOM RUN' });
      }
    }
  }
  return protections.sort((a, b) =>
    a.player.deployedOrder - b.player.deployedOrder || a.player.runtimeId.localeCompare(b.player.runtimeId)
  )[0];
}

function prepareChanceProtection(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): base.V8CalibrationState {
  const tactical = base.calibrationHandTacticals(state, side).find((card) => card.id === cardId);
  if (!tactical || !isV8ChanceType(tactical.type)) return state;
  const protection = activeChanceProtection(state, side, zone);
  if (!protection) return state;

  const next = clone(state);
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (!entry || entry.kind !== 'tactical') return state;
  entry.card.cancellable = false;
  next.periodCounters[protection.counterKey] = 0;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer(protection.player.cardId).realName} · ${protection.actionName} protects ${entry.card.name} in ${zone}.`,
  });
  return next;
}

function prepareBergkampFirstTouch(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  cardId: string,
): base.V8CalibrationState {
  const tactical = base.calibrationHandTacticals(state, side).find((card) => card.id === cardId);
  if (!tactical || !isV8ChanceType(tactical.type)) return state;
  const bergkamp = Object.values(state.players)
    .filter((player) =>
      player.side === side
      && player.cardId === 'bergkamp'
      && base.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[bergkampFirstTouchKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
  if (!bergkamp) return state;

  const next = clone(state);
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (!entry || entry.kind !== 'tactical') return state;
  entry.card.attModifier += 2;
  next.periodCounters[bergkampFirstTouchKey(bergkamp.runtimeId)] = 1;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer('bergkamp').realName} · FIRST TOUCH gives ${entry.card.name} +2 ATT.`,
  });
  return next;
}

function removeLatestResolvedEvent(
  state: base.V8CalibrationState,
  tacticalName: string,
): void {
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index];
    if (event?.type === 'chance_resolved' && event.text.startsWith(`${tacticalName} resolves`)) {
      state.events.splice(index, 1);
      return;
    }
  }
}

/**
 * Chance-resolution layer: FIRST TOUCH enhances the first team Chance; movement Actions can protect
 * one destination Chance; TIMED SLIDE then cancels an otherwise-resolving Through Ball.
 */
export function playCalibrationTactical(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean } = {},
): base.V8CalibrationState {
  const tacticalBefore = base.calibrationHandTacticals(state, side).find((card) => card.id === cardId);
  const touched = prepareBergkampFirstTouch(state, side, cardId);
  const prepared = prepareChanceProtection(touched, side, cardId, zone);
  let next = base.playCalibrationTactical(prepared, side, cardId, zone, options);
  if (!tacticalBefore || tacticalBefore.type !== 'through_ball') return next;

  const defendingSide = otherSide(side);
  const defendingZone = base.opposingDepthZone(zone);
  const nesta = base.calibrationPlayersInZone(prepared, defendingSide, defendingZone)
    .find((player) =>
      player.cardId === 'nesta'
      && base.isCalibrationActionEnabled(prepared, player.runtimeId)
      && (prepared.periodCounters[`nesta-timed-slide:${player.runtimeId}`] ?? 0) === 0
    );
  if (!nesta) return next;

  const resolution = [...next.tacticalResolutions].reverse()
    .find((candidate) => candidate.cardId === cardId && candidate.side === side);
  if (!resolution || resolution.cancelled || resolution.uncancellable || resolution.attack <= 0) return next;

  next = clone(next);
  const liveResolution = [...next.tacticalResolutions].reverse()
    .find((candidate) => candidate.cardId === cardId && candidate.side === side)!;
  next.tacticalAttack[side][zone] -= liveResolution.attack;
  liveResolution.cancelled = true;
  liveResolution.attack = 0;
  next.periodCounters[`nesta-timed-slide:${nesta.runtimeId}`] = 1;
  removeLatestResolvedEvent(next, tacticalBefore.name);
  next.events.push({
    type: 'chance_cancelled',
    period: next.period,
    text: `${tacticalBefore.name} is cancelled by ${getV8CalibrationPlayer('nesta').actionName}.`,
  });
  return next;
}

export function resolveCommittedCalibrationTactical(
  state: base.V8CalibrationState,
  side: base.V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
  paidCost: number,
): base.V8CalibrationState {
  const next = clone(state);
  next.teams[side].hand.push({ kind: 'tactical', card });
  const resolved = playCalibrationTactical(next, side, card.id, zone, { ignoreEnergy: true });
  const latest = resolved.tacticalResolutions[resolved.tacticalResolutions.length - 1];
  if (latest) latest.cost = paidCost;
  return resolved;
}

export interface V8ExpansionResolvedWindowPlay {
  side: base.V8CalibrationSide;
  card: V8TacticalCardInstance;
  zone: V8Zone;
  cost: number;
}

/** Uses the expansion Tactical wrapper for generated-window Chances while preserving utility-first ordering. */
export function resolveGeneratedTacticalWindow(
  state: base.V8CalibrationState,
  plays: readonly base.V8CalibrationWindowPlay[],
): { state: base.V8CalibrationState; plays: V8ExpansionResolvedWindowPlay[] } {
  let next = state;
  const resolved: V8ExpansionResolvedWindowPlay[] = [];
  const isUtility = (play: base.V8CalibrationWindowPlay): boolean => {
    const card = base.calibrationHandTacticals(next, play.side).find((candidate) => candidate.id === play.cardId);
    return card !== undefined && !isV8ChanceType(card.type);
  };
  const ordered = [...plays.filter((play) => isUtility(play)), ...plays.filter((play) => !isUtility(play))];

  for (const play of ordered) {
    const card = base.calibrationHandTacticals(next, play.side).find((candidate) => candidate.id === play.cardId);
    if (!card) throw new Error(`Tactical card ${play.cardId} is not in hand`);
    if (!base.isWindowEligibleTactical(next, card)) {
      throw new Error(`${card.name} was not generated this period and is not window-eligible`);
    }
    const cost = base.previewCalibrationTacticalCost(next, play.side, card, play.zone);
    next = playCalibrationTactical(next, play.side, play.cardId, play.zone, { window: true });
    resolved.push({ side: play.side, card, zone: play.zone, cost });
  }

  return { state: next, plays: resolved };
}