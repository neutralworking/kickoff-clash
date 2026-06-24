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
import { createEmptySlots, getTacticById } from '../src/lib/tactics';
import { getJokerById } from '../src/lib/jokers';
import { tacticTraits, managerTraits } from '../src/lib/squad-transforms';
import type { Card } from '../src/lib/scoring';
import {
  initMatch,
  commitAttackers,
  evaluateSplit,
  resolveIncrement,
  advanceIncrement,
  getMatchResult,
  computeSideField,
  type MatchV5State,
} from '../src/lib/match-v5';
import { generateOpponentXI, opponentScaleTraits, counterPush, reactivityFor } from '../src/lib/opponent';
import { chemistryStrength, accrueMatch, coApp, chemistryRecords } from '../src/lib/chem';
import { dispatchTraits, buildBaseCells, type DispatchCard } from '../src/lib/verbs';
import { ROLE_TRANSFORMS } from '../src/lib/role-transforms';
import { CELLS, cellOf, bandOf, attackVsCover, pushVsReserveCover, type Band, type Lane } from '../src/lib/field';

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
    const result = resolveIncrement(state, split, SEED);
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
  // The base field is now the cards' own emission placed in their cells; the
  // dispatcher builds it internally, so each test just declares a card's cell + emit.
  const mk = (over: Partial<DispatchCard>): DispatchCard => ({
    id: 1, power: 80, archetype: 'Creator', position: 'WF', team: 'player', side: 'attack', isWide: true,
    cell: 'ATT_C', emit: { attack: 80, defence: 0, creation: 50, finishing: 50 }, traits: [], ...over,
  });
  // Band → chance-mix weights, mirroring match-v5's §7 dials (ATT≈finishing, MID≈creation).
  const CREATION_BAND: Record<Band, number> = { ATT: 0.7, MID: 1.0, DEF: 0.4 };
  const FINISHING_BAND: Record<Band, number> = { ATT: 1.0, MID: 0.5, DEF: 0.1 };
  const proj = (cells: Record<string, Record<string, number>>, w: Record<Band, number>, kind: string) =>
    CELLS.reduce((s, c) => s + cells[c][kind] * w[bandOf(c)], 0);

  // relocate (inside-forward "Cut Inside"): a wide card carries threat into the
  // central lane (ATT_L → ATT_C). Real lane shift; every kind's total is conserved.
  const ifCard = mk({ cell: 'ATT_L', side: 'attack', emit: { attack: 100, defence: 0, creation: 40, finishing: 40 }, traits: ROLE_TRANSFORMS['Inverted Winger'] });
  const ifRes = dispatchTraits([ifCard], SEED, 0);
  check('Cut Inside moves emission ATT_L → ATT_C', ifRes.cells.ATT_C.attack > 0 && ifRes.cells.ATT_L.attack < 100, `L=${ifRes.cells.ATT_L.attack} C=${ifRes.cells.ATT_C.attack}`);
  check('relocate conserves total attack across cells', Math.abs(ifRes.zones.attack - 100) < 1e-9, `attack=${ifRes.zones.attack}`);
  check('Cut Inside loads the centre lane (push moves L → C)', ifRes.lanePush.C > 0 && ifRes.lanePush.L < 100, `push L=${ifRes.lanePush.L} C=${ifRes.lanePush.C}`);

  // relocate (False 9 "Drop Deep"): the striker drops a band (ATT_C → MID_C). The
  // band-weighted projection turns that into a finishing→creation trade.
  const f9 = mk({ cell: 'ATT_C', side: 'attack', emit: { attack: 100, defence: 0, creation: 60, finishing: 60 }, traits: ROLE_TRANSFORMS['Falso Nove'] });
  const f9base = buildBaseCells([f9]);
  const f9Res = dispatchTraits([f9], SEED, 0);
  check('Drop Deep moves emission ATT_C → MID_C', f9Res.cells.MID_C.attack > 0 && f9Res.cells.ATT_C.attack < 100, `ATT_C=${f9Res.cells.ATT_C.attack} MID_C=${f9Res.cells.MID_C.attack}`);
  check('Drop Deep conserves total attack across cells', Math.abs(f9Res.zones.attack - 100) < 1e-9, `attack=${f9Res.zones.attack}`);
  check('Drop Deep trades finishing for creation (band projection)',
    proj(f9Res.cells, FINISHING_BAND, 'finishing') < proj(f9base, FINISHING_BAND, 'finishing') &&
    proj(f9Res.cells, CREATION_BAND, 'creation') > proj(f9base, CREATION_BAND, 'creation'),
    `fin ${proj(f9base, FINISHING_BAND, 'finishing').toFixed(0)}→${proj(f9Res.cells, FINISHING_BAND, 'finishing').toFixed(0)}, cre ${proj(f9base, CREATION_BAND, 'creation').toFixed(0)}→${proj(f9Res.cells, CREATION_BAND, 'creation').toFixed(0)}`);

  // amplify (Regista): +5% creation across all cells.
  const reg = mk({ emit: { attack: 80, defence: 0, creation: 50, finishing: 50 }, traits: ROLE_TRANSFORMS['Regista'] });
  const regRes = dispatchTraits([reg], SEED, 0);
  check('Regista amplifies creation by +5%', Math.abs(regRes.zones.creation - 50 * 1.05) < 1e-9, `50 → ${regRes.zones.creation}`);

  // amplify-inverse-power lifts a weak card more than a strong one (Strong Leader).
  const leaderTrait = [{ name: 'Leader', verb: 'amplify-inverse-power' as const, params: { amount: 0.5 }, scope: 'global' as const, target: { kind: 'criterion' as const, criterion: 'all-teammates' as const, zone: 'attack' as const } }];
  const weak = mk({ id: 1, power: 60, side: 'attack', emit: { attack: 100, defence: 0, creation: 0, finishing: 0 }, traits: leaderTrait });
  const strong = mk({ id: 2, power: 95, side: 'attack', emit: { attack: 100, defence: 0, creation: 0, finishing: 0 }, traits: [] });
  const ldRes = dispatchTraits([weak, strong], SEED, 0);
  // Leader targets all-teammates: weak (p60) gains 0.5*(1-0.60)*100=20; strong
  // (p95) gains 0.5*(1-0.95)*100=2.5; total 200+22.5=222.5. The curve lifts the weak ~8× more.
  const weakLine = ldRes.log.find((l) => l.note.includes('(#1)'));
  const strongLine = ldRes.log.find((l) => l.note.includes('(#2)'));
  check('amplify-inverse-power lifts the weak card far more than the strong', !!weakLine && !!strongLine && weakLine.value > strongLine.value * 4, `weak=${weakLine?.value} strong=${strongLine?.value}`);
  check('amplify-inverse-power curve = amount×(1−power/100)', Math.abs(ldRes.zones.attack - 222.5) < 1e-9, `attack=${ldRes.zones.attack}`);

  // archetype-criterion targeting hits only matching cards (e.g. Metodista → Controllers).
  const tempo = [{ name: 'Tempo', verb: 'amplify' as const, params: { amount: 0.10 }, scope: 'global' as const, target: { kind: 'criterion' as const, criterion: 'archetype' as const, archetype: 'Controller' as const } }];
  const ctrl = mk({ id: 1, archetype: 'Controller', cell: 'MID_C', side: 'defence', emit: { attack: 0, defence: 100, creation: 0, finishing: 0 }, traits: tempo });
  const striker = mk({ id: 2, archetype: 'Striker', cell: 'ATT_C', side: 'attack', emit: { attack: 100, defence: 0, creation: 0, finishing: 0 }, traits: [] });
  const tempoRes = dispatchTraits([ctrl, striker], SEED, 0);
  check('archetype criterion targets only matching archetype', Math.abs(tempoRes.zones.defence - 110) < 1e-9 && tempoRes.zones.attack === 100, `def=${tempoRes.zones.defence} atk=${tempoRes.zones.attack}`);

  // chance gate is deterministic and respects the probability band.
  const treq = (id: number) => mk({ id, emit: { attack: 80, defence: 0, creation: 0, finishing: 0 }, traits: ROLE_TRANSFORMS['Trequartista'] });
  const ids = Array.from({ length: 200 }, (_, i) => i + 1);
  const fired = (inc: number) => ids.filter((id) => dispatchTraits([treq(id)], SEED, inc).zones.attack > 80).length;
  const rateA = fired(0);
  const rateB = fired(0);
  check('chance gate is deterministic (identical fire-set on repeat)', rateA === rateB, `${rateA} == ${rateB}`);
  check('chance gate ~30% fire rate over 200 cards', rateA > 200 * 0.2 && rateA < 200 * 0.4, `${rateA}/200 fired`);

  // priority escape hatch: a p1 amplify sees a p0 generate's result.
  const stacked = mk({ emit: { attack: 0, defence: 0, creation: 0, finishing: 0 }, traits: [
    { name: 'gen', verb: 'generate', params: { amount: 100 }, scope: 'zone', target: { kind: 'zone', zone: 'attack' }, priority: 0 },
    { name: 'amp', verb: 'amplify', params: { amount: 1.0 }, scope: 'global', target: { kind: 'zone', zone: 'attack' }, priority: 1 },
  ] });
  const stRes = dispatchTraits([stacked], SEED, 0);
  // p0: 0+100=100; p1 amplify +100% of snapshot(100) → +100 → 200.
  check('priority lets a later sub-pass observe an earlier one', Math.abs(stRes.zones.attack - 200) < 1e-9, `attack=${stRes.zones.attack}`);
}

