/**
 * KC rebuild engine — seeded RNG.
 *
 * mulberry32, exposed as a PURE step function over a 32-bit integer state so
 * MatchState stays serialisable (replay, resume, tests). One stream per match,
 * consumed in a fixed loop order: same seed + same decisions = same event log,
 * always (KC_REBUILD_PLAN_V1 › architecture principles).
 *
 * `scripts/balance_sim.py` implements this generator bit-for-bit — keep the
 * two in lockstep or the distribution acceptance numbers drift.
 */

/** Advance the mulberry32 state once → a float in [0, 1) and the next state. */
export function rngNext(state: number): { value: number; next: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, next: a };
}

/** Seed → initial RNG state (the raw 32-bit seed). */
export function rngSeed(seed: number): number {
  return seed | 0;
}

/** Convenience closure over rngNext for non-state-machine callers (sims, tools). */
export function mulberry32(seed: number): () => number {
  let s = rngSeed(seed);
  return () => {
    const { value, next } = rngNext(s);
    s = next;
    return value;
  };
}
