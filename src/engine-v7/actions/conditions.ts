import type { ActionCondition, ConditionGroup, PeriodNumber, PositionCode, Sector } from '../../lib/match-v7/types';

export interface ConditionPlayerView {
  cardId: string;
  slotKey?: string;
  position?: PositionCode;
  sector?: Sector;
  attack: number;
  defence: number;
  cost: number;
  partnerCardIds: string[];
}

export interface ConditionContext {
  period: PeriodNumber;
  ownScore: number;
  enemyScore: number;
  formationKey: string;
  source: ConditionPlayerView;
  ownActive: ConditionPlayerView[];
  occupiedSlotKeys: string[];
  randomPass?: (condition: Extract<ActionCondition, { type: 'probability' }>) => boolean;
}

function compare(value: number, operator: 'eq' | 'gte' | 'lte', expected: number): boolean {
  if (operator === 'eq') return value === expected;
  if (operator === 'gte') return value >= expected;
  return value <= expected;
}

export function evaluateCondition(condition: ActionCondition, context: ConditionContext): boolean {
  switch (condition.type) {
    case 'always': return true;
    case 'score_state':
      if (condition.state === 'winning') return context.ownScore > context.enemyScore;
      if (condition.state === 'losing') return context.ownScore < context.enemyScore;
      return context.ownScore === context.enemyScore;
    case 'period_is': return context.period === condition.period;
    case 'period_at_least': return context.period >= condition.period;
    case 'formation_is': return context.formationKey === condition.formationKey;
    case 'source_position_is': return context.source.position !== undefined && condition.positions.includes(context.source.position);
    case 'source_sector_is': return context.source.sector !== undefined && condition.sectors.includes(context.source.sector);
    case 'occupied_position_count':
      return compare(
        context.ownActive.filter((player) => player.position && condition.positions.includes(player.position)).length,
        condition.comparison,
        condition.value,
      );
    case 'slot_occupied': return context.occupiedSlotKeys.includes(condition.slotKey);
    case 'slot_empty': return !context.occupiedSlotKeys.includes(condition.slotKey);
    case 'has_partner': return context.source.partnerCardIds.length > 0;
    case 'source_rank': {
      const value = (player: ConditionPlayerView) =>
        condition.measure === 'attack' ? player.attack : condition.measure === 'defence' ? player.defence : player.attack + player.defence;
      const sourceValue = value(context.source);
      const values = context.ownActive.map(value);
      return condition.direction === 'strongest'
        ? sourceValue === Math.max(...values)
        : sourceValue === Math.min(...values);
    }
    case 'probability': return context.randomPass?.(condition) ?? false;
  }
}

export function evaluateConditionGroups(groups: ConditionGroup[], context: ConditionContext): boolean {
  if (groups.length === 0) return true;
  return groups.every((group) => group.conditions.some((condition) => evaluateCondition(condition, context)));
}
