/**
 * Phase 2 acceptance — per-manager calibration (KC_REBUILD_PLAN_V1 §P2).
 *
 * Each manager runs the calibration fixture set headless (native formation, no
 * tactical cards, commit-all windows, subs before batches 3/4/5) and must hit
 * the beat rates from `scripts/balance_sim.py --calibrate` EXACTLY (the sim is
 * a bit-exact mirror on the same seeds). Design gates on top of parity:
 * every aggregate inside CALIBRATION_BAND, and Fortress on its own tighter
 * leash (SM §4 tuning flag: accrual engines trend dominant — keep the
 * run-preserver at or below the pack, never towering over it).
 *
 * A failure here means either the engine diverged from the reference (a bug)
 * or a deliberate retune: patch managers.ts, re-run
 * `npx tsx scripts/export-managers.ts` then `--calibrate`, and re-bake.
 */

import { describe, it, expect } from 'vitest';
import { runHeadless, matchResult } from '../match';
import type { MatchConfig, HeadlessPolicy } from '../match';
import { ALL_MANAGERS, managerOffer } from '../data/managers';
import {
  CALIBRATION_OPPONENTS,
  CALIBRATION_TARGET,
  CALIBRATION_SUB_BATCHES,
  CALIBRATION_SEEDS,
  CALIBRATION_BAND,
  FORTRESS_LEASH_MARGIN,
} from '../data/calibration';

// python3 scripts/balance_sim.py --calibrate (n=300, seeds 1..300)
const REF: Record<string, { perOpponent: Record<string, number>; aggregate: number }> = {
  'counter-attack': { perOpponent: { 'balanced-possession': 0.5433333333333333, 'stubborn-block': 0.08666666666666667, 'strong-possession': 0.41333333333333333 }, aggregate: 0.3477777777777778 },
  'set-piece': { perOpponent: { 'balanced-possession': 0.5633333333333334, 'stubborn-block': 0.6666666666666666, 'strong-possession': 0.5366666666666666 }, aggregate: 0.5888888888888889 },
  fortress: { perOpponent: { 'balanced-possession': 0.4066666666666667, 'stubborn-block': 0.69, 'strong-possession': 0.12333333333333334 }, aggregate: 0.4066666666666667 },
  tinkerman: { perOpponent: { 'balanced-possession': 0.3933333333333333, 'stubborn-block': 0.4266666666666667, 'strong-possession': 0.36 }, aggregate: 0.39333333333333337 },
  metronome: { perOpponent: { 'balanced-possession': 0.8, 'stubborn-block': 0.65, 'strong-possession': 0.6233333333333333 }, aggregate: 0.6911111111111111 },
  chaser: { perOpponent: { 'balanced-possession': 0.14666666666666667, 'stubborn-block': 0.25333333333333335, 'strong-possession': 0.22 }, aggregate: 0.20666666666666667 },
  gambler: { perOpponent: { 'balanced-possession': 0.3, 'stubborn-block': 0.29, 'strong-possession': 0.29333333333333333 }, aggregate: 0.29444444444444445 },
  pragmatist: { perOpponent: { 'balanced-possession': 0.8533333333333334, 'stubborn-block': 0.3466666666666667, 'strong-possession': 0.8533333333333334 }, aggregate: 0.6844444444444445 },
  taskmaster: { perOpponent: { 'balanced-possession': 0.32, 'stubborn-block': 0.31333333333333335, 'strong-possession': 0.2733333333333333 }, aggregate: 0.3022222222222222 },
  financier: { perOpponent: { 'balanced-possession': 0.25666666666666665, 'stubborn-block': 0.17, 'strong-possession': 0.19333333333333333 }, aggregate: 0.20666666666666667 },
};

const CALIBRATION_POLICY: HeadlessPolicy = {
  onBatch: (state, batch) =>
    CALIBRATION_SUB_BATCHES.includes(batch) && state.sides[0].subsLeft > 0
      ? { type: 'substitution' }
      : { type: 'none' },
  onWindow: () => ({ type: 'commit' }),
};

function beatRate(managerId: string, opponentIdx: number): number {
  const manager = ALL_MANAGERS.find((m) => m.id === managerId)!;
  let met = 0;
  for (let seed = 1; seed <= CALIBRATION_SEEDS; seed++) {
    const config: MatchConfig = {
      seed,
      target: CALIBRATION_TARGET,
      sides: [
        {
          posture: manager.defaultPosture,
          traits: manager.traits,
          baseCharge: 0,
          engine: manager.engine,
          autoCommit: false,
        },
        CALIBRATION_OPPONENTS[opponentIdx].side,
      ],
    };
    if (matchResult(runHeadless(config, CALIBRATION_POLICY)).targetMet) met += 1;
  }
  return met / CALIBRATION_SEEDS;
}

describe('manager calibration vs balance_sim.py --calibrate (seeds 1..300)', () => {
  const rates: Record<string, number> = {};

  for (const manager of ALL_MANAGERS) {
    it(`${manager.id} matches the reference on every opponent`, () => {
      let sum = 0;
      CALIBRATION_OPPONENTS.forEach((opp, i) => {
        const rate = beatRate(manager.id, i);
        sum += rate;
        expect(rate, `${manager.id} vs ${opp.id}`).toBeCloseTo(REF[manager.id].perOpponent[opp.id], 9);
      });
      const aggregate = sum / CALIBRATION_OPPONENTS.length;
      rates[manager.id] = aggregate;
      expect(aggregate).toBeCloseTo(REF[manager.id].aggregate, 9);
    });
  }

  it('every aggregate sits inside the design band', () => {
    for (const manager of ALL_MANAGERS) {
      const agg = REF[manager.id].aggregate;
      expect(agg, manager.id).toBeGreaterThanOrEqual(CALIBRATION_BAND[0]);
      expect(agg, manager.id).toBeLessThanOrEqual(CALIBRATION_BAND[1]);
    }
  });

  it('Fortress leash: the accrual engine never towers over the roster (SM §4)', () => {
    const others = ALL_MANAGERS.filter((m) => m.id !== 'fortress').map((m) => REF[m.id].aggregate);
    const mean = others.reduce((a, b) => a + b, 0) / others.length;
    expect(REF.fortress.aggregate).toBeLessThanOrEqual(mean + FORTRESS_LEASH_MARGIN);
  });
});

describe('manager offer — seeded choice of three (SM §4)', () => {
  it('offers 3 distinct managers, deterministic per seed, varying across seeds', () => {
    const a = managerOffer(123).map((m) => m.id);
    const b = managerOffer(123).map((m) => m.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) managerOffer(seed).forEach((m) => seen.add(m.id));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('every manager states its win condition in one line (the legibility rule)', () => {
    for (const m of ALL_MANAGERS) {
      expect(m.winCondition.length).toBeGreaterThan(0);
      expect(m.winCondition).not.toContain('\n');
    }
  });
});
