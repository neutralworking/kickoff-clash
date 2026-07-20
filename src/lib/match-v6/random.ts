/**
 * Kickoff Clash V6 — seeded RNG (functional, explicit cursor).
 *
 * The handoff (§`random.ts`) wants a deterministic RNG with an explicit
 * `[value, RngState]` return so a match is snapshot/resume-able AND tests can
 * inject a predetermined roll sequence. So `RngState` is a discriminated union:
 *   • `seed`   — mulberry32 as a pure step over a 32-bit int (the same proven
 *                core as `src/engine-v2/rng.ts`, here in functional form).
 *   • `script` — a fixed list of floats a test feeds in; nextFloat pops the
 *                next one (wrapping), so exact rolls and exact cursor advances
 *                are assertable.
 *
 * NEVER call `Math.random()`. All samplers thread the state — do not reorder
 * sampler calls within a resolution or the log drifts.
 */

import type { Die } from './types';

export type RngState =
  | { readonly kind: 'seed'; readonly s: number }
  | { readonly kind: 'script'; readonly values: readonly number[]; readonly i: number };

/** Seed → initial state. */
export function makeRng(seed: number): RngState {
  return { kind: 'seed', s: seed | 0 };
}

/**
 * A scripted RNG returning `values` in order (wrapping when exhausted). To force
 * a d6 face `f`, feed `(f - 1) / 6` (e.g. `5/6 ≈ 0.834` → a 6; `0` → a 1).
 */
export function scriptRng(values: readonly number[]): RngState {
  return { kind: 'script', values, i: 0 };
}

/** How many draws a state has consumed (scripted states only; -1 otherwise). */
export function cursor(rng: RngState): number {
  return rng.kind === 'script' ? rng.i : -1;
}

/** Uniform float in [0, 1) + the next state. */
export function nextFloat(rng: RngState): [number, RngState] {
  if (rng.kind === 'script') {
    if (rng.values.length === 0) return [0, rng];
    const v = rng.values[rng.i % rng.values.length];
    return [v, { kind: 'script', values: rng.values, i: rng.i + 1 }];
  }
  const a = (rng.s + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { kind: 'seed', s: a }];
}

/** Integer in [0, n) + next state. */
export function nextInt(rng: RngState, n: number): [number, RngState] {
  if (n <= 1) return [0, rng];
  const [f, next] = nextFloat(rng);
  return [Math.floor(f * n) % n, next];
}

/** One d6 (1..6) + next state. */
export function rollD6(rng: RngState): [Die, RngState] {
  const [f, next] = nextFloat(rng);
  return [((Math.floor(f * 6) % 6) + 1) as Die, next];
}

/**
 * Deterministic weighted pick + next state. Negative weights are treated as 0.
 * With all-zero weights it falls back to a uniform index. Consumes exactly one
 * float.
 */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: RngState): [T, RngState] {
  if (items.length === 0) throw new Error('weightedPick: empty items');
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) {
    const [i, next] = nextInt(rng, items.length);
    return [items[i], next];
  }
  const [f, next] = nextFloat(rng);
  let x = f * total;
  for (let k = 0; k < items.length; k++) {
    x -= Math.max(0, weights[k]);
    if (x < 0) return [items[k], next];
  }
  return [items[items.length - 1], next];
}
