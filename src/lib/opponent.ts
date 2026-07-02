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
// Tuned on the cup-sweep (scripts/cup-sweep.ts). Re-anchored for the Called Plays
// rework: opponent plays + the SHOT_MAX dial widened the strong side's edge in
// mismatches, so the finals rise to keep the gauntlet honest. Bands (cup-sweep):
// STRONG rotate+calls ~80% champions (the pool's best 18 under ceiling play), STRONG
// rotate without calls ~38% (calls are load-bearing), MID rotate+calls ~30%. Cup 5's
// 6-tie gauntlet is the wall.
export const CUP_FINAL_POWER = [52, 57, 63, 68, 72]; // boss power per cup (1-5)
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

// ---------------------------------------------------------------------------
// Opponent policy: scale first (play to strengths + build), counter second (§8)
// ---------------------------------------------------------------------------

/** How hard a style reads-and-counters your shape. Low by default — most sides just
 *  play their own game; reactive styles / AI managers raise it. DESIGN §7 dial. */
const OPP_REACTIVITY: Record<string, number> = {
  Passive: 0.15,
  Balanced: 0.25,
  Attacking: 0.10,
  Counter: 0.50,
  Adaptive: 0.60, // was 0.70 — at 0.70 the boss's within-spell dodge nullified an
                  // aimed lane cover, flattening the call layer exactly where the
                  // magnitude contract needs it to decide matches.
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

// ---------------------------------------------------------------------------
// Opponent PLAYS (the Called Plays rework) — one telegraphed play per spell.
//
// Each play is a set of TraitRecords over the existing verb palette, authored
// exactly like squad-transforms.ts squad records: they ride the opponent's
// squad source through computeSideField (resolveIncrement joins them with
// opponentScaleTraits). `telegraph` is the PLAIN factual string shown to the
// player before the spell — the read a called play answers.
// ---------------------------------------------------------------------------

export interface OpponentPlay {
  id: string;
  name: string;
  telegraph: string;
  records: TraitRecord[];
}

/** Amplify one emission kind across the opponent's whole field. */
function oppAmp(name: string, amount: number, zone: 'attack' | 'defence' | 'creation' | 'finishing'): TraitRecord {
  return { name, verb: 'amplify', params: { amount }, scope: 'global', target: { kind: 'zone', zone } };
}

/** Suppress the player's conversion (the opponent's `deny`). */
function oppDeny(name: string, amount: number): TraitRecord {
  return { name, verb: 'deny', params: { amount }, scope: 'zone', target: { kind: 'zone', zone: 'attack' } };
}

/** Manufacture flat threat/cover in a specific cell (mirrors squad-transforms overloadLane). */
function oppGen(name: string, amount: number, zone: 'attack' | 'creation' | 'finishing' | 'defence', band: 'ATT' | 'MID' | 'DEF', lane: Lane): TraitRecord {
  return { name, verb: 'generate', params: { amount }, scope: 'global', target: { kind: 'zone', zone }, to: { band, lane } };
}

/** Flat back-line reinforcement spread across all three lanes (the parked bus —
 *  the opponent can't read your call, so its cover is never lane-aimed). */
function oppCoverSpread(name: string, total: number): TraitRecord[] {
  return LANES.map((lane) => oppGen(name, total / LANES.length, 'defence', 'DEF', lane));
}

// Play magnitudes are sized to the magnitude contract: an UNANSWERED opponent play
// should threaten ~0.2–0.4 xG for the spell (theirPlayXG on the sweep) — that is what
// makes answering it worth a charge. Attacking plays load real shot volume into a
// lane; defensive plays are a prepared denial (deny + flat cover) that punishes a
// forward commitment called into them.
export const OPPONENT_PLAYS: OpponentPlay[] = [
  {
    id: 'build_patiently',
    name: 'Build Patiently',
    telegraph: 'Keeping the ball and building slowly',
    records: [
      oppAmp('Build Patiently', 0.18, 'creation'),
      { name: 'Build Patiently', verb: 'dampen-variance', params: { amount: 0.10 }, scope: 'global', target: { kind: 'zone', zone: 'attack' } },
    ],
  },
  {
    id: 'high_press',
    name: 'High Press',
    telegraph: 'Pressing your back line high',
    records: [oppDeny('High Press', 0.18), oppAmp('High Press', 0.45, 'attack')],
  },
  {
    id: 'overload_left',
    name: 'Overload Left',
    telegraph: 'Overloading your left',
    records: [
      oppGen('Overload Left', 235, 'attack', 'ATT', 'L'),
      oppGen('Overload Left', 125, 'creation', 'MID', 'L'),
    ],
  },
  {
    id: 'overload_right',
    name: 'Overload Right',
    telegraph: 'Overloading your right',
    records: [
      oppGen('Overload Right', 235, 'attack', 'ATT', 'R'),
      oppGen('Overload Right', 125, 'creation', 'MID', 'R'),
    ],
  },
  {
    id: 'route_one',
    name: 'Route One',
    telegraph: 'Playing direct to the striker',
    records: [
      oppGen('Route One', 180, 'finishing', 'ATT', 'C'),
      oppGen('Route One', 145, 'attack', 'ATT', 'C'),
    ],
  },
  {
    id: 'drop_deep',
    name: 'Drop Deep',
    telegraph: 'Sitting deep behind the ball',
    records: [
      oppDeny('Drop Deep', 0.20),
      ...oppCoverSpread('Drop Deep', 150),
      oppAmp('Drop Deep', 0.15, 'defence'),
      oppAmp('Drop Deep', -0.08, 'attack'),
    ],
  },
  {
    id: 'kill_the_game',
    name: 'Kill the Game',
    telegraph: 'Slowing the game down',
    records: [
      oppDeny('Kill the Game', 0.15),
      ...oppCoverSpread('Kill the Game', 90),
      oppAmp('Kill the Game', -0.08, 'attack'),
      { name: 'Kill the Game', verb: 'dampen-variance', params: { amount: 0.20 }, scope: 'global', target: { kind: 'zone', zone: 'attack' } },
    ],
  },
  {
    id: 'unleash_star',
    name: 'Unleash the Star',
    telegraph: 'Playing everything through the star player',
    records: [
      { name: 'Unleash the Star', verb: 'amplify', params: { amount: 0.95 }, scope: 'global', target: { kind: 'criterion', criterion: 'highest-power' } },
      oppAmp('Unleash the Star', 0.25, 'finishing'),
    ],
  },
];

export function getOpponentPlayById(id: string): OpponentPlay | undefined {
  return OPPONENT_PLAYS.find(p => p.id === id);
}

/** Style-base weights per play id (unlisted → 0). Scoreline shifts apply on top. */
const PLAY_WEIGHTS: Record<string, Record<string, number>> = {
  Passive:   { build_patiently: 3.0, drop_deep: 2.5, kill_the_game: 1.0, route_one: 1.3, high_press: 0.8, overload_left: 0.8, overload_right: 0.8, unleash_star: 0.7 },
  Balanced:  { build_patiently: 1.5, drop_deep: 1.0, kill_the_game: 0.8, route_one: 1.2, high_press: 1.2, overload_left: 1.0, overload_right: 1.0, unleash_star: 1.0 },
  Attacking: { build_patiently: 0.5, drop_deep: 0.3, kill_the_game: 0.3, route_one: 2.2, high_press: 1.8, overload_left: 2.2, overload_right: 2.2, unleash_star: 1.5 },
  Counter:   { build_patiently: 0.6, drop_deep: 2.5, kill_the_game: 1.5, route_one: 1.5, high_press: 0.6, overload_left: 0.6, overload_right: 0.6, unleash_star: 0.8 },
  Adaptive:  { build_patiently: 0.9, drop_deep: 0.9, kill_the_game: 0.9, route_one: 1.4, high_press: 1.4, overload_left: 1.4, overload_right: 1.4, unleash_star: 1.3 },
};

const ATTACK_PLAY_IDS = new Set(['high_press', 'overload_left', 'overload_right', 'route_one', 'unleash_star']);

function playRng(seed: number, increment: number, salt: number): number {
  const mixed = (((seed * 73856093) ^ (increment * 19349663) ^ (salt * 2654435761)) >>> 0);
  return seededRandom(mixed);
}

function weightedPlayPick(weights: Map<string, number>, roll: number): OpponentPlay {
  let total = 0;
  for (const w of weights.values()) total += w;
  const t = roll * (total || 1);
  let acc = 0;
  for (const play of OPPONENT_PLAYS) {
    acc += weights.get(play.id) ?? 0;
    if (t <= acc && (weights.get(play.id) ?? 0) > 0) return play;
  }
  return OPPONENT_PLAYS[0];
}

/**
 * Pick the opponent's play for a spell. Deterministic from (style, increment,
 * scoreDiff, seed); style-weighted and scoreline-aware (`scoreDiff` = opponent
 * goals − your goals: ahead → game-killing plays, behind → attacking plays).
 *
 * `candidates` is what the player is SHOWN: [play] for every style except
 * Adaptive, which telegraphs 2 candidates (the real play + a decoy, in a
 * seeded order) — the real one plays.
 */
export function pickOpponentPlay(
  style: string,
  increment: number,
  scoreDiff: number,
  seed: number,
): { play: OpponentPlay; candidates: OpponentPlay[] } {
  const base = PLAY_WEIGHTS[style] ?? PLAY_WEIGHTS.Balanced;
  const weights = new Map<string, number>();
  for (const play of OPPONENT_PLAYS) {
    let w = base[play.id] ?? 0;
    if (scoreDiff > 0) {
      // Ahead: protect it.
      if (play.id === 'kill_the_game') w *= 2.5;
      if (play.id === 'drop_deep') w *= 1.8;
      if (ATTACK_PLAY_IDS.has(play.id)) w *= 0.5;
    } else if (scoreDiff < 0) {
      // Behind: chase it.
      if (ATTACK_PLAY_IDS.has(play.id)) w *= 1.7;
      if (play.id === 'drop_deep') w *= 0.35;
      if (play.id === 'kill_the_game') w *= 0.25;
    }
    weights.set(play.id, w);
  }

  const play = weightedPlayPick(weights, playRng(seed, increment, 71));
  if (style !== 'Adaptive') return { play, candidates: [play] };

  // Adaptive: telegraph two candidates — the real play + a weighted decoy.
  const decoyWeights = new Map(weights);
  decoyWeights.set(play.id, 0);
  const decoy = weightedPlayPick(decoyWeights, playRng(seed, increment, 73));
  const realFirst = playRng(seed, increment, 79) < 0.5;
  return { play, candidates: realFirst ? [play, decoy] : [decoy, play] };
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