// ---------------------------------------------------------------------------
// 4. Real-data wiring: transform.ts derives roles → dispatcher fires (no stamping)
// ---------------------------------------------------------------------------
console.log('\n4. Real-data wiring (roles derived by transform.ts, not stamped)');
{
  const pick = (role: string) => cards.find((c) => c.tacticalRole === role);
  const roled = ['Regista', 'Volante', 'Anchor', 'Inverted Winger', 'Falso Nove'].map(pick);
  check('all five step-1 roles exist in the transformed pool', roled.every(Boolean), roled.map((c) => c?.tacticalRole).join(', '));

  // A realistic XI: the five roled cards + fillers, attackers = the wide/forward roles.
  const fillers = cards.filter((c) => !roled.includes(c)).sort((a, b) => b.power - a.power).slice(0, 6);
  const xi = [...roled.filter((c): c is NonNullable<typeof c> => !!c), ...fillers];
  const bench = cards.sort((a, b) => b.power - a.power).slice(20, 27);
  let s = initMatch(xi, bench, [], formation, 'tiki-taka', [], SEED, 1, 'Balanced', 'Sprinter');
  const atkIds = xi.filter((c) => c.tacticalRole === 'Inverted Winger' || c.tacticalRole === 'Falso Nove' || c.position === 'CF' || c.position === 'WF')
    .slice(0, 4).map((c) => c.id);
  s = commitAttackers(s, atkIds);
  const split = evaluateSplit(s, [], slots);
  const named = split.attackBreakdown.concat(split.defenceBreakdown).filter((l) => /Cut Inside|Drop Deep|Metronome|The Shield|Vacate/.test(l.label));
  check('dispatcher fires from transform-derived roles', split.opponentDenial > 0 || named.length > 0, `denial=${split.opponentDenial}, lines=[${named.map((l) => l.label).join('; ')}]`);
}

