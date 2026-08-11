import { describe, expect, it } from 'vitest';
import {
  calibrationHandTacticals,
  calibrationRuntimeId,
  createV8CalibrationState,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  playCalibrationTactical,
  previewCalibrationTacticalCost,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
} from '../index';

describe('V8 expansion Batch 05 Scholes / Nakamura runtime', () => {
  it('HOLLYWOOD BALL creates a zero-cost same-period Cross without copying DIAGONAL SWITCH', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'paul-scholes', 'MID');
    const cross = calibrationHandTacticals(state, 'home').find((card) => card.generatedBy === 'paul-scholes');

    expect(cross).toBeDefined();
    expect(cross?.type).toBe('cross');
    expect(cross?.metadata.enteredHandPeriod).toBe(1);
    expect(cross?.metadata.availableFromPeriod).toBe(2);
    expect(cross?.metadata.freeThroughPeriod).toBe(1);
    expect(previewCalibrationTacticalCost(state, 'home', cross!, 'ATT')).toBe(0);
    expect(() => playCalibrationTactical(state, 'home', cross!.id, 'ATT')).toThrow('banked until Period 2');

    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: cross!.id, zone: 'ATT' }]);
    const resolution = window.state.tacticalResolutions.find((item) => item.cardId === cross!.id);
    expect(resolution?.type).toBe('cross');
    expect(resolution?.zone).toBe('ATT');
    expect(resolution?.cost).toBe(0);
    expect(resolution?.attack).toBe(2);
  });

  it('HOLLYWOOD BALL only fires when Scholes is revealed in MID', () => {
    let state = createV8CalibrationState();
    state = revealCalibrationPlayer(state, 'home', 'paul-scholes', 'ATT');
    expect(calibrationHandTacticals(state, 'home').some((card) => card.generatedBy === 'paul-scholes')).toBe(false);
  });

  it('DEAD BALL ARTIST creates Long Shot + Corner and gives only the first one played +2 ATT', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'shunsuke-nakamura', 'MID');
    const generated = calibrationHandTacticals(state, 'home').filter((card) => card.generatedBy === 'shunsuke-nakamura');
    const shot = generated.find((card) => card.type === 'long_shot');
    const corner = generated.find((card) => card.type === 'corner');
    const runtimeId = calibrationRuntimeId('home', 'shunsuke-nakamura');

    expect(generated).toHaveLength(2);
    expect(shot).toBeDefined();
    expect(corner).toBeDefined();
    for (const card of generated) {
      expect(card.metadata.enteredHandPeriod).toBe(1);
      expect(card.metadata.availableFromPeriod).toBe(2);
      expect(card.metadata.deadBallArtistPeriod).toBe(1);
      expect(card.metadata.deadBallArtistRuntimeId).toBe(runtimeId);
    }

    const window = resolveGeneratedTacticalWindow(state, [
      { side: 'home', cardId: shot!.id, zone: 'MID' },
      { side: 'home', cardId: corner!.id, zone: 'ATT' },
    ]);
    const shotResolution = window.state.tacticalResolutions.find((item) => item.cardId === shot!.id);
    const cornerResolution = window.state.tacticalResolutions.find((item) => item.cardId === corner!.id);

    expect(shotResolution?.attack).toBe(4);
    expect(cornerResolution?.attack).toBe(3);
    expect(window.state.events.filter((event) => event.text.includes('DEAD BALL ARTIST gives')).length).toBe(1);
    expect(window.state.periodCounters[`nakamura-dead-ball-artist:${runtimeId}`]).toBe(1);
  });

  it('DEAD BALL ARTIST shares the bonus regardless of which generated set piece is played first', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'shunsuke-nakamura', 'MID');
    const generated = calibrationHandTacticals(state, 'home').filter((card) => card.generatedBy === 'shunsuke-nakamura');
    const shot = generated.find((card) => card.type === 'long_shot')!;
    const corner = generated.find((card) => card.type === 'corner')!;

    const window = resolveGeneratedTacticalWindow(state, [
      { side: 'home', cardId: corner.id, zone: 'ATT' },
      { side: 'home', cardId: shot.id, zone: 'MID' },
    ]);
    expect(window.state.tacticalResolutions.find((item) => item.cardId === corner.id)?.attack).toBe(5);
    expect(window.state.tacticalResolutions.find((item) => item.cardId === shot.id)?.attack).toBe(2);
  });

  it('DEAD BALL ARTIST bonus expires if both generated cards are held to the next period', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'shunsuke-nakamura', 'MID');
    const shot = calibrationHandTacticals(state, 'home').find((card) => card.generatedBy === 'shunsuke-nakamura' && card.type === 'long_shot')!;

    state = endV8CalibrationPeriod(state);
    state.teams.home.energy = 20;
    state = playCalibrationTactical(state, 'home', shot.id, 'MID');
    expect(state.tacticalResolutions.find((item) => item.cardId === shot.id)?.attack).toBe(2);
    expect(state.events.some((event) => event.period === 2 && event.text.includes('DEAD BALL ARTIST gives'))).toBe(false);
  });

  it('uses current authoritative reconciliation values for Scholes and Nakamura', () => {
    const scholes = getV8CalibrationPlayer('paul-scholes');
    const nakamura = getV8CalibrationPlayer('shunsuke-nakamura');
    expect([scholes.printedAttack, scholes.printedDefence, scholes.cost]).toEqual([5, 5, 3]);
    expect([nakamura.printedAttack, nakamura.printedDefence, nakamura.cost]).toEqual([8, 3, 4]);
    expect(scholes.usesCalibrationStatFallback).toBe(false);
    expect(nakamura.usesCalibrationStatFallback).toBe(false);
  });
});
