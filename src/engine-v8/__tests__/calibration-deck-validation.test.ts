import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V8_CALIBRATION_SQUAD_KEYS,
  V8_DECK_VALIDATION_SEEDS,
  buildV8DeckValidationCohort,
  formatV8DeckValidationReport,
  getV8CalibrationPlayer,
  runV8DeckValidation,
} from '../index';

describe('V8 broad deck validation', () => {
  it('builds nine deterministic legal decks per family', () => {
    const first = buildV8DeckValidationCohort();
    const second = buildV8DeckValidationCohort();
    expect(first).toEqual(second);
    expect(first).toHaveLength(54);
    expect(new Set(first.map((deck) => deck.playerIds.slice().sort().join('|'))).size).toBe(54);

    for (const family of V8_CALIBRATION_SQUAD_KEYS) {
      const decks = first.filter((deck) => deck.family === family);
      expect(decks).toHaveLength(9);
      expect(decks.filter((deck) => deck.swaps === 0)).toHaveLength(1);
      expect(decks.filter((deck) => deck.swaps > 0)).toHaveLength(8);
    }

    for (const deck of first) {
      expect(deck.playerIds).toHaveLength(11);
      expect(new Set(deck.playerIds).size).toBe(11);
      expect(deck.playerIds).toContain('schmeichel');
      expect(deck.zoneCoverage.DEF).toBeGreaterThanOrEqual(3);
      expect(deck.zoneCoverage.MID).toBeGreaterThanOrEqual(4);
      expect(deck.zoneCoverage.ATT).toBeGreaterThanOrEqual(2);
      expect(deck.playerIds.every((id) => getV8CalibrationPlayer(id).id === id)).toBe(true);
    }
  });

  it('runs the 5,184-match robustness panel and writes evidence', () => {
    const report = runV8DeckValidation(V8_DECK_VALIDATION_SEEDS);
    expect(report.decks).toHaveLength(54);
    expect(report.matches).toBe(5_184);
    expect(report.deckSummaries).toHaveLength(54);
    expect(report.families).toHaveLength(6);
    expect(report.deckSummaries.every((deck) => deck.matches === 96)).toBe(true);
    expect(report.families.every((family) => family.decks === 9 && family.matches === 864)).toBe(true);
    expect(report.families.every((family) => family.minWinRate <= family.medianWinRate && family.medianWinRate <= family.maxWinRate)).toBe(true);

    const text = formatV8DeckValidationReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-calibration-deck-validation.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-calibration-deck-validation.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  });
});
