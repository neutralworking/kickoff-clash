import type { Sector } from '../../lib/match-v7/types';
import type { DeterministicRng } from './rng';

export interface SectorPressureInput {
  sector: Sector;
  attack: number;
  defenceAgainst: number;
  attackingPlayers: number;
}

export interface SectorChanceAllocation {
  sector: Sector;
  pressure: number;
  chances: number;
}

/**
 * One chance is created for every complete five points by which ATT exceeds the
 * opposing DEF. Partial bands do not create a chance: +4 = 0, +5 = 1,
 * +9 = 1, +10 = 2, +13 = 2.
 */
export function calculatedChanceCount(totalAttack: number, opponentDefence: number): number {
  const difference = totalAttack - opponentDefence;
  return difference <= 0 ? 0 : Math.floor(difference / 5);
}

export function allocateCalculatedChances(
  chanceCount: number,
  sectors: readonly SectorPressureInput[],
  rng: DeterministicRng,
): SectorChanceAllocation[] {
  const state = sectors.map((sector) => ({
    ...sector,
    pressure: sector.attack - sector.defenceAgainst,
    remainingPressure: sector.attack - sector.defenceAgainst,
    chances: 0,
  }));

  for (let index = 0; index < chanceCount; index += 1) {
    const highestPressure = Math.max(...state.map((sector) => sector.remainingPressure));
    let candidates = state.filter((sector) => sector.remainingPressure === highestPressure);
    const highestAttack = Math.max(...candidates.map((sector) => sector.attack));
    candidates = candidates.filter((sector) => sector.attack === highestAttack);
    const highestPlayerCount = Math.max(...candidates.map((sector) => sector.attackingPlayers));
    candidates = candidates.filter((sector) => sector.attackingPlayers === highestPlayerCount);
    const selected = candidates.length === 1 ? candidates[0]! : rng.pick(candidates);
    selected.chances += 1;
    selected.remainingPressure -= 5;
  }

  return state.map(({ sector, pressure, chances }) => ({ sector, pressure, chances }));
}
