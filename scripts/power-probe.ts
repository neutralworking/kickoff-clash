/**
 * Power probe — calibration helper for the data port (D.4).
 *
 * The new BRS pool shifted the player power scale, so the opponent curves (ROUND_POWER,
 * CUP_FINAL_POWER) need re-placing. This sweeps OPPONENT base power for fixed squad tiers
 * and reports single-match win/draw/loss, giving the raw power→winrate curve so we can
 * place each cup final at a target difficulty.
 *
 * Run:  npx tsx scripts/power-probe.ts [seeds]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformCards, type KCCard } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';

import {
  initMatch, commitAttackers, evaluateSplit, resolveIncrement, advanceIncrement,
  getMatchResult, type MatchV5State,
} from '../src/lib/match-v5';
import type { Card } from '../src/lib/scoring';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = Number(process.argv[2] ?? 60);

const cards = transformCards(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'kc_cards.json'), 'utf-8')) as KCCard[],
);
const sorted = [...cards].sort((a, b) => b.power - a.power);
const N = sorted.length;
const tierAt = (frac: number) => {
  const start = Math.min(Math.max(0, Math.round(frac * (N - 18))), N - 18);
  return sorted.slice(start, start + 11);
};

const formation = getFormation('4-3-3');

const pickAttackers = (s: MatchV5State) =>
  [...s.xi].filter(c => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map(c => c.id);

function runMatch(xi: Card[], power: number, seed: number): 'win' | 'draw' | 'loss' {
  let state = initMatch(xi, [], [], formation, 'tiki-taka', [], seed, 2, 'Balanced', 'Creator', {}, 'balanced', power);
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    state = advanceIncrement(state, resolveIncrement(state, evaluateSplit(state, [], null), seed));
  }
  return getMatchResult(state).result;
}

const TIERS: [string, number][] = [['STRONG(top11)', 0.0], ['UPPER(~60)', 0.13], ['MID(~150)', 0.3], ['WEAK(~300)', 0.6]];
const POWERS = [55, 60, 65, 70, 75, 80, 85, 90];

console.log(`\n=== POWER PROBE (${SEEDS} seeds, single match, fresh fitness) ===`);
console.log(`Pool ${sorted[N - 1].power}–${sorted[0].power}\n`);
for (const [label, frac] of TIERS) {
  const xi = tierAt(frac);
  const avg = Math.round(xi.reduce((s, c) => s + c.power, 0) / 11);
  const row: string[] = [];
  for (const power of POWERS) {
    let w = 0;
    for (let s = 0; s < SEEDS; s++) if (runMatch(xi, power, s * 101 + 7) === 'win') w++;
    row.push(`${power}:${((w / SEEDS) * 100).toFixed(0).padStart(3)}%`);
  }
  console.log(`${label.padEnd(14)} (avg ${avg})  ${row.join('  ')}`);
}
console.log('\nColumns = opponent base power. Cell = win%. Place each cup final where the');
console.log('intended squad tier sits at the intended win rate.\n');
