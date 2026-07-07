/**
 * Balance sweep — the Phase 3 measurement instrument.
 *
 * Foundation changes MOVE the meta by design, so byte-identical determinism is the
 * wrong test. Instead this sweeps deck-strength tiers × opponent rounds × N seeds and
 * reports the metrics the Lab named:
 *   - win/draw/loss rate per (deck tier, round)         → is the curve monotonic?
 *   - personality attackMod/defMod (deck-level)         → is the stack tamed? (target ≤1.30)
 *   - TOP vs WEAK increment-1 attacking-funnel divergence → do builds differ? (compression)
 *   - TOP-deck win-rate vs R1                            → does a good build clear it? (≥70%)
 *
 * TACTICS BY CARDS axis: every match runs under an equip policy —
 *   none    — no tactic cards equipped
 *   random  — 3 seeded random tactic cards equipped for the match
 *   curated — a fixed strong trio (set_piece + possession + fortress)
 * and the sweep reports win% per policy and the curated-vs-none gap (do equipped
 * tactics matter?).
 *
 * Run:  npx tsx scripts/balance-sweep.ts [seeds]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformCards, type KCCard } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';
import { ALL_TACTICS } from '../src/lib/tactics';
import { seededRandom } from '../src/lib/scoring';
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
const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_cards.json');
const cards = transformCards(JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCard[]);
const sorted = [...cards].sort((a, b) => b.power - a.power);

// Deck-strength tiers by power rank. S5 strongest → S1 weakest. Under the funnel
// model a deck is only meaningful if it is POSITION-COHERENT (a raw top-11-by-power
// slice fields no GK and no defence lane, which measures the drafting bug, not the
// power curve), so each tier drafts a 4-3-3-shaped XI — best-by-power within each
// positional pool at the tier's depth — ordered to match the formation's slots:
// GK, FB, CB, CB, FB, DM, CM, CM, WF, CF, WF.
const N = sorted.length;
const tierAt = (frac: number): { xi: Card[]; bench: Card[] } => {
  const used = new Set<number>();
  const pickFrom = (want: (c: Card) => boolean, k: number): Card[] => {
    const avail = sorted.filter((c) => want(c) && !used.has(c.id));
    const start = Math.min(Math.max(0, Math.round(frac * (avail.length - k))), Math.max(0, avail.length - k));
    const picked = avail.slice(start, start + k);
    picked.forEach((c) => used.add(c.id));
    return picked;
  };
  // Lane-quota draft (FUNNEL_MODEL_V1): a competent squad covers all six lanes, so
  // each tier drafts by lane at the tier's power depth — tiers then isolate POWER,
  // not composition luck. Ordered into the 4-3-3 slots (GK FB CB CB FB DM CM CM WF CF WF).
  const gk = pickFrom((c) => c.position === 'GK', 1);
  const covers = pickFrom((c) => c.archetype === 'Cover', 2);                                  // defence
  const destroyers = pickFrom((c) => ['Destroyer', 'Powerhouse'].includes(c.archetype), 2);    // destruction
  const possession = pickFrom((c) => ['Passer', 'Controller', 'Engine'].includes(c.archetype), 2);
  const presser = pickFrom((c) => c.archetype === 'Sprinter', 1);
  const creators = pickFrom((c) => ['Creator', 'Dribbler'].includes(c.archetype), 2);
  const finisher = pickFrom((c) => ['Striker', 'Target'].includes(c.archetype), 1);
  const xi = [
    gk[0],
    destroyers[0], covers[0], covers[1], destroyers[1],
    possession[0], possession[1], presser[0],
    creators[0], finisher[0], creators[1],
  ];
  const startB = Math.min(Math.max(0, Math.round(frac * (N - 7))), N - 7);
  const bench = sorted.filter((c) => !used.has(c.id)).slice(startB, startB + 7);
  return { xi, bench };
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

// --- Equip policies (TACTICS BY CARDS) --------------------------------------

type CallPolicy = 'none' | 'random' | 'best';
const POLICIES: CallPolicy[] = ['none', 'random', 'best'];

/** The curated trio for the 'best' policy — a broadly strong, condition-light set. */
const CURATED_TACTICS = ['set_piece', 'possession', 'fortress'];

function equipFor(policy: CallPolicy, seed: number): string[] {
  if (policy === 'none') return [];
  if (policy === 'best') return CURATED_TACTICS;
  const ids: string[] = [];
  const pool = ALL_TACTICS.map((t) => t.id);
  for (let k = 0; ids.length < 3 && k < 40; k++) {
    const r = seededRandom((((seed * 92821) ^ (k * 68917) ^ 40503) >>> 0));
    const pick = pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
    if (!ids.includes(pick)) ids.push(pick);
  }
  return ids;
}

interface MatchOut {
  result: 'win' | 'draw' | 'loss';
  gf: number; ga: number;
  net: number; firstAttack: number;
}

