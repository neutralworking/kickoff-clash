/**
 * KC rebuild — run-distribution instrument (Phase 4; SM §8 acceptance).
 *
 * Plays N headless runs per policy (managers round-robin over seeds) and
 * prints the distributions the vitest harness gates on:
 *   uncommitted: median death fixture 5, ~54% of deaths in fixtures 5–7, 0% completion
 *   committed:   median fixture reached 9, 41–49% run-beat
 *
 *   npx tsx scripts/run-probe.ts [runs-per-policy]
 */

import { ALL_MANAGERS } from '../src/engine/data/managers';
import { playRun, type RunPolicy } from '../src/engine/run';

const N = Number(process.argv[2] ?? 300);

function sweep(policy: RunPolicy) {
  const deaths: number[] = [];
  const reached: number[] = [];
  let beaten = 0;
  const perManager = new Map<string, { runs: number; beat: number }>();
  for (let i = 0; i < N; i++) {
    const manager = ALL_MANAGERS[i % ALL_MANAGERS.length];
    const summary = playRun(10_000 + i, manager.id, policy);
    const pm = perManager.get(manager.id) ?? { runs: 0, beat: 0 };
    pm.runs += 1;
    if (summary.beaten) {
      beaten += 1;
      pm.beat += 1;
      reached.push(9);
    } else {
      deaths.push(summary.deathFixture!);
      reached.push(summary.deathFixture!);
    }
    perManager.set(manager.id, pm);
  }
  const sorted = [...reached].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deathsIn57 = deaths.filter((f) => f >= 5 && f <= 7).length / Math.max(1, deaths.length);
  const sortedDeaths = [...deaths].sort((a, b) => a - b);
  const medianDeath = sortedDeaths.length ? sortedDeaths[Math.floor(sortedDeaths.length / 2)] : null;
  return { policy, beatRate: beaten / N, medianReached: median, medianDeath, deathsIn57, perManager };
}

for (const policy of ['uncommitted', 'committed'] as RunPolicy[]) {
  const s = sweep(policy);
  console.log(
    `${policy.padEnd(12)} beat=${s.beatRate.toFixed(3)} medianReached=${s.medianReached} medianDeath=${s.medianDeath} deathsIn5-7=${s.deathsIn57.toFixed(3)}`
  );
  if (process.argv.includes('--per-manager')) {
    for (const [id, pm] of s.perManager) {
      console.log(`  ${id.padEnd(16)} beat ${(pm.beat / pm.runs).toFixed(2)} (${pm.beat}/${pm.runs})`);
    }
  }
}
