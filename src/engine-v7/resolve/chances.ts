import type { ChanceToken, PeriodNumber, Sector, TeamSide } from '../../lib/match-v7/types';
import {
  allocateCalculatedChances,
  calculatedChanceCount,
  type SectorChanceAllocation,
  type SectorPressureInput,
} from '../core/chances';
import type { DeterministicRng } from '../core/rng';
import type { EffectivePlayer } from './stats';

// Chance CREATION for the upcoming period (not rolling — the dice come in the
// next slice). From the post-break board: a global chance count of one chance
// for every complete five points of positive (teamATT − enemyDEF), allocated to
// sectors by remaining pressure, then capped at the natural per-sector maximum
// (B1). Partial five-point bands do not create a chance. Each token defaults to
// the d6-only goal threshold (only a 6 scores); action effects such as
// set_goal_threshold / add_reroll adjust tokens later.

export const DEFAULT_GOAL_ROLL: ChanceToken['minimumGoalRoll'] = 6;
export const NATURAL_SECTOR_CAP = 4;

const SECTORS: readonly Sector[] = ['left', 'centre', 'right'];

export interface ChanceCreation {
  tokens: ChanceToken[];
  count: number;
  allocation: SectorChanceAllocation[];
}

function sum(players: readonly EffectivePlayer[], key: 'attack' | 'defence'): number {
  return players.reduce((total, player) => total + player[key], 0);
}

function sectorInputs(
  ownActive: readonly EffectivePlayer[],
  enemyActive: readonly EffectivePlayer[],
): SectorPressureInput[] {
  return SECTORS.map((sector) => {
    const inSector = ownActive.filter((player) => player.sector === sector);
    return {
      sector,
      attack: sum(inSector, 'attack'),
      defenceAgainst: sum(enemyActive.filter((player) => player.sector === sector), 'defence'),
      attackingPlayers: inSector.length,
    };
  });
}

/** Create one side's chances for the upcoming period from the post-break board. */
export function createChances(
  side: TeamSide,
  period: PeriodNumber,
  ownActive: readonly EffectivePlayer[],
  enemyActive: readonly EffectivePlayer[],
  rng: DeterministicRng,
): ChanceCreation {
  const count = calculatedChanceCount(sum(ownActive, 'attack'), sum(enemyActive, 'defence'));
  const allocation = allocateCalculatedChances(count, sectorInputs(ownActive, enemyActive), rng).map((entry) => ({
    ...entry,
    chances: Math.min(entry.chances, NATURAL_SECTOR_CAP),
  }));

  const tokens: ChanceToken[] = [];
  let order = 0;
  for (const sector of SECTORS) {
    const sectorChances = allocation.find((entry) => entry.sector === sector)?.chances ?? 0;
    for (let index = 0; index < sectorChances; index += 1) {
      tokens.push({
        id: `chance:${side}:${period}:${sector}:${index}`,
        side,
        sector,
        origin: 'calculated',
        order: order++,
        minimumGoalRoll: DEFAULT_GOAL_ROLL,
        rerolls: 0,
        cancelled: false,
      });
    }
  }

  return { tokens, count, allocation };
}
