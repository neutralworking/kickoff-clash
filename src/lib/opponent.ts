/**
 * Kickoff Clash — Opponent XI generator (engine v1, step 4)
 *
 * MATCH_ENGINE_V1 §8 / DESIGN §8.4: the opponent is a real, positioned XI — not a
 * scalar baseline. `OPPONENT_BASELINES` becomes a *power budget*; this module spends
 * it on 11 synthesised `Card`s placed in a formation. Because they are ordinary
 * Cards with `tacticalRole`s, they flow through the *same* dispatcher and emit the
 * same verbs as your side — so the counter-web is emergent (ARCHETYPES §1: counters
 * come from identities touching the field with different verbs, never a hardcoded
 * triangle), not authored here.
 *
 * Deterministic from (round, style, seed). Style picks the shape; the round budget
 * sets the power; each slot draws a seeded archetype/role profile so the side has a
 * real composition for your reads to exploit. Difficulty dials live in ROUND_POWER
 * (DESIGN §7).
 */

import type { Card, Durability } from './scoring';
import { seededRandom } from './scoring';
import type { Formation } from './formations';
import { getFormation } from './formations';

interface SlotProfile {
  position: string;   // a valid Card position for the slot
  archetype: string;
  role?: string;      // tacticalRole → role traits fire through the dispatcher
}

/** Per formation-slot-type archetype/role options (seeded pick gives composition variety). */
const SLOT_PROFILES: Record<string, SlotProfile[]> = {
  GK: [{ position: 'GK', archetype: 'GK', role: 'Torwart' }],
  CB: [
    { position: 'CD', archetype: 'Cover', role: 'Zagueiro' },
    { position: 'CD', archetype: 'Destroyer', role: 'Stopper' },
  ],
  FB: [
    { position: 'WD', archetype: 'Engine', role: 'Lateral' },
    { position: 'WD', archetype: 'Cover', role: 'Zagueiro' },
  ],
  DM: [
    { position: 'DM', archetype: 'Destroyer', role: 'Volante' },
    { position: 'DM', archetype: 'Controller', role: 'Anchor' },
  ],
  CM: [
    { position: 'CM', archetype: 'Controller', role: 'Regista' },
    { position: 'CM', archetype: 'Passer', role: 'Metodista' },
    { position: 'CM', archetype: 'Engine', role: 'Tuttocampista' },
  ],
  WM: [
    { position: 'WM', archetype: 'Engine', role: 'Tornante' },
    { position: 'WM', archetype: 'Sprinter', role: 'Extremo' },
  ],
  AM: [
    { position: 'AM', archetype: 'Creator', role: 'Trequartista' },
    { position: 'AM', archetype: 'Passer', role: 'Enganche' },
  ],
  WF: [
    { position: 'WF', archetype: 'Dribbler', role: 'Winger' },
    { position: 'WF', archetype: 'Dribbler', role: 'Inverted Winger' },
    { position: 'WF', archetype: 'Sprinter', role: 'Extremo' },
  ],
  CF: [
    { position: 'CF', archetype: 'Striker', role: 'Poacher' },
    { position: 'CF', archetype: 'Target', role: 'Prima Punta' },
  ],
};

/** Shape per proto-style (opponentStyle is the deterministic-policy proto, §8). */
const STYLE_FORMATION: Record<string, string> = {
  Passive: '4-4-2',
  Balanced: '4-3-3',
  Attacking: '4-3-3',
  Counter: '4-4-2',
  Adaptive: '3-5-2',
};

/** Round power budget → opponent base power (DESIGN §7 difficulty dial). */
const ROUND_POWER = [76, 81, 86, 91, 96];

function pick<T>(arr: T[], roll: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(roll * arr.length))];
}

/**
 * Build the opponent's XI for a round. Deterministic given (round, style, seed).
 */
export function generateOpponentXI(
  round: number,
  style: string,
  seed: number,
): { xi: Card[]; formation: Formation } {
  const formation = getFormation(STYLE_FORMATION[style] ?? '4-3-3');
  const basePower = ROUND_POWER[Math.min(Math.max(round - 1, 0), ROUND_POWER.length - 1)];

  const xi: Card[] = formation.slots.map((slot, i) => {
    const profiles = SLOT_PROFILES[slot.type] ?? SLOT_PROFILES.CM;
    const profile = pick(profiles, seededRandom(seed * 31 + i * 97 + round * 13));
    // ±6 seeded jitter around the round's base power.
    const jitter = Math.round((seededRandom(seed * 17 + i * 53 + round * 7) - 0.5) * 12);
    const power = Math.max(60, Math.min(99, basePower + jitter));
    const card: Card = {
      id: 9000 + i,
      name: `${formation.id} ${slot.label}`,
      position: profile.position,
      archetype: profile.archetype,
      tacticalRole: profile.role,
      power,
      rarity: 'Rare',
      gatePull: 0,
      durability: 'standard' as Durability,
    };
    return card;
  });

  return { xi, formation };
}
