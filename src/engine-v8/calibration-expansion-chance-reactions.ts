export * from './calibration-expansion-runtime';

import { getV8CalibrationPlayer } from './calibration-cards';
import type { V8Zone } from './core';
import {
  V8_TACTICAL_DEFINITIONS,
  isV8ChanceType,
  type V8TacticalCardInstance,
  type V8TacticalType,
} from './tactical';
import * as runtime from './calibration-expansion-runtime';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function otherSide(side: runtime.V8CalibrationSide): runtime.V8CalibrationSide {
  return side === 'home' ? 'away' : 'home';
}

function cavaniCounterKey(runtimeId: string): string {
  return `cavani-get-across-him:${runtimeId}`;
}

function yashinCounterKey(runtimeId: string): string {
  return `yashin-black-spider:${runtimeId}`;
}

function alexiaCounterKey(runtimeId: string): string {
  return `alexia-through-the-gap:${runtimeId}`;
}

function pirloCounterKey(runtimeId: string): string {
  return `pirlo-diagonal-switch:${runtimeId}`;
}

function activeCavani(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  zone: V8Zone,
): runtime.V8CalibrationRuntimePlayer | undefined {
  return runtime.calibrationPlayersInZone(state, side, zone)
    .filter((player) =>
      player.cardId === 'cavani'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[cavaniCounterKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function activeYashin(
  state: runtime.V8CalibrationState,
  attackingSide: runtime.V8CalibrationSide,
  attackingZone: V8Zone,
): runtime.V8CalibrationRuntimePlayer | undefined {
  if (attackingZone !== 'ATT') return undefined;
  const defendingSide = otherSide(attackingSide);
  return runtime.calibrationPlayersInZone(state, defendingSide, runtime.opposingDepthZone(attackingZone))
    .filter((player) =>
      player.cardId === 'yashin'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[yashinCounterKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function activeAlexia(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  originalZone: V8Zone,
): runtime.V8CalibrationRuntimePlayer | undefined {
  return runtime.calibrationPlayersInZone(state, side, originalZone)
    .filter((player) =>
      player.cardId === 'alexia-putellas'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[alexiaCounterKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function activePirlo(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
): runtime.V8CalibrationRuntimePlayer | undefined {
  return Object.values(state.players)
    .filter((player) =>
      player.side === side
      && player.cardId === 'pirlo'
      && runtime.isCalibrationActionEnabled(state, player.runtimeId)
      && (state.periodCounters[pirloCounterKey(player.runtimeId)] ?? 0) === 0
    )
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function latestResolution(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationTacticalResolution | undefined {
  return [...state.tacticalResolutions].reverse()
    .find((resolution) => resolution.side === side && resolution.cardId === cardId);
}

function transformTacticalType(card: V8TacticalCardInstance, type: V8TacticalType): void {
  if (card.type === type) return;
  const definition = V8_TACTICAL_DEFINITIONS[type];
  // Deliberately preserve baseCost, costModifier, attModifier, cancellable, generatedBy and metadata.
  card.type = type;
  card.name = definition.name;
  card.baseAtt = definition.baseAtt;
}

interface PreparedTransformation {
  state: runtime.V8CalibrationState;
  zone: V8Zone;
  transformed: boolean;
}

/**
 * Pre-resolution transformation stage. Alexia reads the original requested zone first; Pirlo then
 * performs the MID → ATT switch and ensures the final Chance is a Cross. Downstream specialist and
 * cancellation logic therefore sees only the final type/zone.
 */
function prepareChanceTransformations(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  originalZone: V8Zone,
): PreparedTransformation {
  const original = runtime.calibrationHandTacticals(state, side).find((card) => card.id === cardId);
  if (!original || !isV8ChanceType(original.type)) return { state, zone: originalZone, transformed: false };

  let next = clone(state);
  let zone = originalZone;
  let transformed = false;
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (!entry || entry.kind !== 'tactical') return { state, zone: originalZone, transformed: false };

  const alexia = activeAlexia(next, side, originalZone);
  if (alexia && entry.card.type !== 'through_ball') {
    const fromName = entry.card.name;
    transformTacticalType(entry.card, 'through_ball');
    next.periodCounters[alexiaCounterKey(alexia.runtimeId)] = 1;
    next.events.push({
      type: 'tactical_modified',
      period: next.period,
      text: `${getV8CalibrationPlayer('alexia-putellas').realName} · THROUGH THE GAP turns ${fromName} into a Through Ball.`,
    });
    transformed = true;
  }

  const pirlo = originalZone === 'MID' ? activePirlo(next, side) : undefined;
  if (pirlo) {
    const fromName = entry.card.name;
    zone = 'ATT';
    if (entry.card.type !== 'cross') transformTacticalType(entry.card, 'cross');
    next.periodCounters[pirloCounterKey(pirlo.runtimeId)] = 1;
    next.events.push({
      type: 'tactical_modified',
      period: next.period,
      text: `${getV8CalibrationPlayer('pirlo').realName} · DIAGONAL SWITCH sends ${fromName} to ATT${entry.card.type === 'cross' && fromName !== 'Cross' ? ' as a Cross' : ''}.`,
    });
    transformed = true;
  }

  return { state: next, zone, transformed };
}

function makeChanceUncancellable(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationState {
  const next = clone(state);
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (entry?.kind === 'tactical') entry.card.cancellable = false;
  return next;
}

/** GET ACROSS HIM only spends on an actual cancelled Cross. */
function interceptCancelledCross(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean },
): runtime.V8CalibrationState {
  const original = runtime.calibrationHandTacticals(before, side).find((card) => card.id === cardId);
  if (!original || original.type !== 'cross') return after;
  const resolution = latestResolution(after, side, cardId);
  if (!resolution?.cancelled) return after;

  const cavani = activeCavani(before, side, zone);
  if (!cavani) return after;

  const protectedState = makeChanceUncancellable(before, side, cardId);
  let retried = runtime.playCalibrationTactical(protectedState, side, cardId, zone, options);
  retried = clone(retried);
  retried.periodCounters[cavaniCounterKey(cavani.runtimeId)] = 1;
  retried.events.push({
    type: 'action_triggered',
    period: retried.period,
    text: `${getV8CalibrationPlayer('cavani').realName} · GET ACROSS HIM prevents ${original.name} from being cancelled.`,
  });
  return retried;
}

/** BLACK SPIDER consumes the first opposing ATT Chance attempt each period and reduces live ATT. */
function applyYashinSuppression(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): runtime.V8CalibrationState {
  const original = runtime.calibrationHandTacticals(before, side).find((card) => card.id === cardId);
  if (!original || !isV8ChanceType(original.type)) return after;
  const yashin = activeYashin(after, side, zone);
  if (!yashin) return after;

  const next = clone(after);
  next.periodCounters[yashinCounterKey(yashin.runtimeId)] = 1;
  const resolution = latestResolution(next, side, cardId);
  if (!resolution || resolution.cancelled || resolution.attack <= 0) return next;

  const reduction = Math.min(2, resolution.attack);
  resolution.attack -= reduction;
  next.tacticalAttack[side][zone] -= reduction;
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer('yashin').realName} · BLACK SPIDER reduces ${original.name} by ${reduction} ATT.`,
  });
  return next;
}

function resolvePreparedChance(
  beforeResolution: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean },
): runtime.V8CalibrationState {
  let next = runtime.playCalibrationTactical(beforeResolution, side, cardId, zone, options);
  next = interceptCancelledCross(beforeResolution, next, side, cardId, zone, options);
  return applyYashinSuppression(beforeResolution, next, side, cardId, zone);
}

export function playCalibrationTactical(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean } = {},
): runtime.V8CalibrationState {
  const original = runtime.calibrationHandTacticals(state, side).find((card) => card.id === cardId);
  if (!original || !isV8ChanceType(original.type)) {
    return runtime.playCalibrationTactical(state, side, cardId, zone, options);
  }

  const preview = prepareChanceTransformations(state, side, cardId, zone);
  if (!preview.transformed) {
    // Preserve the established payment/telemetry path when Alexia/Pirlo do not intervene.
    return resolvePreparedChance(state, side, cardId, zone, options);
  }

  if (options.ignoreEnergy) {
    return resolvePreparedChance(preview.state, side, cardId, preview.zone, options);
  }

  // Pay and consume live Cost rules against the ORIGINAL Tactical before type/zone transformation.
  // This preserves effects such as Lloyd's free Long Shot, not merely the instance's baseCost.
  const spent = runtime.spendCalibrationTacticalFromHand(state, side, cardId, zone);
  const paidState = clone(spent.state);
  paidState.teams[side].hand.push({ kind: 'tactical', card: spent.card });
  const prepared = prepareChanceTransformations(paidState, side, cardId, zone);
  let next = resolvePreparedChance(prepared.state, side, cardId, prepared.zone, { ...options, ignoreEnergy: true });
  next = clone(next);
  const resolution = latestResolution(next, side, cardId);
  if (resolution) resolution.cost = spent.cost;
  return next;
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
  const latest = resolved.tacticalResolutions[resolved.tacticalResolutions.length - 1];
  if (latest) latest.cost = paidCost;
  return resolved;
}

export interface V8ExpansionChanceReactionWindowPlay {
  side: runtime.V8CalibrationSide;
  card: V8TacticalCardInstance;
  zone: V8Zone;
  cost: number;
}

/** Commitment and generated-window Chances share the same transformation/reaction pipeline. */
export function resolveGeneratedTacticalWindow(
  state: runtime.V8CalibrationState,
  plays: readonly runtime.V8CalibrationWindowPlay[],
): { state: runtime.V8CalibrationState; plays: V8ExpansionChanceReactionWindowPlay[] } {
  let next = state;
  const resolved: V8ExpansionChanceReactionWindowPlay[] = [];
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
    const finalDefinition = V8_TACTICAL_DEFINITIONS[finalType];
    const resolvedCard: V8TacticalCardInstance = {
      ...card,
      type: finalType,
      name: finalDefinition.name,
      baseAtt: finalDefinition.baseAtt,
    };
    resolved.push({ side: play.side, card: resolvedCard, zone: latest?.zone ?? play.zone, cost });
  }

  return { state: next, plays: resolved };
}