// ---------------------------------------------------------------------------
// 5. Zonal field & coupled lane contest (step 2)
// ---------------------------------------------------------------------------
console.log('\n5. Zonal field & mirror lane contest');
{
  check('cellOf buckets slot x/y into lane×band', cellOf(50, 12) === 'ATT_C' && cellOf(10, 78) === 'DEF_L' && cellOf(50, 50) === 'MID_C');

  // Your push vs the opponent's positioned (here even) cover, defender reacting.
  const evenCover: Record<Lane, number> = { L: 100, C: 100, R: 100 };
  const spread: Record<Lane, number> = { L: 100, C: 100, R: 100 };
  const overload: Record<Lane, number> = { L: 300, C: 0, R: 0 };
  const spreadThreat = attackVsCover(spread, evenCover);
  const overloadThreat = attackVsCover(overload, evenCover);
  check('spread beats pure overload vs a reactive defence (same total push)', spreadThreat > overloadThreat, `spread=${spreadThreat.toFixed(2)} overload=${overloadThreat.toFixed(2)}`);

  // Opponent's even push vs your cover: a thin defensive lane leaks more.
  const oppPush: Record<Lane, number> = { L: 100, C: 100, R: 100 };
  const thinCover: Record<Lane, number> = { L: 300, C: 0, R: 0 };
  const evenThreat = pushVsReserveCover(oppPush, evenCover);
  const thinThreat = pushVsReserveCover(oppPush, thinCover);
  check('a thin defensive lane leaks more than balanced cover (same total)', thinThreat > evenThreat, `thin=${thinThreat.toFixed(2)} even=${evenThreat.toFixed(2)}`);

  // evaluateSplit now exposes per-lane vectors.
  const xi = buildRoledXI();
  const bench = cards.sort((a, b) => b.power - a.power).slice(11, 18);
  let s = initMatch(xi, bench, [], formation, 'tiki-taka', [], SEED, 1, 'Balanced', 'Sprinter');
  s = commitAttackers(s, [...s.xi].sort((a, b) => b.power - a.power).slice(0, 4).map((c) => c.id));
  const split = evaluateSplit(s, [], slots);
  const lanes = (split.lanePush.L + split.lanePush.C + split.lanePush.R) > 0;
  check('evaluateSplit emits a per-lane push vector', lanes, `push=${JSON.stringify(Object.fromEntries(['L','C','R'].map((l) => [l, Math.round(split.lanePush[l as Lane])])))}`);
}