function runMatch(deck: { xi: Card[]; bench: Card[] }, round: number, seed: number, policy: CallPolicy): MatchOut {
  const { style, weakness } = ROUNDS[round];
  let state = initMatch(
    deck.xi, deck.bench, [], formation, 'tiki-taka', [], seed, round, style, weakness,
    {}, 'balanced', undefined, equipFor(policy, seed),
  );
  let firstAttack = 0;
  let net = 0;
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    const split = evaluateSplit(state, []);
    if (i === 0) {
      firstAttack = split.forecast.yourAttack;
      net = split.forecast.net;
    }
    const result = resolveIncrement(state, split, seed);
    state = advanceIncrement(state, result);
  }
  const final = getMatchResult(state);
  return { result: final.result, gf: state.yourGoals, ga: state.opponentGoals, net, firstAttack };
}

// --- Sweep ---
console.log(`\n=== BALANCE SWEEP (${SEEDS} seeds; equip policies: none / random3 / curated3) ===`);
console.log(`Power range: ${sorted[N - 1].power}–${sorted[0].power}  (cards=${N})\n`);

const divergence: Record<string, number> = {};
const policyWins: Record<CallPolicy, { w: number; n: number }> = { none: { w: 0, n: 0 }, random: { w: 0, n: 0 }, best: { w: 0, n: 0 } };
const policyGoals: Record<CallPolicy, { gf: number; ga: number; d: number }> = {
  none: { gf: 0, ga: 0, d: 0 }, random: { gf: 0, ga: 0, d: 0 }, best: { gf: 0, ga: 0, d: 0 },
};

for (const round of [1, 3, 5]) {
  console.log(`── vs Round ${round} (${ROUNDS[round].style}, soft-spot ${ROUNDS[round].weakness}) ──`);
  console.log(`  tier      | win% none | win% rand3 | win% cur3 | gf/ga (cur3)  net@1  atk@1`);
  for (const { name, deck } of TIERS) {
    const winPct: Record<CallPolicy, number> = { none: 0, random: 0, best: 0 };
    let gf = 0, ga = 0, nt = 0, fa = 0;
    for (const policy of POLICIES) {
      let w = 0;
      for (let s = 0; s < SEEDS; s++) {
        const o = runMatch(deck, round, s * 101 + 7, policy);
        if (o.result === 'win') w++;
        policyWins[policy].n++;
        if (o.result === 'win') policyWins[policy].w++;
        policyGoals[policy].gf += o.gf; policyGoals[policy].ga += o.ga;
        if (o.result === 'draw') policyGoals[policy].d++;
        if (policy === 'best') {
          gf += o.gf; ga += o.ga; nt += o.net;
        }
        if (policy === 'none') fa += o.firstAttack;
      }
      winPct[policy] = (w / SEEDS) * 100;
    }
    const pct = (x: number) => x.toFixed(0).padStart(3);
    console.log(`  ${name.padEnd(8)} |   ${pct(winPct.none)}%    |    ${pct(winPct.random)}%     |   ${pct(winPct.best)}%    | ${(gf / SEEDS).toFixed(1)}/${(ga / SEEDS).toFixed(1)}       ${Math.round(nt / SEEDS).toString().padStart(4)}   ${Math.round(fa / SEEDS)}`);
    if (round === 1) divergence[name] = fa / SEEDS;
  }
  console.log('');
}

const top = divergence['S5-top'] ?? 0;
const weak = divergence['S1-weak'] ?? 0;
console.log(`── Foundation targets (measured under callPolicy=none) ──`);
console.log(`  TOP vs WEAK atk@1 divergence: ${Math.round(top)} vs ${Math.round(weak)}  = ${weak > 0 ? (((top - weak) / weak) * 100).toFixed(0) : '∞'}%  (target ≥40%)`);
console.log(`  (win-rate should rise monotonically S1→S5; TOP vs R1 should be ≥70% win)\n`);

console.log(`── Tactics-by-cards targets ──`);
const wp = (p: CallPolicy) => (policyWins[p].n ? (policyWins[p].w / policyWins[p].n) * 100 : 0);
console.log(`  win% by equip policy: none=${wp('none').toFixed(1)}%  random3=${wp('random').toFixed(1)}%  curated3=${wp('best').toFixed(1)}%`);
const gl = (p: CallPolicy) => `${(policyGoals[p].gf / policyWins[p].n).toFixed(2)}/${(policyGoals[p].ga / policyWins[p].n).toFixed(2)} (draw ${((policyGoals[p].d / policyWins[p].n) * 100).toFixed(0)}%)`;
console.log(`  gf/ga by policy: none=${gl('none')}  random3=${gl('random')}  curated3=${gl('best')}`);
console.log(`  curated-vs-none gap: ${(wp('best') - wp('none')).toFixed(1)}pp  (equipped tactics should matter)`);
console.log('');
