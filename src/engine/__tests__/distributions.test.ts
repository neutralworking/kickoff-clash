/**
 * NW-139 acceptance — single-match distribution checks per
 * `scripts/balance_sim.py` (the balance reference; KC_REBUILD_PLAN_V1 §P1).
 *
 * The Python sim implements the same mulberry32 and consumes rolls in the same
 * order, so on seeds 1..500 the two implementations agree BIT-FOR-BIT — these
 * constants are baked from `python3 scripts/balance_sim.py --n 500` (and the
 * gambler variant). A failure means the model diverged from the reference:
 * either re-bake deliberately (a tuning pass, changing baseline.ts AND
 * balance_sim.py together) or you broke the engine.
 */

import { describe, it, expect } from 'vitest';
import { runHeadless, COMMIT_ALL, matchResult } from '../match';
import type { MatchConfig } from '../match';
import { STUB_FIXTURE } from '../data/stub';

const N = 500;

// python3 scripts/balance_sim.py --n 500
const REF_BASELINE = {
  meanPoints: 9.608,
  meanGoalsFor: 3.096,
  meanGoalsAgainst: 1.456,
  conversionRate: 0.5156562291805463,
  targetMetRate: 0.634,
  meanStreakPeak: 2.212,
};

// python3 scripts/balance_sim.py --n 500 --variant gambler-opp
const REF_GAMBLER_OPP = {
  meanPoints: 10.628,
  meanGoalsFor: 3.758,
  meanGoalsAgainst: 2.272,
  conversionRate: 0.7616538305634374,
  targetMetRate: 0.86,
  meanStreakPeak: 2.14,
};

function sweep(configFor: (seed: number) => MatchConfig) {
  let points = 0;
  let goalsF = 0;
  let goalsA = 0;
  let committed = 0;
  let converted = 0;
  let met = 0;
  let peaks = 0;
  for (let seed = 1; seed <= N; seed++) {
    const state = runHeadless(configFor(seed), COMMIT_ALL);
    const r = matchResult(state);
    points += r.points[0];
    goalsF += r.score[0];
    goalsA += r.score[1];
    if (r.targetMet) met += 1;
    let peak = 0;
    for (const e of state.log) {
      if (e.type === 'window-resolved' && e.side === 0) {
        committed += 1;
        if (e.converted) converted += 1;
      }
      if (e.type === 'streak-extended' && e.side === 0) peak = Math.max(peak, e.streak);
    }
    peaks += peak;
  }
  return {
    meanPoints: points / N,
    meanGoalsFor: goalsF / N,
    meanGoalsAgainst: goalsA / N,
    conversionRate: converted / Math.max(1, committed),
    targetMetRate: met / N,
    meanStreakPeak: peaks / N,
  };
}

describe('single-match distributions vs balance_sim.py (seeds 1..500)', () => {
  it('baseline stub matches the reference exactly', () => {
    const s = sweep((seed) => ({ ...STUB_FIXTURE, seed }));
    expect(s.meanPoints).toBeCloseTo(REF_BASELINE.meanPoints, 9);
    expect(s.meanGoalsFor).toBeCloseTo(REF_BASELINE.meanGoalsFor, 9);
    expect(s.meanGoalsAgainst).toBeCloseTo(REF_BASELINE.meanGoalsAgainst, 9);
    expect(s.conversionRate).toBeCloseTo(REF_BASELINE.conversionRate, 9);
    expect(s.targetMetRate).toBeCloseTo(REF_BASELINE.targetMetRate, 9);
    expect(s.meanStreakPeak).toBeCloseTo(REF_BASELINE.meanStreakPeak, 9);
  });

  it('gambler-opponent variant matches the reference exactly (die-size teeth, SM §6)', () => {
    const s = sweep((seed) => ({
      ...STUB_FIXTURE,
      seed,
      sides: [
        STUB_FIXTURE.sides[0],
        {
          ...STUB_FIXTURE.sides[1],
          traits: [
            {
              name: 'Chaos Merchant',
              verb: 'amplify-variance',
              context: { kind: 'posture', posture: 'possession' },
              magnitude: 1,
            },
          ],
        },
      ],
    }));
    expect(s.meanPoints).toBeCloseTo(REF_GAMBLER_OPP.meanPoints, 9);
    expect(s.meanGoalsFor).toBeCloseTo(REF_GAMBLER_OPP.meanGoalsFor, 9);
    expect(s.meanGoalsAgainst).toBeCloseTo(REF_GAMBLER_OPP.meanGoalsAgainst, 9);
    expect(s.conversionRate).toBeCloseTo(REF_GAMBLER_OPP.conversionRate, 9);
    expect(s.targetMetRate).toBeCloseTo(REF_GAMBLER_OPP.targetMetRate, 9);
    expect(s.meanStreakPeak).toBeCloseTo(REF_GAMBLER_OPP.meanStreakPeak, 9);
  });

  it('the variance die is real teeth, both directions: the gambler fixture is swingier for BOTH sides', () => {
    const base = sweep((seed) => ({ ...STUB_FIXTURE, seed }));
    const gam = sweep((seed) => ({
      ...STUB_FIXTURE,
      seed,
      sides: [
        STUB_FIXTURE.sides[0],
        {
          ...STUB_FIXTURE.sides[1],
          traits: [
            {
              name: 'Chaos Merchant',
              verb: 'amplify-variance',
              context: { kind: 'posture', posture: 'possession' },
              magnitude: 1,
            },
          ],
        },
      ],
    }));
    expect(gam.meanGoalsFor).toBeGreaterThan(base.meanGoalsFor);
    expect(gam.meanGoalsAgainst).toBeGreaterThan(base.meanGoalsAgainst);
  });
});