// ---------------------------------------------------------------------------
// 6. Tactical cards + Manager dispatch as squad records (step 3)
// ---------------------------------------------------------------------------
console.log('\n6. Tactical cards + Manager as squad records');
{
  const ctx = { xi: [] as Card[], increment: 0, opponentGoals: 0, connections: [] };
  const mk6 = (over: Partial<DispatchCard>): DispatchCard => ({
    id: 1, power: 80, archetype: 'Creator', position: 'CM', team: 'player', side: 'attack',
    isWide: false, cell: 'ATT_C', emit: { attack: 80, defence: 0, creation: 40, finishing: 40 }, traits: [], ...over,
  });

  // A defensive tactic now suppresses the opponent for real (was a 0 stub in v5).
  const lowBlock = tacticTraits(getTacticById('low_block')!, ctx);
  const lowRes = dispatchTraits([mk6({})], SEED, 0, { playerSquadTraits: lowBlock });
  check('Low Block deny raises opponentDenial', lowRes.opponentDenial > 0, `denial=${lowRes.opponentDenial}`);
  check('Low Block debuffs your own attack (−10%)', Math.abs(lowRes.zones.attack - 72) < 1e-9, `attack 80 → ${lowRes.zones.attack}`);

  // An attacking tactic lifts the field +15%.
  const highLine = tacticTraits(getTacticById('high_line')!, ctx);
  const highRes = dispatchTraits([mk6({})], SEED, 0, { playerSquadTraits: highLine });
  check('High Line lifts attack +15%', Math.abs(highRes.zones.attack - 92) < 1e-9, `attack 80 → ${highRes.zones.attack}`);

  // The Manager amplifies its target archetype (Mourinho → Destroyer +20%).
  const destroyer = mk6({ id: 2, archetype: 'Destroyer', cell: 'DEF_C', side: 'defence', emit: { attack: 0, defence: 100, creation: 0, finishing: 0 } });
  const mou = managerTraits(getJokerById('the_mourinho')!, ctx);
  const mouRes = dispatchTraits([destroyer], SEED, 0, { playerSquadTraits: mou });
  check('Manager (Mourinho) amplifies Destroyers +20%', Math.abs(mouRes.zones.defence - 120) < 1e-9, `defence 100 → ${mouRes.zones.defence}`);

  // The squad source must not be a target itself: Anchor (lowest-power shield)
  // has to pick the real defender, not the 0-power source carrying the tactics.
  const realDef = mk6({ id: 3, power: 70, archetype: 'Cover', cell: 'DEF_C', side: 'defence', emit: { attack: 0, defence: 100, creation: 0, finishing: 0 }, traits: ROLE_TRANSFORMS['Anchor'] });
  const shieldRes = dispatchTraits([realDef], SEED, 0, { playerSquadTraits: highLine });
  check('squad source is excluded from criterion targeting (Anchor shields the real card)', Math.abs(shieldRes.zones.defence - 130) < 1e-9, `defence 100 → ${shieldRes.zones.defence}`);
}

