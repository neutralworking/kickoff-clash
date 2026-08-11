export * from './calibration-expansion-batch-06-runtime';

import { calibrationScoreRelation } from './calibration-action-context';
import { getV8CalibrationPlayer } from './calibration-cards';
import type { V8Zone } from './core';
import {
  V8_TACTICAL_DEFINITIONS,
  type V8TacticalCardInstance,
} from './tactical';
import * as runtime from './calibration-expansion-batch-06-runtime';

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

interface TemporarySuppression {
  runtimeId: string;
  previous?: string;
}

function lockGenericChanceTransformations(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  zone: V8Zone,
): { state: runtime.V8CalibrationState; suppressions: TemporarySuppression[] } {
  const next = clone(state);
  const suppressions: TemporarySuppression[] = [];
  const candidates = Object.values(next.players).filter((player) =>
    player.side === side
    && (
      (player.cardId === 'alexia-putellas' && player.zone === zone)
      || (player.cardId === 'pirlo' && zone === 'MID')
    )
  );

  for (const player of candidates) {
    suppressions.push({ runtimeId: player.runtimeId, previous: next.suppressedActions[player.runtimeId] });
    next.suppressedActions[player.runtimeId] = 'batch07:chance-shape';
  }
  return { state: next, suppressions };
}

function restoreTemporarySuppressions(
  state: runtime.V8CalibrationState,
  suppressions: readonly TemporarySuppression[],
): runtime.V8CalibrationState {
  if (suppressions.length === 0) return state;
  const next = clone(state);
  for (const suppression of suppressions) {
    if (suppression.previous === undefined) delete next.suppressedActions[suppression.runtimeId];
    else next.suppressedActions[suppression.runtimeId] = suppression.previous;
  }
  return next;
}

function pendingWaddleTransformInAtt(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
): boolean {
  return Object.values(state.players).some((player) =>
    player.side === side
    && player.cardId === 'chris-waddle'
    && player.zone === 'ATT'
    && runtime.isCalibrationActionEnabled(state, player.runtimeId)
    && (state.periodCounters[`waddle-drop-the-shoulder-transform:${player.runtimeId}`] ?? 0) === 3
  );
}

interface Batch07Transformation {
  state: runtime.V8CalibrationState;
  transformed: boolean;
  suppressions: TemporarySuppression[];
}

function transformCardToCross(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  sourceName: string,
  metadataKey: string,
): Batch07Transformation {
  const locked = lockGenericChanceTransformations(state, side, zone);
  const next = locked.state;
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (!entry || entry.kind !== 'tactical') return { state, transformed: false, suppressions: [] };
  const fromName = entry.card.name;
  entry.card.type = 'cross';
  entry.card.name = V8_TACTICAL_DEFINITIONS.cross.name;
  entry.card.baseAtt = V8_TACTICAL_DEFINITIONS.cross.baseAtt;
  entry.card.metadata[metadataKey] = true;
  next.events.push({
    type: 'tactical_modified',
    period: next.period,
    text: `${sourceName} turns ${fromName} into a Cross in ATT.`,
  });
  return { state: next, transformed: true, suppressions: locked.suppressions };
}

