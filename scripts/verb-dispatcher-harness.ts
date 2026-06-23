/**
 * Acceptance harness for NW-138 — verb dispatcher + TraitRecord runtime.
 *
 * Proves the three acceptance criteria from KICKOFF_CLASH_DESIGN §9 without the
 * Next.js UI:
 *   1. Same seed → identical result (determinism preserved), with the dispatcher
 *      actively firing migrated roles.
 *   2. Regista / Volante / Anchor + inside-forward + False 9 visibly shape the
 *      field via the dispatcher.
 *   3. (structural) all behaviour is data — there is no archetype/identity
 *      object; roles resolve through ROLE_TRANSFORMS records only.
 *
 * Run with:  npx tsx scripts/verb-dispatcher-harness.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformAllCharacters, type KCCharacter } from '../src/lib/transform';
import { getFormation } from '../src/lib/formations';
import { createEmptySlots } from '../src/lib/tactics';
import type { Card } from '../src/lib/scoring';
import {
  initMatch,
  commitAttackers,
  evaluateSplit,
  getOpponentBaselines,
  resolveIncrement,
  advanceIncrement,
  getMatchResult,
  type MatchV5State,
} from '../src/lib/match-v5';
import { dispatchTraits, type DispatchCard, type ZoneName } from '../src/lib/verbs';
import { ROLE_TRANSFORMS } from '../src/lib/role-transforms';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_characters.json');
const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCharacter[];
const cards = transformAllCharacters(raw);

const SEED = 12345;
const formation = getFormation('4-3-3');
const slots = createEmptySlots();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// Build an XI from real data, then stamp the five v1 roles onto specific cards
// so the dispatcher actually fires. The lowest-power card is forced to Anchor.
function buildRoledXI(): Card[] {
  const sorted = [...cards].sort((a, b) => b.power - a.power);
  const xi = sorted.slice(0, 11).map((c) => ({ ...c, tacticalRole: undefined as string | undefined }));
  // Roles by index (deterministic).
  xi[0] = { ...xi[0], position: 'WF', tacticalRole: 'Inverted Winger' }; // inside-forward
  xi[1] = { ...xi[1], position: 'CF', tacticalRole: 'Falso Nove' };      // False 9
  xi[2] = { ...xi[2], position: 'CM', tacticalRole: 'Regista' };
  xi[3] = { ...xi[3], position: 'DM', tacticalRole: 'Volante' };
  xi[10] = { ...xi[10], position: 'CD', tacticalRole: 'Anchor' };        // lowest power → Anchor
  return xi;
}

function runMatch(xi: Card[]): MatchV5State {
  const bench = cards.sort((a, b) => b.power - a.power).slice(11, 18);
  let state = initMatch(xi, bench, [], formation, 'tiki-taka', [], SEED, 1, 'Balanced', 'Sprinter');
  for (let i = 0; i < 5; i++) {
    const attackerIds = [...state.xi].filter((c) => !c.injured).sort((a, b) => b.power - a.power).slice(0, 4).map((c) => c.id);
    state = commitAttackers(state, attackerIds);
    const split = evaluateSplit(state, [], slots);
    const opp = getOpponentBaselines(1, 'Balanced', i, state);
    const result = resolveIncrement(state, split, opp.attack, opp.defence, SEED);
    state = advanceIncrement(state, result);
  }
  return state;
}

console.log('\n=== NW-138 — verb dispatcher acceptance harness ===\n');

// ---------------------------------------------------------------------------
// 1. Determinism (dispatcher active)
// ---------------------------------------------------------------------------
console.log('1. Determinism under seed (roles firing through the dispatcher)');
{
  const a = getMatchResult(runMatch(buildRoledXI()));
  const b = getMatchResult(runMatch(buildRoledXI()));
  const sameScore = a.yourGoals === b.yourGoals && a.opponentGoals === b.opponentGoals;
  const sameDetail = JSON.stringify(a.scores) === JSON.stringify(b.scores);
  check('two runs, same seed → identical scoreline', sameScore, `${a.yourGoals}-${a.opponentGoals} vs ${b.yourGoals}-${b.opponentGoals}`);
  check('two runs, same seed → identical per-increment detail', sameDetail);
}

// ---------------------------------------------------------------------------
// 2. Roles visibly shape the field (vs the same XI with roles stripped)
// ---------------------------------------------------------------------------
console.log('\n2. Migrated roles + inside-forward + False 9 reshape the field');
{
  const roledXI = buildRoledXI();
  const plainXI = roledXI.map((c) => ({ ...c, tacticalRole: undefined as string | undefined }));

  const mkState = (xi: Card[]) => {
    const bench = cards.sort((a, b) => b.power - a.power).slice(11, 18);
    let s = initMatch(xi, bench, [], formation, 'tiki-taka', [], SEED, 1, 'Balanced', 'Sprinter');
    const ids = [...s.xi].sort((a, b) => b.power - a.power).slice(0, 4).map((c) => c.id);
    s = commitAttackers(s, ids);
    return s;
  };

  const withRoles = evaluateSplit(mkState(roledXI), [], slots);
  const without = evaluateSplit(mkState(plainXI), [], slots);

  console.log(`     attack    ${without.attackScore} → ${withRoles.attackScore}`);
  console.log(`     defence   ${without.defenceScore} → ${withRoles.defenceScore}`);
  console.log(`     creation  ${without.chanceCreation} → ${withRoles.chanceCreation}`);
  console.log(`     finishing ${without.shotQuality} → ${withRoles.shotQuality}`);
  console.log(`     denial    ${without.opponentDenial} → ${withRoles.opponentDenial}`);

  const shaped =
    withRoles.attackScore !== without.attackScore ||
    withRoles.defenceScore !== without.defenceScore ||
    withRoles.chanceCreation !== without.chanceCreation ||
    withRoles.shotQuality !== without.shotQuality;
  check('field accumulators change when roles are present', shaped);
  check('Volante deny raises opponentDenial', withRoles.opponentDenial > 0, `denial=${withRoles.opponentDenial}`);
  const dispatcherLines = withRoles.attackBreakdown.concat(withRoles.defenceBreakdown).filter((l) => /Cut Inside|Drop Deep|Metronome|The Shield|Vacate/.test(l.label));
  check('named transforms appear in the cascade breakdown', dispatcherLines.length > 0, dispatcherLines.map((l) => l.label).join(', '));
}

// ---------------------------------------------------------------------------
// 3. Verb unit checks (each verb is a pure function over the field)
// ---------------------------------------------------------------------------
console.log('\n3. Verb-level checks');
{
  const base: Record<ZoneName, number> = { attack: 1000, defence: 1000, creation: 400, finishing: 400 };
  const mk = (over: Partial<DispatchCard>): DispatchCard => ({
    id: 1, power: 80, archetype: 'Creator', team: 'player', side: 'attack', isWide: true,
    emit: { attack: 80, defence: 0, creation: 50, finishing: 50 }, traits: [], ...over,
  });

  // relocate (inside-forward): creation down, finishing up, total conserved.
  const ifCard = mk({ traits: ROLE_TRANSFORMS['Inverted Winger'] });
  const ifRes = dispatchTraits([ifCard], { ...base }, SEED, 0);
  const conserved = Math.abs((ifRes.zones.creation + ifRes.zones.finishing) - (base.creation + base.finishing)) < 1e-9;
  check('relocate conserves creation+finishing total', conserved);
  check('relocate moves emission creation→finishing', ifRes.zones.finishing > base.finishing && ifRes.zones.creation < base.creation);

  // amplify (Regista): +5% creation zone.
  const reg = mk({ traits: ROLE_TRANSFORMS['Regista'] });
  const regRes = dispatchTraits([reg], { ...base }, SEED, 0);
  check('Regista amplifies creation by +5%', Math.abs(regRes.zones.creation - base.creation * 1.05) < 1e-9, `${base.creation} → ${regRes.zones.creation}`);

  // amplify-inverse-power lifts a weak card more than a strong one (Strong Leader).
  const leaderTrait = [{ name: 'Leader', verb: 'amplify-inverse-power' as const, params: { amount: 0.5 }, scope: 'global' as const, target: { kind: 'criterion' as const, criterion: 'all-teammates' as const, zone: 'attack' as const } }];
  const weak = mk({ id: 1, power: 60, side: 'attack', emit: { attack: 100, defence: 0, creation: 0, finishing: 0 }, traits: leaderTrait });
  const strong = mk({ id: 2, power: 95, side: 'attack', emit: { attack: 100, defence: 0, creation: 0, finishing: 0 }, traits: [] });
  const ldRes = dispatchTraits([weak, strong], { attack: 200, defence: 0, creation: 0, finishing: 0 }, SEED, 0);
  // Leader targets all-teammates: weak (p60) gains 0.5*(1-0.60)*100=20; strong
  // (p95) gains 0.5*(1-0.95)*100=2.5; total 200+22.5=222.5. The curve lifts the weak ~8× more.
  const weakLine = ldRes.log.find((l) => l.note.includes('(#1)'));
  const strongLine = ldRes.log.find((l) => l.note.includes('(#2)'));
  check('amplify-inverse-power lifts the weak card far more than the strong', !!weakLine && !!strongLine && weakLine.value > strongLine.value * 4, `weak=${weakLine?.value} strong=${strongLine?.value}`);
  check('amplify-inverse-power curve = amount×(1−power/100)', Math.abs(ldRes.zones.attack - 222.5) < 1e-9, `attack=${ldRes.zones.attack}`);

  // priority escape hatch: a p1 amplify sees a p0 generate's result.
  const stacked = mk({ traits: [
    { name: 'gen', verb: 'generate', params: { amount: 100 }, scope: 'zone', target: { kind: 'zone', zone: 'attack' }, priority: 0 },
    { name: 'amp', verb: 'amplify', params: { amount: 1.0 }, scope: 'global', target: { kind: 'zone', zone: 'attack' }, priority: 1 },
  ] });
  const stRes = dispatchTraits([stacked], { attack: 0, defence: 0, creation: 0, finishing: 0 }, SEED, 0);
  // p0: 0+100=100; p1 amplify +100% of snapshot(100) → +100 → 200.
  check('priority lets a later sub-pass observe an earlier one', Math.abs(stRes.zones.attack - 200) < 1e-9, `attack=${stRes.zones.attack}`);
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
