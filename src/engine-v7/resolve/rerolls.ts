// Reroll policy. The V7 contract gives a ChanceToken a `rerolls` count but no
// flag saying whether a reroll is forced or optional. We resolve that from the
// shape of the contract: a reroll only helps on a MISS (rerolling a hit could
// only turn a goal back into a miss), so the deterministic reading is
// "mandatory on a miss, never on a hit". Each reroll is a finite resource that
// decrements to zero, and a hard cap guards against pathological data, so the
// loop always terminates.

/** Safety ceiling on rerolls consumed per token, regardless of ledger data. */
export const MAX_REROLLS_PER_TOKEN = 8;

export interface RerollPolicy {
  /** When true, a token with rerolls left re-rolls every miss until it hits or runs out. */
  mandatoryOnMiss: boolean;
}

export const DEFAULT_REROLL_POLICY: RerollPolicy = { mandatoryOnMiss: true };

/** Clamp a token's declared rerolls to the safety ceiling. */
export function usableRerolls(declared: number): number {
  return Math.max(0, Math.min(declared, MAX_REROLLS_PER_TOKEN));
}

/** Should a miss be re-rolled, given the rerolls left and the policy? */
export function shouldReroll(
  scored: boolean,
  rerollsRemaining: number,
  policy: RerollPolicy = DEFAULT_REROLL_POLICY,
): boolean {
  return policy.mandatoryOnMiss && !scored && rerollsRemaining > 0;
}
