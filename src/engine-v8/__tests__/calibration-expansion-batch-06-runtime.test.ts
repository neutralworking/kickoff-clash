import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationHandTacticals,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  isCalibrationActionEnabled,
  playCalibrationTactical,
  previewCalibrationTacticalCost,
  revealCalibrationPlayer,
} from '../index';

describe('V8 expansion Batch 06 Slice A runtime', () => {
  it('registers the five Slice A cards with reconciliation values and tracker identity', () => {
    expect(getV8CalibrationPlayer('carli-lloyd')).toMatchObject({
      printedAttack: 6, printedDefence: 4, cost: 3, actionName: 'HALFWAY HIT',
    });
    expect(getV8CalibrationPlayer('carlos-valderrama')).toMatchObject({
      printedAttack: 9, printedDefence: 2, cost: 4, actionName: 'PAUSE AND SLIP',
    });
    expect(getV8CalibrationPlayer('christian-eriksen')).toMatchObject({
      printedAttack: 8, printedDefence: 3, cost: 4, actionName: 'WHIPPED DELIVERY',
    });
    expect(getV8CalibrationPlayer('caroline-graham-hansen')).toMatchObject({
      printedAttack: 10, printedDefence: 1, cost: 4, actionName: 'ONE ON ONE',
    });
    expect(getV8CalibrationPlayer('jari-litmanen')).toMatchObject({
      printedAttack: 9, printedDefence: 2, cost: 4, actionName: 'KILLER PASS',
    });
  });

  it('HALFWAY HIT gives local Long Shots +4 ATT and makes only the first one free each match', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'carli-lloyd', 'MID');

    const first = addCalibrationTacticalToHand(state, 'home', 'long_shot');
    state = first.state;
    expect(previewCalibrationTacticalCost(state, 'home', first.card, 'MID')).toBe(0);
    state = playCalibrationTactical(state, 'home', first.card.id, 'MID');
    const firstResolution = state.tacticalResolutions.find((resolution) => resolution.cardId === first.card.id);
    expect(firstResolution?.attack).toBe(6);
    expect(firstResolution?.specialistBonuses).toContain('HALFWAY HIT +4');

    const second = addCalibrationTacticalToHand(state, 'home', 'long_shot');
    state = second.state;
    expect(previewCalibrationTacticalCost(state, 'home', second.card, 'MID')).toBe(1);
    state = playCalibrationTactical(state, 'home', second.card.id, 'MID');
    const secondResolution = state.tacticalResolutions.find((resolution) => resolution.cardId === second.card.id);
    expect(secondResolution?.attack).toBe(6);
  });

  it('PAUSE AND SLIP creates a +2 Through Ball only when ATT is already occupied', () => {
    let supported = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    supported = revealCalibrationPlayer(supported, 'home', 'alan-shearer', 'ATT');
    supported = revealCalibrationPlayer(supported, 'home', 'carlos-valderrama', 'MID');
    const boosted = calibrationHandTacticals(supported, 'home')
      .find((card) => card.generatedBy === 'carlos-valderrama');
    expect(boosted).toMatchObject({ type: 'through_ball', attModifier: 2 });

    let unsupported = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    unsupported = revealCalibrationPlayer(unsupported, 'home', 'carlos-valderrama', 'MID');
    const plain = calibrationHandTacticals(unsupported, 'home')
      .find((card) => card.generatedBy === 'carlos-valderrama');
    expect(plain).toMatchObject({ type: 'through_ball', attModifier: 0 });
  });

  it('WHIPPED DELIVERY scales its generated Corner from CBs committed in ATT', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'puyol', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'tony-adams', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'christian-eriksen', 'MID');

    const corner = calibrationHandTacticals(state, 'home')
      .find((card) => card.generatedBy === 'christian-eriksen');
    expect(corner).toMatchObject({ type: 'corner', attModifier: 2 });
  });

  it('ONE ON ONE ignores Ashley Cole for the whole period source binding and gains +2 ATT once', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    const hansenId = calibrationRuntimeId('home', 'caroline-graham-hansen');
    state = revealCalibrationPlayer(state, 'home', 'caroline-graham-hansen', 'ATT');
    state = revealCalibrationPlayer(state, 'away', 'ashley-cole', 'DEF');

    expect(currentCalibrationAttack(state, hansenId)).toBe(12);
    expect(state.events.some((event) => event.text.includes('ONE ON ONE ignores SHOW HIM OUTSIDE'))).toBe(true);

    // A later board refresh in the same period must not resurrect Ashley's already-ignored Action.
    state = revealCalibrationPlayer(state, 'away', 'tony-adams', 'DEF');
    expect(currentCalibrationAttack(state, hansenId)).toBe(12);
    expect(state.players[hansenId]?.modifiers.filter((modifier) => modifier.source === 'ONE ON ONE')).toHaveLength(1);
  });

  it('ONE ON ONE consumes only the first defender Action, so a different defender can target Hansen', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    const hansenId = calibrationRuntimeId('home', 'caroline-graham-hansen');
    state = revealCalibrationPlayer(state, 'home', 'caroline-graham-hansen', 'MID');
    state = revealCalibrationPlayer(state, 'away', 'tymoshchuk', 'MID');
    expect(currentCalibrationAttack(state, hansenId)).toBe(12);

    // Ashley is a second, different defender Action in the same period and therefore lands.
    state = revealCalibrationPlayer(state, 'away', 'ashley-cole', 'MID');
    expect(currentCalibrationAttack(state, hansenId)).toBe(7);
    expect(state.players[hansenId]?.modifiers.filter((modifier) => modifier.source === 'ONE ON ONE')).toHaveLength(1);
  });

  it('ONE ON ONE intercepts Gentile suppression without disabling Hansen, and stays bound to Gentile', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    const hansenId = calibrationRuntimeId('home', 'caroline-graham-hansen');
    state = revealCalibrationPlayer(state, 'home', 'caroline-graham-hansen', 'ATT');
    state = revealCalibrationPlayer(state, 'away', 'gentile', 'DEF');

    expect(isCalibrationActionEnabled(state, hansenId)).toBe(true);
    expect(currentCalibrationAttack(state, hansenId)).toBe(12);
    expect(state.events.some((event) => event.text.includes('ONE ON ONE ignores MAN MARKER'))).toBe(true);

    state = revealCalibrationPlayer(state, 'home', 'cavani', 'ATT');
    expect(isCalibrationActionEnabled(state, hansenId)).toBe(true);
    expect(currentCalibrationAttack(state, hansenId)).toBe(12);
  });

  it('KILLER PASS creates a +1 Through Ball at period end only for the MID winner', () => {
    let winning = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    winning = revealCalibrationPlayer(winning, 'home', 'jari-litmanen', 'MID');
    winning = endV8CalibrationPeriod(winning, { home: 0, away: 0 });
    const reward = calibrationHandTacticals(winning, 'home')
      .find((card) => card.generatedBy === 'jari-litmanen');
    expect(reward).toMatchObject({ type: 'through_ball', attModifier: 1 });

    let drawn = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    drawn = revealCalibrationPlayer(drawn, 'home', 'jari-litmanen', 'MID');
    drawn = revealCalibrationPlayer(drawn, 'away', 'jari-litmanen', 'MID');
    drawn = endV8CalibrationPeriod(drawn, { home: 0, away: 0 });
    expect(calibrationHandTacticals(drawn, 'home').some((card) => card.generatedBy === 'jari-litmanen')).toBe(false);
    expect(calibrationHandTacticals(drawn, 'away').some((card) => card.generatedBy === 'jari-litmanen')).toBe(false);
  });
});
