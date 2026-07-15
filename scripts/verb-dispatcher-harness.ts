/**
 * SCORING_V2 invariant harness — the live engine's validation battery.
 *
 * Validates the one-currency contract (docs/SCORING_V2.md) end-to-end on the real
 * 540-card pool:
 *   1. Determinism — same seed ⇒ byte-identical match record.
 *   2. The receipt law — every card's effective stat === printed + Σ ledgered mods.
 *   3. Interactions — Marshal/Star Service thresholds, Overlap's lane-ahead,
 *      Antagonist's cross-side wind-up, tactic targeting.
 *   4. The ball contest — 6 possessions, split clamped 2–4, KEEP is identity-based.
 *   5. The d100 shot law — every shot beat carries a legal need (5..90) and
 *      goal ⇔ roll ≤ need.
 *   6. Discipline — ≤1 red per side per match; every red beat is a second yellow.
 *   7. Fitness/flank — flat, visible penalties (tired XI forecasts strictly lower;
 *      a wrong-flank wide man carries the −2/−2 mod).
 *   8. Sanity band — mean total goals across seeds inside [1.0, 6.0].
 *
 * Run:  npx tsx scripts/verb-dispatcher-harness.ts   → must print ALL CHECKS PASSED.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformCards, type KCCard } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';
import type { Card } from '../src/lib/scoring';
import {
  initMatch, evaluateSplit, resolveIncrement, advanceIncrement,
  type MatchV5State, type IncrementResult,
} from '../src/lib/match-v5';
import { preferredSide } from '../src/lib/points';
import { definingTraitsFor } from '../src/lib/defining-traits';
import { POSSESSIONS_PER_ROUND, POSS_MIN, POSS_MAX, SHOT_BASE, MARGIN_PER_POINT } from '../src/lib/contests';
import { deriveStats } from '../src/lib/funnel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_cards.json');
const POOL = transformCards(JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCard[]);

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// ---------------------------------------------------------------------------
// Pool scouts: find real cards carrying a named defining trait.
// ---------------------------------------------------------------------------

function carriersOf(traitName: string, positions?: string[]): Card[] {
  return POOL.filter((c) =>
    (!positions || positions.includes(c.position)) &&
    definingTraitsFor(c).some((t) => t.name === traitName));
}

/** A lane-quota 4-3-3 XI at a power depth (same drafting as the balance-sweep). */
const sorted = [...POOL].sort((a, b) => b.power - a.power);
function draftXI(frac: number): Card[] {
  const used = new Set<number>();
  const pick = (want: (c: Card) => boolean, k: number): Card[] => {
    const avail = sorted.filter((c) => want(c) && !used.has(c.id));
    const start = Math.min(Math.max(0, Math.round(frac * (avail.length - k))), Math.max(0, avail.length - k));
    const picked = avail.slice(start, start + k);
    picked.forEach((c) => used.add(c.id));
    return picked;
  };
  const gk = pick((c) => c.position === 'GK', 1);
  const covers = pick((c) => c.archetype === 'Cover', 2);
  const dest = pick((c) => ['Destroyer', 'Powerhouse'].includes(c.archetype), 2);
  const poss = pick((c) => ['Passer', 'Controller', 'Engine'].includes(c.archetype), 2);
  const spr = pick((c) => c.archetype === 'Sprinter', 1);
  const cre = pick((c) => ['Creator', 'Dribbler'].includes(c.archetype), 2);
  const fin = pick((c) => ['Striker', 'Target'].includes(c.archetype), 1);
  return [gk[0], dest[0], covers[0], covers[1], dest[1], poss[0], poss[1], spr[0], cre[0], fin[0], cre[1]];
}

const F433 = getFormation('4-3-3');

function playMatch(xi: Card[], seed: number, round = 3, tactics: string[] = []): { state: MatchV5State; results: IncrementResult[] } {
  let state = initMatch(xi, [], [], F433, 'tiki-taka', [], seed, round, 'Balanced', 'Sprinter', {}, 'balanced', undefined, {});
  const results: IncrementResult[] = [];
  for (let i = 0; i < 5; i++) {
    // Per-call tactics: re-call the plays each period (advanceIncrement clears them).
    state = { ...state, activeTactics: tactics };
    const split = evaluateSplit(state, []);
    const result = resolveIncrement(state, split, seed + i * 113);
    results.push(result);
    state = advanceIncrement(state, result);
  }
  return { state, results };
}

