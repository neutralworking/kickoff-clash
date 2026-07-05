/**
 * NW-139 acceptance — the synergy spine's mechanisms, asserted on the event
 * log (the log is the source of truth; if it can't be read off the log, the
 * feature doesn't exist).
 */

import { describe, it, expect } from 'vitest';
import { runHeadless, COMMIT_ALL, matchResult } from '../match';
import type { MatchConfig, HeadlessPolicy } from '../match';
import type { MatchEvent } from '../events';
import { STUB_FIXTURE } from '../data/stub';
import {
  BATCHES,
  INCREMENTS_PER_BATCH,
  ENERGY_BUDGET,
  SURPLUS_CASH_PER_BATCH,
  SURPLUS_CASH_PER_ENERGY,
  WINDOW_THRESHOLD,
} from '../data/baseline';

const config = (seed: number, target = STUB_FIXTURE.target): MatchConfig => ({
  ...STUB_FIXTURE,
  seed,
  target,
});

const ofType = <T extends MatchEvent['type']>(log: MatchEvent[], type: T) =>
  log.filter((e): e is Extract<MatchEvent, { type: T }> => e.type === type);

describe('event log completeness', () => {
  it('a full match logs its whole shape: start, 6 batches, 18 increments, full-time last', () => {
    // High target → no early whistle interferes.
    const state = runHeadless(config(7, 9999), COMMIT_ALL);
    expect(state.log[0].type).toBe('match-start');
    expect(state.log[state.log.length - 1].type).toBe('full-time');
    expect(ofType(state.log, 'batch-start')).toHaveLength(BATCHES);
    expect(ofType(state.log, 'batch-end')).toHaveLength(BATCHES);
    expect(ofType(state.log, 'increment-start')).toHaveLength(BATCHES * INCREMENTS_PER_BATCH);
  });

  it('every goal is preceded by a converted window-resolved and followed by points-banked', () => {
    const state = runHeadless(config(11, 9999), COMMIT_ALL);
    const log = state.log;
    log.forEach((e, i) => {
      if (e.type !== 'goal') return;
      const before = log.slice(0, i).reverse().find((x) => x.type === 'window-resolved');
      expect(before && before.type === 'window-resolved' && before.converted).toBe(true);
      const after = log.slice(i + 1).find((x) => x.type === 'points-banked');
      expect(after).toBeDefined();
    });
  });
});

describe('window resolution — charge + d(die) ≥ threshold (SM §6)', () => {
  it('resolves with the logged charge/roll/die and the baseline threshold', () => {
    const state = runHeadless(config(3, 9999), COMMIT_ALL);
    for (const w of ofType(state.log, 'window-resolved')) {
      expect(w.threshold).toBe(WINDOW_THRESHOLD);
      expect(w.roll).toBeGreaterThanOrEqual(1);
      expect(w.roll).toBeLessThanOrEqual(w.die);
      expect(w.converted).toBe(w.charge + w.roll >= WINDOW_THRESHOLD);
    }
  });

  it('variance verbs mutate the die: late-band increments roll d8 (stub Late Chaos)', () => {
    const state = runHeadless(config(5, 9999), COMMIT_ALL);
    for (const inc of ofType(state.log, 'increment-start')) {
      expect(inc.die).toBe(inc.band === 'late' ? 8 : 4);
    }
    const dieProcs = ofType(state.log, 'trait-proc').filter((p) => p.effect === 'die');
    expect(dieProcs.length).toBeGreaterThan(0);
    expect(dieProcs.every((p) => p.trait === 'Late Chaos')).toBe(true);
  });

  it('passed windows never roll: pass-all yields zero player resolutions and zero player goals', () => {
    const passAll: HeadlessPolicy = {
      onBatch: () => ({ type: 'none' }),
      onWindow: () => ({ type: 'pass' }),
    };
    const state = runHeadless(config(7, 9999), passAll);
    expect(ofType(state.log, 'window-resolved').filter((w) => w.side === 0)).toHaveLength(0);
    expect(ofType(state.log, 'goal').filter((g) => g.side === 0)).toHaveLength(0);
    // No empty turns: the decisions themselves are still logged.
    expect(
      ofType(state.log, 'window-decision').filter((d) => d.side === 0 && d.decision === 'pass').length
    ).toBeGreaterThan(0);
  });

  it('deny traits reduce the opposing charge on the logged resolution', () => {
    const denyConfig: MatchConfig = {
      ...config(7, 9999),
      sides: [
        STUB_FIXTURE.sides[0],
        {
          ...STUB_FIXTURE.sides[1],
          traits: [
            { name: 'Break Screen', verb: 'deny', context: { kind: 'window', window: 'transition' }, magnitude: 1 },
          ],
        },
      ],
    };
    const state = runHeadless(denyConfig, COMMIT_ALL);
    const transitions = ofType(state.log, 'window-resolved').filter(
      (w) => w.side === 0 && w.kind === 'transition'
    );
    expect(transitions.length).toBeGreaterThan(0);
    // Stub charge on transition is 3 (+2 chasing); the deny takes 1 off both shapes.
    for (const w of transitions) expect([2, 4]).toContain(w.charge);
    const denyProcs = ofType(state.log, 'trait-proc').filter((p) => p.effect === 'deny');
    expect(denyProcs.length).toBeGreaterThan(0);
  });
});

