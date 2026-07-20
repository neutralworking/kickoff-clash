/**
 * Kickoff Clash V6 — chance/threshold resolution (the pure core).
 *
 * This commit lands the PURE, order-independent pieces of period resolution:
 *   • threshold → natural chances (created/cancelled/remaining),
 *   • the natural soft-cap (+ the action-created overflow allowance),
 *   • chance-token construction,
 *   • rolling a token to a goal (d6, scoring faces, rerolls) — the A2 model:
 *     conversion is ALWAYS the die, there is no guaranteed-goal path.
 *
 * The full 10-step period orchestration (build board after reveals → create →
 * cancel → action effects → cap → roll → attribute → score → next priority)
 * lands in commit 3 alongside substitutions + priority, and composes these.
 */

import type { ChanceRoll, ChanceToken, Die, Sector, TeamSide } from './types';
import { V6_BALANCE, type V6Balance } from './balance';
import { rollD6, type RngState } from './random';

export interface ChanceCount {
  created: number;
  cancelled: number;
  remaining: number;
}

/**
 * Natural chances for one sector (handoff §"ATT/DEF chance resolution"):
 *   created   = floor(sectorAttack / threshold)
 *   cancelled = floor(opponentSectorDefence / threshold)
 *   remaining = max(0, created − cancelled)
 * Negative stat sums (an over-penalised card) floor at 0 before the divide.
 */
export function naturalChances(
  sectorAttack: number,
  opponentSectorDefence: number,
  balance: V6Balance = V6_BALANCE,
): ChanceCount {
  const created = Math.floor(Math.max(0, sectorAttack) / balance.threshold);
  const cancelled = Math.floor(Math.max(0, opponentSectorDefence) / balance.threshold);
  const remaining = Math.max(0, created - cancelled);
  return { created, cancelled, remaining };
}

/** Apply the natural soft-cap to a per-sector remaining count. */
export function capNaturalChances(remaining: number, balance: V6Balance = V6_BALANCE): number {
  return Math.min(remaining, balance.naturalChanceCapPerSector);
}

/**
 * The absolute ceiling on chance tokens in a sector for a period. Action-created
 * chances may push it past the natural cap by `actionChanceCapBonus` (handoff:
 * "Explicit action-created chances may exceed the natural cap by one").
 */
export function sectorCeiling(hasActionChances: boolean, balance: V6Balance = V6_BALANCE): number {
  return balance.naturalChanceCapPerSector + (hasActionChances ? balance.actionChanceCapBonus : 0);
}

let tokenSeq = 0;
/** Reset the token id counter (call at match start for stable ids). */
export function resetTokenIds(): void {
  tokenSeq = 0;
}

/** Build `count` chance tokens for a sector. Faces default to the balance's goal faces. */
export function makeTokens(
  side: TeamSide,
  sector: Sector,
  count: number,
  opts: { origin?: 'natural' | 'action'; faces?: Die[]; rerolls?: number; sourceCardId?: string } = {},
  balance: V6Balance = V6_BALANCE,
): ChanceToken[] {
  const faces = opts.faces ?? [...balance.naturalGoalFaces];
  const tokens: ChanceToken[] = [];
  for (let k = 0; k < count; k++) {
    tokens.push({
      id: `t${tokenSeq++}`,
      side,
      sector,
      origin: opts.origin ?? 'natural',
      faces: [...faces],
      rerolls: opts.rerolls ?? 0,
      sourceCardId: opts.sourceCardId,
    });
  }
  return tokens;
}

/**
 * Roll one chance to a goal (A2). Rolls a d6; scores if the face is in the
 * token's scoring set; otherwise consumes one reroll per available reroll until
 * it scores or runs out. Each roll (initial + each reroll) consumes exactly one
 * RNG value, in order — the determinism guarantee.
 */
export function rollChanceToGoal(token: ChanceToken, rng: RngState): [ChanceRoll, RngState] {
  let [die, state] = rollD6(rng);
  const rolls: Die[] = [die];
  let scored = token.faces.includes(die);
  let rerolls = token.rerolls;
  while (!scored && rerolls > 0) {
    [die, state] = rollD6(state);
    rolls.push(die);
    scored = token.faces.includes(die);
    rerolls -= 1;
  }
  const roll: ChanceRoll = {
    tokenId: token.id,
    side: token.side,
    sector: token.sector,
    rolls,
    scored,
    attackerCardId: token.attackerCardId,
  };
  return [roll, state];
}
