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

import { transformCards, type KCCard } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';

import {
  initMatch, commitAttackers, callPlay, evaluateSplit, resolveIncrement, advanceIncrement,
  getMatchResult, type MatchV5State,
} from '../src/lib/match-v5';
import { cupMatchPower, getOpponentPlayById } from '../src/lib/opponent';
import { CUP_SIZES, MAX_CUPS, cupSize, applyMatchFitness, buildMatchSeed } from '../src/lib/run';
import { ALL_TACTICS, chargesLeft, type TacticCard } from '../src/lib/tactics';
import { tacticTraits, type SquadContext } from '../src/lib/squad-transforms';
import { gradeCall } from '../src/lib/plays';
import type { Card } from '../src/lib/scoring';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEEDS = Number(process.argv[2] ?? 40);

const cards = transformCards(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'kc_cards.json'), 'utf-8')) as KCCard[],
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

const pickAttackers = (s: MatchV5State) =>
  [...s.xi].filter(c => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map(c => c.id);

type Policy = 'best-xi' | 'rotate' | 'rotate+calls';

// --- Called-play layer (Called Plays rework) --------------------------------
// 'rotate+calls' plays the same rotation policy but also CALLS a play each spell
// with balance-sweep's 'best' heuristic: answer a telegraphed forward commitment
// with a defensive-class block, otherwise attack what can't punish you. This is
// the instrument for "completable under good play" now that calls exist.
const PLAY_RANK: Record<string, number> = {
  low_block: 16, man_marking: 15, sit_deep: 14, fortress: 13, press_high: 12,
  route_one: 11, wing_play: 10, narrow: 9, overload_right: 8, overload_left: 7,
  high_line: 6, counter_attack: 5, set_piece: 4,
  possession: 3, youth_policy: 2, dark_arts: 1,
};

function chooseBestPlay(s: MatchV5State): TacticCard | null {
  const available = ALL_TACTICS.filter(t => chargesLeft(t, s.playChargesUsed) > 0);
  if (available.length === 0) return null;
  const oppRecords = s.opponentPlay ? getOpponentPlayById(s.opponentPlay.id)?.records ?? [] : [];
  const ctx: SquadContext = {
    xi: s.xi, increment: s.currentIncrement, opponentGoals: s.opponentGoals,
    yourGoals: s.yourGoals, connections: [], intent: s.intent, opponentPlayId: s.opponentPlay?.id,
  };
  let best: TacticCard | null = null;
  let bestScore = 0;
  for (const t of available) {
    const records = tacticTraits(t, ctx);
    const grade = gradeCall(t, oppRecords, records);
    const base = grade === 'answered'
      ? (t.playClass === 'defensive' ? 400 : 300)
      : grade === 'neutral' && records.length > 0
        ? (t.playClass === 'attacking' ? 200 : 100)
        : -100;
    const score = base + (PLAY_RANK[t.id] ?? 0);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

// Pick the XI for a tie from the squad given the policy. Under the funnel model an
// XI must COVER THE LANES (a raw top-11 fields no defence and measures the drafting
// bug, not the run), so both policies draft by lane quota — best by the policy's
// power metric within each lane — ordered into the 4-3-3 slots.
//  - best-xi: RAW power within each lane (ignores fatigue — the stubborn manager).
//  - rotate: EFFECTIVE power (fitness-adjusted) → tired stars drop out for fresh bench.
function pickXI(squad: Card[], policy: Policy, isFinal: boolean): { xi: Card[]; benchIds: Set<number> } {
  const avail = squad.filter(c => !c.injured);
  const metric = policy === 'best-xi' ? (c: Card) => c.power : effPower;
  const used = new Set<number>();
  const take = (want: (c: Card) => boolean, k: number): (Card | undefined)[] => {
    const pool = avail.filter((c) => want(c) && !used.has(c.id)).sort((a, b) => metric(b) - metric(a));
    const picked = pool.slice(0, k);
    picked.forEach((c) => used.add(c.id));
    return picked.length < k ? [...picked, ...Array(k - picked.length).fill(undefined)] : picked;
  };
  const gk = take((c) => c.position === 'GK', 1);
  const covers = take((c) => c.archetype === 'Cover', 2);
  const destroyers = take((c) => ['Destroyer', 'Powerhouse'].includes(c.archetype), 2);
  const possession = take((c) => ['Passer', 'Controller', 'Engine'].includes(c.archetype), 2);
  const presser = take((c) => c.archetype === 'Sprinter', 1);
  const creators = take((c) => ['Creator', 'Dribbler'].includes(c.archetype), 2);
  const finisher = take((c) => ['Striker', 'Target'].includes(c.archetype), 1);
  // 4-3-3 slot order: GK FB CB CB FB DM CM CM WF CF WF.
  const slots: (Card | undefined)[] = [
    gk[0],
    destroyers[0], covers[0], covers[1], destroyers[1],
    possession[0], possession[1], presser[0],
    creators[0], finisher[0], creators[1],
  ];
  // Injury gaps: fill with the best remaining by the metric (any lane).
  const rest = avail.filter((c) => !used.has(c.id)).sort((a, b) => metric(b) - metric(a));
  const chosen = slots.map((c) => c ?? rest.shift()).filter((c): c is Card => !!c);
  const xiIds = new Set(chosen.map(c => c.id));
  return { xi: chosen, benchIds: new Set(squad.filter(c => !xiIds.has(c.id)).map(c => c.id)) };
}

function playTie(xi: Card[], cup: number, matchInCup: number, seed: number, calls: boolean): 'win' | 'draw' | 'loss' {
  const { style, weakness } = ROUNDS[cup];
  const power = cupMatchPower(cup, matchInCup, cupSize(cup));
  let state = initMatch(xi, [], [], formation, 'tiki-taka', [], seed, cup, style, weakness, {}, 'balanced', power);
  for (let i = 0; i < 5; i++) {
    state = commitAttackers(state, pickAttackers(state));
    const play = calls ? chooseBestPlay(state) : null;
    state = callPlay(state, play?.id ?? null);
    state = advanceIncrement(state, resolveIncrement(state, evaluateSplit(state, [], play), seed));
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
      const result = playTie(xi, cup, m, seed, policy === 'rotate+calls');
      if (result === 'loss') return { cupReached: cup - 1 + (m - 1) / size, won: false };
      // fold fitness + injuries back onto the squad (playTie set them on the XI cards)
      const updated = applyMatchFitness(squad, xi, result);
      for (let i = 0; i < squad.length; i++) { squad[i].fitness = updated[i].fitness; squad[i].injured = updated[i].injured; }
    }
  }
  return { cupReached: 5, won: true };
}

let squadCards: Card[] = [];
// 18-man squad drafted by LANE QUOTA at the tier's power depth (FUNNEL_MODEL_V1):
// 2 GK, 3 defence, 3 destruction, 3 possession, 2 pressing, 3 creation, 2 finishing.
// A raw top-18 slice fields no coherent XI under the funnel.
function tierAt(frac: number): Card[] {
  const used = new Set<number>();
  const pickFrom = (want: (c: Card) => boolean, k: number): Card[] => {
    const avail = sorted.filter((c) => want(c) && !used.has(c.id));
    const start = Math.min(Math.max(0, Math.round(frac * (avail.length - k))), Math.max(0, avail.length - k));
    const picked = avail.slice(start, start + k);
    picked.forEach((c) => used.add(c.id));
    return picked;
  };
  return [
    ...pickFrom((c) => c.position === 'GK', 2),
    ...pickFrom((c) => c.archetype === 'Cover', 3),
    ...pickFrom((c) => ['Destroyer', 'Powerhouse'].includes(c.archetype), 3),
    ...pickFrom((c) => ['Passer', 'Controller', 'Engine'].includes(c.archetype), 3),
    ...pickFrom((c) => c.archetype === 'Sprinter', 2),
    ...pickFrom((c) => ['Creator', 'Dribbler'].includes(c.archetype), 3),
    ...pickFrom((c) => ['Striker', 'Target'].includes(c.archetype), 2),
  ];
}

console.log(`\n=== CUP SWEEP (${SEEDS} seeds, 20-match runs) ===`);
console.log(`Power range ${sorted[sorted.length - 1].power}–${sorted[0].power}\n`);

for (const [label, frac] of [['STRONG (top 18)', 0.0], ['UPPER (rank ~60)', 0.13], ['MID (rank ~150)', 0.3]] as const) {
  squadCards = tierAt(frac);
  const avgPow = Math.round(squadCards.slice(0, 11).reduce((s, c) => s + c.power, 0) / 11);
  console.log(`── ${label}  (best-XI avg power ${avgPow}) ──`);
  for (const policy of ['best-xi', 'rotate', 'rotate+calls'] as Policy[]) {
    let champions = 0, sumCup = 0;
    const cupHist = [0, 0, 0, 0, 0, 0]; // index = cup reached (0-5)
    for (let s = 0; s < SEEDS; s++) {
      const { cupReached, won } = runOnce(s * 101 + 7, policy);
      if (won) champions++;
      sumCup += cupReached;
      cupHist[Math.floor(cupReached)]++;
    }
    console.log(
      `  ${policy.padEnd(12)} champions ${((champions / SEEDS) * 100).toFixed(0).padStart(3)}%  ` +
      `avg cup reached ${(sumCup / SEEDS).toFixed(2)}  ` +
      `[died after cup: ${cupHist.slice(0, 5).join('/')} | champ ${cupHist[5]}]`,
    );
  }
  console.log('');
}
console.log('Targets: a STRONG squad should complete the run at a sane (non-trivial, non-zero)');
console.log('rate, and "rotate" should clearly beat "best-xi" (rotation matters).\n');
