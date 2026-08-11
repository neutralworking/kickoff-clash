import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatV8NeymarFoulReport, runV8NeymarFoulSensitivity } from '../calibration-dribbling-neymar-foul';

describe('V8 Neymar won-Penalty sensitivity', () => {
  it('compares reduced-defender dependency against beating a defender directly', () => {
    const report = runV8NeymarFoulSensitivity();
    expect(report.matches).toBe(2 * 7 * 6 * 8 * 2);
    expect(report.summaries).toHaveLength(14);
    const current = report.summaries.filter((summary) => summary.mode === 'current');
    const candidate = report.summaries.filter((summary) => summary.mode === 'beats_defender');
    expect(candidate.reduce((sum, item) => sum + item.penaltyGenerations, 0))
      .toBeGreaterThan(current.reduce((sum, item) => sum + item.penaltyGenerations, 0));

    const text = formatV8NeymarFoulReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-dribbling-neymar-foul.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-dribbling-neymar-foul.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 30_000);
});
