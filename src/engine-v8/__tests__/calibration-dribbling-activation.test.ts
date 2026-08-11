import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatV8DribblingActivationReport,
  runV8DribblingActivationDiagnostic,
} from '../calibration-dribbling-activation';

describe('V8 Dribbling activation timing', () => {
  it('traces defender availability, reducer hits and Penalty generation', () => {
    const report = runV8DribblingActivationDiagnostic();
    expect(report.matches).toBe(6 * 6 * 8 * 2);
    expect(report.summaries).toHaveLength(6);
    expect(report.summaries.every((summary) => summary.neymarPenaltyGenerations >= summary.penaltyResolutions)).toBe(true);

    const text = formatV8DribblingActivationReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-dribbling-activation.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-dribbling-activation.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 20_000);
});
