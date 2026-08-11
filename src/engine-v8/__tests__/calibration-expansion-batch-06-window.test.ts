import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationHandTacticals,
  calibrationTacticalAvailableFromPeriod,
  createV8CalibrationState,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
} from '../index';

describe('V8 expansion Batch 06 Generated-Tactical Window routing', () => {
  it('routes a same-period Cross through CUT INSIDE inside the window', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'arjen-robben', 'ATT');
    const cross = addCalibrationTacticalToHand(state, 'home', 'cross', { costModifier: 2 });

    const window = resolveGeneratedTacticalWindow(cross.state, [
      { side: 'home', cardId: cross.card.id, zone: 'ATT' },
    ]);
    const resolution = window.state.tacticalResolutions.find((item) => item.cardId === cross.card.id);

    expect(resolution).toMatchObject({ type: 'long_shot', cost: 3, attack: 2, window: true });
    expect(window.plays[0]).toMatchObject({ side: 'home', zone: 'ATT', cost: 3 });
    expect(window.plays[0]?.card.type).toBe('long_shot');
  });

  it('routes window Trigger Press through BEAT THE PRESS without extending the fixed blind play list', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'keira-walsh', 'MID');
    const press = addCalibrationTacticalToHand(state, 'away', 'trigger_press');

    const window = resolveGeneratedTacticalWindow(press.state, [
      { side: 'away', cardId: press.card.id, zone: 'ATT' },
    ]);

    expect(window.state.triggerPress.away.ATT).toBe(true);
    expect(window.plays).toHaveLength(1);
    const reward = calibrationHandTacticals(window.state, 'home')
      .find((card) => card.generatedBy === 'keira-walsh');
    expect(reward).toMatchObject({ type: 'through_ball', attModifier: 2 });
    expect(calibrationTacticalAvailableFromPeriod(reward!)).toBe(window.state.period + 1);
  });
});
