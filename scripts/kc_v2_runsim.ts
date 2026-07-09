/**
 * KC six-contest run-distribution instrument (NW-142). Simulates many runs and
 * reports the permadeath curve for committed vs uncommitted builds — the lever
 * for tuning the target curve / opponent scaling in src/engine-v2/run.ts.
 *
 *   npx tsx scripts/kc_v2_runsim.ts [runs]
 *
 * Target shape (SM §8, re-based to the engine-v2 points scale): committed median
 * death ≈ F9 with ~40–50% completion; uncommitted median death ≈ F5 with ~0%
 * completion; deaths concentrated mid/late.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadCards, simulateRun, deathFixture, fixtureTarget, RUN_FIXTURES, MANAGERS, type KCCard, type KCCardJSON } from '../src/engine-v2/index';

const pool: KCCard[] = loadCards(JSON.parse(readFileSync(join(__dirname, '..', 'public/data/kc_v2_cards.json'), 'utf8')) as KCCardJSON[]);
const N = Number(process.argv[2] ?? 400);

console.log('target curve:', Array.from({ length: RUN_FIXTURES }, (_, i) => fixtureTarget(i + 1)).join(' · '));

function sweep(committed: boolean) {
  const deaths: number[] = [];
  let completed = 0;
  for (let i = 0; i < N; i++) {
    const m = MANAGERS[i % MANAGERS.length];
    const run = simulateRun(1000 + i, m, pool, committed);
    if (run.completed) completed++;
    deaths.push(deathFixture(run));
  }
  deaths.sort((a, b) => a - b);
  const median = deaths[Math.floor(deaths.length / 2)];
  const mid = deaths.filter((d) => d >= 5 && d <= 7).length / N;
  return { median: Math.min(median, RUN_FIXTURES), completion: completed / N, mid };
}

for (const committed of [true, false]) {
  const r = sweep(committed);
  console.log(
    `${committed ? 'committed' : 'uncommitted'}: median death F${r.median}  completion ${(100 * r.completion).toFixed(0)}%  deaths F5–7 ${(100 * r.mid).toFixed(0)}%`
  );
}

// per-manager completion (committed)
console.log('\nper-manager completion (committed):');
for (const m of MANAGERS) {
  let c = 0;
  const K = 120;
  for (let i = 0; i < K; i++) if (simulateRun(7000 + i, m, pool, true).completed) c++;
  console.log(`  ${m.name.padEnd(15)} ${(100 * (c / K)).toFixed(0)}%`);
}
