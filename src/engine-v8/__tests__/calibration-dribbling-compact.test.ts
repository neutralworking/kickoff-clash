import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildV8DribblingCompactDecks,
  formatV8DribblingCompactReport,
  runV8DribblingCompactSensitivity,
  V8_DRIBBLING_COMPACT_SEEDS,
} from '../calibration-dribbling-compact';

describe('V8 compact Dribbling sensitivity', () => {
  it('builds isolated reducer / generator / Panenka shells', () => {
    const decks = buildV8DribblingCompactDecks();
    expect(decks).toHaveLength(13);
    expect(decks.every((deck) => deck.playerIds.length === 11 && new Set(deck.playerIds).size === 11)).toBe(true);
    expect(decks.find((deck) => deck.id === 'neutral')?.core).toEqual([]);
    expect(decks.find((deck) => deck.id === 'duff-neymar-panenka')?.core).toEqual(['duff', 'neymar', 'panenka']);
  });

  it('runs the 1,248-match compact package panel and writes evidence', () => {
    const report = runV8DribblingCompactSensitivity(V8_DRIBBLING_COMPACT_SEEDS);
    expect(report.matches).toBe(13 * 6 * 8 * 2);
    expect(report.summaries).toHaveLength(13);
    expect(report.summaries.every((summary) => summary.winRate >= 0 && summary.winRate <= 1)).toBe(true);
    expect(report.summaries.every((summary) => summary.penaltiesPerMatch >= 0)).toBe(true);

    const text = formatV8DribblingCompactReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-dribbling-compact.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-dribbling-compact.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 20_000);
});
