export * from './calibration-expansion-batch-07-runtime';
export * from './calibration-expansion-batch-05-cards';

import * as decay from './calibration-decay';
import {
  calibrationScoreRelation,
  rollCalibrationAction,
  storeCalibrationMatchScore,
} from './calibration-action-context';
import { getV8CalibrationPlayer } from './calibration-cards';
import { refreshV8Batch07OngoingEffects } from './calibration-expansion-batch-07-ongoing';
import { applyCalibrationAttackGainReactions } from './calibration-expansion-reactions';
import * as runtime from './calibration-expansion-batch-07-runtime';
import type { V8Zone } from './core';

export interface V8CalibrationMatchScore {
  home: number;
  away: number;
}

function withExpansionReactions(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
): runtime.V8CalibrationState {
  const refreshed = refreshV8Batch07OngoingEffects(after);
  return applyCalibrationAttackGainReactions(before, refreshed);
}

function applyBatch05RevealEffects(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): runtime.V8CalibrationState {
  const runtimeId = runtime.calibrationRuntimeId(side, cardId);
  if (!runtime.isCalibrationActionEnabled(state, runtimeId)) return state;

  if (cardId === 'roberto-carlos' && zone === 'MID') {
    let next = state;
    const generated = runtime.addCalibrationTacticalToHand(next, side, 'long_shot', {
      attModifier: 3,
      generatedBy: cardId,
    });
    next = generated.state;
    generated.card.metadata.availableFromPeriod = next.period + 1;
    next.events.push({
      type: 'tactical_generated',
      period: next.period,
      text: `${getV8CalibrationPlayer(cardId).realName} · THUNDERBOLT generates ${generated.card.name} (+3 ATT).`,
    });
    next = runtime.applyCalibrationModifier(next, runtimeId, {
      defence: -3,
      lifetime: 'period',
      source: 'THUNDERBOLT',
    });
    return next;
  }

  if (cardId === 'ole-gunnar-solskjaer'
    && state.period >= 3
    && calibrationScoreRelation(state, side) === 'losing') {
    let next = runtime.applyCalibrationModifier(state, runtimeId, {
      attack: 4,
      lifetime: 'period',
      source: 'SUPERSUB',
    });
    const generated = runtime.addCalibrationTacticalToHand(next, side, 'through_ball', { generatedBy: cardId });
    next = generated.state;
    generated.card.metadata.availableFromPeriod = next.period + 1;
    next.events.push({
      type: 'tactical_generated',
      period: next.period,
      text: `${getV8CalibrationPlayer(cardId).realName} · SUPERSUB generates ${generated.card.name}.`,
    });
    return next;
  }

  if (cardId === 'ronaldinho') {
    const rolled = rollCalibrationAction(state, `${side}:${runtimeId}:showboat`);
    const attack = rolled.roll < 0.5 ? 6 : -2;
    let next = runtime.applyCalibrationModifier(rolled.state, runtimeId, {
      attack,
      lifetime: 'period',
      source: 'SHOWBOAT',
    });
    next.events.push({
      type: 'action_triggered',
      period: next.period,
      text: `${getV8CalibrationPlayer(cardId).realName} · SHOWBOAT ${attack > 0 ? 'comes off' : 'breaks down'}: ${attack > 0 ? '+' : ''}${attack} ATT this period.`,
    });
    return next;
  }

  if (cardId === 'paul-scholes' && zone === 'MID') {
    let next = state;
    const generated = runtime.addCalibrationTacticalToHand(next, side, 'cross', { generatedBy: cardId });
    next = generated.state;
    generated.card.metadata.availableFromPeriod = next.period + 1;
    generated.card.metadata.freeThroughPeriod = next.period;
    next.events.push({
      type: 'tactical_generated',
      period: next.period,
      text: `${getV8CalibrationPlayer(cardId).realName} · HOLLYWOOD BALL generates ${generated.card.name} at 0 Energy this period.`,
    });
    return next;
  }

  if (cardId === 'shunsuke-nakamura') {
    let next = state;
    for (const type of ['long_shot', 'corner'] as const) {
      const generated = runtime.addCalibrationTacticalToHand(next, side, type, { generatedBy: cardId });
      next = generated.state;
      generated.card.metadata.availableFromPeriod = next.period + 1;
      generated.card.metadata.deadBallArtistPeriod = next.period;
      generated.card.metadata.deadBallArtistRuntimeId = runtimeId;
      next.events.push({
        type: 'tactical_generated',
        period: next.period,
        text: `${getV8CalibrationPlayer(cardId).realName} · DEAD BALL ARTIST generates ${generated.card.name}.`,
      });
    }
    return next;
  }

  return state;
}

