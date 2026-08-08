import './calibration-integration-base';

import { describe, expect, it } from 'vitest';
import {
  calibrationHandTacticals,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  getV8CalibrationPlayer,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
  windowEligibleCalibrationTacticals,
} from '../index';

describe('V8 compact Neymar Penalty creator', () => {
  it('does not generate a Penalty when no opposing defender is present', () => {
    const state = createV8CalibrationState();
    const revealed = revealCalibrationPlayer(state, 'home', 'neymar', 'ATT');
    expect(calibrationHandTacticals(revealed, 'home').filter((card) => card.type === 'penalty')).toHaveLength(0);
  });

  it('wins a Penalty against an opposing defender and exposes it to the same-period window', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'neymar', 'ATT');

    expect(getV8CalibrationPlayer('neymar').actionText)
      .toBe('On Reveal: If an opposing defender is here, add a Penalty to your hand.');
    const penalties = calibrationHandTacticals(state, 'home').filter((card) => card.type === 'penalty');
    expect(penalties).toHaveLength(1);
    expect(windowEligibleCalibrationTacticals(state, 'home').map((card) => card.id)).toContain(penalties[0]!.id);
  });

  it('lets Panenka amplify Neymar’s generated Penalty without changing the base Tactical', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'panenka', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'neymar', 'ATT');
    const penalty = calibrationHandTacticals(state, 'home').find((card) => card.type === 'penalty');
    expect(penalty).toBeDefined();

    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: penalty!.id, zone: 'ATT' }]);
    const resolution = window.state.tacticalResolutions.find((item) => item.cardId === penalty!.id);
    expect(resolution?.attack).toBe(8);
    expect(resolution?.uncancellable).toBe(true);
    expect(resolution?.specialistBonuses).toContain('CHIPPED PENALTY +3 · uncancellable');
  });
});

describe('V8 individual dribbler quality', () => {
  it('gives Okocha a standalone ATT payoff when STEPOVER beats a defender', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'okocha', 'ATT');

    expect(getV8CalibrationPlayer('okocha').actionText)
      .toBe('On Reveal: Give the lowest-DEF opposing defender here −2 DEF and gain +2 ATT this period. If they were already reduced, add a Penalty to your hand.');
    expect(currentCalibrationAttack(state, calibrationRuntimeId('home', 'okocha')))
      .toBe(getV8CalibrationPlayer('okocha').printedAttack + 2);
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.type === 'penalty')).toHaveLength(0);
  });
});
