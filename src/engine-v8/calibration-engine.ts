export * from './calibration-runtime';

export {
  applyCalibrationModifier as applyCalibrationDecayModifier,
  revealCalibrationPlayer as revealCalibrationPlayerWithDecay,
  endV8CalibrationPeriod as endV8CalibrationPeriodWithDecay,
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
