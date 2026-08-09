export * from './calibration-expansion-batch-04-runtime';

import './calibration-expansion-batch-05-cards';
import { getV8CalibrationPlayer } from './calibration-cards';
import type { V8Zone } from './core';
import {
  V8_TACTICAL_DEFINITIONS,
  isV8ChanceType,
  type V8TacticalCardInstance,
} from './tactical';
import { applyV8Batch05TypedChanceSuppression } from './calibration-expansion-batch-05-chance-suppression';
import * as runtime from './calibration-expansion-batch-04-runtime';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: runtime.V8CalibrationSide): runtime.V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

function latestResolution(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationTacticalResolution | undefined {
  return [...state.tacticalResolutions].reverse()
    .find((resolution) => resolution.side === side && resolution.cardId === cardId);
}

function actionPlayer(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone?: V8Zone,
): runtime.V8CalibrationRuntimePlayer | undefined {
  return Object.values(state.players)
    .filter((player) =>
      player.side === side
      && player.cardId === cardId
      && (zone === undefined || player.zone === zone)
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function removeLatestChanceResolvedEvent(state: runtime.V8CalibrationState, minimumIndex: number): void {
  for (let index = state.events.length - 1; index >= minimumIndex; index -= 1) {
    if (state.events[index]?.type === 'chance_resolved') {
      state.events.splice(index, 1);
      return;
    }
  }
}

interface CounterSnapshot {
  bag: 'period' | 'match';
  key: string;
  value?: number;
}

function setCounter(
  state: runtime.V8CalibrationState,
  bag: CounterSnapshot['bag'],
  key: string,
  value: number,
): CounterSnapshot {
  const target = bag === 'period' ? state.periodCounters : state.matchCounters;
  const snapshot: CounterSnapshot = { bag, key, value: target[key] };
  target[key] = value;
  return snapshot;
}

/**
 * Batch 04 owns Banks/Terry reactions after friendly Chance enhancement. Batch 05 inserts typed
 * suppression immediately before those reactions by temporarily marking Banks/Terry as spent,
 * letting the established Batch 04 pipeline finish its friendly work, restoring the counters,
 * then resolving suppression → Banks → Terry in the intended order.
 */
function deferThresholdDefenders(
  state: runtime.V8CalibrationState,
  attackingSide: runtime.V8CalibrationSide,
): { state: runtime.V8CalibrationState; snapshots: CounterSnapshot[] } {
  const next = clone(state);
  const snapshots: CounterSnapshot[] = [];
  const defendingSide = otherSide(attackingSide);

  for (const player of Object.values(next.players).filter((candidate) => candidate.side === defendingSide)) {
    if (player.cardId === 'gordon-banks') {
      snapshots.push(setCounter(next, 'match', `banks-impossible-save:${player.runtimeId}`, 1));
    }
    if (player.cardId === 'john-terry') {
      snapshots.push(setCounter(next, 'match', `terry-head-where-it-hurts-used:${player.runtimeId}`, 1));
      snapshots.push({
        bag: 'period',
        key: `terry-head-where-it-hurts-seen:${player.runtimeId}`,
        value: next.periodCounters[`terry-head-where-it-hurts-seen:${player.runtimeId}`],
      });
    }
  }
  return { state: next, snapshots };
}

function restoreCounters(state: runtime.V8CalibrationState, snapshots: readonly CounterSnapshot[]): runtime.V8CalibrationState {
  if (snapshots.length === 0) return state;
  const next = clone(state);
  for (const snapshot of snapshots) {
    const target = snapshot.bag === 'period' ? next.periodCounters : next.matchCounters;
    if (snapshot.value === undefined) delete target[snapshot.key];
    else target[snapshot.key] = snapshot.value;
  }
  return next;
}

function prepareDeadBallArtistBonus(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationState {
  const card = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (!card || card.metadata.deadBallArtistPeriod !== state.period) return state;
  const sourceRuntimeId = typeof card.metadata.deadBallArtistRuntimeId === 'string'
    ? card.metadata.deadBallArtistRuntimeId
    : undefined;
  if (!sourceRuntimeId) return state;
  const key = `nakamura-dead-ball-artist:${sourceRuntimeId}`;
  if ((state.periodCounters[key] ?? 0) > 0) return state;

  const next = clone(state);
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (!entry || entry.kind !== 'tactical') return state;
  entry.card.attModifier += 2;
  next.periodCounters[key] = 1;
  next.events.push({
    type: 'tactical_modified',
    period: next.period,
    text: `${getV8CalibrationPlayer('shunsuke-nakamura').realName} · DEAD BALL ARTIST gives ${entry.card.name} +2 ATT.`,
  });
  return next;
}

function cancelResolution(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  eventStart: number,
  reason: string,
): runtime.V8CalibrationState {
  const next = clone(state);
  const resolution = latestResolution(next, side, cardId);
  if (!resolution || resolution.cancelled) return state;
  next.tacticalAttack[side][resolution.zone] -= resolution.attack;
  resolution.attack = 0;
  resolution.cancelled = true;
  removeLatestChanceResolvedEvent(next, eventStart);
  next.events.push({ type: 'chance_cancelled', period: next.period, text: reason });
  return next;
}

function applyDeferredBanks(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  eventStart: number,
): runtime.V8CalibrationState {
  const resolution = latestResolution(state, side, cardId);
  if (!resolution || resolution.zone !== 'ATT' || resolution.cancelled || resolution.uncancellable || resolution.attack < 4) return state;
  const banks = actionPlayer(state, otherSide(side), 'gordon-banks', 'DEF');
  if (!banks) return state;
  const key = `banks-impossible-save:${banks.runtimeId}`;
  if ((state.matchCounters[key] ?? 0) > 0) return state;

  let next = cancelResolution(
    state,
    side,
    cardId,
    eventStart,
    `${getV8CalibrationPlayer('gordon-banks').realName} · IMPOSSIBLE SAVE cancels the Chance.`,
  );
  next = clone(next);
  next.matchCounters[key] = 1;
  return next;
}

function applyDeferredTerry(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  eventStart: number,
): runtime.V8CalibrationState {
  const resolution = latestResolution(state, side, cardId);
  if (!resolution || resolution.zone !== 'ATT' || resolution.cancelled) return state;
  const terry = actionPlayer(state, otherSide(side), 'john-terry', 'DEF');
  if (!terry) return state;
  const seenKey = `terry-head-where-it-hurts-seen:${terry.runtimeId}`;
  const usedKey = `terry-head-where-it-hurts-used:${terry.runtimeId}`;

  let next = clone(state);
  const seen = (next.periodCounters[seenKey] ?? 0) + 1;
  next.periodCounters[seenKey] = seen;
  if (seen !== 2 || (next.matchCounters[usedKey] ?? 0) > 0 || resolution.uncancellable) return next;

  next = cancelResolution(
    next,
    side,
    cardId,
    eventStart,
    `${getV8CalibrationPlayer('john-terry').realName} · HEAD WHERE IT HURTS cancels the second ATT Chance this period.`,
  );
  next = runtime.applyCalibrationModifier(next, terry.runtimeId, {
    defence: -3,
    lifetime: 'match',
    source: 'HEAD WHERE IT HURTS',
  });
  next.matchCounters[usedKey] = 1;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer('john-terry').realName} · HEAD WHERE IT HURTS costs 3 DEF for the match.`,
  });
  return next;
}

export function playCalibrationTactical(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean } = {},
): runtime.V8CalibrationState {
  const card = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (!card || !isV8ChanceType(card.type)) return runtime.playCalibrationTactical(state, side, cardId, zone, options);

  const eventStart = state.events.length;
  const enhanced = prepareDeadBallArtistBonus(state, side, cardId);
  const deferred = deferThresholdDefenders(enhanced, side);
  let next = runtime.playCalibrationTactical(deferred.state, side, cardId, zone, options);
  next = restoreCounters(next, deferred.snapshots);
  next = applyV8Batch05TypedChanceSuppression(next, side, cardId);
  next = applyDeferredBanks(next, side, cardId, eventStart);
  return applyDeferredTerry(next, side, cardId, eventStart);
}

export function resolveCommittedCalibrationTactical(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  card: V8TacticalCardInstance,
  zone: V8Zone,
  paidCost: number,
): runtime.V8CalibrationState {
  const next = clone(state);
  next.teams[side].hand.push({ kind: 'tactical', card });
  const resolved = playCalibrationTactical(next, side, card.id, zone, { ignoreEnergy: true });
  const latest = latestResolution(resolved, side, card.id);
  if (latest) latest.cost = paidCost;
  return resolved;
}

export interface V8Batch05ResolvedWindowPlay {
  side: runtime.V8CalibrationSide;
  card: V8TacticalCardInstance;
  zone: V8Zone;
  cost: number;
}

export function resolveGeneratedTacticalWindow(
  state: runtime.V8CalibrationState,
  plays: readonly runtime.V8CalibrationWindowPlay[],
): { state: runtime.V8CalibrationState; plays: V8Batch05ResolvedWindowPlay[] } {
  let next = state;
  const resolved: V8Batch05ResolvedWindowPlay[] = [];
  const isUtility = (play: runtime.V8CalibrationWindowPlay): boolean => {
    const card = runtime.calibrationHandTacticals(next, play.side).find((candidate) => candidate.id === play.cardId);
    return card !== undefined && !isV8ChanceType(card.type);
  };
  const ordered = [...plays.filter((play) => isUtility(play)), ...plays.filter((play) => !isUtility(play))];

  for (const play of ordered) {
    const card = runtime.calibrationHandTacticals(next, play.side).find((candidate) => candidate.id === play.cardId);
    if (!card) throw new Error(`Tactical card ${play.cardId} is not in hand`);
    if (!runtime.isWindowEligibleTactical(next, card)) {
      throw new Error(`${card.name} was not generated this period and is not window-eligible`);
    }
    const cost = runtime.previewCalibrationTacticalCost(next, play.side, card, play.zone);
    next = playCalibrationTactical(next, play.side, play.cardId, play.zone, { window: true });
    const latest = latestResolution(next, play.side, play.cardId);
    const finalType = latest?.type ?? card.type;
    const definition = V8_TACTICAL_DEFINITIONS[finalType];
    resolved.push({
      side: play.side,
      card: { ...card, type: finalType, name: definition.name, baseAtt: definition.baseAtt },
      zone: latest?.zone ?? play.zone,
      cost,
    });
  }
  return { state: next, plays: resolved };
}
