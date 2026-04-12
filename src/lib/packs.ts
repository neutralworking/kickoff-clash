/**
 * Kickoff Clash — Pack Opening System (v4-3)
 *
 * 3 pack types: Academy, Chequebook, Gaffer.
 * Each pack contains a seeded-random selection of players, tactics,
 * formations, and manager (joker) cards.
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

export interface PackType {
  id: 'academy' | 'chequebook' | 'gaffer';
  name: string;
  description: string;
  flavour: string;
  playerCount: number;
  tacticCount: number;
  formationCount: number;
  managerCount: number;
  guaranteedEpicCount: number;
}

export interface PackContents {
  players: Card[];
  tactics: TacticCard[];
  formations: Formation[];
  managers: JokerCard[];
}

// ---------------------------------------------------------------------------
// Pack definitions
// ---------------------------------------------------------------------------

export const PACK_TYPES: PackType[] = [
  {
    id: 'academy',
    name: 'The Academy',
    description: '12 players, 2 tactics, 1 formation',
    flavour: 'Give the kids a chance. Strong chemistry potential.',
    playerCount: 12,
    tacticCount: 2,
    formationCount: 1,
    managerCount: 0,
    guaranteedEpicCount: 0,
  },
  {
    id: 'chequebook',
    name: 'The Chequebook',
    description: '8 players (2 guaranteed Epic+), 3 tactics, 1 formation, 1 manager',
    flavour: 'Money talks. Star power from day one.',
    playerCount: 8,
    tacticCount: 3,
    formationCount: 1,
    managerCount: 1,
    guaranteedEpicCount: 2,
  },
  {
    id: 'gaffer',
    name: 'The Gaffer',
    description: '10 players, 4 tactics, 2 formations, 1 manager',
    flavour: 'Tactical flexibility. More tools, more options.',
    playerCount: 10,
    tacticCount: 4,
    formationCount: 2,
    managerCount: 1,
    guaranteedEpicCount: 0,
  },
];

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
// Pack opening
// ---------------------------------------------------------------------------

/**
 * Open a pack and return its contents. All randomness is seeded so the same
 * seed always produces the same pack (useful for replays / share codes).
 */
export function openPack(packType: PackType, seed: number): PackContents {
  // ---- Players ----
  let players: Card[];

  if (packType.id === 'academy') {
    // Common / Rare only — no Epic or Legendary
    const commonRarePool = ALL_CARDS.filter(
      (c) => c.rarity === 'Common' || c.rarity === 'Rare',
    );
    const shuffled = seededShuffle(commonRarePool, seed);
    players = shuffled.slice(0, packType.playerCount);
  } else if (packType.id === 'chequebook') {
    // First fill the guaranteed Epic+ slots, then top up from the full pool
    const epicPool = ALL_CARDS.filter(
      (c) => c.rarity === 'Epic' || c.rarity === 'Legendary',
    );
    const guaranteedEpics = seededShuffle(epicPool, seed + 1000).slice(
      0,
      packType.guaranteedEpicCount,
    );
    const usedIds = new Set(guaranteedEpics.map((c) => c.id));

    const remainder = seededShuffle(
      ALL_CARDS.filter((c) => !usedIds.has(c.id)),
      seed + 2000,
    ).slice(0, packType.playerCount - guaranteedEpics.length);

    players = [...guaranteedEpics, ...remainder];
  } else {
    // Gaffer — any rarity, seeded shuffle of full pool
    players = seededShuffle(ALL_CARDS, seed).slice(0, packType.playerCount);
  }

  // ---- Tactics ----
  const tactics = seededShuffle(ALL_TACTICS, seed + 100).slice(
    0,
    packType.tacticCount,
  );

  // ---- Formations ----
  let formations: Formation[];
  if (packType.formationCount >= 1) {
    // Always lead with 4-3-3
    const base433 = ALL_FORMATIONS.find((f) => f.id === '4-3-3');
    const remaining = seededShuffle(
      ALL_FORMATIONS.filter((f) => f.id !== '4-3-3'),
      seed + 200,
    ).slice(0, packType.formationCount - 1);
    formations = base433 ? [base433, ...remaining] : remaining;
  } else {
    formations = [];
  }

  // ---- Managers (Jokers) ----
  const managers = seededShuffle(ALL_JOKERS, seed + 300).slice(
    0,
    packType.managerCount,
  );

  return { players, tactics, formations, managers };
}
