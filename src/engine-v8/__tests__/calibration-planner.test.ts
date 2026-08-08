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

    const planned = planV8CalibrationSide(state, 'home', false, 'cross');

    expect(planned.pending).toContainEqual({ kind: 'player', side: 'home', cardId: 'di-maria', zone: 'MID', cost: 2 });
    expect(planned.pending.some((play) => play.kind === 'tactical' && play.card.id === cross.id)).toBe(false);
    expect(calibrationHandTacticals(planned.state, 'home').some((card) => card.id === cross.id)).toBe(true);
  });

  it('moves Cafu forward during commitment so PENDOLINO creates an immediately available Cross', () => {
    let state = createV8CalibrationState({ homeEnergy: 0 });
    state = seedCalibrationPlayer(state, 'home', 'cafu', 'DEF');

    const planned = planV8CalibrationSide(state, 'home', false, 'cross');
    const cafu = planned.state.players[calibrationRuntimeId('home', 'cafu')]!;
    const cross = calibrationHandTacticals(planned.state, 'home').find((card) => card.type === 'cross');

    expect(cafu.zone).toBe('MID');
    expect(cross).toBeDefined();
    expect(isCalibrationTacticalAvailable(planned.state, cross!)).toBe(true);
    expect(planned.state.events.some((event) => event.type === 'player_moved' && event.text.includes('Cafu'))).toBe(true);
  });

  it('moves Beckenbauer between natural lines so DER KAISER is exercised in the reference profile', () => {
    let state = createV8CalibrationState({ homeEnergy: 0 });
    state = seedCalibrationPlayer(state, 'home', 'beckenbauer', 'DEF');

    const planned = planV8CalibrationSide(state, 'home', false, 'balanced_midrange');
    const runtimeId = calibrationRuntimeId('home', 'beckenbauer');

    expect(planned.state.players[runtimeId]?.zone).toBe('MID');
    expect(currentCalibrationAttack(planned.state, runtimeId)).toBe(getV8CalibrationPlayer('beckenbauer').printedAttack + 2);
    expect(currentCalibrationDefence(planned.state, runtimeId)).toBe(getV8CalibrationPlayer('beckenbauer').printedDefence + 2);
  });

  it('establishes a Through Ball runner before cheap generic support when both are affordable', () => {
    const state = createV8CalibrationState({ homeDeck: ['bremner', 'morgan'], homeEnergy: 4 });

    const planned = planV8CalibrationSide(state, 'home', false, 'through_ball');

    expect(planned.pending[0]).toEqual({ kind: 'player', side: 'home', cardId: 'morgan', zone: 'ATT', cost: 3 });
    expect(planned.pending[1]).toEqual({ kind: 'player', side: 'home', cardId: 'bremner', zone: 'MID', cost: 1 });
  });

  it('puts Penalty enablers in ATT even when Panenka takes the normal OOP penalty', () => {
    const panenkaState = createV8CalibrationState({ homeDeck: ['panenka'], homeEnergy: 1 });
    const panenka = planV8CalibrationSide(panenkaState, 'home', false, 'dribbling_penalty');
    expect(panenka.pending[0]).toEqual({ kind: 'player', side: 'home', cardId: 'panenka', zone: 'ATT', cost: 1 });

    const neymarState = createV8CalibrationState({ homeDeck: ['neymar'], homeEnergy: 3 });
    const neymar = planV8CalibrationSide(neymarState, 'home', false, 'dribbling_penalty');
    expect(neymar.pending[0]).toEqual({ kind: 'player', side: 'home', cardId: 'neymar', zone: 'ATT', cost: 3 });
  });

  it('sequences Duff before Neymar in P3 when the ready Penalty pair already fits', () => {
    const state = createV8CalibrationState({ homeDeck: ['duff', 'neymar'], homeEnergy: 6 });
    state.period = 3;

    const planned = planV8CalibrationSide(state, 'home', false, 'dribbling_penalty');

    expect(planned.pending).toEqual([
      { kind: 'player', side: 'home', cardId: 'duff', zone: 'ATT', cost: 3 },
      { kind: 'player', side: 'home', cardId: 'neymar', zone: 'ATT', cost: 3 },
    ]);
  });

  it('sequences Panenka before Duff and Neymar in P4 when the whole ready Penalty line fits', () => {
    const state = createV8CalibrationState({ homeDeck: ['panenka', 'duff', 'neymar'], homeEnergy: 8 });
    state.period = 4;

    const planned = planV8CalibrationSide(state, 'home', false, 'dribbling_penalty');

    expect(planned.pending).toEqual([
      { kind: 'player', side: 'home', cardId: 'panenka', zone: 'ATT', cost: 1 },
      { kind: 'player', side: 'home', cardId: 'duff', zone: 'ATT', cost: 3 },
      { kind: 'player', side: 'home', cardId: 'neymar', zone: 'ATT', cost: 3 },
    ]);
  });

  it('does not hoard a future Penalty pair when Duff and Neymar do not both fit this period', () => {
    const state = createV8CalibrationState({ homeDeck: ['panenka', 'duff', 'neymar'], homeEnergy: 4 });
    state.period = 2;

    const planned = planV8CalibrationSide(state, 'home', false, 'dribbling_penalty');

    expect(planned.pending).toEqual([
      { kind: 'player', side: 'home', cardId: 'panenka', zone: 'ATT', cost: 1 },
      { kind: 'player', side: 'home', cardId: 'duff', zone: 'ATT', cost: 3 },
    ]);
  });

  it('holds an available Penalty long enough to deploy Panenka in ATT first', () => {
    let state = createV8CalibrationState({ homeDeck: ['panenka'], homeEnergy: 1 });
    state = addCalibrationTacticalToHand(state, 'home', 'penalty').state;
    const penalty = calibrationHandTacticals(state, 'home').find((card) => card.type === 'penalty')!;

    const planned = planV8CalibrationSide(state, 'home', false, 'dribbling_penalty');

    expect(planned.pending[0]).toEqual({ kind: 'player', side: 'home', cardId: 'panenka', zone: 'ATT', cost: 1 });
    expect(planned.pending.some((play) => play.kind === 'tactical' && play.card.id === penalty.id)).toBe(false);
  });

  it('keeps Ramos back before P3, then sends him to ATT for the late set-piece payoff', () => {
    const early = createV8CalibrationState({ homeDeck: ['ramos'], homeEnergy: 4 });
    const earlyPlan = planV8CalibrationSide(early, 'home', false, 'long_shot_set_piece');
    expect(earlyPlan.pending).toHaveLength(0);

    const late = createV8CalibrationState({ homeDeck: ['ramos'], homeEnergy: 6 });
    late.period = 3;
    const latePlan = planV8CalibrationSide(late, 'home', false, 'long_shot_set_piece');
    expect(latePlan.pending[0]).toEqual({ kind: 'player', side: 'home', cardId: 'ramos', zone: 'ATT', cost: 2 });
  });
});
