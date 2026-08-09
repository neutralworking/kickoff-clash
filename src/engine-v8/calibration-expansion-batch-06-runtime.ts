export * from './calibration-expansion-batch-05-runtime';

import { getV8CalibrationPlayer } from './calibration-cards';
import type { V8Zone } from './core';
import {
  V8_TACTICAL_DEFINITIONS,
  type V8TacticalCardInstance,
} from './tactical';
import * as runtime from './calibration-expansion-batch-05-runtime';

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

function activeWalsh(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
): runtime.V8CalibrationRuntimePlayer | undefined {
  return Object.values(state.players)
    .filter((player) =>
      player.side === side
      && player.cardId === 'keira-walsh'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[`walsh-beat-the-press:${player.runtimeId}`] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function applyWalshPressReaction(
  state: runtime.V8CalibrationState,
  pressingSide: runtime.V8CalibrationSide,
): runtime.V8CalibrationState {
  const receivingSide = otherSide(pressingSide);
  const walsh = activeWalsh(state, receivingSide);
  if (!walsh) return state;

  let next = clone(state);
  next.periodCounters[`walsh-beat-the-press:${walsh.runtimeId}`] = 1;
  const generated = runtime.addCalibrationTacticalToHand(next, receivingSide, 'through_ball', {
    attModifier: 2,
    generatedBy: 'keira-walsh',
  });
  next = generated.state;
  generated.card.metadata.availableFromPeriod = next.period + 1;
  next.events.push({
    type: 'tactical_generated',
    period: next.period,
    text: `${getV8CalibrationPlayer('keira-walsh').realName} · BEAT THE PRESS exploits the press and generates ${generated.card.name} (+2 ATT).`,
  });
  return next;
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
    next.suppressedActions[player.runtimeId] = 'batch06:cut-inside';
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

function prepareRobbenCutInside(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): { state: runtime.V8CalibrationState; transformed: boolean; suppressions: TemporarySuppression[] } {
  const card = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (zone !== 'ATT' || card?.type !== 'cross') return { state, transformed: false, suppressions: [] };
  if (pendingWaddleTransformInAtt(state, side)) return { state, transformed: false, suppressions: [] };

  const robben = Object.values(state.players)
    .filter((player) =>
      player.side === side
      && player.cardId === 'arjen-robben'
      && player.zone === 'ATT'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[`robben-cut-inside:${player.runtimeId}`] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
  if (!robben) return { state, transformed: false, suppressions: [] };

  const locked = lockGenericChanceTransformations(state, side, zone);
  const next = locked.state;
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (!entry || entry.kind !== 'tactical') return { state, transformed: false, suppressions: [] };

  entry.card.type = 'long_shot';
  entry.card.name = V8_TACTICAL_DEFINITIONS.long_shot.name;
  entry.card.baseAtt = V8_TACTICAL_DEFINITIONS.long_shot.baseAtt;
  entry.card.metadata.batch06CutInside = true;
  next.periodCounters[`robben-cut-inside:${robben.runtimeId}`] = 1;
  next.events.push({
    type: 'tactical_modified',
    period: next.period,
    text: `${getV8CalibrationPlayer('arjen-robben').realName} · CUT INSIDE turns Cross into a Long Shot in ATT.`,
  });
  return { state: next, transformed: true, suppressions: locked.suppressions };
}

function playRobbenTransformedChance(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean },
): runtime.V8CalibrationState | undefined {
  const preview = prepareRobbenCutInside(state, side, cardId, zone);
  if (!preview.transformed) return undefined;

  let prepared = preview.state;
  let paidCost: number | undefined;
  if (!options.ignoreEnergy) {
    const spent = runtime.spendCalibrationTacticalFromHand(state, side, cardId, zone);
    paidCost = spent.cost;
    prepared = clone(spent.state);
    prepared.teams[side].hand.push({ kind: 'tactical', card: spent.card });
    prepared = prepareRobbenCutInside(prepared, side, cardId, zone).state;
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
  const robbenResolved = playRobbenTransformedChance(state, side, cardId, zone, options);
  if (robbenResolved) return robbenResolved;

  const card = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  const reactsToPress = card?.type === 'trigger_press';
  const resolved = runtime.playCalibrationTactical(state, side, cardId, zone, options);
  return reactsToPress ? applyWalshPressReaction(resolved, side) : resolved;
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

export interface V8Batch06ResolvedWindowPlay {
  side: runtime.V8CalibrationSide;
  card: V8TacticalCardInstance;
  zone: V8Zone;
  cost: number;
}

/**
 * Keep the Batch 05 utility-before-Chance window ordering, but route each actual play back through
 * the current Batch 06 wrapper. That guarantees CUT INSIDE and BEAT THE PRESS behave identically
 * whether the triggering Tactical was committed normally or played in the Generated-Tactical Window.
 * New cards created while the blind window is already resolving cannot be appended to its fixed play
 * list; they remain in hand with ordinary generated-card timing.
 */
export function resolveGeneratedTacticalWindow(
  state: runtime.V8CalibrationState,
  plays: readonly runtime.V8CalibrationWindowPlay[],
): { state: runtime.V8CalibrationState; plays: V8Batch06ResolvedWindowPlay[] } {
  let next = state;
  const resolved: V8Batch06ResolvedWindowPlay[] = [];
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
