import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatV8DeferredNeymarReport,
  runV8DeferredNeymarSensitivity,
} from '../calibration-dribbling-deferred-neymar';

describe('V8 deferred RAINBOW FLICK sensitivity', () => {
  it('compares immediate and post-reveal condition evaluation', () => {
    const report = runV8DeferredNeymarSensitivity();
    expect(report.matches).toBe(2 * 5 * 6 * 8 * 2);
    expect(report.summaries).toHaveLength(10);
    const immediate = report.summaries.filter((summary) => summary.mode === 'immediate');
    const deferred = report.summaries.filter((summary) => summary.mode === 'post_reveal');
    expect(deferred.reduce((sum, item) => sum + item.neymarPenaltyGenerations, 0))
      .toBeGreaterThanOrEqual(immediate.reduce((sum, item) => sum + item.neymarPenaltyGenerations, 0));

    const text = formatV8DeferredNeymarReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-dribbling-deferred-neymar.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-dribbling-deferred-neymar.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 20_000);
});
