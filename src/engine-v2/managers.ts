/**
 * KC six-contest engine (NW-140) — managers as DATA (no manager class).
 *
 * The load-bearing addition (CARD_SYSTEM_V2_CHANGES §7): a manager REWEIGHTS the
 * match by adding flat team-points to its favoured contest(s) — same units as
 * tilts, additive, applied before the §4 mirror subtraction. Each reweight is a
 * committed-gated EngineTrait (gates.ts `committed`): it pays a flat bonus ONLY
 * to a squad that actually commits tilts to the manager's PRIMARY contest. No
 * commitment → no reweight → a committed mono is just a stat-hole liability (the
 * no-unconditional law, applied to managers).
 *
 * A manager's reweight is a small PACKAGE — a primary contest (its identity, the
 * commitment gate) plus an optional enabling contest — so the build it rewards
 * actually converts to goals (a KEEP wall needs a CREATE outlet; a PRESS press
 * needs a BREAK counter). SM §4 supplies the roster + postures/formations; V2
 * wins on resolution. The magnitudes are the sim-pass lever (NW-140 out of
 * scope) — tuned here to the qualitative target: a matched build+manager clears
 * a balanced squad by ~2×, and the same build swings best↔worst across the roster.
 */

import type { Contest } from './contests';
import type { Posture } from './gates';
import type { EngineTrait } from './traits';
import type { EngineDef } from './streak';
import type { FormationId } from './adherence';

/**
 * Per-contest commitment threshold ≈ 0.75 × the dial ceiling: high enough that
 * only a DELIBERATELY committed build clears it (a random squad's incidental
 * GK+CB STOP, or a stray CREATE, stays below), so an uncommitted squad gets no
 * reweight (the law check).
 */
export const COMMIT_MIN: Record<Contest, number> = {
  KEEP: 9,
  CREATE: 8,
  BREAK: 8,
  PRESS: 7,
  // STOP sits at the mono ceiling: a random squad's incidental GK+CB DEF reaches
  // ~5–6 and spikes to 8, so only a full defensive commitment (~9) clears it.
  STOP: 9,
  FINISH: 6,
};

export interface Manager {
  id: string;
  name: string;
  /** Human copy — the win condition the manager rewards. */
  winCon: string;
  posture: Posture;
  formation: FormationId;
  /** The contest commitment is gated on (the manager's identity). */
  favoured: Contest;
  /** Additive reweight package (favoured is the gate; entries pay when open). */
  reweight: Partial<Record<Contest, number>>;
  /** Streak engine override (Fortress clean-batch, Tinkerman substitution). */
  engine?: EngineDef;
  /** Variance win-con: Gambler amplifies, Pragmatist dampens (consistency). */
  variance?: 'amplify' | 'dampen';
  /** Taskmaster: per-batch opponent fitness drain. */
  fitnessDrain?: number;
  /** Financier: cash banked per goal (economy hook). */
  cashOnGoal?: number;
}

const FORTRESS_ENGINE: EngineDef = {
  id: 'fortress',
  successes: [{ on: 'clean-batch' }, { on: 'any-goal' }],
  contradictions: [{ on: 'batch-conceded', reason: 'conceded — the wall cracked' }],
};

const TINKERMAN_ENGINE: EngineDef = {
  id: 'tinkerman',
  successes: [{ on: 'any-goal' }, { on: 'substitution' }], // rotation is fuel
  contradictions: [{ on: 'conceded', reason: 'conceded' }],
};

/**
 * The defensive win-con: the streak (the Balatro mult) ramps on CLEAN SHEETS, so
 * a wall banks defensive points toward the run's blind (match.ts clean-batch
 * points). A concede breaks it. Assigned to STOP/BREAK/PRESS managers so their
 * archetype scores its own way, not by chasing goals it can't produce.
 */
const DEFENSIVE_ENGINE: EngineDef = {
  id: 'defensive',
  successes: [{ on: 'clean-batch' }, { on: 'any-goal' }],
  contradictions: [{ on: 'conceded', reason: 'conceded — the wall cracked' }],
};

/** Attacking win-cons ramp on goals (the default); defensive ones on clean sheets. */
const DEFENSIVE_CONTESTS = new Set<Contest>(['STOP', 'BREAK', 'PRESS']);

