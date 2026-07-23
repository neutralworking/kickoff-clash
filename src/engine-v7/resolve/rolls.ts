import type { ChanceToken, Sector, TeamSide } from '../../lib/match-v7/types';
import type { DeterministicRng } from '../core/rng';
import { DEFAULT_REROLL_POLICY, shouldReroll, usableRerolls, type RerollPolicy } from './rerolls';

// Chance-token rolling. Each surviving token rolls one d6; it scores when the
// roll meets or exceeds its (possibly modified) minimumGoalRoll. Misses are
// re-rolled per the reroll policy, consuming one RNG value each, immediately
// after the die they replace (V6 spec B2). Cancelled tokens never roll. Every
// roll — original, each reroll, and the accepted final — is recorded so the
// receipt is a full audit trail.

export interface TokenRoll {
  tokenId: string;
  side: TeamSide;
  sector: Sector;
  order: number;
  threshold: number;
  /** Every d6 value in order: [original, ...rerolls]. Empty when cancelled. */
  rolls: number[];
  /** The accepted roll (the last one). Zero when cancelled. */
  finalRoll: number;
  rerollsUsed: number;
  scored: boolean;
  cancelled: boolean;
}

/** Roll one token deterministically. A cancelled token consumes no RNG value. */
export function rollToken(
  token: ChanceToken,
  rng: DeterministicRng,
  policy: RerollPolicy = DEFAULT_REROLL_POLICY,
): TokenRoll {
  const base = {
    tokenId: token.id,
    side: token.side,
    sector: token.sector,
    order: token.order,
    threshold: token.minimumGoalRoll,
  };

  if (token.cancelled) {
    return { ...base, rolls: [], finalRoll: 0, rerollsUsed: 0, scored: false, cancelled: true };
  }

  let rerollsRemaining = usableRerolls(token.rerolls);
  const rolls: number[] = [];

  let roll = rng.int(1, 6);
  rolls.push(roll);
  let scored = roll >= token.minimumGoalRoll;
  let rerollsUsed = 0;

  while (shouldReroll(scored, rerollsRemaining, policy)) {
    rerollsRemaining -= 1;
    rerollsUsed += 1;
    roll = rng.int(1, 6);
    rolls.push(roll);
    scored = roll >= token.minimumGoalRoll;
  }

  return { ...base, rolls, finalRoll: roll, rerollsUsed, scored, cancelled: false };
}
