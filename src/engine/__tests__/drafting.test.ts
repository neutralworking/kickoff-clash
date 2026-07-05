/**
 * Phase 3 acceptance — the drafting sim (KC_REBUILD_PLAN_V1 §P3).
 *
 * "A headless shop-bot can assemble a viable squad for all 10 managers from
 * random shop streams." Per manager: the bot drafts from seeded random offers
 * of the regenerated pool, the XI must be legal, and the squad must genuinely
 * COMPOUND the engine — beating the calibration set strictly better than the
 * manager fielding nothing, and comfortably viable in absolute terms.
 * (Absolute rates vs these early-run opponents run hot — 0.77–1.0; the run
 * difficulty curve is Phase 4's job. Deterministic: fixed draft seeds.)
 */

import { describe, it, expect } from 'vitest';
import { runHeadless, matchResult } from '../match';
import type { MatchConfig, HeadlessPolicy } from '../match';
import { ALL_MANAGERS } from '../data/managers';
import { draftSquad } from '../draft';
import { sideFromSquad, isLegalXI } from '../cards';
import {
  CALIBRATION_OPPONENTS,
  CALIBRATION_TARGET,
  CALIBRATION_SUB_BATCHES,
} from '../data/calibration';

const N = 100;

const POLICY: HeadlessPolicy = {
  onBatch: (state, batch) =>
    CALIBRATION_SUB_BATCHES.includes(batch) && state.sides[0].subsLeft > 0
      ? { type: 'substitution' }
      : { type: 'none' },
  onWindow: () => ({ type: 'commit' }),
};

function aggregateRate(side0: MatchConfig['sides'][0]): number {
  let met = 0;
  for (const opp of CALIBRATION_OPPONENTS) {
    for (let seed = 1; seed <= N; seed++) {
      const config: MatchConfig = { seed, target: CALIBRATION_TARGET, sides: [side0, opp.side] };
      if (matchResult(runHeadless(config, POLICY)).targetMet) met += 1;
    }
  }
  return met / (N * CALIBRATION_OPPONENTS.length);
}

describe('shop-bot drafting viability (all 10 managers)', () => {
  for (const manager of ALL_MANAGERS) {
    it(`${manager.id}: legal XI that compounds the engine`, () => {
      const xi = draftSquad(manager, 1000 + ALL_MANAGERS.indexOf(manager));
      expect(isLegalXI(xi), xi.map((c) => c.position).join(' ')).toBe(true);

      const squadRate = aggregateRate(sideFromSquad(manager, xi));
      const aloneRate = aggregateRate({
        posture: manager.defaultPosture,
        traits: manager.traits,
        baseCharge: 0,
        engine: manager.engine,
        autoCommit: false,
      });

      // The squad must add real power (dual-axis compounding has fuel to buy)…
      expect(squadRate, `squad ${squadRate} vs alone ${aloneRate}`).toBeGreaterThan(aloneRate);
      // …and be comfortably viable in absolute terms.
      expect(squadRate).toBeGreaterThanOrEqual(0.5);
    });
  }

  it('drafts differ across managers (fit-driven, not one generic best-XI)', () => {
    const ids = ALL_MANAGERS.map((m) =>
      draftSquad(m, 2024)
        .map((c) => c.id)
        .sort((a, b) => a - b)
        .join(',')
    );
    expect(new Set(ids).size).toBeGreaterThan(5);
  });
});
