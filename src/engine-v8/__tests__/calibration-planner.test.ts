import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationHandTacticals,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  getV8CalibrationPlayer,
  isCalibrationTacticalAvailable,
  planV8CalibrationSide,
  seedCalibrationPlayer,
} from '../index';

describe('V8 calibration planner exercise policy', () => {
  it('holds one available Cross, reserves Di María and commits RABONA instead of spending the Cross first', () => {
    let state = createV8CalibrationState({ homeDeck: ['di-maria'], homeEnergy: 2 });
    state = addCalibrationTacticalToHand(state, 'home', 'cross').state;
    const cross = calibrationHandTacticals(state, 'home').find((card) => card.type === 'cross')!;

    const planned = planV8CalibrationSide(state, 'home', false);

    expect(planned.pending).toContainEqual({ kind: 'player', side: 'home', cardId: 'di-maria', zone: 'MID', cost: 2 });
    expect(planned.pending.some((play) => play.kind === 'tactical' && play.card.id === cross.id)).toBe(false);
    expect(calibrationHandTacticals(planned.state, 'home').some((card) => card.id === cross.id)).toBe(true);
  });

  it('moves Cafu forward during commitment so PENDOLINO creates an immediately available Cross', () => {
    let state = createV8CalibrationState({ homeEnergy: 0 });
    state = seedCalibrationPlayer(state, 'home', 'cafu', 'DEF');

    const planned = planV8CalibrationSide(state, 'home', false);
    const cafu = planned.state.players[calibrationRuntimeId('home', 'cafu')]!;
    const cross = calibrationHandTacticals(planned.state, 'home').find((card) => card.type === 'cross');

    expect(cafu.zone).toBe('MID');
    expect(cross).toBeDefined();
    expect(isCalibrationTacticalAvailable(planned.state, cross!)).toBe(true);
    expect(planned.state.events.some((event) => event.type === 'player_moved' && event.text.includes('Cafu'))).toBe(true);
  });

  it('moves Beckenbauer between natural lines so DER KAISER is actually exercised', () => {
    let state = createV8CalibrationState({ homeEnergy: 0 });
    state = seedCalibrationPlayer(state, 'home', 'beckenbauer', 'DEF');

    const planned = planV8CalibrationSide(state, 'home', false);
    const runtimeId = calibrationRuntimeId('home', 'beckenbauer');

    expect(planned.state.players[runtimeId]?.zone).toBe('MID');
    expect(currentCalibrationAttack(planned.state, runtimeId)).toBe(getV8CalibrationPlayer('beckenbauer').printedAttack + 2);
    expect(currentCalibrationDefence(planned.state, runtimeId)).toBe(getV8CalibrationPlayer('beckenbauer').printedDefence + 2);
  });
});
