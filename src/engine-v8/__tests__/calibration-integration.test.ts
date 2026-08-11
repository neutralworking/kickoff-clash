import './calibration-integration-base';

import { describe, expect, it } from 'vitest';
import {
  calibrationHandTacticals,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
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

describe('V8 individual Action quality', () => {
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

  it('lets Ronaldo break the strongest defender directly without generating a Penalty', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    const before = currentCalibrationDefence(state, calibrationRuntimeId('away', 'ramos'));
    state = revealCalibrationPlayer(state, 'home', 'ronaldo', 'ATT');

    expect(getV8CalibrationPlayer('ronaldo').actionText)
      .toBe('On Reveal: Give the highest-DEF opposing defender here −3 DEF this period.');
    expect(currentCalibrationDefence(state, calibrationRuntimeId('away', 'ramos'))).toBe(before - 3);
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.type === 'penalty')).toHaveLength(0);
  });

  it('renames Makélélé without changing the local defensive aura', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'makelele', 'MID');
    state = seedCalibrationPlayer(state, 'home', 'seedorf', 'MID');

    expect(getV8CalibrationPlayer('makelele').actionName).toBe('THE MAKÉLÉLÉ ROLE');
    expect(getV8CalibrationPlayer('makelele').actionText).toBe('Ongoing: Your other players here have +2 DEF.');
    expect(currentCalibrationDefence(state, calibrationRuntimeId('home', 'seedorf')))
      .toBe(getV8CalibrationPlayer('seedorf').printedDefence + 2);
    expect(currentCalibrationDefence(state, calibrationRuntimeId('home', 'makelele')))
      .toBe(getV8CalibrationPlayer('makelele').printedDefence);
  });
});
