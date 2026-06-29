/**
 * Cup sweep — the Phase 3B measurement instrument.
 *
 * Simulates a FULL 20-match cup run (5 knockout cups, sizes 2·3·4·5·6) with fitness
 * carrying across a cup's ties and resetting between cups, under two rotation policies,
 * so we can answer the two questions the cup design lives or dies on:
 *   1. Is the run COMPLETABLE at a sane rate for a good squad under good play?
 *   2. Does ROTATION matter — does resting tired players beat stubbornly fielding the
 *      best XI every tie? (rotate completion% should clearly exceed best-XI completion%)
 *
 * Permadeath: a loss ends the run. A draw advances (extra-time fitness drain). The
 * opponent ramps within each cup (cupMatchPower) toward a boss final.
 *
 * Run:  npx tsx scripts/cup-sweep.ts [seeds]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformAllCharacters, type KCCharacter } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';
import { createEmptySlots } from '../src/lib/tactics';
import {
  initMatch, commitAttackers, evaluateSplit, resolveIncrement, advanceIncrement,
  getMatchResult, type MatchV5State,
} from '../src/lib/match-v5';
import { cupMatchPower } from '../src/lib/opponent';
import { CUP_SIZES, MAX_CUPS, cupSize, applyMatchFitness, buildMatchSeed } from '../src/lib/run';
import type { Card } from '../src/lib/scoring';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEEDS = Number(process.argv[2] ?? 40);

const cards = transformAllCharacters(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'kc_characters.json'), 'utf-8')) as KCCharacter[],
);
const sorted = [...cards].sort((a, b) => b.power - a.power);

// fitnessFactor mirrors match-v5 (not exported): fresh 6 → ×1.0, spent 1 → ×0.6.
const fitFactor = (f: number) => 0.52 + 0.08 * Math.max(1, Math.min(6, f));
const effPower = (c: Card) => c.power * fitFactor(c.fitness ?? 6);

const ROUNDS: Record<number, { style: string; weakness: string }> = {
  1: { style: 'Passive', weakness: 'Sprinter' }, 2: { style: 'Balanced', weakness: 'Creator' },
  3: { style: 'Attacking', weakness: 'Engine' }, 4: { style: 'Counter', weakness: 'Dribbler' },
  5: { style: 'Adaptive', weakness: 'Striker' },
};
const formation = getFormation('4-3-3');
const slots = createEmptySlots();
const pickAttackers = (s: MatchV5State) =>
  [...s.xi].filter(c => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map(c => c.id);

type Policy = 'best-xi' | 'rotate';

// Pick the XI for a tie from the squad given the policy.
//  - best-xi: the 11 highest RAW power (ignores fatigue — the stubborn manager).
//  - rotate: the 11 highest EFFECTIVE power (fitness-adjusted) → tired stars drop out for
//    fresh bench, and on a non-final tie the freshest are preferred to bank star fitness.
function pickXI(squad: Card[], policy: Policy, isFinal: boolean): { xi: Card[]; benchIds: Set<number> } {
  const avail = squad.filter(c => !c.injured);
  let chosen: Card[];
  if (policy === 'best-xi') {
    chosen = [...avail].sort((a, b) => b.power - a.power).slice(0, 11);
  } else {
    // On the final, field the best available right now (effective power). On openers, lean
    // on effective power too but the tired stars naturally rest and recover for the final.
    chosen = [...avail].sort((a, b) => effPower(b) - effPower(a)).slice(0, 11);
  }
  const xiIds = new Set(chosen.map(c => c.id));
  return { xi: chosen, benchIds: new Set(squad.filter(c => !xiIds.has(c.id)).map(c => c.id)) };
}

function playTie(xi: Card[], cup: number, matchInCup: number, seed: number): 'win' | 'draw' | 'loss' {
  const { style, weakness } = ROUNDS[cup];
  const power = cupMatchPower(cup, matchInCup, cupSize(cup));
  let state = initMatch(xi, [], [], formation, 'tiki-taka', [], seed, cup, style, weakness, {}, 'balanced', power);
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    state = advanceIncrement(state, resolveIncrement(state, evaluateSplit(state, [], slots), seed));
  }
  // Copy the played XI's drained fitness AND any in-match injury back onto the caller's
  // squad cards, so applyMatchFitness sees them (injuries are a real cross-tie punishment).
  for (const played of state.xi) {
    const src = xi.find(c => c.id === played.id);
    if (src) { src.fitness = played.fitness; src.injured = played.injured; }
  }
  return getMatchResult(state).result;
}

// One full run under a policy. Returns the cup reached (5 = champions) and whether won.
function runOnce(squadSeed: number, policy: Policy): { cupReached: number; won: boolean } {
  // Fresh squad copy (fitness mutates).
  const squad: Card[] = squadCards.map(c => ({ ...c, fitness: 6, injured: false }));
  for (let cup = 1; cup <= MAX_CUPS; cup++) {
    for (const c of squad) { c.fitness = 6; c.injured = false; } // reset between cups
    const size = CUP_SIZES[cup - 1];
    for (let m = 1; m <= size; m++) {
      const isFinal = m === size;
      const { xi } = pickXI(squad, policy, isFinal);
      const seed = buildMatchSeed(squadSeed, cup, m);
      const result = playTie(xi, cup, m, seed);
      if (result === 'loss') return { cupReached: cup - 1 + (m - 1) / size, won: false };
      // fold fitness + injuries back onto the squad (playTie set them on the XI cards)
      const updated = applyMatchFitness(squad, xi, result);
      for (let i = 0; i < squad.length; i++) { squad[i].fitness = updated[i].fitness; squad[i].injured = updated[i].injured; }
    }
  }
  return { cupReached: 5, won: true };
}

let squadCards: Card[] = [];
function tierAt(frac: number): Card[] {
  const N = sorted.length;
  const start = Math.min(Math.max(0, Math.round(frac * (N - 18))), N - 18);
  return sorted.slice(start, start + 18); // 18-man squad (XI + 7 bench)
}

console.log(`\n=== CUP SWEEP (${SEEDS} seeds, 20-match runs) ===`);
console.log(`Power range ${sorted[sorted.length - 1].power}–${sorted[0].power}\n`);

for (const [label, frac] of [['STRONG (top 18)', 0.0], ['UPPER (rank ~60)', 0.13], ['MID (rank ~150)', 0.3]] as const) {
  squadCards = tierAt(frac);
  const avgPow = Math.round(squadCards.slice(0, 11).reduce((s, c) => s + c.power, 0) / 11);
  console.log(`── ${label}  (best-XI avg power ${avgPow}) ──`);
  for (const policy of ['best-xi', 'rotate'] as Policy[]) {
    let champions = 0, sumCup = 0;
    const cupHist = [0, 0, 0, 0, 0, 0]; // index = cup reached (0-5)
    for (let s = 0; s < SEEDS; s++) {
      const { cupReached, won } = runOnce(s * 101 + 7, policy);
      if (won) champions++;
      sumCup += cupReached;
      cupHist[Math.floor(cupReached)]++;
    }
    console.log(
      `  ${policy.padEnd(8)} champions ${((champions / SEEDS) * 100).toFixed(0).padStart(3)}%  ` +
      `avg cup reached ${(sumCup / SEEDS).toFixed(2)}  ` +
      `[died after cup: ${cupHist.slice(0, 5).join('/')} | champ ${cupHist[5]}]`,
    );
  }
  console.log('');
}
console.log('Targets: a STRONG squad should complete the run at a sane (non-trivial, non-zero)');
console.log('rate, and "rotate" should clearly beat "best-xi" (rotation matters).\n');
