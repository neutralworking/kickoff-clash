export * from './calibration-expansion-runtime';

import * as decay from './calibration-decay';
import { refreshCalibrationExpansionOngoingEffects } from './calibration-expansion-ongoing';
import * as runtime from './calibration-expansion-runtime';
import type { V8Zone } from './core';

export function revealCalibrationPlayerWithDecay(
  ...args: Parameters<typeof decay.revealCalibrationPlayer>
): ReturnType<typeof decay.revealCalibrationPlayer> {
  return refreshCalibrationExpansionOngoingEffects(decay.revealCalibrationPlayer(...args));
}

export function endV8CalibrationPeriodWithDecay(
  ...args: Parameters<typeof decay.endV8CalibrationPeriod>
): ReturnType<typeof decay.endV8CalibrationPeriod> {
  return refreshCalibrationExpansionOngoingEffects(decay.endV8CalibrationPeriod(...args));
}

export function moveCalibrationPlayer(
  ...args: Parameters<typeof runtime.moveCalibrationPlayer>
): ReturnType<typeof runtime.moveCalibrationPlayer> {
  return refreshCalibrationExpansionOngoingEffects(runtime.moveCalibrationPlayer(...args));
}

export function refreshCalibrationScoreState(
  ...args: Parameters<typeof runtime.refreshCalibrationScoreState>
): ReturnType<typeof runtime.refreshCalibrationScoreState> {
  return refreshCalibrationExpansionOngoingEffects(runtime.refreshCalibrationScoreState(...args));
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
