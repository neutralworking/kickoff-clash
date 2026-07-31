/**
 * Kickoff Clash — Pack contents
 *
 * The live flow is the starter rip (`ripStarterPacks`): a manager pack, two
 * player packs, and a tactical pack. `PackContents` remains the shared storage
 * shape; PackReveal decides how those contents are presented.
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

/** Seeded Fisher-Yates shuffle. Returns a new array without mutating input. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Starter rip
//   - Manager pack: 2 managers, pick 1
//   - Rare player pack: 6 Rare players
//   - Common player pack: 10 Common players, including a guaranteed GK
//   - Tactical pack: 3 tactics, pick 1
// All formations remain available when the user names the squad.
// ---------------------------------------------------------------------------

export const RIP_COUNTS = { players: 16, rarePlayers: 6, commonPlayers: 10, managers: 2, tactics: 3 } as const;

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
 * Legendary); Elite = the chase (Rare-led with an Epic/Legendary tail). */
const PACK_WEIGHTS: Record<PackTier, Record<string, number>> = {
  scout: { Common: 78, Rare: 20, Epic: 2, Legendary: 0 },
  elite: { Common: 28, Rare: 50, Epic: 18, Legendary: 4 },
};

const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary'] as const;

/** Pick one rarity bucket by weight (seeded), then a random card from it. Falls
 * back down the rarity ladder if a bucket is empty. */
function drawByWeight(weights: Record<string, number>, seed: number): Card | null {
  const total = RARITIES.reduce((sum, rarity) => sum + (weights[rarity] ?? 0), 0);
  if (total <= 0) return null;

  let roll = seededRandom(seed) * total;
  let chosen: string = 'Common';
  for (const rarity of RARITIES) {
    roll -= weights[rarity] ?? 0;
    if (roll <= 0) {
      chosen = rarity;
      break;
    }
  }

  for (let index = RARITIES.indexOf(chosen as typeof RARITIES[number]); index >= 0; index--) {
    const pool = ALL_CARDS.filter((card) => card.rarity === RARITIES[index]);
    if (pool.length) return pool[Math.floor(seededRandom(seed + 31) * pool.length)];
  }

  return ALL_CARDS[Math.floor(seededRandom(seed + 53) * ALL_CARDS.length)] ?? null;
}

/** Rip a shop card pack — PACK_SIZE cards by the tier weighting. */
export function ripCardPack(tier: PackTier, seed: number): Card[] {
  const out: Card[] = [];
  for (let index = 0; index < PACK_SIZE; index++) {
    let weights = PACK_WEIGHTS[tier];
    if (tier === 'elite' && index === 0) weights = { Common: 0, Rare: 62, Epic: 30, Legendary: 8 };
    const card = drawByWeight(weights, seed + index * 97 + (tier === 'elite' ? 500 : 0));
    if (card) out.push(card);
  }
  return out;
}

export function ripStarterPacks(seed: number): PackContents {
  // A legal starting XI must have a goalkeeper. Put a Common GK in the Common
  // pack so the six-card Rare pack remains exactly six Rare players.
  const commonGoalkeeper = seededShuffle(
    ALL_CARDS.filter((card) => card.position === 'GK' && card.rarity === 'Common'),
    seed + 21,
  ).slice(0, 1);

  const rarePlayers = seededShuffle(
    ALL_CARDS.filter((card) => card.rarity === 'Rare'),
    seed + 11,
  ).slice(0, RIP_COUNTS.rarePlayers);

  const otherCommons = seededShuffle(
    ALL_CARDS.filter((card) => card.rarity === 'Common' && !commonGoalkeeper.includes(card)),
    seed,
  ).slice(0, RIP_COUNTS.commonPlayers - commonGoalkeeper.length);

  // Keep the storage contract flat. PackReveal separates the cards by rarity.
  const players = seededShuffle([...rarePlayers, ...commonGoalkeeper, ...otherCommons], seed + 7);
  const tactics = seededShuffle(ALL_TACTICS, seed + 100).slice(0, RIP_COUNTS.tactics);
  const managers = seededShuffle(ALL_JOKERS, seed + 300).slice(0, RIP_COUNTS.managers);

  const base433 = ALL_FORMATIONS.find((formation) => formation.id === '4-3-3');
  const rest = ALL_FORMATIONS.filter((formation) => formation.id !== '4-3-3');
  const formations = base433 ? [base433, ...rest] : [...ALL_FORMATIONS];

  return { players, tactics, formations, managers };
}
