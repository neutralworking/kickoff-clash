/**
 * Starter-rip probe — pick the opening-squad strength (item: "initial packs too good").
 *
 * Sweeps how many Rares the starter rip allows (rest Common, no Epic/Legendary) and, for
 * each, measures the opening XI's avg power and how the auto-filled starter squad fares
 * through cup 1 and a full 20-match run (best-xi play). The goal: a scrappy-but-survivable
 * start (cup 1 winnable) with a clear gap below the old full-pool rip, so the shop is the
 * real upgrade path.
 *
 * Run:  npx tsx scripts/starter-probe.ts [seeds]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformCards, type KCCard } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';
import { autoFillXI } from '../src/lib/team-select';
import { createEmptySlots } from '../src/lib/tactics';
import {
  initMatch, commitAttackers, evaluateSplit, resolveIncrement, advanceIncrement,
  getMatchResult, type MatchV5State,
} from '../src/lib/match-v5';
import { cupMatchPower } from '../src/lib/opponent';
import { CUP_SIZES, MAX_CUPS, cupSize, applyMatchFitness, buildMatchSeed } from '../src/lib/run';
import type { Card } from '../src/lib/scoring';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = Number(process.argv[2] ?? 60);

const ALL = transformCards(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'kc_cards.json'), 'utf-8')) as KCCard[],
);
const COMMON = ALL.filter((c) => c.rarity === 'Common');
const RARE = ALL.filter((c) => c.rarity === 'Rare');

const formation = getFormation('4-3-3');
const slots = createEmptySlots();
const pickAttackers = (s: MatchV5State) =>
  [...s.xi].filter((c) => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map((c) => c.id);

// Deterministic seeded shuffle (mirrors packs.seededShuffle closely enough for sampling).
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Rip a 25-card starter: `rares` Rares + rest Common (full pool when rares<0).
function ripStarter(seed: number, rares: number): Card[] {
  if (rares < 0) return shuffle(ALL, seed).slice(0, 25);
  const r = shuffle(RARE, seed + 11).slice(0, rares);
  const c = shuffle(COMMON, seed).slice(0, 25 - r.length);
  return [...c, ...r];
}

function playTie(xi: Card[], cup: number, m: number, seed: number): 'win' | 'draw' | 'loss' {
  const power = cupMatchPower(cup, m, cupSize(cup));
  let state = initMatch(xi, [], [], formation, 'tiki-taka', [], seed, cup, 'Balanced', 'Creator', {}, 'balanced', power);
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    state = advanceIncrement(state, resolveIncrement(state, evaluateSplit(state, [], slots), seed));
  }
  for (const played of state.xi) {
    const src = xi.find((c) => c.id === played.id);
    if (src) { src.fitness = played.fitness; src.injured = played.injured; }
  }
  return getMatchResult(state).result;
}

// Full run with the starter squad held fixed (no shop upgrades) — the floor experience.
function runOnce(starter: Card[], squadSeed: number): { cup1: boolean; reached: number } {
  const squad: Card[] = starter.map((c) => ({ ...c, fitness: 6, injured: false }));
  let cup1 = false;
  for (let cup = 1; cup <= MAX_CUPS; cup++) {
    for (const c of squad) { c.fitness = 6; c.injured = false; }
    const size = CUP_SIZES[cup - 1];
    for (let m = 1; m <= size; m++) {
      const avail = squad.filter((c) => !c.injured);
      const { xi } = autoFillXI(avail, formation, true);
      const result = playTie(xi, cup, m, buildMatchSeed(squadSeed, cup, m));
      if (result === 'loss') return { cup1, reached: cup - 1 + (m - 1) / size };
      const updated = applyMatchFitness(squad, xi, result);
      for (let i = 0; i < squad.length; i++) { squad[i].fitness = updated[i].fitness; squad[i].injured = updated[i].injured; }
    }
    if (cup === 1) cup1 = true;
  }
  return { cup1, reached: 5 };
}

console.log(`\n=== STARTER PROBE (${SEEDS} seeds, no shop upgrades) ===`);
console.log(`Pool: Common ${COMMON.length} (${COMMON[COMMON.length-1].power}-${COMMON[0].power}), Rare ${RARE.length}\n`);
console.log(`rares  XIavg  cup1-clear%  avg-cup-reached`);
for (const rares of [-1, 10, 8, 6, 4, 2, 0]) {
  let xiSum = 0, cup1 = 0, reachSum = 0;
  for (let s = 0; s < SEEDS; s++) {
    const starter = ripStarter(s * 101 + 7, rares);
    const { xi } = autoFillXI(starter, formation, false);
    xiSum += xi.reduce((a, c) => a + c.power, 0) / xi.length;
    const r = runOnce(starter, s * 101 + 7);
    if (r.cup1) cup1++;
    reachSum += r.reached;
  }
  const label = rares < 0 ? 'FULL' : String(rares);
  console.log(`${label.padStart(4)}   ${(xiSum / SEEDS).toFixed(1)}   ${((cup1 / SEEDS) * 100).toFixed(0).padStart(3)}%        ${(reachSum / SEEDS).toFixed(2)}`);
}
console.log(`\nWant a scrappy start: XI avg well below FULL, cup1-clear still high (~70-90%),`);
console.log(`avg-cup-reached < the cup-sweep STRONG (the shop is meant to carry you further).\n`);
