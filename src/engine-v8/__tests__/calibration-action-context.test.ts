import { describe, expect, it } from 'vitest';
import {
  calibrationActionRngSeed,
  calibrationScoreRelation,
  createV8CalibrationState,
  rollCalibrationAction,
  storeCalibrationMatchScore,
  withCalibrationActionRngSeed,
} from '../index';

describe('V8 deterministic Action context', () => {
  it('replays the same namespaced roll from the same seed', () => {
    const initial = withCalibrationActionRngSeed(createV8CalibrationState(), 1688);
    const first = rollCalibrationAction(initial, 'home:home:ronaldinho:showboat');
    const replay = rollCalibrationAction(initial, 'home:home:ronaldinho:showboat');

    expect(first.roll).toBe(replay.roll);
    expect(first.ordinal).toBe(0);
    expect(replay.ordinal).toBe(0);
    expect(calibrationActionRngSeed(first.state)).toBe(1688);
  });

  it('keeps Action namespaces independent from unrelated random Actions', () => {
    const initial = withCalibrationActionRngSeed(createV8CalibrationState(), 1688);
    const direct = rollCalibrationAction(initial, 'home:home:ronaldinho:showboat');
    const unrelated = rollCalibrationAction(initial, 'away:future-random-action');
    const afterUnrelated = rollCalibrationAction(unrelated.state, 'home:home:ronaldinho:showboat');

    expect(afterUnrelated.roll).toBe(direct.roll);
    expect(afterUnrelated.ordinal).toBe(0);
  });

  it('advances repeated rolls only inside their own namespace', () => {
    const initial = withCalibrationActionRngSeed(createV8CalibrationState(), 1688);
    const first = rollCalibrationAction(initial, 'showboat');
    const second = rollCalibrationAction(first.state, 'showboat');

    expect(first.ordinal).toBe(0);
    expect(second.ordinal).toBe(1);
    expect(second.roll).not.toBe(first.roll);
  });

  it('stores banked match score as explicit match context', () => {
    const state = storeCalibrationMatchScore(createV8CalibrationState(), { home: 1, away: 2 });
    expect(calibrationScoreRelation(state, 'home')).toBe('losing');
    expect(calibrationScoreRelation(state, 'away')).toBe('winning');

    const level = storeCalibrationMatchScore(state, { home: 3, away: 3 });
    expect(calibrationScoreRelation(level, 'home')).toBe('level');
  });
});
