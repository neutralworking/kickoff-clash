import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationRuntimeId,
  calibrationZoneTotals,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  playCalibrationTactical,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  storeCalibrationMatchScore,
  withCalibrationActionRngSeed,
} from '../index';

describe('V8 expansion Batch 07 runtime', () => {
  it('registers seven source-grounded runtime cards and leaves Angerer out of the playable registry', () => {
    expect(getV8CalibrationPlayer('achraf-hakimi')).toMatchObject({ printedAttack: 4, printedDefence: 6, cost: 3, actionName: 'BOMB ON' });
    expect(getV8CalibrationPlayer('annike-krahn')).toMatchObject({ printedAttack: 1, printedDefence: 10, cost: 3, actionName: 'STEP ACROSS' });
    expect(getV8CalibrationPlayer('nemanja-vidic')).toMatchObject({ printedAttack: 1, printedDefence: 10, cost: 3, actionName: 'PARTNERSHIP' });
    expect(getV8CalibrationPlayer('rio-ferdinand')).toMatchObject({ printedAttack: 1, printedDefence: 10, cost: 3, actionName: 'PARTNERSHIP' });
    expect(getV8CalibrationPlayer('sol-campbell')).toMatchObject({ printedAttack: 1, printedDefence: 10, cost: 3, actionName: 'MARSHAL' });
    expect(getV8CalibrationPlayer('zlatan-ibrahimovic')).toMatchObject({ printedAttack: 11, printedDefence: 1, cost: 4, actionName: 'ALPHA' });
    expect(getV8CalibrationPlayer('roy-keane')).toMatchObject({ printedAttack: 4, printedDefence: 6, cost: 3, actionName: 'REDUCER' });
    expect(() => getV8CalibrationPlayer('nadine-angerer')).toThrow();
  });

  it('PARTNERSHIP is functional alone and becomes asymmetrically stronger when the pair is deployed', () => {
    let state = createV8CalibrationState({ homeEnergy: 30, awayEnergy: 30 });
    const vidicId = calibrationRuntimeId('home', 'nemanja-vidic');
    const rioId = calibrationRuntimeId('home', 'rio-ferdinand');

    state = revealCalibrationPlayer(state, 'home', 'nemanja-vidic', 'DEF');
    expect(currentCalibrationDefence(state, vidicId)).toBe(12);

    state = revealCalibrationPlayer(state, 'home', 'rio-ferdinand', 'DEF');
    expect(currentCalibrationDefence(state, vidicId)).toBe(15);
    expect(currentCalibrationAttack(state, rioId)).toBe(6);
    expect(currentCalibrationAttack(state, vidicId)).toBe(1);
    expect(currentCalibrationDefence(state, rioId)).toBe(10);
  });

  it('MARSHAL adds zone contribution without falsifying Campbell DEF and does not stack on refresh', () => {
    let state = createV8CalibrationState({ homeEnergy: 30, awayEnergy: 30 });
    const campbellId = calibrationRuntimeId('home', 'sol-campbell');
    const robbenId = calibrationRuntimeId('home', 'arjen-robben');

    state = revealCalibrationPlayer(state, 'home', 'sol-campbell', 'DEF');
    expect(currentCalibrationDefence(state, campbellId)).toBe(10);
    expect(calibrationZoneTotals(state, 'home', 'DEF').defence).toBe(13);

    state = revealCalibrationPlayer(state, 'home', 'arjen-robben', 'ATT');
    expect(currentCalibrationAttack(state, robbenId)).toBe(getV8CalibrationPlayer('arjen-robben').printedAttack - 2);
    expect(currentCalibrationDefence(state, campbellId)).toBe(10);
    expect(calibrationZoneTotals(state, 'home', 'DEF').defence).toBe(13);

    state = revealCalibrationPlayer(state, 'home', 'alan-shearer', 'ATT');
    expect(calibrationZoneTotals(state, 'home', 'DEF').defence).toBe(13);
  });

  it('ALPHA concentrates real ATT in Zlatan while reducing only the other forwards', () => {
    let state = createV8CalibrationState({ homeEnergy: 30, awayEnergy: 30 });
    const zlatanId = calibrationRuntimeId('home', 'zlatan-ibrahimovic');
    const robbenId = calibrationRuntimeId('home', 'arjen-robben');
    const keaneId = calibrationRuntimeId('home', 'roy-keane');

    state = revealCalibrationPlayer(state, 'home', 'arjen-robben', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'roy-keane', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'zlatan-ibrahimovic', 'ATT');

    expect(currentCalibrationAttack(state, zlatanId)).toBe(17);
    expect(currentCalibrationAttack(state, robbenId)).toBe(getV8CalibrationPlayer('arjen-robben').printedAttack - 2);
    expect(currentCalibrationAttack(state, keaneId)).toBe(4);
  });

  it('BOMB ON converts only the first qualifying ATT Chance while trailing and preserves paid Cost', () => {
    let state = createV8CalibrationState({ homeEnergy: 30, awayEnergy: 30 });
    state = storeCalibrationMatchScore(state, { home: 0, away: 1 });
    state = revealCalibrationPlayer(state, 'home', 'achraf-hakimi', 'MID');

    const first = addCalibrationTacticalToHand(state, 'home', 'through_ball', { costModifier: 2 });
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    expect(state.tacticalResolutions.find((resolution) => resolution.cardId === first.card.id)).toMatchObject({
      type: 'cross',
      cost: 3,
      attack: 2,
    });
    expect(state.events.some((event) => event.text.includes('BOMB ON turns Through Ball into a Cross'))).toBe(true);

    const second = addCalibrationTacticalToHand(state, 'home', 'long_shot');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((resolution) => resolution.cardId === second.card.id)?.type).toBe('long_shot');
  });

  it('BOMB ON uses the same transformation path in the Generated-Tactical Window', () => {
    let state = createV8CalibrationState({ homeEnergy: 30, awayEnergy: 30 });
    state = storeCalibrationMatchScore(state, { home: 0, away: 2 });
    state = revealCalibrationPlayer(state, 'home', 'achraf-hakimi', 'MID');
    const generated = addCalibrationTacticalToHand(state, 'home', 'long_shot', { costModifier: 1 });

    const window = resolveGeneratedTacticalWindow(generated.state, [{ side: 'home', cardId: generated.card.id, zone: 'ATT' }]);
    expect(window.plays[0]).toMatchObject({ cost: 2, card: { type: 'cross' } });
    expect(window.state.tacticalResolutions.find((resolution) => resolution.cardId === generated.card.id)).toMatchObject({
      type: 'cross',
      cost: 2,
      window: true,
    });
  });

  it('STEP ACROSS can steer a Through Ball into the Cross route before Robben cuts inside', () => {
    let state = createV8CalibrationState({ homeEnergy: 30, awayEnergy: 30 });
    state = revealCalibrationPlayer(state, 'away', 'annike-krahn', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'arjen-robben', 'ATT');
    const chance = addCalibrationTacticalToHand(state, 'home', 'through_ball', { costModifier: 2 });
    state = playCalibrationTactical(chance.state, 'home', chance.card.id, 'ATT');

    const resolution = state.tacticalResolutions.find((item) => item.cardId === chance.card.id);
    expect(resolution).toMatchObject({ type: 'long_shot', cost: 3 });
    expect(state.events.some((event) => event.text.includes('STEP ACROSS turns Through Ball into a Cross'))).toBe(true);
    expect(state.events.some((event) => event.text.includes('CUT INSIDE turns Cross into a Long Shot'))).toBe(true);
  });

  it('REDUCER binds the highest-ATT opposing forward and recovery never overshoots the original debuff', () => {
    let state = createV8CalibrationState({ homeEnergy: 30, awayEnergy: 30 });
    state = withCalibrationActionRngSeed(state, 5000);
    state = revealCalibrationPlayer(state, 'away', 'zlatan-ibrahimovic', 'ATT');
    state = revealCalibrationPlayer(state, 'away', 'arjen-robben', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'roy-keane', 'MID');

    const zlatanId = calibrationRuntimeId('away', 'zlatan-ibrahimovic');
    const robbenId = calibrationRuntimeId('away', 'arjen-robben');
    expect(currentCalibrationAttack(state, zlatanId)).toBe(12);
    expect(currentCalibrationAttack(state, robbenId)).toBe(getV8CalibrationPlayer('arjen-robben').printedAttack - 2);
    expect(state.events.some((event) => event.text.includes('REDUCER binds Zlatan Ibrahimović'))).toBe(true);

    state = endV8CalibrationPeriod(state, { home: 0, away: 0 });
    expect(currentCalibrationAttack(state, zlatanId)).toBe(14);
    expect(state.events.some((event) => event.text.includes('recovers 2 ATT from REDUCER'))).toBe(true);

    state = endV8CalibrationPeriod(state, { home: 0, away: 0 });
    expect(currentCalibrationAttack(state, zlatanId)).toBe(14);
  });
});