/** A serializable match record for the determinism diff. */
function record(results: IncrementResult[]): string {
  return JSON.stringify(results.map((r) => ({
    g: [r.yourGoalCount, r.opponentGoalCount],
    p: [r.yourPossessions, r.opponentPossessions],
    beats: r.beats.map((b) => [b.clock, b.side, b.outcome, b.scorerId, b.roll ?? -1, b.need ?? -1]),
    bookings: r.bookings,
  })));
}

console.log('\n=== SCORING_V2 invariant harness ===\n');

// ---------------------------------------------------------------------------
console.log('— 1. Determinism —');
{
  const xi = draftXI(0.3);
  const a = record(playMatch(xi, 777).results);
  const b = record(playMatch(xi, 777).results);
  check('same seed ⇒ identical match record', a === b);
  const c = record(playMatch(xi, 778).results);
  check('different seed ⇒ different record (dice actually roll)', a !== c);
}

// ---------------------------------------------------------------------------
console.log('— 2. The receipt law (one currency) —');
{
  const xi = draftXI(0.2);
  const state = { ...initMatch(xi, [], [], F433, 'tiki-taka', [], 42, 3, 'Balanced', 'Sprinter', {}, 'attacking', undefined, {}), activeTactics: ['fortress', 'possession'] };
  const split = evaluateSplit(state, []);
  let ok = true;
  let detail = '';
  for (const c of xi) {
    const st = split.cardStats[c.id];
    const mods = split.cardMods[c.id] ?? [];
    const atk = st.baseAtk + mods.reduce((s, m) => s + m.atk, 0);
    const def = st.baseDef + mods.reduce((s, m) => s + m.def, 0);
    if (st.atk !== atk || st.def !== def) {
      ok = false;
      detail = `card ${c.id}: shown ${st.atk}/${st.def} vs receipt ${atk}/${def}`;
      break;
    }
  }
  check('effective stat === printed + Σ ledgered mods (every card)', ok, detail);
  const printed = deriveStats(xi[3]);
  const st3 = split.cardStats[xi[3].id];
  check('printed numbers on the receipt match deriveStats', st3.baseAtk === printed.atk && st3.baseDef === printed.def);
  const totalAtk = xi.reduce((s, c) => s + split.cardStats[c.id].atk, 0);
  check('forecast ATTACK === Σ effective ATK of the XI', split.forecast.yourAttack === Math.round(totalAtk),
    `${split.forecast.yourAttack} vs ${Math.round(totalAtk)}`);
}

