import type { Sector, TeamSide } from '../../lib/match-v7/types';
import type { DeterministicRng } from '../core/rng';
import type { EffectivePlayer } from './stats';

// Goal attribution. A scored goal is credited to an eligible player on the
// scoring side, chosen on a SEPARATE deterministic RNG substream (V6 spec B2 —
// attribution never draws from the roll stream, so who is credited cannot change
// whether the goal happened). Eligibility follows the current contracts: the
// player must be active on the scoring side and able to attack (attack > 0);
// emergency goalkeepers are excluded. Selection prefers the token's sector, then
// falls back to any eligible attacker, weighting by effective attack. When no
// eligible scorer exists it fizzles safely — the goal is left unattributed
// rather than forcing an invalid card or mutating anything.

export interface AttributionResult {
  scorerId?: string;
  eligibleIds: string[];
  fizzled: boolean;
}

// The caller passes only the scoring side's players, so eligibility is purely
// per-player: active, able to attack, and not an emergency goalkeeper.
function eligible(players: readonly EffectivePlayer[]): EffectivePlayer[] {
  return players.filter(
    (player) => player.zone === 'active' && !player.emergencyGoalkeeper && player.attack > 0,
  );
}

/** Deterministically pick a weighted scorer by effective attack. */
function weightedPick(pool: readonly EffectivePlayer[], rng: DeterministicRng): EffectivePlayer {
  const ordered = [...pool].sort((a, b) => a.cardId.localeCompare(b.cardId));
  const total = ordered.reduce((sum, player) => sum + player.attack, 0);
  let cursor = rng.next() * total;
  for (const player of ordered) {
    cursor -= player.attack;
    if (cursor < 0) return player;
  }
  return ordered[ordered.length - 1]!;
}

/**
 * Attribute one goal for the scoring side in a sector. `scoringActive` is the
 * scoring side's effective active players.
 */
export function attributeGoal(
  scoringSide: TeamSide,
  sector: Sector,
  scoringActive: readonly EffectivePlayer[],
  rng: DeterministicRng,
): AttributionResult {
  const pool = eligible(scoringActive);
  if (pool.length === 0) return { fizzled: true, eligibleIds: [] };

  const inSector = pool.filter((player) => player.sector === sector);
  const candidates = inSector.length > 0 ? inSector : pool;
  const scorer = weightedPick(candidates, rng);

  return { scorerId: scorer.cardId, eligibleIds: candidates.map((player) => player.cardId).sort(), fizzled: false };
}
