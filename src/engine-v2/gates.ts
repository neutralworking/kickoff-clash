/**
 * KC six-contest engine (NW-139 Fork A) — the context taxonomy as GATES.
 *
 * SYNERGY_MODEL_V1's context taxonomy survives, but DEMOTED from resolver to
 * gate (CARD_SYSTEM_V2_CHANGES §1): a gate scales an action's magnitude, it
 * NEVER resolves a contest. The six contests (contests.ts) do all resolution;
 * gates only decide how much of a trait's magnitude is paid this increment.
 *
 * Two gate families, one closed union:
 *   • state gates   — posture · scoreline · clock · fitness (binary)
 *   • coherence gates — per-tilt · per-role-count · match-state (scaling)
 *
 * The no-unconditional law (SM law 1) is enforced at the type level: every
 * EngineTrait REQUIRES a gate (traits.ts). There is no exception list — a
 * "guaranteed" effect is expressed as a gate on ¬posture, not as an ungated
 * trait (Regista's guaranteed chance is gated ¬Attack).
 */

import type { Contest } from './contests';

// ---- state axes (closed unions; adding one is a schema change, law 3) ------

export type Posture = 'attack' | 'balanced' | 'defend';
export const POSTURES: readonly Posture[] = ['attack', 'balanced', 'defend'];

export type Scoreline = 'leading' | 'level' | 'chasing';
export type ClockBand = 'early' | 'mid' | 'late';

/** Transient per-increment match facts a gate can read (never a resolver). */
export type MatchState = 'turnover' | 'retain-survived';

// ---- the closed gate union ------------------------------------------------

export type Gate =
  // state gates — binary active/inactive on the snapshot
  | { kind: 'posture'; is: Posture }
  | { kind: 'not-posture'; is: Posture } // ¬posture (the no-unconditional escape)
  | { kind: 'scoreline'; is: Scoreline }
  | { kind: 'clock'; band: ClockBand }
  | { kind: 'fitness'; below: number }
  | { kind: 'fitness-at-least'; atLeast: number }
  // coherence gates — scale magnitude by a count (Balatro "the more you commit")
  | { kind: 'per-tilt'; contest: Contest }
  | { kind: 'per-pos-count'; anyOf: readonly string[] }
  | { kind: 'match-state'; on: MatchState }
  // commitment gate — BINARY: open iff the squad commits to a contest. This is
  // the no-unconditional law applied to MANAGERS (NW-140): an additive reweight
  // pays a FLAT bonus, but only to a squad that has actually committed tilts to
  // the manager's contest. No commitment → gate closed → no reweight.
  | { kind: 'committed'; contest: Contest; atLeast: number };

/** The regime a gate is evaluated against, per increment (own side's view). */
export interface GateSnapshot {
  posture: Posture;
  scoreline: Scoreline;
  clock: ClockBand;
  /** Squad-average fitness 0–10 (stub squads default 10). */
  fitness: number;
  /** This side's contest dials this increment (per-tilt gates read these). */
  dials: Record<Contest, number>;
  /** Count of fielded cards per position (per-pos-count gates read this). */
  posCounts: Record<string, number>;
  /** Transient facts true at the evaluation site (match-state gates). */
  states: ReadonlySet<MatchState>;
}

/**
 * The gate's scale THIS increment: 0 = closed (pays nothing), else the
 * multiplier applied to the trait's base magnitude. Binary gates return 1 when
 * open; coherence gates return the count they scale by. A closed gate is how
 * the no-unconditional law bites — a committed build opens its gates wider.
 */
export function gateScale(gate: Gate, snap: GateSnapshot): number {
  switch (gate.kind) {
    case 'posture':
      return snap.posture === gate.is ? 1 : 0;
    case 'not-posture':
      return snap.posture !== gate.is ? 1 : 0;
    case 'scoreline':
      return snap.scoreline === gate.is ? 1 : 0;
    case 'clock':
      return snap.clock === gate.band ? 1 : 0;
    case 'fitness':
      return snap.fitness < gate.below ? 1 : 0;
    case 'fitness-at-least':
      return snap.fitness >= gate.atLeast ? 1 : 0;
    case 'per-tilt':
      return Math.max(0, snap.dials[gate.contest]);
    case 'per-pos-count':
      return gate.anyOf.reduce((n, p) => n + (snap.posCounts[p] ?? 0), 0);
    case 'match-state':
      return snap.states.has(gate.on) ? 1 : 0;
    case 'committed':
      return snap.dials[gate.contest] >= gate.atLeast ? 1 : 0;
  }
}

export function scorelineFor(goalsFor: number, goalsAgainst: number): Scoreline {
  if (goalsFor > goalsAgainst) return 'leading';
  if (goalsFor < goalsAgainst) return 'chasing';
  return 'level';
}

export function clockBand(batch: number, batches: number): ClockBand {
  const frac = batch / batches;
  if (frac <= 1 / 3) return 'early';
  if (frac <= 2 / 3) return 'mid';
  return 'late';
}
