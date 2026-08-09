import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  playCalibrationTactical,
  resolveGeneratedTacticalWindow,
  seedCalibrationPlayer,
} from '../index';

describe('V8 expansion Batch 04 Tactical reaction primitives', () => {
  it('IMPOSSIBLE SAVE ignores low-value Chances and cancels the first cancellable 4+ ATT Chance once per match', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'gordon-banks', 'DEF');

    const low = addCalibrationTacticalToHand(state, 'away', 'cross');
    state = playCalibrationTactical(low.state, 'away', low.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === low.card.id)?.cancelled).toBe(false);

    const high = addCalibrationTacticalToHand(state, 'away', 'cross', { attModifier: 2 });
    state = playCalibrationTactical(high.state, 'away', high.card.id, 'ATT');
    const highResolution = state.tacticalResolutions.find((item) => item.cardId === high.card.id);
    expect(highResolution?.cancelled).toBe(true);
    expect(highResolution?.attack).toBe(0);

    const secondHigh = addCalibrationTacticalToHand(state, 'away', 'penalty');
    state = playCalibrationTactical(secondHigh.state, 'away', secondHigh.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === secondHigh.card.id)?.cancelled).toBe(false);
  });

  it('IMPOSSIBLE SAVE does not spend itself on an uncancellable high-value Chance', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'gordon-banks', 'DEF');

    const protectedChance = addCalibrationTacticalToHand(state, 'away', 'cross', { attModifier: 2, cancellable: false });
    state = playCalibrationTactical(protectedChance.state, 'away', protectedChance.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === protectedChance.card.id)?.cancelled).toBe(false);

    const ordinaryHigh = addCalibrationTacticalToHand(state, 'away', 'penalty');
    state = playCalibrationTactical(ordinaryHigh.state, 'away', ordinaryHigh.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === ordinaryHigh.card.id)?.cancelled).toBe(true);
  });

  it('HEAD WHERE IT HURTS cancels the second live ATT Chance in a period and permanently costs Terry 3 DEF', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'john-terry', 'DEF');
    const terryId = calibrationRuntimeId('home', 'john-terry');

    const first = addCalibrationTacticalToHand(state, 'away', 'cross');
    state = playCalibrationTactical(first.state, 'away', first.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === first.card.id)?.cancelled).toBe(false);

    const second = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(second.state, 'away', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.cancelled).toBe(true);
    expect(currentCalibrationDefence(state, terryId)).toBe(getV8CalibrationPlayer('john-terry').printedDefence - 3);

    state = endV8CalibrationPeriod(state);
    state.teams.away.energy = 20;
    const third = addCalibrationTacticalToHand(state, 'away', 'cross');
    state = playCalibrationTactical(third.state, 'away', third.card.id, 'ATT');
    const fourth = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(fourth.state, 'away', fourth.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === fourth.card.id)?.cancelled).toBe(false);
    expect(currentCalibrationDefence(state, terryId)).toBe(getV8CalibrationPlayer('john-terry').printedDefence - 3);
  });

  it('CRASH THE BOX buffs Popp after only the first Cross in ATT each period and resets next period', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'alexandra-popp', 'ATT');
    const poppId = calibrationRuntimeId('home', 'alexandra-popp');

    const first = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    expect(currentCalibrationAttack(state, poppId)).toBe(getV8CalibrationPlayer('alexandra-popp').printedAttack + 3);

    const second = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(currentCalibrationAttack(state, poppId)).toBe(getV8CalibrationPlayer('alexandra-popp').printedAttack + 3);

    state = endV8CalibrationPeriod(state);
    expect(currentCalibrationAttack(state, poppId)).toBe(getV8CalibrationPlayer('alexandra-popp').printedAttack);
    state.teams.home.energy = 20;
    const third = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(third.state, 'home', third.card.id, 'ATT');
    expect(currentCalibrationAttack(state, poppId)).toBe(getV8CalibrationPlayer('alexandra-popp').printedAttack + 3);
  });

  it('POWER HEADER gives the first Cross +2 ATT and protects it from BLACK SPIDER suppression', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'ali-daei', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'yashin', 'DEF');

    const first = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    const firstResolution = state.tacticalResolutions.find((item) => item.cardId === first.card.id);
    expect(firstResolution?.cancelled).toBe(false);
    expect(firstResolution?.attack).toBe(4);
    expect(firstResolution?.specialistBonuses.some((bonus) => bonus.includes('POWER HEADER'))).toBe(true);

    const second = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.attack).toBe(2);
  });

  it('POWER HEADER enhancement is visible to IMPOSSIBLE SAVE before defensive interception', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'ali-daei', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'gordon-banks', 'DEF');

    const cross = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(cross.state, 'home', cross.card.id, 'ATT');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === cross.card.id);
    expect(resolution?.cancelled).toBe(true);
    expect(resolution?.attack).toBe(0);
  });

  it('FIRST-TIME LOB transforms only the first Through Ball here per match into a +3 ATT Long Shot', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'ellen-white', 'ATT');

    const first = addCalibrationTacticalToHand(state, 'home', 'through_ball');
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    const firstResolution = state.tacticalResolutions.find((item) => item.cardId === first.card.id);
    expect(firstResolution?.type).toBe('long_shot');
    expect(firstResolution?.attack).toBe(5);

    const second = addCalibrationTacticalToHand(state, 'home', 'through_ball');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    const secondResolution = state.tacticalResolutions.find((item) => item.cardId === second.card.id);
    expect(secondResolution?.type).toBe('through_ball');
    expect(secondResolution?.attack).toBe(2);
  });

  it('Batch 04 transformations/reactions use the Generated-Tactical Window path too', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'ellen-white', 'ATT');
    const generated = addCalibrationTacticalToHand(state, 'home', 'through_ball');

    const result = resolveGeneratedTacticalWindow(generated.state, [
      { side: 'home', cardId: generated.card.id, zone: 'ATT' },
    ]);
    const resolution = result.state.tacticalResolutions.find((item) => item.cardId === generated.card.id);
    expect(resolution?.type).toBe('long_shot');
    expect(resolution?.attack).toBe(5);
    expect(result.plays[0]?.card.type).toBe('long_shot');
    expect(result.plays[0]?.zone).toBe('ATT');
  });
});
