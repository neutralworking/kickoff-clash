import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  moveCalibrationPlayer,
  playCalibrationTactical,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
} from '../index';

describe('V8 expansion Batch 03 runtime primitives', () => {
  it('READS IT EARLY adds +4 DEF only while the facing attack exceeds baseline zone DEF', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'cannavaro', 'DEF');
    const cannavaroId = calibrationRuntimeId('home', 'cannavaro');
    expect(currentCalibrationDefence(state, cannavaroId)).toBe(getV8CalibrationPlayer('cannavaro').printedDefence);

    state = revealCalibrationPlayer(state, 'away', 'wambach', 'ATT');
    expect(currentCalibrationDefence(state, cannavaroId)).toBe(getV8CalibrationPlayer('cannavaro').printedDefence + 4);

    state = revealCalibrationPlayer(state, 'home', 'puyol', 'DEF');
    expect(currentCalibrationDefence(state, cannavaroId)).toBe(getV8CalibrationPlayer('cannavaro').printedDefence);
    expect(state.players[cannavaroId]?.modifiers.filter((modifier) => modifier.source?.startsWith('READS IT EARLY:'))).toHaveLength(0);
  });

  it('SLALOM RUN moves MID → ATT once per match, bursts +4 ATT and protects the next ATT Chance', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'away', 'schmeichel', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'maradona', 'MID');
    const maradonaId = calibrationRuntimeId('home', 'maradona');

    state = moveCalibrationPlayer(state, 'home', 'maradona', 'ATT');
    expect(state.players[maradonaId]?.zone).toBe('ATT');
    expect(currentCalibrationAttack(state, maradonaId)).toBe(getV8CalibrationPlayer('maradona').printedAttack + 4);
    expect(() => moveCalibrationPlayer(state, 'home', 'maradona', 'MID')).toThrow('already moved this match');

    const chance = addCalibrationTacticalToHand(state, 'home', 'through_ball');
    state = playCalibrationTactical(chance.state, 'home', chance.card.id, 'ATT');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === chance.card.id);
    expect(resolution?.uncancellable).toBe(true);
    expect(resolution?.cancelled).toBe(false);

    state = endV8CalibrationPeriod(state);
    expect(currentCalibrationAttack(state, maradonaId)).toBe(getV8CalibrationPlayer('maradona').printedAttack);
    expect(() => moveCalibrationPlayer(state, 'home', 'maradona', 'MID')).toThrow('already moved this match');
  });

  it('FIRST TOUCH gives only the first team Chance each period +2 ATT and resets next period', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'bergkamp', 'ATT');

    const first = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === first.card.id)?.attack).toBe(4);

    const second = addCalibrationTacticalToHand(state, 'home', 'through_ball');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.attack).toBe(2);

    state = endV8CalibrationPeriod(state);
    state.teams.home.energy = 20;
    const third = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(third.state, 'home', third.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === third.card.id)?.attack).toBe(4);
  });
});