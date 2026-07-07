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

/** Round power budget → opponent base power (DESIGN §7 difficulty dial).
 *  Re-grounded for the V3.1 BRS pool (data port D.4): BRS-as-power is a flatter,
 *  lower-ceiling scale than the old decompressed band, so the budget drops to match.
 *  This is the single-match Foundation curve (balance-sweep) + the opener fallback;
 *  the real cup difficulty lives in CUP_FINAL_POWER below. */
const ROUND_POWER = [62, 68, 73, 78, 84];

// --- Within-cup ramp (Phase 3B.3) ---------------------------------------------------
// Each cup escalates from soft openers to a boss FINAL. Most of the 20 sudden-death
// matches are openers (high survival); difficulty is concentrated in the five finals,
// and the final being a step up is what makes "rest your stars for the final" correct.
// Tuned on the cup-sweep (scripts/cup-sweep.ts). Re-anchored for the FUNNEL model
// (docs/FUNNEL_MODEL_V1.md): a lane-coherent squad plays well above its raw average
// power, so the finals rise to keep the gauntlet honest against a competently built
// XI (power-probe places the curve; cup-sweep validates the run rates).
export const CUP_FINAL_POWER = [60, 68, 76, 84, 90]; // boss power per cup (1-5)
export const OPENER_DROP = 18;                       // openers this far below the final

/** The opponent base power for a specific tie: ramps openerPower → final across the cup. */
export function cupMatchPower(cup: number, matchInCup: number, size: number): number {
  const c = Math.min(Math.max(cup - 1, 0), CUP_FINAL_POWER.length - 1);
  const finalP = CUP_FINAL_POWER[c];
  if (size <= 1) return finalP;
  const t = (matchInCup - 1) / (size - 1); // 0 at the opener → 1 at the final
  return finalP - OPENER_DROP * (1 - t);
}

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
  basePowerOverride?: number,
): { xi: Card[]; formation: Formation } {
  const formation = getFormation(STYLE_FORMATION[style] ?? '4-3-3');
  // basePowerOverride is the within-cup ramp (cupMatchPower); without it, fall back to the
  // per-cup base (ROUND_POWER) — used by the harnesses and the cup opener default.
  const basePower = basePowerOverride ?? ROUND_POWER[Math.min(Math.max(round - 1, 0), ROUND_POWER.length - 1)];

  const usedSurnames = new Set<string>();
  const xi: Card[] = formation.slots.map((slot, i) => {
    const profiles = SLOT_PROFILES[slot.type] ?? SLOT_PROFILES.CM;
    const profile = pick(profiles, seededRandom(seed * 31 + i * 97 + round * 13));
    // ±6 seeded jitter around the round's base power.
    const jitter = Math.round((seededRandom(seed * 17 + i * 53 + round * 7) - 0.5) * 12);
    const power = Math.max(50, Math.min(99, Math.round(basePower) + jitter));
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

// The old opponent POLICY layer (reactivity/counterPush/opponentScaleTraits) is
// gone with SCORING_V2: the opponent's difficulty is its power budget plus the
// flat cohesion points (match-v5 OPP_COHESION_PTS) — one currency, no multipliers.
