export * from './calibration-expansion-chance-reactions';

import './calibration-expansion-batch-04-cards';
import { getV8CalibrationPlayer } from './calibration-cards';
import type { V8Zone } from './core';
import {
  V8_TACTICAL_DEFINITIONS,
  isV8ChanceType,
  type V8TacticalCardInstance,
} from './tactical';
import * as runtime from './calibration-expansion-chance-reactions';

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

function counter(prefix: string, runtimeId: string): string {
  return `${prefix}:${runtimeId}`;
}

function removeLatestChanceResolvedEvent(state: runtime.V8CalibrationState, minimumIndex: number): void {
  for (let index = state.events.length - 1; index >= minimumIndex; index -= 1) {
    if (state.events[index]?.type === 'chance_resolved') {
      state.events.splice(index, 1);
      return;
    }
  }
}

interface TemporarySuppression {
  runtimeId: string;
  previous?: string;
}

function lockEllenTransformation(
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
    next.suppressedActions[player.runtimeId] = 'batch04:first-time-lob';
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

function prepareEllenWhiteTransformation(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): { state: runtime.V8CalibrationState; transformed: boolean; suppressions: TemporarySuppression[] } {
  const card = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (!card || card.type !== 'through_ball') return { state, transformed: false, suppressions: [] };

  const ellen = actionPlayer(state, side, 'ellen-white', zone);
  if (!ellen) return { state, transformed: false, suppressions: [] };
  const key = counter('ellen-white-first-time-lob', ellen.runtimeId);
  if ((state.matchCounters[key] ?? 0) > 0) return { state, transformed: false, suppressions: [] };

  const locked = lockEllenTransformation(state, side, zone);
  const next = locked.state;
  const entry = next.teams[side].hand.find((candidate) => candidate.kind === 'tactical' && candidate.card.id === cardId);
  if (!entry || entry.kind !== 'tactical') return { state, transformed: false, suppressions: [] };

  entry.card.type = 'long_shot';
  entry.card.name = V8_TACTICAL_DEFINITIONS.long_shot.name;
  entry.card.baseAtt = V8_TACTICAL_DEFINITIONS.long_shot.baseAtt;
  entry.card.attModifier += 3;
  entry.card.metadata.batch04FirstTimeLob = true;
  next.matchCounters[key] = 1;
  next.events.push({
    type: 'tactical_modified',
    period: next.period,
    text: `${getV8CalibrationPlayer('ellen-white').realName} · FIRST-TIME LOB turns Through Ball into a Long Shot with +3 ATT.`,
  });
  return { state: next, transformed: true, suppressions: locked.suppressions };
}

function yashinReductionSince(state: runtime.V8CalibrationState, eventStart: number): number {
  for (let index = state.events.length - 1; index >= eventStart; index -= 1) {
    const event = state.events[index];
    if (!event?.text.includes('BLACK SPIDER reduces')) continue;
    const match = event.text.match(/ by (\d+) ATT\.$/);
    return match ? Number(match[1]) : 0;
  }
  return 0;
}

function applyDaeiPowerHeader(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  eventStart: number,
): runtime.V8CalibrationState {
  const resolution = latestResolution(after, side, cardId);
  if (!resolution || resolution.type !== 'cross') return after;
  const daei = actionPlayer(before, side, 'ali-daei', resolution.zone);
  if (!daei) return after;
  const key = counter('daei-power-header', daei.runtimeId);
  if ((before.periodCounters[key] ?? 0) > 0) return after;

  const next = clone(after);
  next.periodCounters[key] = 1;
  const live = latestResolution(next, side, cardId)!;
  if (!live.cancelled) {
    const restored = yashinReductionSince(next, eventStart);
    const increase = 2 + restored;
    live.attack += increase;
    next.tacticalAttack[side][live.zone] += increase;
    live.specialistBonuses.push('POWER HEADER +2 ATT; ATT protected');
    next.events.push({
      type: 'action_triggered',
      period: next.period,
      text: `${getV8CalibrationPlayer('ali-daei').realName} · POWER HEADER gives Cross +2 ATT${restored > 0 ? ` and restores ${restored} suppressed ATT` : ''}.`,
    });
  }
  return next;
}

function applyPoppCrashTheBox(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationState {
  const resolution = latestResolution(after, side, cardId);
  if (!resolution || resolution.type !== 'cross' || resolution.zone !== 'ATT') return after;
  const popp = actionPlayer(before, side, 'alexandra-popp');
  if (!popp) return after;
  const key = counter('popp-crash-the-box', popp.runtimeId);
  if ((before.periodCounters[key] ?? 0) > 0) return after;

  let next = clone(after);
  next.periodCounters[key] = 1;
  next = runtime.applyCalibrationModifier(next, popp.runtimeId, {
    attack: 3,
    lifetime: 'period',
    source: 'CRASH THE BOX',
  });
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer('alexandra-popp').realName} · CRASH THE BOX gains +3 ATT.`,
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

function applyBanksImpossibleSave(
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  eventStart: number,
): runtime.V8CalibrationState {
  const resolution = latestResolution(after, side, cardId);
  if (!resolution || resolution.zone !== 'ATT' || resolution.cancelled || resolution.uncancellable || resolution.attack < 4) return after;
  const banks = actionPlayer(after, otherSide(side), 'gordon-banks', 'DEF');
  if (!banks) return after;
  const key = counter('banks-impossible-save', banks.runtimeId);
  if ((after.matchCounters[key] ?? 0) > 0) return after;

  let next = cancelResolution(
    after,
    side,
    cardId,
    eventStart,
    `${getV8CalibrationPlayer('gordon-banks').realName} · IMPOSSIBLE SAVE cancels the Chance.`,
  );
  next = clone(next);
  next.matchCounters[key] = 1;
  return next;
}

function applyTerryHeadWhereItHurts(
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  eventStart: number,
): runtime.V8CalibrationState {
  const resolution = latestResolution(after, side, cardId);
  if (!resolution || resolution.zone !== 'ATT' || resolution.cancelled) return after;
  const terry = actionPlayer(after, otherSide(side), 'john-terry', 'DEF');
  if (!terry) return after;
  const seenKey = counter('terry-head-where-it-hurts-seen', terry.runtimeId);
  const usedKey = counter('terry-head-where-it-hurts-used', terry.runtimeId);

  let next = clone(after);
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

function applyBatch04PostResolution(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  eventStart: number,
): runtime.V8CalibrationState {
  let next = applyDaeiPowerHeader(before, after, side, cardId, eventStart);
  next = applyPoppCrashTheBox(before, next, side, cardId);
  next = applyBanksImpossibleSave(next, side, cardId, eventStart);
  return applyTerryHeadWhereItHurts(next, side, cardId, eventStart);
}

function playEllenWhiteTransformedChance(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean },
): runtime.V8CalibrationState | undefined {
  const original = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (!original || original.type !== 'through_ball') return undefined;
  const preview = prepareEllenWhiteTransformation(state, side, cardId, zone);
  if (!preview.transformed) return undefined;

  let prepared = preview.state;
  let paidCost: number | undefined;
  if (!options.ignoreEnergy) {
    const spent = runtime.spendCalibrationTacticalFromHand(state, side, cardId, zone);
    paidCost = spent.cost;
    prepared = clone(spent.state);
    prepared.teams[side].hand.push({ kind: 'tactical', card: spent.card });
    const transformed = prepareEllenWhiteTransformation(prepared, side, cardId, zone);
    prepared = transformed.state;
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
  const original = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (!original || !isV8ChanceType(original.type)) {
    return runtime.playCalibrationTactical(state, side, cardId, zone, options);
  }

  const eventStart = state.events.length;
  const ellenResolved = playEllenWhiteTransformedChance(state, side, cardId, zone, options);
  const resolved = ellenResolved ?? runtime.playCalibrationTactical(state, side, cardId, zone, options);
  return applyBatch04PostResolution(state, resolved, side, cardId, eventStart);
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

export interface V8Batch04ResolvedWindowPlay {
  side: runtime.V8CalibrationSide;
  card: V8TacticalCardInstance;
  zone: V8Zone;
  cost: number;
}

/** Batch 04 reactions use the same path for normal commitment and same-period generated cards. */
export function resolveGeneratedTacticalWindow(
  state: runtime.V8CalibrationState,
  plays: readonly runtime.V8CalibrationWindowPlay[],
): { state: runtime.V8CalibrationState; plays: V8Batch04ResolvedWindowPlay[] } {
  let next = state;
  const resolved: V8Batch04ResolvedWindowPlay[] = [];
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
