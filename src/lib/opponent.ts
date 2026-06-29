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
import type { Lane } from './field';
import { LANES } from './field';
import type { TraitRecord } from './verbs';

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
const ROUND_POWER = [72, 77, 82, 86, 90];

/** Fictional surname pool for opponent XI display names. Names only — never feeds
 *  match math. Seeded pick (NEW salt) + per-XI dedup so each opponent reads as a real
 *  named side. ~50 invented surnames, no real footballers. */
const SURNAMES = [
  'Voss', 'Renard', 'Haldor', 'Kessler', 'Brandt', 'Marek', 'Sorin', 'Calder',
  'Drobny', 'Ferreira', 'Lindqvist', 'Okoro', 'Vasquez', 'Petrov', 'Norebo',
  'Achterberg', 'Salvi', 'Konno', 'Dembele', 'Ravel', 'Tessier', 'Olund',
  'Berisha', 'Maganga', 'Ivankov', 'Quintero', 'Faxe', 'Holloway', 'Strand',
  'Reuben', 'Costa', 'Adeyemi', 'Vornov', 'Larsson', 'Belmonte', 'Hage',
  'Cisse', 'Truong', 'Maldini', 'Roux', 'Skoglund', 'Vargic', 'Nieto',
  'Halversen', 'Okafor', 'Pasic', 'Lindholm', 'Esquivel', 'Brunner', 'Talbot',
];

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

  const usedSurnames = new Set<string>();
  const xi: Card[] = formation.slots.map((slot, i) => {
    const profiles = SLOT_PROFILES[slot.type] ?? SLOT_PROFILES.CM;
    const profile = pick(profiles, seededRandom(seed * 31 + i * 97 + round * 13));
    // ±6 seeded jitter around the round's base power.
    const jitter = Math.round((seededRandom(seed * 17 + i * 53 + round * 7) - 0.5) * 12);
    const power = Math.max(60, Math.min(99, basePower + jitter));
    // Display surname: NEW salt distinct from the power/profile rolls, deduped within
    // this XI (advance to the next candidate on collision). Name only — no math impact.
    let nameIdx = Math.floor(seededRandom(seed * 911 + i * 2399 + round * 53) * SURNAMES.length);
    for (let n = 0; n < SURNAMES.length && usedSurnames.has(SURNAMES[nameIdx]); n++) {
      nameIdx = (nameIdx + 1) % SURNAMES.length;
    }
    const surname = SURNAMES[nameIdx];
    usedSurnames.add(surname);
    const card: Card = {
      id: 9000 + i,
      name: surname,
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

// ---------------------------------------------------------------------------
// Opponent policy: scale first (play to strengths + build), counter second (§8)
// ---------------------------------------------------------------------------

/** How hard a style reads-and-counters your shape. Low by default — most sides just
 *  play their own game; reactive styles / AI managers raise it. DESIGN §7 dial. */
const OPP_REACTIVITY: Record<string, number> = {
  Passive: 0.15,
  Balanced: 0.25,
  Attacking: 0.10,
  Counter: 0.55,
  Adaptive: 0.70,
};

export function reactivityFor(style: string): number {
  return OPP_REACTIVITY[style] ?? 0.25;
}

/**
 * PRIMARY behaviour — scale the opponent's own points. It leans into its composition's
 * dominant archetype (play to strengths) and builds its attacking output across the
 * increments. Expressed as squad records so it runs through the same dispatcher.
 */
export function opponentScaleTraits(xi: Card[], increment: number): TraitRecord[] {
  const recs: TraitRecord[] = [];

  // Play to strengths: amplify the most common archetype (deterministic tiebreak).
  const counts = new Map<string, number>();
  for (const c of xi) counts.set(c.archetype, (counts.get(c.archetype) ?? 0) + 1);
  let dominant = '';
  let best = 0;
  for (const [arch, n] of counts) {
    if (n > best || (n === best && (dominant === '' || arch < dominant))) {
      best = n;
      dominant = arch;
    }
  }
  if (dominant) {
    recs.push({
      name: 'Play to Strengths', verb: 'amplify', params: { amount: 0.15 }, scope: 'global',
      target: { kind: 'criterion', criterion: 'archetype', archetype: dominant },
    });
  }

  // Build-up: its points grow as it settles into the game.
  if (increment > 0) {
    const amount = 0.05 * increment;
    recs.push({ name: 'Building', verb: 'amplify', params: { amount }, scope: 'global', target: { kind: 'zone', zone: 'attack' } });
    recs.push({ name: 'Building', verb: 'amplify', params: { amount }, scope: 'global', target: { kind: 'zone', zone: 'creation' } });
  }

  return recs;
}

/**
 * SECONDARY behaviour — counter only if it can. Bias a `reactivity`-weighted share of
 * the opponent's push toward your thinnest cover lane: opportunistic, and only as
 * strong as this opponent's reactivity (a scale-focused side barely moves). Reads your
 * committed cover; deterministic.
 */
export function counterPush(
  oppPush: Record<Lane, number>,
  yourCover: Record<Lane, number>,
  reactivity: number,
): Record<Lane, number> {
  const out: Record<Lane, number> = { L: oppPush.L, C: oppPush.C, R: oppPush.R };
  const total = oppPush.L + oppPush.C + oppPush.R;
  if (total <= 0 || reactivity <= 0) return out;
  // Your thinnest cover lane = where they can hurt you (deterministic tiebreak L<C<R).
  let weak: Lane = 'L';
  for (const lane of LANES) if (yourCover[lane] < yourCover[weak]) weak = lane;
  const shift = total * reactivity * 0.5; // up to half the push for a max-reactive side
  for (const lane of LANES) out[lane] -= shift * (oppPush[lane] / total);
  out[weak] += shift;
  return out;
}
