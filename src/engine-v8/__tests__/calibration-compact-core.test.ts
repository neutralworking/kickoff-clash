import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V8_COMPACT_CORE_SEEDS,
  buildV8CompactCoreDecks,
  formatV8CompactCoreReport,
  runV8CompactCoreSensitivity,
} from '../index';

describe('V8 compact-core sensitivity', () => {
  it('builds nested 3 / 4 / 5 card cores on a common support shell', () => {
    const decks = buildV8CompactCoreDecks();
    expect(decks).toHaveLength(9);

    for (const family of ['cross', 'through_ball', 'long_shot_set_piece'] as const) {
      const familyDecks = decks.filter((deck) => deck.family === family);
      expect(familyDecks.map((deck) => deck.coreSize)).toEqual([3, 4, 5]);
      expect(familyDecks.every((deck) => deck.playerIds.length === 11)).toBe(true);
      expect(familyDecks.every((deck) => new Set(deck.playerIds).size === 11)).toBe(true);
      expect(familyDecks.every((deck) => deck.playerIds.includes('schmeichel'))).toBe(true);

      const [three, four, five] = familyDecks;
      expect(four!.corePlayerIds.slice(0, 3)).toEqual(three!.corePlayerIds);
      expect(five!.corePlayerIds.slice(0, 4)).toEqual(four!.corePlayerIds);
    }
  });

  it('runs the 864-match sensitivity panel and writes evidence', () => {
    const report = runV8CompactCoreSensitivity(V8_COMPACT_CORE_SEEDS);
    expect(report.decks).toHaveLength(9);
    expect(report.matches).toBe(864);
    expect(report.summaries).toHaveLength(9);
    expect(report.summaries.every((summary) => summary.matches === 96)).toBe(true);

    const text = formatV8CompactCoreReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-calibration-compact-core.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-calibration-compact-core.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 30_000);
});
