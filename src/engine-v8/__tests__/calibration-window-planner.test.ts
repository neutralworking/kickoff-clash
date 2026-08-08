import { describe, expect, it } from 'vitest';
import {
  createV8CalibrationState,
  planV8CalibrationWindow,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
  type V8CalibrationState,
} from '../index';

function stateWithEnergy(period = 1, energy = 9): V8CalibrationState {
  const state = createV8CalibrationState({ period });
  state.teams.home.energy = energy;
  state.teams.away.energy = energy;
  return state;
}

describe('calibration Generated-Tactical Window sequencing', () => {
  it('cashes ordinary generated Chances immediately rather than waiting a second commitment cycle', () => {
    let cross = stateWithEnergy();
    cross = revealCalibrationPlayer(cross, 'home', 'beckham', 'MID');
    expect(planV8CalibrationWindow(cross, 'home', 'cross')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);

    let throughBall = stateWithEnergy();
    throughBall = revealCalibrationPlayer(throughBall, 'home', 'valderrama', 'MID');
    expect(planV8CalibrationWindow(throughBall, 'home', 'through_ball')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);

    let longShot = stateWithEnergy();
    longShot = revealCalibrationPlayer(longShot, 'home', 'charlton', 'MID');
    expect(planV8CalibrationWindow(longShot, 'home', 'long_shot_set_piece')).toMatchObject([
      { side: 'home', zone: 'MID' },
    ]);

    let penalty = stateWithEnergy();
    penalty = seedCalibrationPlayer(penalty, 'away', 'ramos', 'DEF');
    penalty = revealCalibrationPlayer(penalty, 'home', 'duff', 'ATT');
    penalty = revealCalibrationPlayer(penalty, 'home', 'neymar', 'ATT');
    expect(planV8CalibrationWindow(penalty, 'home', 'dribbling_penalty')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);
  });

  it('holds Eriksen\'s P3 Corner for an established Ramos, then cashes a P4 Corner', () => {
    let periodThree = stateWithEnergy(3);
    periodThree = seedCalibrationPlayer(periodThree, 'home', 'ramos', 'ATT');
    periodThree = revealCalibrationPlayer(periodThree, 'home', 'eriksen', 'MID');
    expect(planV8CalibrationWindow(periodThree, 'home', 'long_shot_set_piece')).toEqual([]);

    let periodFour = stateWithEnergy(4);
    periodFour = seedCalibrationPlayer(periodFour, 'home', 'ramos', 'ATT');
    periodFour = revealCalibrationPlayer(periodFour, 'home', 'eriksen', 'MID');
    expect(planV8CalibrationWindow(periodFour, 'home', 'long_shot_set_piece')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);
  });

  it('clears THREE LUNGS in its free window even if ATT is empty, avoiding a printed-cost carryover tax', () => {
    let emptyAtt = stateWithEnergy();
    emptyAtt = revealCalibrationPlayer(emptyAtt, 'home', 'park', 'MID');
    expect(planV8CalibrationWindow(emptyAtt, 'home', 'balanced_midrange')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);

    let occupiedAtt = stateWithEnergy();
    occupiedAtt = seedCalibrationPlayer(occupiedAtt, 'home', 'wambach', 'ATT');
    occupiedAtt = revealCalibrationPlayer(occupiedAtt, 'home', 'park', 'MID');
    expect(planV8CalibrationWindow(occupiedAtt, 'home', 'balanced_midrange')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);
  });

  it('spends Offside Trap when the opponent has a window Through Ball, because that Chance is cashed now', () => {
    let state = stateWithEnergy();
    state = revealCalibrationPlayer(state, 'home', 'baresi', 'DEF');
    state = revealCalibrationPlayer(state, 'away', 'valderrama', 'MID');

    expect(planV8CalibrationWindow(state, 'home', 'control_defence')).toMatchObject([
      { side: 'home', zone: 'DEF' },
    ]);
    expect(planV8CalibrationWindow(state, 'away', 'through_ball')).toMatchObject([
      { side: 'away', zone: 'ATT' },
    ]);
  });

  it('holds Offside Trap when there is no opposing window Through Ball to cancel', () => {
    let state = stateWithEnergy();
    state = revealCalibrationPlayer(state, 'home', 'baresi', 'DEF');
    expect(planV8CalibrationWindow(state, 'home', 'control_defence')).toEqual([]);
  });
});