// ---------------------------------------------------------------------------
console.log('— 3. Interactions (flat, targeted, ledgered) —');
{
  // Marshal: teammates with snapshot DEF < 5 defend at +2.
  const marshal = carriersOf('Marshal').find((c) => c.position === 'CD') ?? carriersOf('Marshal')[0];
  if (!marshal) check('Marshal carrier exists in the pool', false);
  else {
    const weak = POOL.filter((c) => c.id !== marshal.id && deriveStats(c).def < 4 && c.position !== 'GK').slice(0, 10);
    const gk = POOL.find((c) => c.position === 'GK')!;
    const xi = [gk, marshal, weak[0], weak[1], weak[2], weak[3], weak[4], weak[5], weak[6], weak[7], weak[8]];
    const split = evaluateSplit(initMatch(xi, [], [], F433, 'tiki-taka', [], 5, 1, 'Passive', 'Sprinter'), []);
    const buffed = Object.values(split.cardMods).filter((mods) =>
      mods.some((m) => m.source.startsWith('Marshal') && m.def === 2)).length;
    check('Marshal grants +2 DEF to low-DEF teammates', buffed >= 3, `${buffed} teammates buffed`);
  }

  // Star Service: teammates with ATK ≥ 12 get +2 ATK.
  const star = carriersOf('Star Service')[0];
  if (!star) check('Star Service carrier exists in the pool', false);
  else {
    const stars = sorted.filter((c) => c.id !== star.id && deriveStats(c).atk >= 13 && c.position !== 'GK').slice(0, 3);
    const rest = POOL.filter((c) => c.position !== 'GK' && ![star.id, ...stars.map((s) => s.id)].includes(c.id)).slice(0, 6);
    const gk = POOL.find((c) => c.position === 'GK')!;
    const xi = [gk, rest[0], rest[1], rest[2], rest[3], star, rest[4], rest[5], stars[0], stars[1], stars[2]];
    const split = evaluateSplit(initMatch(xi, [], [], F433, 'tiki-taka', [], 5, 1, 'Passive', 'Sprinter'), []);
    const fed = Object.values(split.cardMods).filter((mods) =>
      mods.some((m) => m.source.startsWith('Star Service') && m.atk === 2)).length;
    check('Star Service feeds the ATK≥12 stars (+2)', fed >= 1, `${fed} stars fed`);
  }

  // Overlap Run: the NEAREST man ahead in the same lane attacks at +2 (the owner's
  // example — the fullback feeding the wide man in front of him).
  const overlap = carriersOf('Overlap Run', ['WD'])[0] ?? carriersOf('Overlap Run')[0];
  if (!overlap) check('Overlap carrier exists in the pool', false);
  else {
    const base = draftXI(0.4).filter((c) => c.id !== overlap.id);
    // 4-3-3 slot 1 = Left Back (lane L, DEF band) — the overlap runs up lane L.
    // base may hold 10 or 11 cards (the carrier can be in the draft), so take 0..9.
    const xi = [base[0], overlap, ...base.slice(1, 10)];
    const split = evaluateSplit(initMatch(xi, [], [], F433, 'tiki-taka', [], 5, 1, 'Passive', 'Sprinter'), []);
    const owner = split.youEff.find((c) => c.id === overlap.id);
    const fed = split.youEff.find((c) =>
      c.mods.some((m) => m.source.startsWith('Overlap Run') && m.atk === 2));
    const BAND_RANK = { DEF: 0, MID: 1, ATT: 2 } as const;
    check('Overlap feeds a man ahead in the owner\'s lane (+2 ATK)',
      !!owner && !!fed && fed.lane === owner.lane && BAND_RANK[fed.band] > BAND_RANK[owner.band],
      fed ? `${fed.name} (${fed.band}_${fed.lane}) fed by ${owner?.name} (${owner?.band}_${owner?.lane})` : 'nobody fed');
  }

  // Antagonist: the OPPOSING back line defends at −2 (the sanctioned exception).
  const antagonist = carriersOf('Antagonist', ['CF', 'WF'])[0] ?? carriersOf('Antagonist')[0];
  if (!antagonist) check('Antagonist carrier exists in the pool', false);
  else {
    const base = draftXI(0.4).filter((c) => c.id !== antagonist.id);
    const xi = [...base.slice(0, 9), antagonist, base[9]];
    const split = evaluateSplit(initMatch(xi, [], [], F433, 'tiki-taka', [], 5, 1, 'Passive', 'Sprinter'), []);
    const wound = split.oppEff.filter((c) => c.band === 'DEF'
      && c.mods.some((m) => m.source.startsWith('Antagonist') && m.def === -2)).length;
    check('Antagonist winds up the opposing back line (−2 DEF each)', wound >= 3, `${wound} defenders wound up`);
  }

  // Tactic targeting: Fortress = +3 DEF to the back line, nothing else.
  {
    const xi = draftXI(0.3);
    const split = evaluateSplit({ ...initMatch(xi, [], [], F433, 'tiki-taka', [], 5, 1, 'Passive', 'Sprinter', {}, 'balanced', undefined, {}), activeTactics: ['fortress'] }, []);
    const backline = split.youEff.filter((c) => c.band === 'DEF');
    const others = split.youEff.filter((c) => c.band !== 'DEF');
    check('Fortress: back line +3 DEF',
      backline.length > 0 && backline.every((c) => c.mods.some((m) => m.source === 'Fortress' && m.def === 3)),
      `${backline.length} defenders`);
    check('Fortress touches nobody else', others.every((c) => !c.mods.some((m) => m.source === 'Fortress')));
  }
}

