import { describe, expect, it } from 'vitest';
import {
  calibrationHandTacticals,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  playCalibrationTactical,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  rollCalibrationAction,
  storeCalibrationMatchScore,
  withCalibrationActionRngSeed,
} from '../index';

describe('V8 Batch 05 reveal-time Action context', () => {
  it('SHOWBOAT is deterministic for the same seed and can land both outcomes', () => {
    const successBase = withCalibrationActionRngSeed(createV8CalibrationState(), 1688);
    const success = revealCalibrationPlayer(successBase, 'home', 'ronaldinho', 'ATT');
    const successReplay = revealCalibrationPlayer(successBase, 'home', 'ronaldinho', 'ATT');
    const failureBase = withCalibrationActionRngSeed(createV8CalibrationState(), 1);
    const failure = revealCalibrationPlayer(failureBase, 'home', 'ronaldinho', 'ATT');
    const runtimeId = calibrationRuntimeId('home', 'ronaldinho');

    expect(currentCalibrationAttack(success, runtimeId)).toBe(getV8CalibrationPlayer('ronaldinho').printedAttack + 6);
    expect(currentCalibrationAttack(successReplay, runtimeId)).toBe(currentCalibrationAttack(success, runtimeId));
    expect(currentCalibrationAttack(failure, runtimeId)).toBe(getV8CalibrationPlayer('ronaldinho').printedAttack - 2);
  });

  it('SHOWBOAT ignores unrelated RNG namespaces and does not roll while suppressed', () => {
    const seeded = withCalibrationActionRngSeed(createV8CalibrationState(), 1688);
    const unrelated = rollCalibrationAction(seeded, 'away:future-random-action').state;
    const afterUnrelated = revealCalibrationPlayer(unrelated, 'home', 'ronaldinho', 'ATT');
    const runtimeId = calibrationRuntimeId('home', 'ronaldinho');
    expect(currentCalibrationAttack(afterUnrelated, runtimeId)).toBe(getV8CalibrationPlayer('ronaldinho').printedAttack + 6);

    let suppressed = withCalibrationActionRngSeed(createV8CalibrationState(), 1688);
    suppressed = revealCalibrationPlayer(suppressed, 'away', 'gentile', 'DEF');
    suppressed = revealCalibrationPlayer(suppressed, 'home', 'ronaldinho', 'ATT');
    expect(suppressed.suppressedActions[runtimeId]).toBe(calibrationRuntimeId('away', 'gentile'));
    expect(currentCalibrationAttack(suppressed, runtimeId)).toBe(getV8CalibrationPlayer('ronaldinho').printedAttack);
    expect(suppressed.matchCounters[`action-rng:count:home:${runtimeId}:showboat`] ?? 0).toBe(0);
  });

  it('SUPERSUB reads the score banked at period end and fires only from P3 while losing', () => {
    let state = createV8CalibrationState({ period: 2 });
    state = endV8CalibrationPeriod(state, { home: 0, away: 1 });
    expect(state.period).toBe(3);

    state = revealCalibrationPlayer(state, 'home', 'ole-gunnar-solskjaer', 'ATT');
    const runtimeId = calibrationRuntimeId('home', 'ole-gunnar-solskjaer');
    const throughBall = calibrationHandTacticals(state, 'home').find((card) => card.generatedBy === 'ole-gunnar-solskjaer');

    expect(currentCalibrationAttack(state, runtimeId)).toBe(getV8CalibrationPlayer('ole-gunnar-solskjaer').printedAttack + 4);
    expect(throughBall?.type).toBe('through_ball');
    expect(throughBall?.metadata.enteredHandPeriod).toBe(3);
    expect(throughBall?.metadata.availableFromPeriod).toBe(4);
    expect(() => playCalibrationTactical(state, 'home', throughBall!.id, 'ATT')).toThrow('banked until Period 4');

    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: throughBall!.id, zone: 'ATT' }]);
    expect(window.state.tacticalResolutions.find((item) => item.cardId === throughBall!.id)?.type).toBe('through_ball');
  });

  it('SUPERSUB does not infer losing state from the board or trigger before P3', () => {
    let early = storeCalibrationMatchScore(createV8CalibrationState({ period: 2 }), { home: 0, away: 3 });
    early = revealCalibrationPlayer(early, 'home', 'ole-gunnar-solskjaer', 'ATT');
    const earlyId = calibrationRuntimeId('home', 'ole-gunnar-solskjaer');
    expect(currentCalibrationAttack(early, earlyId)).toBe(getV8CalibrationPlayer('ole-gunnar-solskjaer').printedAttack);
    expect(calibrationHandTacticals(early, 'home').some((card) => card.generatedBy === 'ole-gunnar-solskjaer')).toBe(false);

    let level = storeCalibrationMatchScore(createV8CalibrationState({ period: 3 }), { home: 2, away: 2 });
    level = revealCalibrationPlayer(level, 'home', 'ole-gunnar-solskjaer', 'ATT');
    const levelId = calibrationRuntimeId('home', 'ole-gunnar-solskjaer');
    expect(currentCalibrationAttack(level, levelId)).toBe(getV8CalibrationPlayer('ole-gunnar-solskjaer').printedAttack);
    expect(calibrationHandTacticals(level, 'home').some((card) => card.generatedBy === 'ole-gunnar-solskjaer')).toBe(false);
  });

  it('uses current authoritative reconciliation values for SHOWBOAT and SUPERSUB cards', () => {
    const solskjaer = getV8CalibrationPlayer('ole-gunnar-solskjaer');
    const ronaldinho = getV8CalibrationPlayer('ronaldinho');
    expect([solskjaer.printedAttack, solskjaer.printedDefence, solskjaer.cost]).toEqual([11, 1, 4]);
    expect([ronaldinho.printedAttack, ronaldinho.printedDefence, ronaldinho.cost]).toEqual([10, 1, 4]);
    expect(solskjaer.usesCalibrationStatFallback).toBe(false);
    expect(ronaldinho.usesCalibrationStatFallback).toBe(false);
  });
});
