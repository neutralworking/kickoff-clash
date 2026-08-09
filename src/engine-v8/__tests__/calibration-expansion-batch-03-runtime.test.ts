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

  it('BLACK SPIDER reduces only the first opposing ATT Chance each period, to a minimum of zero', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'yashin', 'DEF');

    const first = addCalibrationTacticalToHand(state, 'away', 'cross');
    state = playCalibrationTactical(first.state, 'away', first.card.id, 'ATT');
    const firstResolution = state.tacticalResolutions.find((item) => item.cardId === first.card.id);
    expect(firstResolution?.cancelled).toBe(false);
    expect(firstResolution?.attack).toBe(0);

    const second = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(second.state, 'away', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.attack).toBe(2);

    state = endV8CalibrationPeriod(state);
    state.teams.away.energy = 20;
    const third = addCalibrationTacticalToHand(state, 'away', 'cross');
    state = playCalibrationTactical(third.state, 'away', third.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === third.card.id)?.attack).toBe(0);
  });

  it('GET ACROSS HIM prevents one actual Cross cancellation per period, not every Cross', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'cavani', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'schmeichel', 'DEF');
    const keeperId = calibrationRuntimeId('away', 'schmeichel');

    const first = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    const firstResolution = state.tacticalResolutions.find((item) => item.cardId === first.card.id);
    expect(firstResolution?.cancelled).toBe(false);
    expect(firstResolution?.uncancellable).toBe(true);
    expect(firstResolution?.attack).toBeGreaterThan(0);

    // Re-arm the keeper only to force a second cancellation attempt in this same period. Cavani's
    // own once-per-period counter is deliberately left consumed.
    state.periodCounters[`schmeichel-first-chance:${keeperId}:DEF`] = 0;
    const second = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.cancelled).toBe(true);
  });

  it('OVERLAP dynamically rebinds +2 ATT from one friendly WF to the stronger WF in ATT', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'lucy-bronze', 'MID');
    const bronzeId = calibrationRuntimeId('home', 'lucy-bronze');

    state = revealCalibrationPlayer(state, 'home', 'abedi-pele', 'ATT');
    const abediId = calibrationRuntimeId('home', 'abedi-pele');
    expect(currentCalibrationAttack(state, bronzeId)).toBe(getV8CalibrationPlayer('lucy-bronze').printedAttack + 2);
    expect(currentCalibrationAttack(state, abediId)).toBe(getV8CalibrationPlayer('abedi-pele').printedAttack + 2);

    state = revealCalibrationPlayer(state, 'home', 'brian-laudrup', 'ATT');
    const laudrupId = calibrationRuntimeId('home', 'brian-laudrup');
    expect(currentCalibrationAttack(state, bronzeId)).toBe(getV8CalibrationPlayer('lucy-bronze').printedAttack + 2);
    expect(currentCalibrationAttack(state, abediId)).toBe(getV8CalibrationPlayer('abedi-pele').printedAttack);
    expect(currentCalibrationAttack(state, laudrupId)).toBe(getV8CalibrationPlayer('brian-laudrup').printedAttack + 2);
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