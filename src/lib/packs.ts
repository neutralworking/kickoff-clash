/**
 * Kickoff Clash — Pack contents
 *
 * The live flow begins with two seeded choice-of-three offers: one manager pack,
 * then one player pack. `PackContents` remains the handoff into team selection.
 */

import type { Card } from './scoring';
import { seededRandom } from './scoring';
import type { TacticCard } from './tactics';
import { ALL_TACTICS } from './tactics';
import type { Formation } from './formations';
import { ALL_FORMATIONS } from './formations';
import type { JokerCard } from './jokers';
import { ALL_JOKERS } from './jokers';
import { V8_RUN_PLAYER_POOL } from '../game-v8/roster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackContents {
  players: Card[];
  tactics: TacticCard[];
  formations: Formation[];
  managers: JokerCard[];
}

export interface StarterPackChoices {
  managers: JokerCard[];
  playerPacks: Card[][];
  formations: Formation[];
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
// Starter rip.
//   - Player pack: 18 real V8 roster cards — 11 for the match plus seven
//     alternatives used only to change the XI before kick-off
//   - Manager offer: 3 sealed packs, each containing one distinct manager
//   - Player offer: 3 sealed packs, each containing a complete legal squad
// Tactics are absent from the V1 opening. All formations remain in the legacy
// PackContents handoff while manager-owned formation pools are migrated.
// ---------------------------------------------------------------------------

export const RIP_COUNTS = { players: 18, managers: 3, tactics: 3 } as const;
export const STARTER_CHOICE_COUNT = 3;

/** Compatibility name retained for opening-pack callers and tests. */
export const V8_STARTER_PLAYER_POOL = V8_RUN_PLAYER_POOL;

// ---------------------------------------------------------------------------
// Shop card packs — the SEALED acquisition (economy.ts SCOUT_PACK / ELITE_PACK).
// A pack rips PACK_SIZE cards from the pool by a per-tier rarity weighting; the
// Elite tier floors slot 0 to Rare+ so the guarantee always holds. Deterministic
// per seed. The cards come from the same implemented V8 roster as the opening
// pack (deduped owned ids are assigned by run.ts when they enter the deck).
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
    const pool = V8_RUN_PLAYER_POOL.filter((c) => c.rarity === RARITIES[i]);
    if (pool.length) return pool[Math.floor(seededRandom(seed + 31) * pool.length)];
  }
  return V8_RUN_PLAYER_POOL[Math.floor(seededRandom(seed + 53) * V8_RUN_PLAYER_POOL.length)] ?? null;
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

function ripStarterPlayers(seed: number): Card[] {
  const picked: Card[] = [];
  const used = new Set<number>();
  const take = (positions: readonly string[], count: number, salt: number) => {
    const candidates = seededShuffle(
      V8_STARTER_PLAYER_POOL.filter((card) => positions.includes(card.position) && !used.has(card.id)),
      seed + salt,
    );
    for (const card of candidates.slice(0, count)) {
      picked.push(card);
      used.add(card.id);
    }
  };

  // Two full 3×3 reveal pages with enough positional spread to build a legal XI.
  take(['GK'], 2, 11);
  take(['CD', 'WD'], 5, 23);
  take(['DM', 'CM', 'WM', 'AM'], 6, 37);
  take(['WF', 'CF'], 5, 53);

  if (picked.length < RIP_COUNTS.players) {
    for (const card of seededShuffle([...V8_STARTER_PLAYER_POOL], seed + 71)) {
      if (used.has(card.id)) continue;
      picked.push(card);
      used.add(card.id);
      if (picked.length === RIP_COUNTS.players) break;
    }
  }

  return seededShuffle(picked, seed + 97);
}

function starterFormations(): Formation[] {
  // Lead with 4-3-3, then the rest — every formation is selectable.
  const base433 = ALL_FORMATIONS.find((f) => f.id === '4-3-3');
  const rest = ALL_FORMATIONS.filter((f) => f.id !== '4-3-3');
  return base433 ? [base433, ...rest] : [...ALL_FORMATIONS];
}

/** Deterministic blind offers for the V1 opening. The three player packs are
 * generated independently; only the chosen squad crosses into team selection. */
export function ripStarterPackChoices(seed: number): StarterPackChoices {
  return {
    managers: seededShuffle(ALL_JOKERS, seed + 300).slice(0, STARTER_CHOICE_COUNT),
    playerPacks: Array.from({ length: STARTER_CHOICE_COUNT }, (_, index) =>
      ripStarterPlayers(seed + index * 4099),
    ),
    formations: starterFormations(),
  };
}

/** Compatibility helper for engine fixtures and older callers that need one
 * already-combined starter rip rather than the live choice flow. */
export function ripStarterPacks(seed: number): PackContents {
  const players = ripStarterPlayers(seed);
  const tactics = seededShuffle(ALL_TACTICS, seed + 100).slice(0, RIP_COUNTS.tactics);
  const managers = seededShuffle(ALL_JOKERS, seed + 300).slice(0, RIP_COUNTS.managers);
  const formations = starterFormations();
  return { players, tactics, formations, managers };
}
