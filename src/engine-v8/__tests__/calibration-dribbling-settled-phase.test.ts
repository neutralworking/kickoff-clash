import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatV8SettledDribbleReport,
  runV8SettledDribbleSensitivity,
} from '../calibration-dribbling-settled-phase';

describe('V8 settled-pitch Dribble sensitivity', () => {
  it('compares immediate On Reveal against a settled Dribble phase', () => {
    const report = runV8SettledDribbleSensitivity();
    expect(report.matches).toBe(2 * 7 * 6 * 8 * 2);
    expect(report.summaries).toHaveLength(14);
    const immediate = report.summaries.filter((summary) => summary.mode === 'immediate');
    const settled = report.summaries.filter((summary) => summary.mode === 'settled_dribble');
    expect(settled.reduce((sum, item) => sum + item.neymarPenaltyGenerations, 0))
      .toBeGreaterThan(immediate.reduce((sum, item) => sum + item.neymarPenaltyGenerations, 0));

    const text = formatV8SettledDribbleReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-dribbling-settled-phase.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-dribbling-settled-phase.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 30_000);
});
