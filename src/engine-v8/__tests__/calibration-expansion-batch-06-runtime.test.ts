import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationHandTacticals,
  calibrationRuntimeId,
  calibrationTacticalAvailableFromPeriod,
  createV8CalibrationState,
  currentCalibrationAttack,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  isCalibrationActionEnabled,
  isV8ChanceType,
  moveCalibrationPlayer,
  playCalibrationTactical,
  previewCalibrationTacticalCost,
  revealCalibrationPlayer,
  tacticalDefinition,
  windowEligibleCalibrationTacticals,
} from '../index';

describe('V8 expansion Batch 06 runtime', () => {
  it('registers all eight Batch 06 cards with reconciliation values and tracker identity', () => {
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
    expect(getV8CalibrationPlayer('keira-walsh')).toMatchObject({
      printedAttack: 4, printedDefence: 7, cost: 3, actionName: 'BEAT THE PRESS',
    });
    expect(getV8CalibrationPlayer('rory-delap')).toMatchObject({
      printedAttack: 5, printedDefence: 5, cost: 3, actionName: 'HURLER',
    });
    expect(getV8CalibrationPlayer('arjen-robben')).toMatchObject({
      printedAttack: 10, printedDefence: 1, cost: 4, actionName: 'CUT INSIDE',
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

  it('BEAT THE PRESS lets Trigger Press resolve and creates one +2 Through Ball per period', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'keira-walsh', 'MID');

    const firstPress = addCalibrationTacticalToHand(state, 'away', 'trigger_press');
    state = playCalibrationTactical(firstPress.state, 'away', firstPress.card.id, 'ATT');
    expect(state.triggerPress.away.ATT).toBe(true);

    const firstReward = calibrationHandTacticals(state, 'home')
      .find((card) => card.generatedBy === 'keira-walsh');
    expect(firstReward).toMatchObject({ type: 'through_ball', attModifier: 2 });
    expect(windowEligibleCalibrationTacticals(state, 'home').some((card) => card.id === firstReward?.id)).toBe(true);

    const secondPress = addCalibrationTacticalToHand(state, 'away', 'trigger_press');
    state = playCalibrationTactical(secondPress.state, 'away', secondPress.card.id, 'ATT');
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.generatedBy === 'keira-walsh')).toHaveLength(1);
  });

  it('BEAT THE PRESS is disabled by suppression rather than granting blanket press immunity', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    const walshId = calibrationRuntimeId('home', 'keira-walsh');
    state = revealCalibrationPlayer(state, 'home', 'keira-walsh', 'MID');
    state = revealCalibrationPlayer(state, 'away', 'gentile', 'MID');
    expect(isCalibrationActionEnabled(state, walshId)).toBe(false);

    const press = addCalibrationTacticalToHand(state, 'away', 'trigger_press');
    state = playCalibrationTactical(press.state, 'away', press.card.id, 'ATT');
    expect(state.triggerPress.away.ATT).toBe(true);
    expect(calibrationHandTacticals(state, 'home').some((card) => card.generatedBy === 'keira-walsh')).toBe(false);
  });

  it('Long Throw is a normal ATT-only Chance at the neutral Cost 1 / +2 ATT baseline', () => {
    const definition = tacticalDefinition('long_throw');
    expect(definition).toMatchObject({ name: 'Long Throw', baseCost: 1, baseAtt: 2, eligibleZones: ['ATT'], isChance: true });
    expect(isV8ChanceType('long_throw')).toBe(true);

    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    const generated = addCalibrationTacticalToHand(state, 'home', 'long_throw');
    state = playCalibrationTactical(generated.state, 'home', generated.card.id, 'ATT');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === generated.card.id);
    expect(resolution).toMatchObject({ type: 'long_throw', cost: 1, attack: 2, cancelled: false });
  });

  it('HURLER generates one Long Throw after P1-P3 and intentionally fizzles after P4', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'rory-delap', 'MID');

    for (let completedPeriod = 1; completedPeriod <= 3; completedPeriod += 1) {
      state = endV8CalibrationPeriod(state, { home: 0, away: 0 });
      const throws = calibrationHandTacticals(state, 'home').filter((card) => card.generatedBy === 'rory-delap');
      expect(throws).toHaveLength(completedPeriod);
      expect(throws.at(-1)).toMatchObject({ type: 'long_throw' });
      expect(calibrationTacticalAvailableFromPeriod(throws.at(-1)!)).toBe(completedPeriod + 1);
    }

    expect(state.period).toBe(4);
    state = endV8CalibrationPeriod(state, { home: 0, away: 0 });
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.generatedBy === 'rory-delap')).toHaveLength(3);
  });

  it('CUT INSIDE changes Cross identity without changing its paid Cost or carried modifier', () => {
    let state = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'arjen-robben', 'ATT');
    const cross = addCalibrationTacticalToHand(state, 'home', 'cross', { costModifier: 2, attModifier: 1 });
    state = cross.state;
    const beforeEnergy = state.teams.home.energy;

    state = playCalibrationTactical(state, 'home', cross.card.id, 'ATT');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === cross.card.id);
    expect(resolution).toMatchObject({ type: 'long_shot', cost: 3, attack: 3, cancelled: false });
    expect(state.teams.home.energy).toBe(beforeEnergy - 3);
    expect(state.events.some((event) => event.text.includes('CUT INSIDE turns Cross into a Long Shot'))).toBe(true);

    const second = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.type).toBe('cross');
  });

  it('CUT INSIDE outranks generic Alexia transformation, but pending Waddle movement outranks CUT INSIDE', () => {
    let genericState = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    genericState = revealCalibrationPlayer(genericState, 'home', 'arjen-robben', 'ATT');
    genericState = revealCalibrationPlayer(genericState, 'home', 'alexia-putellas', 'ATT');
    const firstCross = addCalibrationTacticalToHand(genericState, 'home', 'cross');
    genericState = playCalibrationTactical(firstCross.state, 'home', firstCross.card.id, 'ATT');
    expect(genericState.tacticalResolutions.find((item) => item.cardId === firstCross.card.id)?.type).toBe('long_shot');

    const secondCross = addCalibrationTacticalToHand(genericState, 'home', 'cross');
    genericState = playCalibrationTactical(secondCross.state, 'home', secondCross.card.id, 'ATT');
    expect(genericState.tacticalResolutions.find((item) => item.cardId === secondCross.card.id)?.type).toBe('through_ball');

    let movementState = createV8CalibrationState({ homeEnergy: 20, awayEnergy: 20 });
    movementState = revealCalibrationPlayer(movementState, 'home', 'arjen-robben', 'ATT');
    movementState = revealCalibrationPlayer(movementState, 'home', 'chris-waddle', 'MID');
    movementState = moveCalibrationPlayer(movementState, 'home', 'chris-waddle', 'ATT');
    const waddleCross = addCalibrationTacticalToHand(movementState, 'home', 'cross');
    movementState = playCalibrationTactical(waddleCross.state, 'home', waddleCross.card.id, 'ATT');
    expect(movementState.tacticalResolutions.find((item) => item.cardId === waddleCross.card.id)?.type).toBe('cross');
    expect(movementState.periodCounters[`robben-cut-inside:${calibrationRuntimeId('home', 'arjen-robben')}`] ?? 0).toBe(0);

    const robbenCross = addCalibrationTacticalToHand(movementState, 'home', 'cross');
    movementState = playCalibrationTactical(robbenCross.state, 'home', robbenCross.card.id, 'ATT');
    expect(movementState.tacticalResolutions.find((item) => item.cardId === robbenCross.card.id)?.type).toBe('long_shot');
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
