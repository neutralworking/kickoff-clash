export * from './calibration-runtime';

import * as decay from './calibration-decay';
import { refreshCalibrationExpansionOngoingEffects } from './calibration-expansion-ongoing';
import * as runtime from './calibration-runtime';

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

export {
  applyCalibrationModifier as applyCalibrationDecayModifier,
  playCalibrationTactical as playCalibrationTacticalWithTiming,
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