describe('streaks — per-engine contradiction resets (SM §6)', () => {
  it('chained engine goals escalate the banked mult (×1, ×2, …)', () => {
    // Find a seed where the player scores 2+ transition goals with no concede between.
    for (let seed = 1; seed <= 60; seed++) {
      const state = runHeadless(config(seed, 9999), COMMIT_ALL);
      const banks = ofType(state.log, 'points-banked').filter((b) => b.side === 0 && b.source === 'goal');
      const mults = banks.map((b) => b.mult);
      const idx = mults.findIndex((m, i) => m === 2 && mults[i - 1] === 1);
      if (idx > 0) {
        expect(banks[idx].value).toBe(banks[idx].mult * 2); // GOAL_VALUE = 2
        return;
      }
    }
    throw new Error('no chained-streak seed found in 1..60 — engine or rates changed');
  });

  it('conceding breaks the streak with the engine reason', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = runHeadless(config(seed, 9999), COMMIT_ALL);
      const breaks = ofType(state.log, 'streak-broken').filter((b) => b.side === 0);
      if (breaks.length > 0) {
        expect(breaks[0].reason).toBe('conceded');
        expect(breaks[0].atStreak).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error('no streak-break seed found in 1..60 — engine or rates changed');
  });

  it('set-piece goals bank points but never extend the transition engine', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const state = runHeadless(config(seed, 9999), COMMIT_ALL);
      const log = state.log;
      const spGoalIdx = log.findIndex((e) => e.type === 'goal' && e.side === 0 && e.via === 'set-piece');
      if (spGoalIdx === -1) continue;
      const next = log[spGoalIdx + 1];
      // No streak-extended between a set-piece goal and its points-banked.
      expect(next.type).toBe('points-banked');
      return;
    }
    throw new Error('no set-piece-goal seed found in 1..120 — engine or rates changed');
  });
});

describe('posture windows — timed override with revert (SM §3)', () => {
  it('a posture play shifts the posture, costs energy, changes the telegraph, and reverts on expiry', () => {
    const playAtBatch2: HeadlessPolicy = {
      onBatch: (_s, batch) =>
        batch === 2 ? { type: 'posture-play', posture: 'possession', durationBatches: 2 } : { type: 'none' },
      onWindow: () => ({ type: 'commit' }),
    };
    const state = runHeadless(config(7, 9999), playAtBatch2);
    const shifts = ofType(state.log, 'posture-shift').filter((p) => p.side === 0);
    expect(shifts).toEqual([
      expect.objectContaining({ from: 'deep-block', to: 'possession', reason: 'tactic', batch: 2 }),
      expect.objectContaining({ from: 'possession', to: 'deep-block', reason: 'revert', batch: 4 }),
    ]);
    const telegraphs = ofType(state.log, 'batch-start').map((b) => b.telegraph[0]);
    expect(telegraphs).toEqual([
      'deep-block', 'possession', 'possession', 'deep-block', 'deep-block', 'deep-block',
    ]);
    expect(state.energy).toBe(ENERGY_BUDGET - 1);
  });
});

describe('scoring — goals AND points, early whistle, surplus→cash (SM §6)', () => {
  it('the scoreline is honest: full-time score equals the goal events', () => {
    const state = runHeadless(config(13, 9999), COMMIT_ALL);
    const ft = ofType(state.log, 'full-time')[0];
    const goals0 = ofType(state.log, 'goal').filter((g) => g.side === 0).length;
    const goals1 = ofType(state.log, 'goal').filter((g) => g.side === 1).length;
    expect(ft.score).toEqual([goals0, goals1]);
  });

  it('early whistle: play stops the moment the target is met; surplus converts to cash', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = runHeadless(config(seed, 4), COMMIT_ALL); // low target invites the whistle
      const early = ofType(state.log, 'early-whistle');
      if (early.length === 0) continue;
      const e = early[0];
      expect(e.surplusCash).toBe(
        e.surplusBatches * SURPLUS_CASH_PER_BATCH + e.surplusEnergy * SURPLUS_CASH_PER_ENERGY
      );
      // Nothing after full-time; full-time follows the whistle.
      const last = state.log[state.log.length - 1];
      expect(last.type).toBe('full-time');
      expect(last.type === 'full-time' && last.result).toBe('target-met');
      const r = matchResult(state);
      expect(r.targetMet).toBe(true);
      return;
    }
    throw new Error('no early-whistle seed found in 1..40 at target 4');
  });

  it('a missed target banks no surplus cash', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = runHeadless(config(seed, 9999), COMMIT_ALL);
      const ft = ofType(state.log, 'full-time')[0];
      expect(ft.result).toBe('target-missed');
      expect(ft.surplusCash).toBe(0);
      return;
    }
  });

  it('accrual generate traits bank points goallessly (the Fortress hook)', () => {
    const accrualConfig: MatchConfig = {
      ...config(7, 9999),
      sides: [
        {
          ...STUB_FIXTURE.sides[0],
          traits: [
            ...STUB_FIXTURE.sides[0].traits,
            { name: 'Shutout Minutes', verb: 'generate', context: { kind: 'posture', posture: 'deep-block' }, magnitude: 1 },
          ],
        },
        STUB_FIXTURE.sides[1],
      ],
    };
    const state = runHeadless(accrualConfig, COMMIT_ALL);
    const accruals = ofType(state.log, 'points-banked').filter((b) => b.side === 0 && b.source === 'accrual');
    // Active every increment while in the default deep-block posture.
    expect(accruals.length).toBe(BATCHES * INCREMENTS_PER_BATCH);
    expect(accruals.every((a) => a.value === 1 && a.mult === 1)).toBe(true);
  });
});
