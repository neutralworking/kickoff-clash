/**
 * Goals-per-match calibration probe for the per-possession engine (possession.ts).
 *
 * Drives full 5-increment matches headlessly across many seeds for three deck
 * strengths, then sweeps a strong deck against every opponent round to show the
 * difficulty curve. Re-run after touching the §7 tuning dials in possession.ts.
 *
 *   npx tsx scripts/goals-calibration.ts
 *
 * Targets (design owner): even matchups average ~3 total goals; stronger decks
 * win more; win-rate falls monotonically as the opponent round (power) climbs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformCards, type KCCard } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';

import {
  initMatch,
  commitAttackers,
  evaluateSplit,
  resolveIncrement,
  advanceIncrement,
  type MatchV5State,
} from '../src/lib/match-v5';
import type { Card } from '../src/lib/scoring';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_cards.json');
const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCard[];
const cards = transformCards(raw);
const sorted = [...cards].sort((a, b) => b.power - a.power);


const formation = getFormation('4-3-3');
const SEEDS = 160;

function pickAttackers(state: MatchV5State): number[] {
  return [...state.xi].filter(c => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map(c => c.id);
}

function runMatch(xi: Card[], bench: Card[], round: number, seed: number) {
  let state = initMatch(xi, bench, [], formation, 'tiki-taka', [], seed, round, 'Balanced', 'Sprinter');
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    const split = evaluateSplit(state, []);
    state = advanceIncrement(state, resolveIncrement(state, split, seed));
  }
  return { yg: state.yourGoals, og: state.opponentGoals };
}

function sweep(label: string, pool: Card[], round: number) {
  const xi = pool.slice(0, 11);
  const bench = pool.slice(11, 18);
  let sumYg = 0, sumOg = 0, w = 0, d = 0, l = 0;
  for (let s = 0; s < SEEDS; s++) {
    const { yg, og } = runMatch(xi, bench, round, 1000 + s * 17);
    sumYg += yg; sumOg += og;
    if (yg > og) w++; else if (yg === og) d++; else l++;
  }
  const avgPwr = (xi.reduce((s, c) => s + c.power, 0) / 11).toFixed(0);
  console.log(
    `${label.padEnd(14)} pwr=${avgPwr}  avg ${(sumYg / SEEDS).toFixed(2)}-${(sumOg / SEEDS).toFixed(2)}` +
    `  (total ${((sumYg + sumOg) / SEEDS).toFixed(2)})  W${w} D${d} L${l}  win%=${((w / SEEDS) * 100).toFixed(0)}`,
  );
}

const decks: Record<string, Card[]> = {
  STRONG: sorted.slice(0, 18),
  MID: sorted.slice(180, 198),
  WEAK: sorted.slice(420, 438),
};

console.log('\n=== goal calibration: deck strength vs round-2 opponent ===');
for (const [name, pool] of Object.entries(decks)) sweep(name, pool, 2);

console.log('\n=== difficulty curve: STRONG deck vs each opponent round ===');
for (let round = 1; round <= 5; round++) sweep(`STRONG·R${round}`, decks.STRONG, round);
