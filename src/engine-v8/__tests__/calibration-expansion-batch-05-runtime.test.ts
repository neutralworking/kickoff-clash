import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationHandTacticals,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  playCalibrationTactical,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
} from '../index';
import { refreshV8Batch05OngoingEffects } from '../calibration-expansion-batch-05-ongoing';

describe('V8 expansion Batch 05 runtime slice A', () => {
  it('SHUT THE ANGLE reduces only the first opposing Through Ball in ATT each period', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'peter-shilton', 'DEF');

    const first = addCalibrationTacticalToHand(state, 'away', 'through_ball', { attModifier: 4 });
    state = playCalibrationTactical(first.state, 'away', first.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === first.card.id)?.attack).toBe(3);

    const second = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(second.state, 'away', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.attack).toBe(2);

    state = endV8CalibrationPeriod(state);
    state.teams.away.energy = 20;
    const third = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(third.state, 'away', third.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === third.card.id)?.attack).toBe(0);
  });

  it('SHUT THE ANGLE reduces below the IMPOSSIBLE SAVE threshold before Banks decides whether to spend', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'peter-shilton', 'DEF');
    state = seedCalibrationPlayer(state, 'home', 'gordon-banks', 'DEF');
    const banksId = calibrationRuntimeId('home', 'gordon-banks');

    const chance = addCalibrationTacticalToHand(state, 'away', 'through_ball', { attModifier: 3 });
    state = playCalibrationTactical(chance.state, 'away', chance.card.id, 'ATT');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === chance.card.id);

    expect(resolution?.attack).toBe(2);
    expect(resolution?.cancelled).toBe(false);
    expect(state.matchCounters[`banks-impossible-save:${banksId}`] ?? 0).toBe(0);
  });

  it('AERIAL COMMAND cannot reduce POWER HEADER protection, but its first-Cross attempt is consumed', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'ali-daei', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'paul-mcgrath', 'DEF');

    const first = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    const firstResolution = state.tacticalResolutions.find((item) => item.cardId === first.card.id);
    expect(firstResolution?.attack).toBe(4);
    expect(firstResolution?.specialistBonuses.some((bonus) => bonus.includes('ATT protected'))).toBe(true);
    expect(state.events.some((event) => event.type === 'action_ignored' && event.text.includes('AERIAL COMMAND'))).toBe(true);

    const second = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.attack).toBe(2);
  });

  it('THUNDERBOLT in MID generates a same-period window Long Shot and pays its DEF trade-off', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'roberto-carlos', 'MID');
    const carlosId = calibrationRuntimeId('home', 'roberto-carlos');
    const shot = calibrationHandTacticals(state, 'home').find((card) => card.generatedBy === 'roberto-carlos');

    expect(shot).toBeDefined();
    expect(shot?.type).toBe('long_shot');
    expect(shot?.attModifier).toBe(3);
    expect(shot?.metadata.enteredHandPeriod).toBe(1);
    expect(shot?.metadata.availableFromPeriod).toBe(2);
    expect(currentCalibrationDefence(state, carlosId)).toBe(getV8CalibrationPlayer('roberto-carlos').printedDefence - 3);

    expect(() => playCalibrationTactical(state, 'home', shot!.id, 'MID')).toThrow('banked until Period 2');
    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: shot!.id, zone: 'MID' }]);
    expect(window.state.tacticalResolutions.find((item) => item.cardId === shot!.id)?.attack).toBe(5);
  });

  it('THUNDERBOLT does not fire when Roberto Carlos stays in DEF', () => {
    let state = createV8CalibrationState();
    state = revealCalibrationPlayer(state, 'home', 'roberto-carlos', 'DEF');
    const carlosId = calibrationRuntimeId('home', 'roberto-carlos');

    expect(calibrationHandTacticals(state, 'home').some((card) => card.generatedBy === 'roberto-carlos')).toBe(false);
    expect(currentCalibrationDefence(state, carlosId)).toBe(getV8CalibrationPlayer('roberto-carlos').printedDefence);
  });

  it('SKIPPER gives other defenders +2 DEF, never self, and disappears when Adams is suppressed', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'tony-adams', 'DEF');
    state = seedCalibrationPlayer(state, 'home', 'paul-mcgrath', 'DEF');
    const adamsId = calibrationRuntimeId('home', 'tony-adams');
    const mcgrathId = calibrationRuntimeId('home', 'paul-mcgrath');

    state = refreshV8Batch05OngoingEffects(state);
    expect(currentCalibrationDefence(state, adamsId)).toBe(getV8CalibrationPlayer('tony-adams').printedDefence);
    expect(currentCalibrationDefence(state, mcgrathId)).toBe(getV8CalibrationPlayer('paul-mcgrath').printedDefence + 2);

    state.suppressedActions[adamsId] = 'test-suppressor';
    state = refreshV8Batch05OngoingEffects(state);
    expect(currentCalibrationDefence(state, mcgrathId)).toBe(getV8CalibrationPlayer('paul-mcgrath').printedDefence);
  });

  it('SKIPPER is present before READS IT EARLY evaluates the live DEF confrontation', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'tony-adams', 'DEF');
    state = seedCalibrationPlayer(state, 'home', 'cannavaro', 'DEF');
    state = refreshV8Batch05OngoingEffects(state);
    const cannavaroId = calibrationRuntimeId('home', 'cannavaro');
    expect(currentCalibrationDefence(state, cannavaroId)).toBe(getV8CalibrationPlayer('cannavaro').printedDefence + 2);

    state = revealCalibrationPlayer(state, 'away', 'wambach', 'ATT');
    expect(currentCalibrationDefence(state, cannavaroId)).toBe(getV8CalibrationPlayer('cannavaro').printedDefence + 2);
    expect(state.players[cannavaroId]?.modifiers.filter((modifier) => modifier.source?.startsWith('READS IT EARLY:'))).toHaveLength(0);
  });

  it('Batch 05 cards retain authoritative reconciliation stats rather than calibration fallbacks', () => {
    const expected = {
      'peter-shilton': [0, 11, 4],
      'paul-mcgrath': [1, 10, 3],
      'roberto-carlos': [4, 6, 3],
      'tony-adams': [1, 10, 3],
    } as const;
    for (const [id, [attack, defence, cost]] of Object.entries(expected)) {
      const card = getV8CalibrationPlayer(id);
      expect([card.printedAttack, card.printedDefence, card.cost]).toEqual([attack, defence, cost]);
      expect(card.usesCalibrationStatFallback).toBe(false);
      expect(card.usesCalibrationCostFallback).toBe(false);
    }
  });
});