// ---------------------------------------------------------------------------
// 7. Opponent as a real positioned XI through the dispatcher (step 4)
// ---------------------------------------------------------------------------
console.log('\n7. Opponent as a real positioned XI');
{
  const r1 = generateOpponentXI(1, 'Balanced', SEED);
  const r5 = generateOpponentXI(5, 'Attacking', SEED);
  check('opponent XI has 11 positioned cards', r1.xi.length === 11 && r1.formation.slots.length === 11);
  check('opponent cards carry tactical roles (verbs fire through the dispatcher)', r1.xi.filter((c) => c.tacticalRole).length >= 9, `${r1.xi.filter((c) => c.tacticalRole).length}/11 roled`);

  const avg = (xi: Card[]) => xi.reduce((s, c) => s + c.power, 0) / xi.length;
  check('round budget scales opponent power (R5 > R1)', avg(r5.xi) > avg(r1.xi), `R1 avg=${avg(r1.xi).toFixed(0)} R5 avg=${avg(r5.xi).toFixed(0)}`);

  const r1b = generateOpponentXI(1, 'Balanced', SEED);
  check('opponent generation is deterministic', JSON.stringify(r1.xi) === JSON.stringify(r1b.xi));

  // The opponent side runs through the same field path and emits real lane vectors.
  const oppField = computeSideField(r1.xi, r1.formation, SEED + 7777, 0);
  const push = oppField.lanePush.L + oppField.lanePush.C + oppField.lanePush.R;
  const cover = oppField.laneCover.L + oppField.laneCover.C + oppField.laneCover.R;
  check('opponent computeSideField emits lane push + cover', push > 0 && cover > 0, `push=${push.toFixed(0)} cover=${cover.toFixed(0)} def=${oppField.defenceScore}`);

  // Difficulty curve: the round budget scales the opponent's raw attacking threat
  // (measured at the source, not the clamped goal chance, which saturates against a
  // top-tier test XI's defence).
  const r5b = generateOpponentXI(5, 'Attacking', SEED);
  const f1 = computeSideField(r1.xi, r1.formation, SEED + 7777, 0);
  const f5 = computeSideField(r5b.xi, r5b.formation, SEED + 7777, 0);
  check('round budget scales the opponent\'s attacking threat (R5 > R1)',
    f5.chanceCreation > f1.chanceCreation && f5.attackScore > f1.attackScore,
    `R1 atk=${f1.attackScore} cre=${f1.chanceCreation}; R5 atk=${f5.attackScore} cre=${f5.chanceCreation}`);
}

// ---------------------------------------------------------------------------
// 8. Reactive opponent — scale first, counter second (§8)
// ---------------------------------------------------------------------------
console.log('\n8. Reactive opponent — scale first, counter second');
{
  // Reactivity ordering: reactive styles read harder than play-your-own-game styles.
  check('reactive styles counter harder than scale-focused ones',
    reactivityFor('Adaptive') > reactivityFor('Attacking') && reactivityFor('Counter') > reactivityFor('Balanced'),
    `Atk=${reactivityFor('Attacking')} Bal=${reactivityFor('Balanced')} Ctr=${reactivityFor('Counter')} Adp=${reactivityFor('Adaptive')}`);

  // SECONDARY (counter): bias push toward your thinnest cover lane, conserving total.
  const oppPush: Record<Lane, number> = { L: 100, C: 100, R: 100 };
  const yourCover: Record<Lane, number> = { L: 30, C: 100, R: 100 }; // thin on the left
  const low = counterPush(oppPush, yourCover, 0.10);
  const high = counterPush(oppPush, yourCover, 0.70);
  check('counter shifts push toward your weak lane (more for a reactive side)', high.L > low.L && high.L > high.C, `low.L=${low.L.toFixed(0)} high.L=${high.L.toFixed(0)} high.C=${high.C.toFixed(0)}`);
  check('counter conserves total push', Math.abs((high.L + high.C + high.R) - 300) < 1e-9);

  // The counter actually raises threat against an exploitable shape (isolated: same
  // base push + cover, only reactivity varies).
  const lowThreat = pushVsReserveCover(low, yourCover);
  const highThreat = pushVsReserveCover(high, yourCover);
  check('a more reactive opponent generates more threat vs a thin lane', highThreat > lowThreat, `low=${lowThreat.toFixed(2)} high=${highThreat.toFixed(2)}`);

  // Defensive counter: a reactive opponent better covers your overloaded lane.
  const yourOverload: Record<Lane, number> = { L: 300, C: 0, R: 0 };
  const oppCover: Record<Lane, number> = { L: 100, C: 100, R: 100 };
  check('a more reactive opponent better covers your overload', attackVsCover(yourOverload, oppCover, 0.70) < attackVsCover(yourOverload, oppCover, 0.10));

  // PRIMARY (scale): play-to-strengths + build-up that grows across increments.
  const oxi = generateOpponentXI(3, 'Balanced', SEED).xi;
  const buildAttack = (inc: number) => opponentScaleTraits(oxi, inc)
    .filter((r) => r.name === 'Building' && r.target.kind === 'zone' && r.target.zone === 'attack')
    .reduce((s, r) => s + (r.params.amount ?? 0), 0);
  check('opponent plays to strengths (amplifies a dominant archetype)', opponentScaleTraits(oxi, 0).some((r) => r.name === 'Play to Strengths'));
  check('opponent build-up scales across increments', buildAttack(4) > buildAttack(0), `inc0=${buildAttack(0)} inc4=${buildAttack(4).toFixed(2)}`);

  // Determinism through the reactive path.
  const playerXI = buildRoledXI();
  const bench = cards.sort((a, b) => b.power - a.power).slice(11, 18);
  const oppGC = () => {
    let s = initMatch(playerXI, bench, [], formation, 'tiki-taka', [], SEED, 3, 'Counter', 'Sprinter');
    s = commitAttackers(s, [...s.xi].sort((a, b) => b.power - a.power).slice(0, 4).map((c) => c.id));
    return resolveIncrement(s, evaluateSplit(s, [], slots), SEED).opponentGoalChance;
  };
  check('reactive-opponent resolution is deterministic', oppGC() === oppGC());
}

