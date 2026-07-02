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
 * Called Plays axis (the rework's instrument): every match runs under a callPolicy —
 *   none    — no play is ever called (the old sweep's behaviour)
 *   random  — a seeded random charged play each spell
 *   best    — the play that best answers the telegraphed opponent play (gradeCall)
 * and the sweep reports win% per policy, the best-vs-random gap (do calls matter?)
 * and the mean per-spell net xG swing of a clean counter (an 'answered' call).
 *
 * Run:  npx tsx scripts/balance-sweep.ts [seeds]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformCards, type KCCard } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';
import { ALL_TACTICS, chargesLeft, type TacticCard } from '../src/lib/tactics';
import { getOpponentPlayById } from '../src/lib/opponent';
import { tacticTraits, type SquadContext } from '../src/lib/squad-transforms';
import { gradeCall } from '../src/lib/plays';
import { seededRandom } from '../src/lib/scoring';
import {
  initMatch,
  commitAttackers,
  callPlay,
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
const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_cards.json');
const cards = transformCards(JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCard[]);
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

function pickAttackers(s: MatchV5State): number[] {
  return [...s.xi].filter(c => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map(c => c.id);
}

// --- Call policies ---------------------------------------------------------

type CallPolicy = 'none' | 'random' | 'best';
const POLICIES: CallPolicy[] = ['none', 'random', 'best'];

function playCtx(s: MatchV5State): SquadContext {
  return {
    xi: s.xi,
    increment: s.currentIncrement,
    opponentGoals: s.opponentGoals,
    yourGoals: s.yourGoals,
    connections: [],
    intent: s.intent,
    opponentPlayId: s.opponentPlay?.id,
  };
}

function choosePlay(policy: CallPolicy, s: MatchV5State, seed: number): TacticCard | null {
  if (policy === 'none') return null;
  const available = ALL_TACTICS.filter(t => chargesLeft(t, s.playChargesUsed) > 0);
  if (available.length === 0) return null;

  if (policy === 'random') {
    const r = seededRandom((((seed * 92821) ^ (s.currentIncrement * 68917) ^ 40503) >>> 0));
    return available[Math.min(available.length - 1, Math.floor(r * available.length))];
  }

  // 'best': answer the play that will actually run (the clean-counter ceiling —
  // for the Adaptive style this reads through the decoy).
  const oppRecords = s.opponentPlay ? getOpponentPlayById(s.opponentPlay.id)?.records ?? [] : [];
  const ctx = playCtx(s);
  let best: TacticCard | null = null;
  let bestScore = 0;
  for (const t of available) {
    const records = tacticTraits(t, ctx);
    const grade = gradeCall(t, oppRecords, records);
    const score = grade === 'answered' ? 2 : grade === 'neutral' && records.length > 0 ? 1 : -1;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

interface MatchOut {
  result: 'win' | 'draw' | 'loss';
  gf: number; ga: number;
  attackMod: number; firstAttack: number;
  calls: number; answered: number; countered: number;
  answeredSwings: number[]; // playImpact.yourCallXG on 'answered' calls
}

function runMatch(deck: { xi: Card[]; bench: Card[] }, round: number, seed: number, policy: CallPolicy): MatchOut {
  const { style, weakness } = ROUNDS[round];
  let state = initMatch(deck.xi, deck.bench, [], formation, 'tiki-taka', [], seed, round, style, weakness);
  const attackMod = state.personalityBonus.attackMod;
  let firstAttack = 0;
  let calls = 0, answered = 0, countered = 0;
  const answeredSwings: number[] = [];
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    const play = choosePlay(policy, state, seed);
    state = callPlay(state, play?.id ?? null);
    const calledPlay = state.calledPlayId ? play : null;
    const split = evaluateSplit(state, [], calledPlay);
    const baseline = calledPlay ? evaluateSplit(state, [], null) : null;
    if (i === 0) firstAttack = split.attackScore;
    const result = resolveIncrement(state, split, seed, baseline);
    if (result.calledPlayName) {
      calls++;
      if (result.callGrade === 'answered') {
        answered++;
        if (result.playImpact) answeredSwings.push(result.playImpact.yourCallXG);
      } else if (result.callGrade === 'countered') countered++;
    }
    state = advanceIncrement(state, result);
  }
  const final = getMatchResult(state);
  return { result: final.result, gf: state.yourGoals, ga: state.opponentGoals, attackMod, firstAttack, calls, answered, countered, answeredSwings };
}

// --- Sweep ---
console.log(`\n=== BALANCE SWEEP (${SEEDS} seeds; call policies: ${POLICIES.join(' / ')}) ===`);
console.log(`Power range: ${sorted[N - 1].power}–${sorted[0].power}  (cards=${N})\n`);

const divergence: Record<string, number> = {};
const policyWins: Record<CallPolicy, { w: number; n: number }> = { none: { w: 0, n: 0 }, random: { w: 0, n: 0 }, best: { w: 0, n: 0 } };
const allAnsweredSwings: number[] = [];
let bestCalls = 0, bestAnswered = 0, bestCountered = 0;

for (const round of [1, 3, 5]) {
  console.log(`── vs Round ${round} (${ROUNDS[round].style}, soft-spot ${ROUNDS[round].weakness}) ──`);
  console.log(`  tier      | win% none | win% random | win% best | gf/ga (best)  attackMod  atk@1`);
  for (const { name, deck } of TIERS) {
    const winPct: Record<CallPolicy, number> = { none: 0, random: 0, best: 0 };
    let gf = 0, ga = 0, am = 0, fa = 0;
    for (const policy of POLICIES) {
      let w = 0;
      for (let s = 0; s < SEEDS; s++) {
        const o = runMatch(deck, round, s * 101 + 7, policy);
        if (o.result === 'win') w++;
        policyWins[policy].n++;
        if (o.result === 'win') policyWins[policy].w++;
        if (policy === 'best') {
          gf += o.gf; ga += o.ga; am += o.attackMod;
          bestCalls += o.calls; bestAnswered += o.answered; bestCountered += o.countered;
          allAnsweredSwings.push(...o.answeredSwings);
        }
        if (policy === 'none') fa += o.firstAttack;
      }
      winPct[policy] = (w / SEEDS) * 100;
    }
    const pct = (x: number) => x.toFixed(0).padStart(3);
    console.log(`  ${name.padEnd(8)} |   ${pct(winPct.none)}%    |    ${pct(winPct.random)}%     |   ${pct(winPct.best)}%    | ${(gf / SEEDS).toFixed(1)}/${(ga / SEEDS).toFixed(1)}       ${(am / SEEDS).toFixed(2)}      ${Math.round(fa / SEEDS)}`);
    if (round === 1) divergence[name] = fa / SEEDS;
  }
  console.log('');
}

const top = divergence['S5-top'] ?? 0;
const weak = divergence['S1-weak'] ?? 0;
console.log(`── Foundation targets (measured under callPolicy=none) ──`);
console.log(`  TOP vs WEAK atk@1 divergence: ${Math.round(top)} vs ${Math.round(weak)}  = ${weak > 0 ? (((top - weak) / weak) * 100).toFixed(0) : '∞'}%  (target ≥40%)`);
console.log(`  (win-rate should rise monotonically S1→S5; TOP vs R1 should be ≥70% win)\n`);

console.log(`── Called Plays targets ──`);
const wp = (p: CallPolicy) => (policyWins[p].n ? (policyWins[p].w / policyWins[p].n) * 100 : 0);
console.log(`  win% by policy: none=${wp('none').toFixed(1)}%  random=${wp('random').toFixed(1)}%  best=${wp('best').toFixed(1)}%`);
console.log(`  best-vs-random gap: ${(wp('best') - wp('random')).toFixed(1)}pp  (target ≥15–20pp)`);
console.log(`  best-vs-none gap:   ${(wp('best') - wp('none')).toFixed(1)}pp`);
const meanSwing = allAnsweredSwings.length
  ? allAnsweredSwings.reduce((a, b) => a + b, 0) / allAnsweredSwings.length
  : 0;
console.log(`  'best' calls: ${bestCalls} made, ${bestAnswered} answered, ${bestCountered} countered`);
console.log(`  mean net xG swing of a clean counter (answered call): ${meanSwing >= 0 ? '+' : ''}${meanSwing.toFixed(3)}  (target ±0.25–0.40)\n`);
