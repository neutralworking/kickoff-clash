import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  getV8CalibrationPlayer,
  moveCalibrationPlayer,
  playCalibrationTactical,
  refreshCalibrationScoreState,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
} from '../index';

describe('V8 expansion Batch 01 runtime primitives', () => {
  it('JINKING RUN moves once per match and rewards MID → ATT', () => {
    let state = createV8CalibrationState();
    state = revealCalibrationPlayer(state, 'home', 'abedi-pele', 'MID');
    const runtimeId = calibrationRuntimeId('home', 'abedi-pele');

    expect(currentCalibrationAttack(state, runtimeId)).toBe(9);
    state = moveCalibrationPlayer(state, 'home', 'abedi-pele', 'ATT');
    expect(currentCalibrationAttack(state, runtimeId)).toBe(13);
    expect(state.players[runtimeId]?.zone).toBe('ATT');
    expect(() => moveCalibrationPlayer(state, 'home', 'abedi-pele', 'MID')).toThrow('already moved this match');
  });

  it('CHEEKY CHIP reads the live zone confrontation rather than match score', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'away', 'schmeichel', 'DEF');
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'dempsey', 'ATT');

    const runtimeId = calibrationRuntimeId('home', 'dempsey');
    expect(getV8CalibrationPlayer('dempsey').actionName).toBe('CHEEKY CHIP');
    expect(currentCalibrationAttack(state, runtimeId)).toBe(15);
  });

  it('END-TO-END RUN replaces its live score-state modifier instead of stacking it', () => {
    let state = createV8CalibrationState();
    state = revealCalibrationPlayer(state, 'home', 'di-stefano', 'ATT');
    const runtimeId = calibrationRuntimeId('home', 'di-stefano');

    expect(currentCalibrationAttack(state, runtimeId)).toBe(11);
    expect(currentCalibrationDefence(state, runtimeId)).toBe(2);

    state = refreshCalibrationScoreState(state, { home: 0, away: 1 });
    expect(currentCalibrationAttack(state, runtimeId)).toBe(13);
    expect(currentCalibrationDefence(state, runtimeId)).toBe(1);

    state = refreshCalibrationScoreState(state, { home: 2, away: 1 });
    expect(currentCalibrationAttack(state, runtimeId)).toBe(10);
    expect(currentCalibrationDefence(state, runtimeId)).toBe(4);
    expect(state.players[runtimeId]?.modifiers.filter((modifier) => modifier.source === 'END-TO-END RUN')).toHaveLength(1);
  });

  it('BODY ON THE LINE cancels the first otherwise-resolving Chance, then costs Puyol 3 DEF', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'puyol', 'DEF');
    const first = addCalibrationTacticalToHand(state, 'away', 'cross');
    state = first.state;
    state = playCalibrationTactical(state, 'away', first.card.id, 'ATT');

    const puyolId = calibrationRuntimeId('home', 'puyol');
    const firstResolution = state.tacticalResolutions.find((resolution) => resolution.cardId === first.card.id);
    expect(firstResolution?.cancelled).toBe(true);
    expect(firstResolution?.attack).toBe(0);
    expect(currentCalibrationDefence(state, puyolId)).toBe(6);

    const second = addCalibrationTacticalToHand(state, 'away', 'cross');
    state = second.state;
    state = playCalibrationTactical(state, 'away', second.card.id, 'ATT');
    const secondResolution = state.tacticalResolutions.find((resolution) => resolution.cardId === second.card.id);
    expect(secondResolution?.cancelled).toBe(false);
    expect(secondResolution?.attack).toBeGreaterThan(0);
    expect(currentCalibrationDefence(state, puyolId)).toBe(6);
  });

  it('BODY ON THE LINE does not fire into an uncancellable Chance', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'puyol', 'DEF');
    const penalty = addCalibrationTacticalToHand(state, 'away', 'penalty', { cancellable: false });
    state = penalty.state;
    state = playCalibrationTactical(state, 'away', penalty.card.id, 'ATT');

    const puyolId = calibrationRuntimeId('home', 'puyol');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === penalty.card.id);
    expect(resolution?.cancelled).toBe(false);
    expect(currentCalibrationDefence(state, puyolId)).toBe(9);
    expect(state.matchCounters[`puyol-body-on-the-line:${puyolId}`] ?? 0).toBe(0);
  });
});