// ---------------------------------------------------------------------------
// 9. Run-accumulated chemistry (CARDS §5)
// ---------------------------------------------------------------------------
console.log('\n9. Run-accumulated chemistry');
{
  // Strength curve: more co-appearances → more chemistry; static links give a floor.
  const s0 = chemistryStrength(0, false, false);
  const sSettled = chemistryStrength(40, false, false);
  const sNation = chemistryStrength(0, true, false);
  check('chemistry strengthens with co-appearances', sSettled > s0 && s0 === 0, `0→${s0.toFixed(2)}, 40→${sSettled.toFixed(2)}`);
  check('nationality is a static chemistry floor', sNation > 0, `nation@0=${sNation.toFixed(2)}`);

  // Accrual increments every on-pitch pair; accumulates across matches, no decay.
  const m1 = accrueMatch({}, [1, 2, 3], 5);
  check('accrueMatch increments on-pitch pairs', coApp(m1, 1, 2) === 5 && coApp(m1, 1, 3) === 5 && coApp(m1, 2, 3) === 5);
  check('co-appearances accumulate across matches (no decay)', coApp(accrueMatch(m1, [1, 2, 3], 5), 1, 2) === 10);

  // Connection bonus: connecting pairs emit into a cell, scaling with the matrix.
  const xi = buildRoledXI();
  const ids = xi.map((c) => c.id);
  let settled: Record<string, number> = {};
  for (let k = 0; k < 10; k++) settled = accrueMatch(settled, ids, 5); // 50 co-apps/pair
  const freshRecs = chemistryRecords(xi, formation, {});
  const settledRecs = chemistryRecords(xi, formation, settled);
  const sumAmt = (recs: typeof freshRecs) => recs.reduce((s, r) => s + (r.params.amount ?? 0), 0);
  check('chemistry emits connection records into cells (generate + to)', settledRecs.length > 0 && settledRecs.every((r) => r.verb === 'generate' && !!r.to), `${settledRecs.length} records`);
  check('a settled squad has stronger chemistry than a fresh one', sumAmt(settledRecs) > sumAmt(freshRecs), `fresh=${sumAmt(freshRecs).toFixed(0)} settled=${sumAmt(settledRecs).toFixed(0)}`);

  // End-to-end: chemistry lifts the field through the dispatcher, deterministically.
  const bench = cards.sort((a, b) => b.power - a.power).slice(11, 18);
  const evalWith = (chem: Record<string, number>) => {
    let s = initMatch(xi, bench, [], formation, 'tiki-taka', [], SEED, 1, 'Balanced', 'Sprinter', chem);
    s = commitAttackers(s, ids.slice(0, 4));
    return evaluateSplit(s, [], slots);
  };
  const fresh = evalWith({});
  const strong = evalWith(settled);
  check('chemistry lifts attack via the dispatcher', strong.attackScore > fresh.attackScore, `fresh=${fresh.attackScore} settled=${strong.attackScore}`);
  check('chemistry is deterministic', evalWith(settled).attackScore === strong.attackScore);
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