function positionCodes(cardId: string): Set<string> {
  return new Set(getV8CalibrationPlayer(cardId).position.toUpperCase().split(/[^A-Z]+/).filter(Boolean));
}

function isForward(cardId: string): boolean {
  const codes = positionCodes(cardId);
  return ['CF', 'SS', 'WF', 'LW', 'RW', 'LF', 'RF'].some((code) => codes.has(code));
}

function applyBatch07RevealEffects(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
): runtime.V8CalibrationState {
  if (cardId !== 'roy-keane') return state;
  const runtimeId = runtime.calibrationRuntimeId(side, cardId);
  if (!runtime.isCalibrationActionEnabled(state, runtimeId)) return state;
  const opposingSide: runtime.V8CalibrationSide = side === 'home' ? 'away' : 'home';
  const target = Object.values(state.players)
    .filter((player) => player.side === opposingSide && isForward(player.cardId))
    .sort((a, b) =>
      runtime.currentCalibrationAttack(state, b.runtimeId) - runtime.currentCalibrationAttack(state, a.runtimeId)
      || a.deployedOrder - b.deployedOrder
      || a.runtimeId.localeCompare(b.runtimeId)
    )[0];
  if (!target) return state;

  let next = runtime.applyCalibrationModifier(state, target.runtimeId, {
    attack: -5,
    lifetime: 'match',
    source: `REDUCER:${runtimeId}`,
    sourceRuntimeId: runtimeId,
  });
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${getV8CalibrationPlayer('roy-keane').realName} · REDUCER binds ${getV8CalibrationPlayer(target.cardId).realName} at −5 ATT.`,
  });
  return next;
}

export function revealCalibrationPlayerWithDecay(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): runtime.V8CalibrationState {
  let next = decay.revealCalibrationPlayer(state, side, cardId, zone);
  next = applyBatch05RevealEffects(next, side, cardId, zone);
  next = applyBatch07RevealEffects(next, side, cardId);
  return withExpansionReactions(state, next);
}

function applyCaptainMarvelAtPeriodEnd(
  state: runtime.V8CalibrationState,
  score?: V8CalibrationMatchScore,
): runtime.V8CalibrationState {
  if (!score) return state;
  let next = state;
  const robsons = Object.values(state.players)
    .filter((player) => player.cardId === 'bryan-robson')
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const robson of robsons) {
    if (!runtime.isCalibrationActionEnabled(next, robson.runtimeId)) continue;
    const own = robson.side === 'home' ? score.home : score.away;
    const opponent = robson.side === 'home' ? score.away : score.home;
    if (own >= opponent) continue;

    next = runtime.applyCalibrationModifier(next, robson.runtimeId, {
      attack: 2,
      defence: 2,
      lifetime: 'match',
      source: 'CAPTAIN MARVEL',
      sourceRuntimeId: robson.runtimeId,
    });
    next.events.push({
      type: 'action_triggered',
      period: next.period,
      text: `${getV8CalibrationPlayer('bryan-robson').realName} · CAPTAIN MARVEL: +2 ATT and +2 DEF for the rest of the match while trailing ${own}–${opponent}.`,
    });
  }
  return next;
}

function applyHurlerAtPeriodEnd(state: runtime.V8CalibrationState): runtime.V8CalibrationState {
  if (state.period >= 4) return state;
  let next = state;
  const delaps = Object.values(state.players)
    .filter((player) => player.cardId === 'rory-delap')
    .sort((a, b) => a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId));

  for (const delap of delaps) {
    if (!runtime.isCalibrationActionEnabled(next, delap.runtimeId)) continue;
    const generated = runtime.addCalibrationTacticalToHand(next, delap.side, 'long_throw', {
      generatedBy: 'rory-delap',
    });
    next = generated.state;
    generated.card.metadata.availableFromPeriod = next.period + 1;
    next.events.push({
      type: 'tactical_generated',
      period: next.period,
      text: `${getV8CalibrationPlayer('rory-delap').realName} · HURLER generates ${generated.card.name} for the next period.`,
    });
  }
  return next;
}

function applyReducerRecoveryAtPeriodEnd(state: runtime.V8CalibrationState): runtime.V8CalibrationState {
  if (state.period >= 4) return state;
  let next = state;
  const targets = Object.values(next.players)
    .flatMap((player) => player.modifiers
      .filter((modifier) => modifier.source?.startsWith('REDUCER:') && modifier.attack < 0)
      .map((modifier) => ({ player, modifier })))
    .sort((a, b) => a.modifier.source!.localeCompare(b.modifier.source!) || a.player.runtimeId.localeCompare(b.player.runtimeId));

  for (const target of targets) {
    const source = target.modifier.source!;
    const rolled = rollCalibrationAction(next, `${source}:recovery`);
    next = rolled.state;
    if (rolled.roll >= 0.5) continue;
    const livePlayer = next.players[target.player.runtimeId];
    const liveModifier = livePlayer?.modifiers.find((modifier) => modifier.source === source && modifier.attack < 0);
    if (!livePlayer || !liveModifier) continue;
    const recovered = Math.min(2, -liveModifier.attack);
    liveModifier.attack += recovered;
    next.events.push({
      type: 'modifier_changed',
      period: next.period,
      text: `${getV8CalibrationPlayer(livePlayer.cardId).realName} recovers ${recovered} ATT from REDUCER.`,
    });
  }
  return next;
}

/**
 * Period end accepts the actual banked match score as optional coordinator context. The score is
 * persisted into match context for later score-dependent Actions; one-argument legacy callers
 * remain valid but cannot activate those effects honestly.
 */
export function endV8CalibrationPeriodWithDecay(
  state: runtime.V8CalibrationState,
  score?: V8CalibrationMatchScore,
): ReturnType<typeof decay.endV8CalibrationPeriod> {
  const withScore = score ? storeCalibrationMatchScore(state, score) : state;
  const withCaptainMarvel = applyCaptainMarvelAtPeriodEnd(withScore, score);
  const withHurler = applyHurlerAtPeriodEnd(withCaptainMarvel);
  const prepared = applyReducerRecoveryAtPeriodEnd(withHurler);
  return refreshV8Batch07OngoingEffects(decay.endV8CalibrationPeriod(prepared));
}

export function moveCalibrationPlayer(
  ...args: Parameters<typeof runtime.moveCalibrationPlayer>
): ReturnType<typeof runtime.moveCalibrationPlayer> {
  return withExpansionReactions(args[0], runtime.moveCalibrationPlayer(...args));
}

export function refreshCalibrationScoreState(
  ...args: Parameters<typeof runtime.refreshCalibrationScoreState>
): ReturnType<typeof runtime.refreshCalibrationScoreState> {
  return withExpansionReactions(args[0], runtime.refreshCalibrationScoreState(...args));
}

export function playCalibrationTacticalWithTiming(
  state: runtime.V8CalibrationState,
  side: runtime.V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
  options: { ignoreEnergy?: boolean; window?: boolean } = {},
): runtime.V8CalibrationState {
  const card = runtime.calibrationHandTacticals(state, side).find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Tactical card ${cardId} is not in hand`);
  const availableFrom = decay.calibrationTacticalAvailableFromPeriod(card);
  if (availableFrom > state.period) throw new Error(`${card.name} is banked until Period ${availableFrom}`);
  return refreshV8Batch07OngoingEffects(runtime.playCalibrationTactical(state, side, cardId, zone, options));
}

export function resolveCommittedCalibrationTactical(
  ...args: Parameters<typeof runtime.resolveCommittedCalibrationTactical>
): ReturnType<typeof runtime.resolveCommittedCalibrationTactical> {
  return refreshV8Batch07OngoingEffects(runtime.resolveCommittedCalibrationTactical(...args));
}

export function resolveGeneratedTacticalWindow(
  ...args: Parameters<typeof runtime.resolveGeneratedTacticalWindow>
): ReturnType<typeof runtime.resolveGeneratedTacticalWindow> {
  const result = runtime.resolveGeneratedTacticalWindow(...args);
  return { ...result, state: refreshV8Batch07OngoingEffects(result.state) };
}

export {
  applyCalibrationModifier as applyCalibrationDecayModifier,
  spendCalibrationTacticalFromHand as spendCalibrationTacticalFromHandWithTiming,
  calibrationTacticalAvailableFromPeriod,
  isCalibrationTacticalAvailable,
  calibrationActionText,
  calibrationHandPlayersWithDecayText,
  calibrationModifierBadges,
} from './calibration-decay';

export type {
  V8ExtendedModifierLifetime,
  V8ExtendedModifierInput,
} from './calibration-decay';
