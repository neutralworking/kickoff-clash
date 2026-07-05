/**
 * KC rebuild — drafting-sim instrument (Phase 3 acceptance probe).
 *
 * For each manager: the seeded shop-bot (src/engine/draft.ts) drafts an XI
 * from random shop streams of the regenerated pool, then plays the
 * calibration opponents headless. Prints per-manager beat rates; the vitest
 * gate (__tests__/drafting.test.ts) asserts the invariants — this prints the
 * numbers for balance passes.
 *
 *   npx tsx scripts/draft-probe.ts [seeds-per-cell]
 */

import { runHeadless, matchResult } from '../src/engine/match';
import type { MatchConfig, HeadlessPolicy } from '../src/engine/match';
import { ALL_MANAGERS } from '../src/engine/data/managers';
import { draftSquad } from '../src/engine/draft';
import { sideFromSquad, isLegalXI } from '../src/engine/cards';
import { CALIBRATION_OPPONENTS, CALIBRATION_TARGET, CALIBRATION_SUB_BATCHES } from '../src/engine/data/calibration';

const N = Number(process.argv[2] ?? 100);

const POLICY: HeadlessPolicy = {
  onBatch: (state, batch) =>
    CALIBRATION_SUB_BATCHES.includes(batch) && state.sides[0].subsLeft > 0
      ? { type: 'substitution' }
      : { type: 'none' },
  onWindow: () => ({ type: 'commit' }),
};

for (const manager of ALL_MANAGERS) {
  const xi = draftSquad(manager, 1000 + ALL_MANAGERS.indexOf(manager));
  const legal = isLegalXI(xi);
  const rates: number[] = [];
  for (const opp of CALIBRATION_OPPONENTS) {
    let met = 0;
    for (let seed = 1; seed <= N; seed++) {
      const config: MatchConfig = {
        seed,
        target: CALIBRATION_TARGET,
        sides: [sideFromSquad(manager, xi), opp.side],
      };
      if (matchResult(runHeadless(config, POLICY)).targetMet) met += 1;
    }
    rates.push(met / N);
  }
  const agg = rates.reduce((a, b) => a + b, 0) / rates.length;
  console.log(
    `${manager.id.padEnd(16)} legal=${legal} agg=${agg.toFixed(3)}  [${rates.map((r) => r.toFixed(2)).join(' ')}]  baseCharge=${xi
      .reduce((a, c) => a + c.baseContribution, 0)
      .toFixed(2)}`
  );
}
