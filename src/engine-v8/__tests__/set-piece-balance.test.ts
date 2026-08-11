import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationRuntimeId,
  calibrationZoneTotals,
  createV8CalibrationState,
  currentCalibrationAttack,
  playCalibrationTactical,
  revealCalibrationPlayer,
} from '../index';

describe('V8 set-piece balance', () => {
  it('keeps Ramos penalised in ATT before P3, then 93RD MINUTE offsets only his attacking OOP tax', () => {
    let early = createV8CalibrationState({ period: 2 });
    early.teams.home.energy = 99;
    early = revealCalibrationPlayer(early, 'home', 'ramos', 'ATT');
    expect(currentCalibrationAttack(early, calibrationRuntimeId('home', 'ramos'))).toBe(2);
    expect(calibrationZoneTotals(early, 'home', 'ATT').attack).toBe(-3);

    let late = createV8CalibrationState({ period: 3 });
    late.teams.home.energy = 99;
    late = revealCalibrationPlayer(late, 'home', 'ramos', 'ATT');
    expect(currentCalibrationAttack(late, calibrationRuntimeId('home', 'ramos'))).toBe(7);
    expect(calibrationZoneTotals(late, 'home', 'ATT').attack).toBe(2);
    expect(calibrationZoneTotals(late, 'home', 'ATT').defence).toBe(0);
  });

  it('makes the Lloyd-amplified THUNDERBALL Long Shot +8 ATT at the new +2 Long Shot baseline', () => {
    let state = createV8CalibrationState({ period: 3 });
    state.teams.home.energy = 99;
    state = revealCalibrationPlayer(state, 'home', 'lloyd', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'charlton', 'MID');
    const longShot = addCalibrationTacticalToHand(state, 'home', 'long_shot', { metadata: { bonusAttInMid: 2 } });
    state = longShot.state;
    state = playCalibrationTactical(state, 'home', longShot.card.id, 'MID', { ignoreEnergy: true });
    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'long_shot', attack: 8, cancelled: false });
  });
});
