/**
 * KC six-contest engine (NW-139 Fork A) — seeded RNG.
 *
 * mulberry32 as a pure step over a 32-bit integer state, wrapped in a small
 * stateful stream so a match consumes ONE seed in a fixed order: same seed +
 * same squads = same event log, always (the P1 determinism guarantee, inherited
 * from NW-138). The state is a single serialisable integer (replay/resume).
 *
 * numpy's `default_rng` (PCG64) in `scripts/kc_sim.py` cannot be byte-matched
 * here, so the vitest harness asserts on the *distribution shape* (round-robin
 * spread, tilt ceilings, no-runaway) rather than a bit-identical replay of the
 * Python — see `docs/CARD_SYSTEM_V2_CHANGES.md` §7.
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

/**
 * A stateful stream over mulberry32. `state` is a plain 32-bit int, so the
 * whole match is serialisable by snapshotting it. All samplers consume the
 * stream in call order — do not reorder sampler calls or the log drifts.
 */
export class RngStream {
  state: number;
  constructor(seed: number) {
    this.state = rngSeed(seed);
  }
  /** Uniform in [0, 1). */
  float(): number {
    const { value, next } = rngNext(this.state);
    this.state = next;
    return value;
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n) % n;
  }
  /** Bernoulli(p): true with probability p. */
  bernoulli(p: number): boolean {
    return this.float() < p;
  }
  /**
   * Gaussian(mu, sd) via Box–Muller. One sample per call (the paired normal is
   * discarded to keep the consumed-count fixed at two floats per draw — no
   * hidden cached state that a resume would have to serialise).
   */
  gauss(mu: number, sd: number): number {
    let u1 = this.float();
    const u2 = this.float();
    if (u1 < 1e-12) u1 = 1e-12; // guard log(0)
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    return mu + sd * (mag * Math.cos(2 * Math.PI * u2));
  }
  /** Poisson(lambda) via Knuth (lambda is small here — chances per possession). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.float();
    } while (p > L);
    return k - 1;
  }
}
