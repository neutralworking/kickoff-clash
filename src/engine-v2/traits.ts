/**
 * KC six-contest engine (NW-139 Fork A) — the TraitRecord runtime, re-pointed.
 *
 * The verb palette is UNCHANGED (imported from src/lib/verbs.ts, law 3); only
 * the verb TARGETS move: "amplify @ window" → "amplify → contest dial"
 * (CARD_ACTIONS_V1 §7, CARD_SYSTEM_V2_CHANGES §1). An action is the closed shape
 *   [trigger] → one verb → [target], gated by [gate]
 * (CARD_ACTIONS_V1 §1). The gate is REQUIRED — the no-unconditional law is a
 * type constraint here, with no exception list.
 *
 * P1 exposes the PRIMITIVES; the 45-card catalogue is authored downstream
 * (NW-140+). The runtime below turns a side's active traits into: contest-dial
 * deltas, chance injections/cancels (beat verbs), and an xG conversion shift —
 * everything gate-scaled by the per-increment snapshot.
 */

import type { VerbName } from '../lib/verbs';
import type { Contest } from './contests';
import type { Gate, GateSnapshot } from './gates';
import { gateScale } from './gates';

export type Trigger =
  | 'continuous'
  | 'per-period'
  | 'on-turnover'
  | 'on-retain'
  | 'on-goal'
  | 'on-conceded'
  | 'kickoff'
  | 'full-time';

/** Where a verb points. The dial targets are the core new primitive. */
export type TraitTarget =
  | { kind: 'own-dial'; contest: Contest } // amplify → raise own contest dial
  | { kind: 'opp-dial'; contest: Contest } // deny → lower opponent's dial
  | { kind: 'chance'; op: 'volume' | 'quality' | 'xg' } // CREATE→FINISH pipeline
  | { kind: 'retain' } // the possession retain roll
  | { kind: 'set-piece'; op: 'prob' | 'conversion' }
  | { kind: 'fitness' }
  | { kind: 'energy' }
  | { kind: 'cash' };

export interface EngineTrait {
  name: string;
  verb: VerbName;
  trigger: Trigger;
  target: TraitTarget;
  magnitude: number;
  /** REQUIRED — no unconditional traits (law 1, no exception list). */
  gate: Gate;
}

/** Per-increment dial deltas a side's traits contribute (own +, opponent −). */
export interface DialDeltas {
  own: Record<Contest, number>;
  opp: Record<Contest, number>;
}

const emptyDials = (): Record<Contest, number> => ({
  KEEP: 0,
  PRESS: 0,
  CREATE: 0,
  BREAK: 0,
  FINISH: 0,
  STOP: 0,
});

/**
 * amplify → own-dial and deny → opp-dial contributions, gate-scaled. Reads a
 * frozen snapshot and writes into a fresh delta record, so trait order can
 * never change the result (the snapshot-read + delta-pool discipline).
 */
export function dialDeltas(traits: EngineTrait[], snap: GateSnapshot): DialDeltas {
  const out: DialDeltas = { own: emptyDials(), opp: emptyDials() };
  for (const t of traits) {
    const scale = gateScale(t.gate, snap);
    if (scale <= 0) continue;
    const value = t.magnitude * scale;
    if (t.verb === 'amplify' && t.target.kind === 'own-dial') {
      out.own[t.target.contest] += value;
    } else if (t.verb === 'deny' && t.target.kind === 'opp-dial') {
      out.opp[t.target.contest] += value;
    }
  }
  return out;
}

/** generate → chance: bonus open-play chances this possession phase (beat verb). */
export function chanceGenerated(traits: EngineTrait[], snap: GateSnapshot): number {
  let n = 0;
  for (const t of traits) {
    if (t.verb !== 'generate' || t.target.kind !== 'chance' || t.target.op !== 'volume') continue;
    const scale = gateScale(t.gate, snap);
    if (scale > 0) n += t.magnitude; // scale gates existence; magnitude sets count
  }
  return n;
}

/** deny → opp chance volume: cancels of the opponent's chances (keeper/stopper). */
export function chanceDenied(traits: EngineTrait[], snap: GateSnapshot): number {
  let n = 0;
  for (const t of traits) {
    if (t.verb !== 'deny' || t.target.kind !== 'chance' || t.target.op !== 'volume') continue;
    const scale = gateScale(t.gate, snap);
    if (scale > 0) n += t.magnitude;
  }
  return n;
}

/**
 * amplify → chance xG/quality: a multiplicative shift on this side's conversion
 * (the FINISH build-arounds). Returned as a factor on xG (1 = no shift).
 */
export function xgShift(traits: EngineTrait[], snap: GateSnapshot): number {
  let factor = 1;
  for (const t of traits) {
    if (t.verb !== 'amplify' || t.target.kind !== 'chance') continue;
    if (t.target.op !== 'xg' && t.target.op !== 'quality') continue;
    const scale = gateScale(t.gate, snap);
    if (scale > 0) factor *= 1 + 0.08 * t.magnitude * scale;
  }
  return factor;
}

/**
 * Net variance verbs active this increment: +1 per amplify-variance, −1 per
 * dampen-variance (the die-ladder shift; both sides' consistency axis). Used to
 * widen/tighten the conversion spread in the match loop.
 */
export function varianceShift(traits: EngineTrait[], snap: GateSnapshot): number {
  let v = 0;
  for (const t of traits) {
    if (t.verb !== 'amplify-variance' && t.verb !== 'dampen-variance') continue;
    const scale = gateScale(t.gate, snap);
    if (scale > 0) v += t.verb === 'amplify-variance' ? 1 : -1;
  }
  return v;
}

/** drain-fitness → total fitness drained from the OPPONENT this batch (Taskmaster). */
export function fitnessDrain(traits: EngineTrait[], snap: GateSnapshot): number {
  let d = 0;
  for (const t of traits) {
    if (t.verb !== 'drain-fitness' || t.target.kind !== 'fitness') continue;
    const scale = gateScale(t.gate, snap);
    if (scale > 0) d += t.magnitude;
  }
  return d;
}