// ---------------------------------------------------------------------------
console.log('— 4. The ball contest —');
{
  const xi = draftXI(0.3);
  const { results } = playMatch(xi, 99);
  const totalOk = results.every((r) => r.yourPossessions + r.opponentPossessions === POSSESSIONS_PER_ROUND);
  const clampOk = results.every((r) =>
    r.yourPossessions >= POSS_MIN && r.yourPossessions <= POSS_MAX &&
    r.opponentPossessions >= POSS_MIN && r.opponentPossessions <= POSS_MAX);
  check(`each round splits exactly ${POSSESSIONS_PER_ROUND} possessions`, totalOk);
  check(`per-side clamp ${POSS_MIN}–${POSS_MAX} holds`, clampOk);

  // KEEP is identity-based: it is exactly the ball-keepers' ATK.
  const split = evaluateSplit(initMatch(xi, [], [], F433, 'tiki-taka', [], 5, 3, 'Balanced', 'Sprinter'), []);
  const keepIds = split.youEff.filter((c) => ['Controller', 'Passer', 'Engine'].includes(c.archetype));
  const expected = Math.round(keepIds.reduce((s, c) => s + c.atk, 0));
  check('KEEP === Σ ATK of Controllers/Passers/Engines', split.contest.keep === expected,
    `${split.contest.keep} vs ${expected}`);
}

// ---------------------------------------------------------------------------
console.log('— 5. The d100 shot law —');
{
  let shots = 0, legal = 0, lawful = 0;
  for (let s = 0; s < 10; s++) {
    const { results } = playMatch(draftXI(0.25), 1000 + s * 17);
    for (const r of results) {
      for (const b of r.beats) {
        if (b.outcome !== 'goal' && b.outcome !== 'save' && b.outcome !== 'miss') continue;
        shots += 1;
        if (typeof b.roll === 'number' && typeof b.need === 'number' && b.need >= 5 && b.need <= 90 && b.roll >= 1 && b.roll <= 100) legal += 1;
        const isGoal = b.outcome === 'goal';
        if (typeof b.roll === 'number' && typeof b.need === 'number' && isGoal === (b.roll <= b.need)) lawful += 1;
      }
    }
  }
  check('every shot carries a legal d100 receipt (need 5..90, roll 1..100)', shots > 0 && legal === shots, `${legal}/${shots}`);
  check('GOAL ⇔ roll ≤ need (no hidden math)', lawful === shots, `${lawful}/${shots}`);
  check('shot bases are the spec (half 20 / big 40 / corner 15, 3 per point)',
    SHOT_BASE.half === 20 && SHOT_BASE.big === 40 && SHOT_BASE.corner === 15 && MARGIN_PER_POINT === 3);
}

// ---------------------------------------------------------------------------
console.log('— 5b. The counter law —');
{
  // A COUNTER chance may only ever follow a TURNOVER by the OTHER side in the
  // same increment (the honest PRESS → turnover → chance causal chain).
  let counters = 0;
  let orphan = false;
  for (let s = 0; s < 30; s++) {
    const { results } = playMatch(draftXI(0.4), 6100 + s * 17);
    for (const r of results) {
      for (let bi = 0; bi < r.beats.length; bi++) {
        const b = r.beats[bi];
        if (!b.counter) continue;
        counters += 1;
        const other = b.side === 'you' ? 'opp' : 'you';
        const preceded = r.beats.slice(0, bi).some((p) => p.outcome === 'turnover' && p.side === other);
        if (!preceded) orphan = true;
      }
    }
  }
  check('counters occur (turnovers can spring chances)', counters > 0, `${counters} counter beats / 30 matches`);
  check('every counter follows an opposition turnover (the honest chain)', !orphan);
}