/** The 11-manager roster (SM §4 + Heavy Metal, the PRESS/Gegenpress manager). */
export const MANAGERS: Manager[] = [
  {
    id: 'counter-attack',
    name: 'Counter-Attack',
    winCon: 'Win the ball and break at pace — reward BREAK, finish the break.',
    posture: 'defend',
    formation: '4-4-2',
    favoured: 'BREAK',
    reweight: { BREAK: 4, FINISH: 3 },
  },
  {
    id: 'set-piece',
    name: 'Set-Piece',
    winCon: 'Grind the wall, win it from dead balls — reward STOP + the aerial build.',
    posture: 'balanced',
    formation: '4-4-2',
    favoured: 'STOP',
    reweight: { STOP: 5 },
  },
  {
    id: 'fortress',
    name: 'Fortress',
    winCon: 'Concede nothing; bank clean batches — reward STOP.',
    posture: 'defend',
    formation: '5-3-2',
    favoured: 'STOP',
    reweight: { STOP: 5 },
    engine: FORTRESS_ENGINE,
  },
  {
    id: 'tinkerman',
    name: 'Tinkerman',
    winCon: 'Rotate and create — reward CREATE + finish, fuelled by substitutions.',
    posture: 'balanced',
    formation: '4-3-3',
    favoured: 'CREATE',
    reweight: { CREATE: 4, FINISH: 3 },
    engine: TINKERMAN_ENGINE,
  },
  {
    id: 'metronome',
    name: 'Metronome',
    winCon: 'Keep the ball, work an opening — reward KEEP + CREATE.',
    posture: 'balanced',
    formation: '4-3-3',
    favoured: 'KEEP',
    reweight: { KEEP: 5, CREATE: 3, FINISH: 2 },
  },
  {
    id: 'chaser',
    name: 'Chaser',
    winCon: 'Chase goals, take the game to them — reward FINISH.',
    posture: 'attack',
    formation: '4-2-3-1',
    favoured: 'FINISH',
    reweight: { FINISH: 5 },
  },
  {
    id: 'gambler',
    name: 'Gambler',
    winCon: 'Boom or bust — reward FINISH with amplified variance.',
    posture: 'attack',
    formation: '4-3-3',
    favoured: 'FINISH',
    reweight: { FINISH: 4 },
    variance: 'amplify',
  },
  {
    id: 'pragmatist',
    name: 'Pragmatist',
    winCon: 'Take the safe points — reward STOP with dampened variance.',
    posture: 'balanced',
    formation: '4-4-2',
    favoured: 'STOP',
    reweight: { STOP: 5 },
    variance: 'dampen',
  },
  {
    id: 'taskmaster',
    name: 'Taskmaster',
    winCon: 'Run them into the ground — reward PRESS + break, drain their legs.',
    posture: 'attack',
    formation: '4-3-3',
    favoured: 'PRESS',
    reweight: { PRESS: 4, BREAK: 3, FINISH: 1 },
    fitnessDrain: 1,
  },
  {
    id: 'financier',
    name: 'Financier',
    winCon: 'Control and cash in — reward KEEP + create, bank money on goals.',
    posture: 'balanced',
    formation: '4-3-3',
    favoured: 'KEEP',
    reweight: { KEEP: 4, CREATE: 3, FINISH: 2 },
    cashOnGoal: 2,
  },
  {
    id: 'heavy-metal',
    name: 'Heavy Metal',
    winCon: 'High line, high press, win it high and finish — reward PRESS + BREAK (Gegenpress).',
    posture: 'attack',
    formation: '4-3-3',
    favoured: 'PRESS',
    reweight: { PRESS: 4, BREAK: 4, FINISH: 1 },
  },
];

// Backfill the defensive win-con engine onto STOP/BREAK/PRESS managers that
// don't already define one (Fortress keeps its own clean-batch engine).
for (const m of MANAGERS) if (!m.engine && DEFENSIVE_CONTESTS.has(m.favoured)) m.engine = DEFENSIVE_ENGINE;

export const MANAGERS_BY_ID: Record<string, Manager> = Object.fromEntries(
  MANAGERS.map((m) => [m.id, m])
);

/** The additive reweight points a manager applies to a contest (0 if none). */
export function managerContestDial(m: Manager, contest: Contest): number {
  return m.reweight[contest] ?? 0;
}

/**
 * A manager's trait bundle: one committed-gated amplify per reweight entry, plus
 * its variance / fitness-drain traits — all gated on committing to the PRIMARY
 * contest (no payoff without commitment).
 */
export function managerTraits(m: Manager): EngineTrait[] {
  const gate = { kind: 'committed' as const, contest: m.favoured, atLeast: COMMIT_MIN[m.favoured] };
  const traits: EngineTrait[] = [];
  for (const [contest, pts] of Object.entries(m.reweight) as [Contest, number][]) {
    traits.push({
      name: `${m.name} reweight → ${contest}`,
      verb: 'amplify',
      trigger: 'continuous',
      target: { kind: 'own-dial', contest },
      magnitude: pts,
      gate,
    });
  }
  if (m.variance) {
    traits.push({
      name: `${m.name} variance`,
      verb: m.variance === 'amplify' ? 'amplify-variance' : 'dampen-variance',
      trigger: 'continuous',
      target: { kind: 'chance', op: 'xg' },
      magnitude: 1,
      gate,
    });
  }
  if (m.fitnessDrain) {
    traits.push({
      name: `${m.name} press`,
      verb: 'drain-fitness',
      trigger: 'continuous',
      target: { kind: 'fitness' },
      magnitude: m.fitnessDrain,
      gate,
    });
  }
  return traits;
}

/**
 * Run-start manager offer: a seeded choice-of-three, deterministic in the seed
 * (no Math.random — replay-safe). Distinct managers, stable order.
 */
export function managerOffer(seed: number): Manager[] {
  const pool = [...MANAGERS];
  const out: Manager[] = [];
  let s = seed | 0;
  const nextIndex = (n: number) => {
    // xorshift step — deterministic, no shared RNG state
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return Math.abs(s) % n;
  };
  for (let i = 0; i < 3 && pool.length; i++) {
    out.push(pool.splice(nextIndex(pool.length), 1)[0]);
  }
  return out;
}
