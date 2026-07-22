import { describe, expect, it } from 'vitest';
import type { FormationDefinition, V7PlayerCard } from '../../lib/match-v7/types';
import { evaluateConditionGroups } from '../actions/conditions';
import { resolveTarget } from '../actions/targets';
import { evaluateGoalkeeperPlacement } from '../core/goalkeeper';
import { autoMapFormation } from '../formations/mapping';

const formation: FormationDefinition = {
  id: 'f1',
  formationKey: 'test',
  name: 'Test',
  slots: [
    { slotKey: 'gk', positionCode: 'GK', sector: 'centre', xOrder: 0, yOrder: 0, adjacentSlotKeys: [], partnerLinkKeys: [] },
    ...Array.from({ length: 10 }, (_, index) => ({
      slotKey: `s${index}`,
      positionCode: index < 4 ? 'CB' as const : index < 7 ? 'CM' as const : 'CF' as const,
      sector: index % 3 === 0 ? 'left' as const : index % 3 === 1 ? 'centre' as const : 'right' as const,
      xOrder: index,
      yOrder: index,
      adjacentSlotKeys: [],
      partnerLinkKeys: [],
    })),
  ],
};

function card(id: string, positions: V7PlayerCard['positionCodes'], attack = 5, defence = 5): V7PlayerCard {
  return {
    id,
    cardKey: id,
    name: id,
    positionCodes: positions,
    naturalSector: 'centre',
    printedAttack: attack,
    printedDefence: defence,
    printedCost: 3,
    role: 'Test',
    rarity: 'common',
    actionIds: [],
  };
}

describe('formation mapping', () => {
  it('maps a natural goalkeeper before outfield players', () => {
    const players = [card('keeper', ['GK']), ...Array.from({ length: 10 }, (_, i) => card(`p${i}`, ['CM']))]
      .map((player, deploymentOrder) => ({ card: player, deploymentOrder }));
    expect(autoMapFormation(formation, players, 42).assignments.gk).toBe('keeper');
  });
});

describe('goalkeeper rules', () => {
  it('forces emergency goalkeeper ATT to zero and suppresses actions', () => {
    const result = evaluateGoalkeeperPlacement(card('outfielder', ['CM']), formation.slots[0]!, 8, 7);
    expect(result.attack).toBe(0);
    expect(result.defence).toBe(2);
    expect(result.actionsSuppressed).toBe(true);
  });
});

describe('condition and target dispatch', () => {
  const source = { cardId: 'a', position: 'CM' as const, sector: 'centre' as const, attack: 9, defence: 4, cost: 3, partnerCardIds: ['b'] };
  const teammate = { cardId: 'b', position: 'CF' as const, sector: 'centre' as const, attack: 7, defence: 2, cost: 2, partnerCardIds: ['a'] };

  it('treats conditions within a group as OR and groups as AND', () => {
    expect(evaluateConditionGroups([
      { group: 1, conditions: [{ type: 'score_state', state: 'winning' }, { type: 'score_state', state: 'level' }] },
      { group: 2, conditions: [{ type: 'period_is', period: 4 }] },
    ], {
      period: 4,
      ownScore: 1,
      enemyScore: 1,
      formationKey: 'test',
      source,
      ownActive: [source, teammate],
      occupiedSlotKeys: ['s1', 's2'],
    })).toBe(true);
  });

  it('resolves strongest-N selector targets', () => {
    expect(resolveTarget({ type: 'ranked_players', side: 'own', direction: 'strongest', measure: 'attack', count: 1 }, {
      source,
      ownActive: [source, teammate],
      enemyActive: [],
      ownBench: [],
      enemyBench: [],
    }).playerIds).toEqual(['a']);
  });
});
