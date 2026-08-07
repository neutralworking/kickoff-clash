import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V8_CALIBRATION_MATRIX_SEEDS,
  V8_CALIBRATION_SQUAD_KEYS,
  formatV8CalibrationMatrixReport,
  runV8CalibrationMatchupMatrix,
  simulateV8CalibrationMatch,
} from '../index';

describe('V8 calibration matchup matrix', () => {
  it('is deterministic for a fixed matchup and seed', () => {
    const args = { homeSquad: 'cross' as const, awaySquad: 'balanced_midrange' as const, seed: 8_082_026 };
    expect(simulateV8CalibrationMatch(args)).toEqual(simulateV8CalibrationMatch(args));
  });

  it('runs the full six-squad evidence matrix', () => {
    const report = runV8CalibrationMatchupMatrix(V8_CALIBRATION_MATRIX_SEEDS);

    expect(report.matches).toBe(V8_CALIBRATION_SQUAD_KEYS.length ** 2 * V8_CALIBRATION_MATRIX_SEEDS.length);
    expect(report.matches).toBe(1_152);
    expect(report.pairings).toHaveLength(15);
    expect(report.squads).toHaveLength(6);
    expect(report.squads.every((squad) => squad.matches === 320)).toBe(true);
    expect(report.pairings.every((pair) => pair.matches === 64)).toBe(true);
    expect(report.squads.every((squad) => Number.isFinite(squad.averageGoalDifference))).toBe(true);
    expect(report.squads.every((squad) => squad.tacticalAttackShare >= 0 && squad.tacticalAttackShare <= 1)).toBe(true);

    const text = formatV8CalibrationMatrixReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-calibration-matrix.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-calibration-matrix.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  });
});
