export * from './calibration-expansion-batch-04-runtime';
export * from './calibration-expansion-batch-04-cards';

import * as decay from './calibration-decay';
import { getV8CalibrationPlayer } from './calibration-cards';
import { refreshCalibrationExpansionOngoingEffects } from './calibration-expansion-ongoing';
import { applyCalibrationAttackGainReactions } from './calibration-expansion-reactions';
import * as runtime from './calibration-expansion-batch-04-runtime';
import type { V8Zone } from './core';

export interface V8CalibrationMatchScore {
  home: number;
  away: number;
}

function withExpansionReactions(
  before: runtime.V8CalibrationState,
  after: runtime.V8CalibrationState,
): runtime.V8CalibrationState {
  const refreshed = refreshCalibrationExpansionOngoingEffects(after);
  return applyCalibrationAttackGainReactions(before, refreshed);
}

export function revealCalibrationPlayerWithDecay(
  ...args: Parameters<typeof decay.revealCalibrationPlayer>
): ReturnType<typeof decay.revealCalibrationPlayer> {
  return withExpansionReactions(args[0], decay.revealCalibrationPlayer(...args));
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

/**
 * Period end accepts the actual banked match score as optional coordinator context. Existing
 * one-argument callers remain unchanged; CAPTAIN MARVEL only evaluates when a real score is given.
 */
export function endV8CalibrationPeriodWithDecay(
  state: runtime.V8CalibrationState,
  score?: V8CalibrationMatchScore,
): ReturnType<typeof decay.endV8CalibrationPeriod> {
  const prepared = applyCaptainMarvelAtPeriodEnd(state, score);
  return refreshCalibrationExpansionOngoingEffects(decay.endV8CalibrationPeriod(prepared));
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
  return refreshCalibrationExpansionOngoingEffects(runtime.playCalibrationTactical(state, side, cardId, zone, options));
}

export function resolveCommittedCalibrationTactical(
  ...args: Parameters<typeof runtime.resolveCommittedCalibrationTactical>
): ReturnType<typeof runtime.resolveCommittedCalibrationTactical> {
  return refreshCalibrationExpansionOngoingEffects(runtime.resolveCommittedCalibrationTactical(...args));
}

export function resolveGeneratedTacticalWindow(
  ...args: Parameters<typeof runtime.resolveGeneratedTacticalWindow>
): ReturnType<typeof runtime.resolveGeneratedTacticalWindow> {
  const result = runtime.resolveGeneratedTacticalWindow(...args);
  return { ...result, state: refreshCalibrationExpansionOngoingEffects(result.state) };
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