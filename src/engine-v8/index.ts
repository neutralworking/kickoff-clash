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
export * from './calibration-compact-core';
export * from './calibration-expansion-batch-01';
export * from './calibration-expansion-batch-02';
export * from './calibration-presence';

// The playable V8 lab opts into action-decay, expansion primitives and generated-Tactical timing
// while direct lower-layer imports retain isolated calibration behavior for regression tests.
export {
  revealCalibrationPlayerWithDecay as revealCalibrationPlayer,
  endV8CalibrationPeriodWithDecay as endV8CalibrationPeriod,
  applyCalibrationDecayModifier as applyCalibrationModifier,
  playCalibrationTacticalWithTiming as playCalibrationTactical,
  spendCalibrationTacticalFromHandWithTiming as spendCalibrationTacticalFromHand,
  calibrationHandPlayersWithDecayText as calibrationHandPlayers,
  moveCalibrationPlayer,
  refreshCalibrationScoreState,
  resolveCommittedCalibrationTactical,
  resolveGeneratedTacticalWindow,
} from './calibration-engine';
