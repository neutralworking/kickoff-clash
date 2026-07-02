/**
 * Day 1 baseline harness: drive match-v5 end-to-end from Node.
 *
 * Proves the engine resolves a full 5-increment match against real character data,
 * without needing the Next.js UI — now including the Called Plays loop: each spell
 * the harness reads the opponent's telegraphed play and calls the answering play
 * (a simple deterministic policy over gradeCall). Run with:
 *
 *   npx tsx scripts/match-harness.ts
 *
 * Determinism contract: two runs of this script are byte-identical.
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_cards.json');
const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCard[];

console.log(`\n=== kickoff-clash match-v5 harness ===`);
console.log(`Loaded ${raw.length} characters from kc_cards.json`);

const cards = transformCards(raw);
console.log(`Transformed to ${cards.length} Cards`);
console.log(`Power range: ${Math.min(...cards.map(c => c.power))}–${Math.max(...cards.map(c => c.power))}`);
console.log(`Archetype counts:`, cards.reduce<Record<string, number>>((acc, c) => {
  acc[c.archetype] = (acc[c.archetype] ?? 0) + 1;
  return acc;
}, {}));

// Deterministic XI selection: pick 11 cards covering positions, bench next 7.
// Simpler: sort by power desc, take top 11 as XI, next 7 as bench.
const sorted = [...cards].sort((a, b) => b.power - a.power);
const xi = sorted.slice(0, 11);
const bench = sorted.slice(11, 18);

console.log(`\nXI (top 11 by power):`);
for (const c of xi) {
  console.log(`  #${c.id.toString().padStart(3)} ${c.name.padEnd(25)} pos=${c.position.padEnd(3)} arch=${c.archetype.padEnd(12)} pwr=${c.power} rar=${c.rarity} dur=${c.durability}`);
}

const formation = getFormation('4-3-3');
console.log(`\nFormation: ${formation.id} (maxAttackers=${formation.maxAttackers})`);

const SEED = 12345;
let state = initMatch(
  xi,
  bench,
  [],               // remainingDeck (empty — no draw)
  formation,
  'tiki-taka',
  [],               // no jokers
  SEED,
  1,                // opponentRound 1 (FC Warm-Up)
  'Balanced',       // opponent style
  'Sprinter',       // weakness archetype
);

console.log(`\nInitial state: currentIncrement=${state.currentIncrement}, subs=${state.subsRemaining}, discards=${state.discardsRemaining}`);
console.log(`Personality bonus: attackMod=${state.personalityBonus.attackMod.toFixed(2)} defMod=${state.personalityBonus.defenceMod.toFixed(2)} label=${state.personalityBonus.label ?? 'none'} perfect=${state.personalityBonus.perfectDressingRoom}`);

// Simulate 5 increments. Deterministic attacker choice:
// top 4 power in XI each increment (4-3-3 maxAttackers=5, we use 4).
function pickAttackers(state: MatchV5State): number[] {
  return [...state.xi]
    .filter(c => !c.injured)
    .sort((a, b) => b.power - a.power)
    .slice(0, 4)
    .map(c => c.id);
}

// Simple deterministic call policy: answer the telegraphed play — the first
// charged play (in ALL_TACTICS order) that grades best via gradeCall.
function chooseAnsweringPlay(state: MatchV5State): TacticCard | null {
  const oppRecords = state.opponentPlay
    ? getOpponentPlayById(state.opponentPlay.id)?.records ?? []
    : [];
  const ctx: SquadContext = {
    xi: state.xi,
    increment: state.currentIncrement,
    opponentGoals: state.opponentGoals,
    yourGoals: state.yourGoals,
    connections: [],
    intent: state.intent,
    opponentPlayId: state.opponentPlay?.id,
  };
  let best: TacticCard | null = null;
  let bestScore = 0;
  for (const t of ALL_TACTICS) {
    if (chargesLeft(t, state.playChargesUsed) <= 0) continue;
    const records = tacticTraits(t, ctx);
    const grade = gradeCall(t, oppRecords, records);
    const score = grade === 'answered' ? 2 : grade === 'neutral' && records.length > 0 ? 1 : -1;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

for (let i = 0; i < 5; i++) {
  const attackerIds = pickAttackers(state);
  state = commitAttackers(state, attackerIds);

  // Called Plays: read the telegraph, call the answering play.
  const play = chooseAnsweringPlay(state);
  state = callPlay(state, play?.id ?? null);
  const calledPlay = state.calledPlayId ? play : null;

  const split = evaluateSplit(state, [], calledPlay);
  const baseline = calledPlay ? evaluateSplit(state, [], null) : null;
  const result = resolveIncrement(state, split, SEED, baseline);

  console.log(`\n--- Increment ${i + 1} (${result.minute}') ---`);
  console.log(`  Committed ${attackerIds.length} attackers; XI injured=${state.xi.filter(c => c.injured).length}`);
  console.log(`  Their play: ${result.opponentPlayName ?? 'none'} ("${state.opponentPlay?.telegraph ?? ''}")`);
  console.log(`  Your call:  ${result.calledPlayName ?? 'none'} → ${result.callGrade ?? 'n/a'}`);
  if (result.playImpact) {
    console.log(`  Play impact: yourCallXG=${result.playImpact.yourCallXG.toFixed(2)} theirPlayXG=${result.playImpact.theirPlayXG.toFixed(2)}`);
  }
  console.log(`  Your attack:   ${split.attackScore}  | Your defence:   ${split.defenceScore}`);
  console.log(`  Opp XI field:  atk=${result.opponentAttack} def=${result.opponentDefence}`);
  console.log(`  Goal chances:  you=${(result.yourGoalChance * 100).toFixed(1)}% them=${(result.opponentGoalChance * 100).toFixed(1)}%`);
  console.log(`  ${result.event.text}`);
  console.log(`  Synergies: atk=${split.attackSynergies.length} def=${split.defenceSynergies.length} cross=${split.crossSynergies.length}`);

  state = advanceIncrement(state, result);
}

const final = getMatchResult(state);
console.log(`\n=== FINAL ===`);
console.log(`Score: You ${state.yourGoals} – ${state.opponentGoals} Opponent`);
console.log(`Result: ${JSON.stringify(final, null, 2)}`);
console.log(`\nInjured at end: ${state.xi.filter(c => c.injured).length}`);
console.log(`\n=== harness OK ===`);