function prepareHakimiBombOn(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): Batch07Transformation {
  const card = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (zone !== 'ATT' || (card?.type !== 'through_ball' && card?.type !== 'long_shot')) {
    return { state, transformed: false, suppressions: [] };
  }
  if (pendingWaddleTransformInAtt(state, side)) return { state, transformed: false, suppressions: [] };
  if (calibrationScoreRelation(state, side) !== 'losing') return { state, transformed: false, suppressions: [] };

  const hakimi = Object.values(state.players)
    .filter((player) =>
      player.side === side
      && player.cardId === 'achraf-hakimi'
      && player.zone === 'MID'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[`hakimi-bomb-on:${player.runtimeId}`] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
  if (!hakimi) return { state, transformed: false, suppressions: [] };

  const transformed = transformCardToCross(
    state,
    side,
    cardId,
    zone,
    `${getV8CalibrationPlayer('achraf-hakimi').realName} · BOMB ON`,
    'batch07BombOn',
  );
  if (transformed.transformed) transformed.state.periodCounters[`hakimi-bomb-on:${hakimi.runtimeId}`] = 1;
  return transformed;
}

function prepareKrahnStepAcross(
  state: runtime.V8CalibrationState,
  attackingSide: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): Batch07Transformation {
  const card = runtime.calibrationHandTacticals(state, attackingSide).find((candidate) => candidate.id === cardId);
  if (zone !== 'ATT' || card?.type !== 'through_ball') return { state, transformed: false, suppressions: [] };
  if (pendingWaddleTransformInAtt(state, attackingSide)) return { state, transformed: false, suppressions: [] };

  const defendingSide = otherSide(attackingSide);
  const krahn = Object.values(state.players)
    .filter((player) =>
      player.side === defendingSide
      && player.cardId === 'annike-krahn'
      && player.zone === 'DEF'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[`krahn-step-across:${player.runtimeId}`] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
  if (!krahn) return { state, transformed: false, suppressions: [] };

  const transformed = transformCardToCross(
    state,
    attackingSide,
    cardId,
    zone,
    `${getV8CalibrationPlayer('annike-krahn').realName} · STEP ACROSS`,
    'batch07StepAcross',
  );
  if (transformed.transformed) transformed.state.periodCounters[`krahn-step-across:${krahn.runtimeId}`] = 1;
  return transformed;
}

function prepareBatch07Transformation(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): Batch07Transformation {
  const hakimi = prepareHakimiBombOn(state, side, cardId, zone);
  if (hakimi.transformed) return hakimi;
  return prepareKrahnStepAcross(state, side, cardId, zone);
}

function playBatch07TransformedChance(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean },
): runtime.V8CalibrationState | undefined {
  const preview = prepareBatch07Transformation(state, side, cardId, zone);
  if (!preview.transformed) return undefined;

  let prepared = preview.state;
  let paidCost: number | undefined;
  if (!options.ignoreEnergy) {
    const spent = runtime.spendCalibrationTacticalFromHand(state, side, cardId, zone);
    paidCost = spent.cost;
    prepared = clone(spent.state);
    prepared.teams[side].hand.push({ kind: 'tactical', card: spent.card });
    prepared = prepareBatch07Transformation(prepared, side, cardId, zone).state;
  }

  let resolved = runtime.playCalibrationTactical(prepared, side, cardId, zone, { ...options, ignoreEnergy: true });
  resolved = restoreTemporarySuppressions(resolved, preview.suppressions);
  if (paidCost !== undefined) {
    resolved = clone(resolved);
    const resolution = latestResolution(resolved, side, cardId);
    if (resolution) resolution.cost = paidCost;
  }
  return resolved;
}

export function playCalibrationTactical(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean } = {},
): runtime.V8CalibrationState {
  const transformed = playBatch07TransformedChance(state, side, cardId, zone, options);
  return transformed ?? runtime.playCalibrationTactical(state, side, cardId, zone, options);
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

export interface V8Batch07ResolvedWindowPlay {
  side: runtime.V8CalibrationSide;
  card: V8TacticalCardInstance;
  zone: V8Zone;
  cost: number;
}

/** Preserve utility-before-Chance ordering while routing each actual play through Batch 07. */
export function resolveGeneratedTacticalWindow(
  state: runtime.V8CalibrationState,
  plays: readonly runtime.V8CalibrationWindowPlay[],
): { state: runtime.V8CalibrationState; plays: V8Batch07ResolvedWindowPlay[] } {
  let next = state;
  const resolved: V8Batch07ResolvedWindowPlay[] = [];
  const isUtility = (play: runtime.V8CalibrationWindowPlay): boolean => {
    const card = runtime.calibrationHandTacticals(next, play.side).find((candidate) => candidate.id === play.cardId);
    return card !== undefined && !V8_TACTICAL_DEFINITIONS[card.type].isChance;
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
