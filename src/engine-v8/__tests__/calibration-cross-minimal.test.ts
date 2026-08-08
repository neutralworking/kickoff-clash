import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V8_CROSS_MINIMAL_SEEDS,
  buildV8CrossMinimalDecks,
  formatV8CrossMinimalReport,
  runV8CrossMinimalSensitivity,
} from '../calibration-cross-minimal';

describe('V8 minimal Cross-core sensitivity', () => {
  it('builds fixed two-card and three-card Cross cores on the same support shell', () => {
    const decks = buildV8CrossMinimalDecks();
    expect(decks).toHaveLength(8);
    expect(decks.every((deck) => deck.playerIds.length === 11)).toBe(true);
    expect(decks.every((deck) => new Set(deck.playerIds).size === 11)).toBe(true);
    expect(decks.every((deck) => deck.playerIds.includes('schmeichel'))).toBe(true);
    expect(decks.filter((deck) => deck.core.length === 2)).toHaveLength(4);
    expect(decks.filter((deck) => deck.core.length === 3)).toHaveLength(4);
  });

  it('runs the 768-match minimal-core panel and writes evidence', () => {
    const report = runV8CrossMinimalSensitivity(V8_CROSS_MINIMAL_SEEDS);
    expect(report.matches).toBe(768);
    expect(report.summaries).toHaveLength(8);
    expect(report.summaries.every((summary) => summary.matches === 96)).toBe(true);

    const text = formatV8CrossMinimalReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-calibration-cross-minimal.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-calibration-cross-minimal.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 30_000);
});