console.log('— 6. Discipline —');
{
  let redViolation = false;
  let orphanRed = false;
  let reds = 0, yellows = 0;
  for (let s = 0; s < 30; s++) {
    const { state, results } = playMatch(draftXI(0.5), 5000 + s * 31);
    const yourIds = new Set(state.xi.map((c) => c.id));
    const yourReds = state.sentOffIds.filter((id) => yourIds.has(id)).length;
    const oppReds = state.sentOffIds.length - yourReds;
    if (yourReds > 1 || oppReds > 1) redViolation = true;
    reds += state.sentOffIds.length;
    const seenYellow = new Set<number>();
    for (const r of results) {
      for (const b of r.bookings) {
        if (b.red) {
          if (!seenYellow.has(b.cardId)) orphanRed = true;
        } else {
          yellows += 1;
          seenYellow.add(b.cardId);
        }
      }
    }
  }
  check('max 1 red per side per match', !redViolation);
  check('every red is a second yellow', !orphanRed, `${reds} reds / ${yellows} yellows across 30 matches`);
}

// ---------------------------------------------------------------------------
console.log('— 7. Fitness + flank (flat, visible penalties) —');
{
  const xi = draftXI(0.2);
  const fresh = evaluateSplit(initMatch(xi, [], [], F433, 'tiki-taka', [], 7, 3, 'Balanced', 'Sprinter'), []);
  const tiredXI = xi.map((c) => ({ ...c, fitness: 1.5 }));
  const tired = evaluateSplit(initMatch(tiredXI, [], [], F433, 'tiki-taka', [], 7, 3, 'Balanced', 'Sprinter'), []);
  check('a spent XI forecasts strictly lower ATTACK (flat −N per card)',
    tired.forecast.yourAttack < fresh.forecast.yourAttack,
    `${tired.forecast.yourAttack} < ${fresh.forecast.yourAttack}`);
  const tiredMods = Object.values(tired.cardMods).filter((mods) => mods.some((m) => m.kind === 'fitness')).length;
  check('the fatigue shows on the receipt (fitness mods present)', tiredMods >= 8, `${tiredMods} cards ledgered`);

  // Wrong flank: a right-preferring wide man in the LEFT back slot carries the mod.
  const wide = POOL.find((c) => c.position === 'WD' && preferredSide(c) === 'R');
  if (!wide) check('a right-preferring WD exists', false);
  else {
    const base = draftXI(0.4).filter((c) => c.id !== wide.id);
    const xiWrong = [base[0], wide, base[2], base[3], base[4], base[5], base[6], base[7], base[8], base[9], base[10]];
    const split = evaluateSplit(initMatch(xiWrong, [], [], F433, 'tiki-taka', [], 7, 1, 'Passive', 'Sprinter'), []);
    const mods = split.cardMods[wide.id] ?? [];
    check('a wide man on his wrong flank carries −2/−2 "Wrong flank"',
      mods.some((m) => m.source === 'Wrong flank' && m.atk === -2 && m.def === -2),
      mods.map((m) => m.source).join(', ') || 'no mods');
  }
}

// ---------------------------------------------------------------------------
console.log('— 8. Sanity band —');
{
  let goals = 0, matches = 0, xg = 0;
  for (let s = 0; s < 30; s++) {
    const { state, results } = playMatch(draftXI(0.35), 9000 + s * 13);
    goals += state.yourGoals + state.opponentGoals;
    xg += results.reduce((t, r) => t + r.yourXG + r.opponentXG, 0);
    matches += 1;
  }
  const mean = goals / matches;
  check('mean total goals per match in [1.0, 6.0]', mean >= 1.0 && mean <= 6.0, mean.toFixed(2));
  check('xG accumulates (the dice roll on real chances)', xg > 0, (xg / matches).toFixed(2) + ' xG/match');

  const strong = evaluateSplit(initMatch(draftXI(0.0), [], [], F433, 'tiki-taka', [], 3, 3, 'Balanced', 'Sprinter'), []);
  const weakS = evaluateSplit(initMatch(draftXI(1.0), [], [], F433, 'tiki-taka', [], 3, 3, 'Balanced', 'Sprinter'), []);
  check('a stronger deck forecasts a higher NET', strong.forecast.net > weakS.forecast.net,
    `${strong.forecast.net} > ${weakS.forecast.net}`);
}

// ---------------------------------------------------------------------------
console.log('');
if (failures > 0) {
  console.log(`=== ${failures} CHECK(S) FAILED ===\n`);
  process.exit(1);
}
console.log('=== ALL CHECKS PASSED ===\n');
