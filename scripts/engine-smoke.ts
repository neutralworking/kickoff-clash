/**
 * KC rebuild engine — smoke driver. Runs the P1 stub fixture headless and
 * prints the event log + aggregate stats. Not a test: the vitest harness
 * (`npm test`) is the canonical gate; this is for eyeballing a single seed.
 *
 *   npx tsx scripts/engine-smoke.ts [seed] [--stats N]
 */

import type { MatchConfig } from '../src/engine';
import { runHeadless, matchResult, COMMIT_ALL } from '../src/engine';
import { STUB_FIXTURE } from '../src/engine/data/stub';

const seedArg = Number(process.argv[2] ?? 7);
const statsIdx = process.argv.indexOf('--stats');

if (statsIdx === -1) {
  const config: MatchConfig = { ...STUB_FIXTURE, seed: seedArg };
  const state = runHeadless(config, COMMIT_ALL);
  for (const e of state.log) console.log(JSON.stringify(e));
  console.log('\nRESULT', JSON.stringify(matchResult(state)));
} else {
  const n = Number(process.argv[statsIdx + 1] ?? 500);
  let points = 0;
  let goalsF = 0;
  let goalsA = 0;
  let committed = 0;
  let converted = 0;
  let met = 0;
  let peaks = 0;
  for (let seed = 1; seed <= n; seed++) {
    const state = runHeadless({ ...STUB_FIXTURE, seed }, COMMIT_ALL);
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
  console.log(
    JSON.stringify(
      {
        n,
        meanPoints: points / n,
        meanGoalsFor: goalsF / n,
        meanGoalsAgainst: goalsA / n,
        conversionRate: converted / Math.max(1, committed),
        targetMetRate: met / n,
        meanStreakPeak: peaks / n,
      },
      null,
      2
    )
  );
}
