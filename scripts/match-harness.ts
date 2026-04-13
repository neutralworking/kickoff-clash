/**
 * Day 1 baseline harness: drive match-v5 end-to-end from Node.
 *
 * Proves the engine resolves a full 5-increment match against real character data,
 * without needing the Next.js UI. Run with:
 *
 *   npx tsx scripts/match-harness.ts
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
  getOpponentBaselines,
  resolveIncrement,
  advanceIncrement,
  getMatchResult,
} from '../src/lib/match-v5';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'public', 'data', 'kc_characters.json');
const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as KCCharacter[];

console.log(`\n=== kickoff-clash match-v5 harness ===`);
console.log(`Loaded ${raw.length} characters from kc_characters.json`);

const cards = transformAllCharacters(raw);
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

const slots = createEmptySlots();

// Simulate 5 increments. Deterministic attacker choice:
// top 4 power in XI each increment (4-3-3 maxAttackers=5, we use 4).
function pickAttackers(state: typeof state): number[] {
  return [...state.xi]
    .filter(c => !c.injured)
    .sort((a, b) => b.power - a.power)
    .slice(0, 4)
    .map(c => c.id);
}

for (let i = 0; i < 5; i++) {
  const attackerIds = pickAttackers(state);
  state = commitAttackers(state, attackerIds);

  const split = evaluateSplit(state, [], slots);
  const opp = getOpponentBaselines(1, 'Balanced', i, state);
  const result = resolveIncrement(state, split, opp.attack, opp.defence, SEED);

  console.log(`\n--- Increment ${i + 1} (${result.minute}') ---`);
  console.log(`  Committed ${attackerIds.length} attackers; XI injured=${state.xi.filter(c => c.injured).length}`);
  console.log(`  Your attack:   ${split.attackScore}  | Your defence:   ${split.defenceScore}`);
  console.log(`  Opp baselines: atk=${opp.attack} def=${opp.defence}`);
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
