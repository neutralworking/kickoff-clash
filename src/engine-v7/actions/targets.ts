import type { ActionTarget, Sector, TeamSide } from '../../lib/match-v7/types';
import type { ConditionPlayerView } from './conditions';

export interface TargetContext {
  source: ConditionPlayerView;
  ownActive: ConditionPlayerView[];
  enemyActive: ConditionPlayerView[];
  ownBench: ConditionPlayerView[];
  enemyBench: ConditionPlayerView[];
  selectedPlayerIds?: string[];
  selectedSector?: Sector;
  selectedSlotKey?: string;
}

export interface ResolvedTarget {
  playerIds: string[];
  sector?: Sector;
  slotKey?: string;
  chanceSelector?: 'first_in_sector' | 'all_in_sector';
  side?: TeamSide;
}

function rank(players: ConditionPlayerView[], direction: 'strongest' | 'weakest', measure: 'attack' | 'defence' | 'total') {
  const value = (player: ConditionPlayerView) =>
    measure === 'attack' ? player.attack : measure === 'defence' ? player.defence : player.attack + player.defence;
  return [...players].sort((a, b) => {
    const primary = direction === 'strongest' ? value(b) - value(a) : value(a) - value(b);
    if (primary !== 0) return primary;
    const secondary = direction === 'strongest' ? b.cost - a.cost : a.cost - b.cost;
    if (secondary !== 0) return secondary;
    return a.cardId.localeCompare(b.cardId);
  });
}

function selectedPlayers(
  target: Extract<ActionTarget, { type: 'selected_player' }>,
  context: TargetContext,
): ConditionPlayerView[] {
  const own = target.side === 'own' || target.side === 'player';
  const active = own ? context.ownActive : context.enemyActive;
  const bench = own ? context.ownBench : context.enemyBench;

  if (target.zone === 'active') return active;
  if (target.zone === 'bench') return bench;
  return [...active, ...bench];
}

export function resolveTarget(target: ActionTarget, context: TargetContext): ResolvedTarget {
  switch (target.type) {
    case 'self': return { playerIds: [context.source.cardId] };
    case 'selected_player': {
      const eligibleIds = new Set(selectedPlayers(target, context).map((player) => player.cardId));
      return {
        playerIds: [...new Set(context.selectedPlayerIds ?? [])].filter((id) => eligibleIds.has(id)),
      };
    }
    case 'team': {
      const own = target.side === 'own';
      const players = target.zone === 'bench'
        ? (own ? context.ownBench : context.enemyBench)
        : (own ? context.ownActive : context.enemyActive);
      return { playerIds: players.map((player) => player.cardId) };
    }
    case 'sector': {
      const sector = target.selected ? context.selectedSector : target.sector ?? context.source.sector;
      const players = target.side === 'own' ? context.ownActive : context.enemyActive;
      return { sector, playerIds: players.filter((player) => player.sector === sector).map((player) => player.cardId) };
    }
    case 'slot': {
      const slotKey = target.selected ? context.selectedSlotKey : target.slotKey;
      const players = target.side === 'own' ? context.ownActive : context.enemyActive;
      return { slotKey, playerIds: players.filter((player) => player.slotKey === slotKey).map((player) => player.cardId) };
    }
    case 'position_group': {
      const players = target.side === 'own' ? context.ownActive : context.enemyActive;
      return { playerIds: players.filter((player) => player.position && target.positions.includes(player.position)).map((player) => player.cardId) };
    }
    case 'adjacent_player': return { playerIds: [] };
    case 'partner': {
      const ids = context.source.partnerCardIds;
      return { playerIds: target.mode === 'all' ? ids : ids.slice(0, 1) };
    }
    case 'ranked_players': {
      const players = target.side === 'own' ? context.ownActive : context.enemyActive;
      const ordered = rank(players, target.direction, target.measure);
      if (target.includePrimaryTies && ordered.length > 0) {
        const first = ordered[0]!;
        const primary = target.measure === 'attack' ? first.attack : target.measure === 'defence' ? first.defence : first.attack + first.defence;
        return { playerIds: ordered.filter((player) => {
          const value = target.measure === 'attack' ? player.attack : target.measure === 'defence' ? player.defence : player.attack + player.defence;
          return value === primary;
        }).map((player) => player.cardId) };
      }
      return { playerIds: ordered.slice(0, target.count ?? 1).map((player) => player.cardId) };
    }
    case 'chance': return {
      playerIds: [],
      sector: target.sector ?? context.source.sector,
      chanceSelector: target.selector,
      side: target.side === 'own' ? 'player' : 'opponent',
    };
  }
}
