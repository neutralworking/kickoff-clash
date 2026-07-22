import type { RankingMeasure, SelectorDirection } from '../../lib/match-v7/types';
import type { DeterministicRng } from './rng';

export interface RankedPlayer {
  id: string;
  attack: number;
  defence: number;
  cost: number;
  deploymentOrder: number;
}

function measure(player: RankedPlayer, rankingMeasure: RankingMeasure): number {
  if (rankingMeasure === 'attack') return player.attack;
  if (rankingMeasure === 'defence') return player.defence;
  return player.attack + player.defence;
}

export function rankPlayers(
  players: readonly RankedPlayer[],
  direction: SelectorDirection,
  rankingMeasure: RankingMeasure,
  rng: DeterministicRng,
): RankedPlayer[] {
  const randomOrder = new Map(players.map((player) => [player.id, rng.next()]));
  const sign = direction === 'strongest' ? -1 : 1;

  return [...players].sort((a, b) => {
    const primary = sign * (measure(a, rankingMeasure) - measure(b, rankingMeasure));
    if (primary !== 0) return primary;

    const secondaryA = rankingMeasure === 'defence' ? a.attack : a.defence;
    const secondaryB = rankingMeasure === 'defence' ? b.attack : b.defence;
    const secondary = sign * (secondaryA - secondaryB);
    if (secondary !== 0) return secondary;

    const tertiaryA = rankingMeasure === 'total' ? a.attack : a.cost;
    const tertiaryB = rankingMeasure === 'total' ? b.attack : b.cost;
    const tertiary = sign * (tertiaryA - tertiaryB);
    if (tertiary !== 0) return tertiary;

    if (rankingMeasure === 'total') {
      const defence = sign * (a.defence - b.defence);
      if (defence !== 0) return defence;
      const cost = sign * (a.cost - b.cost);
      if (cost !== 0) return cost;
    }

    const deployment = direction === 'strongest'
      ? a.deploymentOrder - b.deploymentOrder
      : b.deploymentOrder - a.deploymentOrder;
    if (deployment !== 0) return deployment;

    return (randomOrder.get(a.id) ?? 0) - (randomOrder.get(b.id) ?? 0);
  });
}
