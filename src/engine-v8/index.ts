export * from './core';
export * from './reveal';
export * from './action-interactions';
export * from './tactical';
export * from './calibration-cards';
export * from './calibration-engine';
export * from './calibration-squads';
export * from './calibration-telemetry';
export * from './calibration-matchup-matrix';
export * from './calibration-deck-validation';

// The playable V8 lab opts into the action-decay and generated-Tactical timing extensions while
// direct calibration-engine imports retain the original 30-card baseline for isolated tests.
export {
  revealCalibrationPlayerWithDecay as revealCalibrationPlayer,
  endV8CalibrationPeriodWithDecay as endV8CalibrationPeriod,
  applyCalibrationDecayModifier as applyCalibrationModifier,
  playCalibrationTacticalWithTiming as playCalibrationTactical,
  spendCalibrationTacticalFromHandWithTiming as spendCalibrationTacticalFromHand,
  calibrationHandPlayersWithDecayText as calibrationHandPlayers,
} from './calibration-engine';
