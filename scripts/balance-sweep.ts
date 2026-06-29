/**
 * Balance sweep — the Phase 3 measurement instrument.
 *
 * Foundation changes MOVE the meta by design, so byte-identical determinism is the
 * wrong test. Instead this sweeps deck-strength tiers × opponent rounds × N seeds and
 * reports the metrics the Lab named:
 *   - win/draw/loss rate per (deck tier, round)         → is the curve monotonic?
 *   - personality attackMod/defMod (deck-level)         → is the stack tamed? (target ≤1.30)
 *   - TOP vs WEAK increment-1 attackScore divergence    → do builds differ? (compression)
 *   - TOP-deck win-rate vs R1                            → does a good build clear it? (≥70%)
 *
 * Run:  npx tsx scripts/balance-sweep.ts [seeds]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformAllCharacters, type KCCharacter } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';
import { createEmptySlots } from '../src/lib/tactics';
import {
  initMatch,
  commitAttackers,
  evaluateSplit,
  resolveIncrement,
  advanceIncrement,
  getMatchResult,
  type MatchV5State,
} from '../src/lib/match-v5';
import type { Card } from '../src/lib/scoring';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEEDS = Number(process.argv[2] ?? 40);
const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_characters.json');
const cards = transformAllCharacters(JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCharacter[]);
const sorted = [...cards].sort((a, b) => b.power - a.power);

// Deck-strength tiers by power rank (each a band of 11). S5 strongest → S1 weakest.
const N = sorted.length;
const tierAt = (frac: number): { xi: Card[]; bench: Card[] } => {
  const start = Math.min(Math.max(0, Math.round(frac * (N - 18))), N - 18);
  return { xi: sorted.slice(start, start + 11), bench: sorted.slice(start + 11, start + 18) };
};
const TIERS: { name: string; deck: { xi: Card[]; bench: Card[] } }[] = [
  { name: 'S5-top', deck: tierAt(0.0) },
  { name: 'S4', deck: tierAt(0.22) },
  { name: 'S3-mid', deck: tierAt(0.45) },
  { name: 'S2', deck: tierAt(0.7) },
  { name: 'S1-weak', deck: tierAt(1.0) },
];

// Real per-round opponent style + weakness (opponent.ts OPPONENTS + OPPONENT_META).
const ROUNDS: Record<number, { style: string; weakness: string }> = {
  1: { style: 'Passive', weakness: 'Sprinter' },
  2: { style: 'Balanced', weakness: 'Creator' },
  3: { style: 'Attacking', weakness: 'Engine' },
  4: { style: 'Counter', weakness: 'Dribbler' },
  5: { style: 'Adaptive', weakness: 'Striker' },
};

const formation = getFormation('4-3-3');
const slots = createEmptySlots();

function pickAttackers(s: MatchV5State): number[] {
  return [...s.xi].filter(c => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map(c => c.id);
}

interface MatchOut { result: 'win' | 'draw' | 'loss'; gf: number; ga: number; attackMod: number; firstAttack: number; }

function runMatch(deck: { xi: Card[]; bench: Card[] }, round: number, seed: number): MatchOut {
  const { style, weakness } = ROUNDS[round];
  let state = initMatch(deck.xi, deck.bench, [], formation, 'tiki-taka', [], seed, round, style, weakness);
  const attackMod = state.personalityBonus.attackMod;
  let firstAttack = 0;
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    const split = evaluateSplit(state, [], slots);
    if (i === 0) firstAttack = split.attackScore;
    state = advanceIncrement(state, resolveIncrement(state, split, seed));
  }
  const final = getMatchResult(state);
  return { result: final.result, gf: state.yourGoals, ga: state.opponentGoals, attackMod, firstAttack };
}

// --- Sweep ---
console.log(`\n=== BALANCE SWEEP (${SEEDS} seeds) ===`);
console.log(`Power range: ${sorted[N - 1].power}–${sorted[0].power}  (cards=${N})\n`);

const divergence: Record<string, number> = {};
for (const round of [1, 3, 5]) {
  console.log(`── vs Round ${round} (${ROUNDS[round].style}, soft-spot ${ROUNDS[round].weakness}) ──`);
  console.log(`  tier      win%  draw%  loss%   gf/ga    attackMod  atk@1`);
  for (const { name, deck } of TIERS) {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0, am = 0, fa = 0;
    for (let s = 0; s < SEEDS; s++) {
      const o = runMatch(deck, round, s * 101 + 7);
      if (o.result === 'win') w++; else if (o.result === 'draw') d++; else l++;
      gf += o.gf; ga += o.ga; am += o.attackMod; fa += o.firstAttack;
    }
    const pct = (x: number) => ((x / SEEDS) * 100).toFixed(0).padStart(3);
    console.log(`  ${name.padEnd(8)} ${pct(w)}%  ${pct(d)}%  ${pct(l)}%   ${(gf / SEEDS).toFixed(1)}/${(ga / SEEDS).toFixed(1)}    ${(am / SEEDS).toFixed(2)}      ${Math.round(fa / SEEDS)}`);
    if (round === 1) divergence[name] = fa / SEEDS;
  }
  console.log('');
}

const top = divergence['S5-top'] ?? 0;
const weak = divergence['S1-weak'] ?? 0;
console.log(`── Foundation targets ──`);
console.log(`  TOP vs WEAK atk@1 divergence: ${Math.round(top)} vs ${Math.round(weak)}  = ${weak > 0 ? (((top - weak) / weak) * 100).toFixed(0) : '∞'}%  (target ≥40%)`);
console.log(`  (win-rate should rise monotonically S1→S5; TOP vs R1 should be ≥70% win)\n`);
