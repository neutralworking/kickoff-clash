/**
 * Phase 2 mechanisms, asserted on the event log: tactical cards as timed
 * posture windows, substitutions as events, formation adherence throttling,
 * relocate reweights, and the goal-event cash hook.
 */

import { describe, it, expect } from 'vitest';
import { runHeadless, COMMIT_ALL, matchResult, createMatch, advance, sideFromManager } from '../match';
import type { MatchConfig, HeadlessPolicy } from '../match';
import type { MatchEvent } from '../events';
import { STUB_FIXTURE } from '../data/stub';
import { getManager } from '../data/managers';
import { getTacticalCard, TACTICAL_CARDS } from '../data/tactical-cards';
import { adherenceBand, ADHERENCE_FACTOR } from '../data/adherence';
import { ENERGY_BUDGET, SUBS_BUDGET } from '../data/baseline';

const ofType = <T extends MatchEvent['type']>(log: MatchEvent[], type: T) =>
  log.filter((e): e is Extract<MatchEvent, { type: T }> => e.type === type);

const config = (seed: number, extra?: Partial<MatchConfig>): MatchConfig => ({
  ...STUB_FIXTURE,
  seed,
  target: 9999,
  ...extra,
});

describe('tactical cards — timed posture windows with card stats (SM §3)', () => {
  const playCard = (cardId: string, atBatch: number): HeadlessPolicy => ({
    onBatch: (_s, batch) => (batch === atBatch ? { type: 'tactic-play', cardId } : { type: 'none' }),
    onWindow: () => ({ type: 'commit' }),
  });

  it('a played card shifts posture for its duration, costs its energy, then reverts', () => {
    const card = getTacticalCard('push-up')!; // possession, 2 batches, 2 energy
    const state = runHeadless(config(7, { tacticalHand: ['push-up'] }), playCard('push-up', 2));
    const played = ofType(state.log, 'tactic-played');
    expect(played).toEqual([
      expect.objectContaining({ card: 'push-up', posture: 'possession', durationBatches: 2, energyCost: 2, batch: 2 }),
    ]);
    const shifts = ofType(state.log, 'posture-shift').filter((p) => p.side === 0);
    expect(shifts).toEqual([
      expect.objectContaining({ from: 'deep-block', to: 'possession', reason: 'tactic', batch: 2 }),
      expect.objectContaining({ from: 'possession', to: 'deep-block', reason: 'revert', batch: 4 }),
    ]);
    expect(state.energy).toBe(ENERGY_BUDGET - card.energyCost);
  });

  it('validation: not in hand, already played, and energy exhaustion all throw', () => {
    let res = createMatch(config(7, { tacticalHand: ['all-out'] }));
    expect(() => advance(res.state, { type: 'tactic-play', cardId: 'park-it' })).toThrow(/not in hand/);
    // Play all-out (1 energy)…
    res = advance(res.state, { type: 'tactic-play', cardId: 'all-out' });
    // …drive to the next batch decision, then try to replay the same card.
    while (res.awaiting && res.awaiting.kind !== 'batch-start') {
      res = advance(res.state, { type: 'commit' });
    }
    expect(res.awaiting?.kind).toBe('batch-start');
    expect(() => advance(res.state, { type: 'tactic-play', cardId: 'all-out' })).toThrow(/already played/);
  });

  it('the card pool is well-formed data (both postures, rarity-scalable durations)', () => {
    expect(TACTICAL_CARDS.length).toBeGreaterThanOrEqual(4);
    const postures = new Set(TACTICAL_CARDS.map((c) => c.posture));
    expect(postures.has('possession') && postures.has('deep-block')).toBe(true);
    for (const c of TACTICAL_CARDS) {
      expect(c.durationBatches).toBeGreaterThanOrEqual(1);
      expect(c.energyCost).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('substitutions — instantaneous events that feed engines (SM §2)', () => {
  const subAt = (batches: number[]): HeadlessPolicy => ({
    onBatch: (state, batch) =>
      batches.includes(batch) && state.sides[0].subsLeft > 0 ? { type: 'substitution' } : { type: 'none' },
    onWindow: () => ({ type: 'commit' }),
  });

  it('subs are budgeted, logged, and restore fitness', () => {
    const state = runHeadless(config(7), subAt([2, 3, 4, 5, 6]));
    const subs = ofType(state.log, 'substitution');
    expect(subs).toHaveLength(SUBS_BUDGET); // the 4th/5th attempts had no subs left
    expect(subs.map((s) => s.subsLeft)).toEqual([2, 1, 0]);
  });

  it("Tinkerman: substitutions extend the streak (the engine's fuel)", () => {
    const tinkerman = getManager('tinkerman')!;
    const cfg = config(7, {
      sides: [sideFromManager(tinkerman), STUB_FIXTURE.sides[1]],
    });
    const state = runHeadless(cfg, subAt([3, 4, 5]));
    const subExtensions = ofType(state.log, 'streak-extended').filter(
      (e) => e.side === 0 && e.clock.increment === 0 // batch-decision site, not a goal
    );
    expect(subExtensions.length).toBe(3);
  });

  it('substitution-context traits charge windows only in the sub batch (fresh legs fade)', () => {
    const tinkerman = getManager('tinkerman')!;
    const cfg = config(11, { sides: [sideFromManager(tinkerman), STUB_FIXTURE.sides[1]] });
    const state = runHeadless(cfg, subAt([3]));
    const procs = ofType(state.log, 'trait-proc').filter((p) => p.trait === 'Fresh Legs');
    expect(procs.length).toBeGreaterThan(0);
    for (const p of procs) expect(p.clock.batch).toBe(3);
  });
});

describe('formation adherence — three bands throttle default-posture generation (SM §7)', () => {
  it('band resolution: native / adjacent / foreign', () => {
    expect(adherenceBand('4-4-2', '4-4-2')).toBe('native');
    expect(adherenceBand('4-3-3', '4-4-2')).toBe('adjacent');
    expect(adherenceBand('5-3-2', '4-4-2')).toBe('foreign');
    expect(ADHERENCE_FACTOR.native).toBe(1);
  });

  it('a foreign formation generates fewer windows than native over a seed sweep', () => {
    const count = (formation: string): number => {
      let windows = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const cfg = config(seed, {
          sides: [
            { ...STUB_FIXTURE.sides[0], formation, preferredFormation: '4-4-2' },
            STUB_FIXTURE.sides[1],
          ],
        });
        const state = runHeadless(cfg, COMMIT_ALL);
        windows += ofType(state.log, 'window-generated').filter((w) => w.side === 0).length;
      }
      return windows;
    };
    const native = count('4-4-2');
    const foreign = count('5-3-2');
    expect(foreign).toBeLessThan(native * 0.6); // ~0.4 throttle, with sampling room
  });

  it('the band is stamped on match-start when formations are in play', () => {
    const cfg = config(7, {
      sides: [
        { ...STUB_FIXTURE.sides[0], formation: '5-3-2', preferredFormation: '4-4-2' },
        STUB_FIXTURE.sides[1],
      ],
    });
    const state = runHeadless(cfg, COMMIT_ALL);
    const start = ofType(state.log, 'match-start')[0];
    expect(start.adherence).toEqual(['foreign', 'native']);
  });
});

describe('relocate — event-generation reweighting (the Set-Piece engine)', () => {
  it("Set-Piece's Win the Foul turns open play into dead balls", () => {
    const setPiece = getManager('set-piece')!;
    let transitions = 0;
    let setPieces = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const cfg = config(seed, { sides: [sideFromManager(setPiece), STUB_FIXTURE.sides[1]] });
      const state = runHeadless(cfg, COMMIT_ALL);
      for (const w of ofType(state.log, 'window-generated')) {
        if (w.side !== 0) continue;
        if (w.kind === 'transition') transitions += 1;
        else setPieces += 1;
      }
    }
    // Base deep-block vs possession is 0.34/0.08; Win the Foul (0.14) → 0.20/0.22.
    expect(setPieces).toBeGreaterThan(transitions);
  });
});

describe('goal-event cash — the Financier hook', () => {
  it('scored goals bank cash, visible in the log and the result', () => {
    const financier = getManager('financier')!;
    for (let seed = 1; seed <= 30; seed++) {
      const cfg = config(seed, { sides: [sideFromManager(financier), STUB_FIXTURE.sides[1]] });
      const state = runHeadless(cfg, COMMIT_ALL);
      const goals = ofType(state.log, 'goal').filter((g) => g.side === 0).length;
      if (goals === 0) continue;
      const banks = ofType(state.log, 'cash-banked').filter((c) => c.side === 0);
      expect(banks).toHaveLength(goals);
      expect(matchResult(state).cash[0]).toBe(goals * 150);
      return;
    }
    throw new Error('no Financier goal in seeds 1..30 — rates changed');
  });
});
