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
  it('holds a Cross until the Cross squad has a finisher, but cashes it in P4', () => {
    let noFinisher = stateWithEnergy();
    noFinisher = revealCalibrationPlayer(noFinisher, 'home', 'beckham', 'MID');
    expect(planV8CalibrationWindow(noFinisher, 'home', 'cross')).toEqual([]);

    let withFinisher = stateWithEnergy();
    withFinisher = seedCalibrationPlayer(withFinisher, 'home', 'wambach', 'ATT');
    withFinisher = revealCalibrationPlayer(withFinisher, 'home', 'beckham', 'MID');
    expect(planV8CalibrationWindow(withFinisher, 'home', 'cross')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);

    let finalPeriod = stateWithEnergy(4);
    finalPeriod = revealCalibrationPlayer(finalPeriod, 'home', 'beckham', 'MID');
    expect(planV8CalibrationWindow(finalPeriod, 'home', 'cross')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);
  });

  it('holds a Through Ball until a runner is established in ATT', () => {
    let noRunner = stateWithEnergy();
    noRunner = revealCalibrationPlayer(noRunner, 'home', 'valderrama', 'MID');
    expect(planV8CalibrationWindow(noRunner, 'home', 'through_ball')).toEqual([]);

    let withRunner = stateWithEnergy();
    withRunner = seedCalibrationPlayer(withRunner, 'home', 'shevchenko', 'ATT');
    withRunner = revealCalibrationPlayer(withRunner, 'home', 'valderrama', 'MID');
    expect(planV8CalibrationWindow(withRunner, 'home', 'through_ball')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);
  });

  it('holds a Long Shot until Lloyd is established in MID', () => {
    let noLloyd = stateWithEnergy();
    noLloyd = revealCalibrationPlayer(noLloyd, 'home', 'charlton', 'MID');
    expect(planV8CalibrationWindow(noLloyd, 'home', 'long_shot_set_piece')).toEqual([]);

    let withLloyd = stateWithEnergy();
    withLloyd = seedCalibrationPlayer(withLloyd, 'home', 'lloyd', 'MID');
    withLloyd = revealCalibrationPlayer(withLloyd, 'home', 'charlton', 'MID');
    expect(planV8CalibrationWindow(withLloyd, 'home', 'long_shot_set_piece')).toMatchObject([
      { side: 'home', zone: 'MID' },
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

  it('holds a Penalty until Panenka is established in ATT', () => {
    let noPanenka = stateWithEnergy();
    noPanenka = seedCalibrationPlayer(noPanenka, 'away', 'ramos', 'DEF');
    noPanenka = revealCalibrationPlayer(noPanenka, 'home', 'duff', 'ATT');
    noPanenka = revealCalibrationPlayer(noPanenka, 'home', 'neymar', 'ATT');
    expect(planV8CalibrationWindow(noPanenka, 'home', 'dribbling_penalty')).toEqual([]);

    let withPanenka = stateWithEnergy();
    withPanenka = seedCalibrationPlayer(withPanenka, 'away', 'ramos', 'DEF');
    withPanenka = seedCalibrationPlayer(withPanenka, 'home', 'panenka', 'ATT');
    withPanenka = revealCalibrationPlayer(withPanenka, 'home', 'duff', 'ATT');
    withPanenka = revealCalibrationPlayer(withPanenka, 'home', 'neymar', 'ATT');
    expect(planV8CalibrationWindow(withPanenka, 'home', 'dribbling_penalty')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);
  });

  it('does not spend THREE LUNGS into an empty ATT line', () => {
    let emptyAtt = stateWithEnergy();
    emptyAtt = revealCalibrationPlayer(emptyAtt, 'home', 'park', 'MID');
    expect(planV8CalibrationWindow(emptyAtt, 'home', 'balanced_midrange')).toEqual([]);

    let occupiedAtt = stateWithEnergy();
    occupiedAtt = seedCalibrationPlayer(occupiedAtt, 'home', 'wambach', 'ATT');
    occupiedAtt = revealCalibrationPlayer(occupiedAtt, 'home', 'park', 'MID');
    expect(planV8CalibrationWindow(occupiedAtt, 'home', 'balanced_midrange')).toMatchObject([
      { side: 'home', zone: 'ATT' },
    ]);
  });

  it('spends Offside Trap only when a window Through Ball is expected to be played', () => {
    let noRunner = stateWithEnergy();
    noRunner = revealCalibrationPlayer(noRunner, 'home', 'baresi', 'DEF');
    noRunner = revealCalibrationPlayer(noRunner, 'away', 'valderrama', 'MID');
    expect(planV8CalibrationWindow(noRunner, 'home', 'control_defence')).toEqual([]);
    expect(planV8CalibrationWindow(noRunner, 'away', 'through_ball')).toEqual([]);

    let withRunner = stateWithEnergy();
    withRunner = seedCalibrationPlayer(withRunner, 'away', 'shevchenko', 'ATT');
    withRunner = revealCalibrationPlayer(withRunner, 'home', 'baresi', 'DEF');
    withRunner = revealCalibrationPlayer(withRunner, 'away', 'valderrama', 'MID');
    expect(planV8CalibrationWindow(withRunner, 'home', 'control_defence')).toMatchObject([
      { side: 'home', zone: 'DEF' },
    ]);
    expect(planV8CalibrationWindow(withRunner, 'away', 'through_ball')).toMatchObject([
      { side: 'away', zone: 'ATT' },
    ]);
  });
});
