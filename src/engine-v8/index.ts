export * from './core';
export * from './reveal';
export * from './action-interactions';
export * from './tactical';
export * from './calibration-cards';
export * from './calibration-engine';
export * from './calibration-squads';
export * from './calibration-telemetry';
export * from './calibration-matchup-matrix';

// The playable V8 lab opts into the action-decay calibration extension while
// direct calibration-engine imports retain the original 30-card baseline.
export {
  revealCalibrationPlayerWithDecay as revealCalibrationPlayer,
  endV8CalibrationPeriodWithDecay as endV8CalibrationPeriod,
  applyCalibrationDecayModifier as applyCalibrationModifier,
  calibrationHandPlayersWithDecayText as calibrationHandPlayers,
} from './calibration-engine';
