/**
 * V6 commit 4 — the full four-period match loop + fixtures + AI.
 */
import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../match';
import { V6_DECKS, V6_CARD_POOL } from '../fixtures';

describe('fixtures', () => {
  it('every deck is a legal 18-card squad drawn from the pool', () => {
    const ids = new Set(V6_CARD_POOL.map((c) => c.id));
    for (const deck of V6_DECKS) {
      expect(deck.startingXI).toHaveLength(11);
      expect(deck.bench).toHaveLength(7);
      for (const id of [...deck.startingXI, ...deck.bench]) expect(ids.has(id)).toBe(true);
    }
  });

  it('has legendary two-action cards and is ATT-plentiful', () => {
    const legendaries = V6_CARD_POOL.filter((c) => c.rarity === 'legendary');
    expect(legendaries.length).toBeGreaterThanOrEqual(3);
    expect(legendaries.every((c) => c.actions.length === 2)).toBe(true);
    const totalAtt = V6_CARD_POOL.reduce((n, c) => n + c.attack, 0);
    const totalDef = V6_CARD_POOL.reduce((n, c) => n + c.defence, 0);
    expect(totalAtt).toBeGreaterThan(totalDef);
  });
});

describe('full match', () => {
  it('plays four periods to full time, deterministically', () => {
    const a = simulateMatch({ playerDeckId: 'aggressive', opponentDeckId: 'defensive', seed: 42 });
    const b = simulateMatch({ playerDeckId: 'aggressive', opponentDeckId: 'defensive', seed: 42 });
    expect(a.log.some((e) => e.type === 'full_time')).toBe(true);
    expect(a.log.filter((e) => e.type === 'period_end')).toHaveLength(4);
    expect(a.playerScore).toBe(b.playerScore);
    expect(a.opponentScore).toBe(b.opponentScore);
    expect(a.log.length).toBe(b.log.length);
  });

  it('keeps 11 active and 18 total after all substitutions', () => {
    const r = simulateMatch({ playerDeckId: 'flexible', opponentDeckId: 'combo', seed: 5 });
    expect(r.state.player.cards.filter((c) => c.zone === 'active')).toHaveLength(11);
    expect(r.state.player.cards).toHaveLength(18);
    expect(r.state.opponent.cards.filter((c) => c.zone === 'active')).toHaveLength(11);
  });

  it('deploys bench cards across a spread of seeds', () => {
    let totalSubs = 0;
    for (let seed = 0; seed < 20; seed++) totalSubs += simulateMatch({ playerDeckId: 'flexible', opponentDeckId: 'aggressive', seed }).subsMade;
    expect(totalSubs).toBeGreaterThan(0);
  });

  it('runs every deck pairing without runaway (balance itself is tuned in commit 5)', () => {
    // Sanity only — finite, non-negative, no runaway. The handoff says NOT to
    // assert exact balance in the first fixtures commit; the 10k-match sim tunes
    // the numbers toward the D2 targets next.
    for (const p of V6_DECKS) {
      for (const o of V6_DECKS) {
        const r = simulateMatch({ playerDeckId: p.id, opponentDeckId: o.id, seed: 7 });
        expect(Number.isFinite(r.playerScore)).toBe(true);
        expect(r.playerScore).toBeGreaterThanOrEqual(0);
        expect(r.opponentScore).toBeGreaterThanOrEqual(0);
        expect(r.playerScore + r.opponentScore).toBeLessThan(100);
        expect(['player', 'opponent', 'draw']).toContain(r.winner);
      }
    }
  });
});
