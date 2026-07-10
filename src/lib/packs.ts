/**
 * Kickoff Clash — Pack contents
 *
 * The live flow is the three-pack starter rip (`ripStarterPacks`): a player pack,
 * a manager pack, and a tactical pack, each a seeded-random draw. `PackContents`
 * is the shared shape (players / tactics / formations / managers).
 */

import type { Card } from './scoring';
import { seededRandom } from './scoring';
import type { TacticCard } from './tactics';
import { ALL_TACTICS } from './tactics';
import type { Formation } from './formations';
import { ALL_FORMATIONS } from './formations';
import type { JokerCard } from './jokers';
import { ALL_JOKERS } from './jokers';
import { ALL_CARDS } from './run';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackContents {
  players: Card[];
  tactics: TacticCard[];
  formations: Formation[];
  managers: JokerCard[];
}

// ---------------------------------------------------------------------------
// Seeded shuffle helper
// ---------------------------------------------------------------------------

/**
 * Seeded Fisher-Yates shuffle. Returns a new shuffled array without
 * mutating the input. The seed is advanced by index at each step so each
 * element gets a unique sub-seed.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}


// ---------------------------------------------------------------------------
// Starter rip (current flow): three fixed packs opened at New Season.
//   - Player pack:  24 players (full pool; a 3-col gallery fills 8 clean rows, no lone card)
//   - Manager pack: 2 managers (pick 1 before the match)
//   - Tactical pack: 10 tactics (5 opening hand + 1 per turn)
// All formations are made available so the manager can pick a shape.
// ---------------------------------------------------------------------------

export const RIP_COUNTS = { players: 24, managers: 2, tactics: 5 } as const;
// The starter rip is deliberately SCRAPPY: Common-heavy with only a few Rare anchors and
// NO Epic/Legendary. A full-pool rip starts the player ~maxed (XI avg ~74, can roll a
// Legendary) so there's nothing to chase; capping at Common+Rare drops the opening XI to a
// winnable-but-thin ~70 (still clears cup 1 ~80%+) and makes the shop's Epics/Legendaries
// the real upgrade path. Tuned on scripts/starter-probe.ts.
const RIP_RARES = 6; // of 24; the remainder are Common

// ---------------------------------------------------------------------------
// Shop card packs — the SEALED acquisition (economy.ts SCOUT_PACK / ELITE_PACK).
// A pack rips PACK_SIZE cards from the pool by a per-tier rarity weighting; the
// Elite tier floors slot 0 to Rare+ so the guarantee always holds. Deterministic
// per seed. The cards come straight from ALL_CARDS (deduped ids are assigned by
// run.ts addCardToDeck when they enter the deck).
// ---------------------------------------------------------------------------

export type PackTier = 'scout' | 'elite';
export const PACK_SIZE = 3;

/** Rarity weights per tier (relative). Scout = cheap depth (Common-heavy, no
 *  Legendary); Elite = the chase (Rare-led with an Epic/Legendary tail). */
const PACK_WEIGHTS: Record<PackTier, Record<string, number>> = {
  scout: { Common: 78, Rare: 20, Epic: 2, Legendary: 0 },
  elite: { Common: 28, Rare: 50, Epic: 18, Legendary: 4 },
};

const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary'] as const;

/** Pick one rarity bucket by weight (seeded), then a random card from it. Falls
 *  back down the rarity ladder if a bucket is empty. */
function drawByWeight(weights: Record<string, number>, seed: number): Card | null {
  const total = RARITIES.reduce((s, r) => s + (weights[r] ?? 0), 0);
  if (total <= 0) return null;
  let roll = seededRandom(seed) * total;
  let chosen: string = 'Common';
  for (const r of RARITIES) {
    roll -= weights[r] ?? 0;
    if (roll <= 0) { chosen = r; break; }
  }
  // Walk down the ladder until a non-empty bucket is found.
  for (let i = RARITIES.indexOf(chosen as typeof RARITIES[number]); i >= 0; i--) {
    const pool = ALL_CARDS.filter((c) => c.rarity === RARITIES[i]);
    if (pool.length) return pool[Math.floor(seededRandom(seed + 31) * pool.length)];
  }
  return ALL_CARDS[Math.floor(seededRandom(seed + 53) * ALL_CARDS.length)] ?? null;
}

/** Rip a shop card pack — PACK_SIZE cards by the tier weighting. The Elite tier
 *  forces its first card to Rare+ so "guaranteed Rare+" always holds. */
export function ripCardPack(tier: PackTier, seed: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let weights = PACK_WEIGHTS[tier];
    if (tier === 'elite' && i === 0) weights = { Common: 0, Rare: 62, Epic: 30, Legendary: 8 };
    const card = drawByWeight(weights, seed + i * 97 + (tier === 'elite' ? 500 : 0));
    if (card) out.push(card);
  }
  return out;
}

export function ripStarterPacks(seed: number): PackContents {
  const rares = seededShuffle(ALL_CARDS.filter((c) => c.rarity === 'Rare'), seed + 11).slice(0, RIP_RARES);
  const commons = seededShuffle(ALL_CARDS.filter((c) => c.rarity === 'Common'), seed).slice(0, RIP_COUNTS.players - rares.length);
  const players = seededShuffle([...commons, ...rares], seed + 7);
  const tactics = seededShuffle(ALL_TACTICS, seed + 100).slice(0, RIP_COUNTS.tactics);
  const managers = seededShuffle(ALL_JOKERS, seed + 300).slice(0, RIP_COUNTS.managers);
  // Lead with 4-3-3, then the rest — every formation is selectable.
  const base433 = ALL_FORMATIONS.find((f) => f.id === '4-3-3');
  const rest = ALL_FORMATIONS.filter((f) => f.id !== '4-3-3');
  const formations = base433 ? [base433, ...rest] : [...ALL_FORMATIONS];
  return { players, tactics, formations, managers };
}
