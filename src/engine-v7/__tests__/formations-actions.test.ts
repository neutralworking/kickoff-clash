import { describe, expect, it } from 'vitest';
import type { FormationDefinition, V7PlayerCard } from '../../lib/match-v7/types';
import { evaluateConditionGroups } from '../actions/conditions';
import { resolveTarget } from '../actions/targets';
import { evaluateGoalkeeperPlacement } from '../core/goalkeeper';
import { validateFormation } from '../formations/geometry';
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

  it('preserves current slots first and maps every player at most once', () => {
    const players = [
      { card: card('keeper', ['GK']), deploymentOrder: 0 },
      { card: card('incumbent', ['CM']), currentSlotKey: 's5', deploymentOrder: 1 },
      ...Array.from({ length: 9 }, (_, i) => ({ card: card(`p${i}`, ['CM']), deploymentOrder: i + 2 })),
    ];
    const result = autoMapFormation(formation, players, 12);

    expect(result.assignments.s5).toBe('incumbent');
    expect(new Set(Object.values(result.assignments)).size).toBe(11);
    expect(result.unmappedCardIds).toEqual([]);
    expect(result.emptySlotKeys).toEqual([]);
  });

  it('replays the complete auto-mapping result for the same seed', () => {
    const players = Array.from({ length: 11 }, (_, i) => ({
      card: card(`equal-${i}`, i === 0 ? ['GK'] : ['CM']),
      deploymentOrder: i === 0 ? 0 : 1,
    }));

    expect(autoMapFormation(formation, players, 73)).toEqual(autoMapFormation(formation, players, 73));
  });
});

describe('formation validation', () => {
  it('accepts an eleven-slot formation with exactly one goalkeeper', () => {
    expect(validateFormation(formation)).toEqual({ valid: true, errors: [] });
  });

  it('reports duplicate keys, invalid adjacency and an invalid goalkeeper count', () => {
    const invalid: FormationDefinition = {
      ...formation,
      slots: formation.slots.map((slot, index) => index === 0
        ? { ...slot, positionCode: 'CB', adjacentSlotKeys: ['gk', 'missing'] }
        : index === 1 ? { ...slot, slotKey: 'gk' } : slot),
    };
    const result = validateFormation(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Slot gk cannot be adjacent to itself.',
      'Duplicate slot key: gk.',
      'Formation test must contain exactly one GK slot.',
      'Slot gk references missing adjacent slot missing.',
    ]));
  });
});

describe('goalkeeper rules', () => {
  it('forces emergency goalkeeper ATT to zero and suppresses actions', () => {
    const result = evaluateGoalkeeperPlacement(card('outfielder', ['CM']), formation.slots[0]!, 8, 7);
    expect(result.attack).toBe(0);
    expect(result.defence).toBe(2);
    expect(result.actionsSuppressed).toBe(true);
  });

  it('does not apply emergency rules to a natural goalkeeper or an outfielder outside goal', () => {
    expect(evaluateGoalkeeperPlacement(card('keeper', ['GK']), formation.slots[0]!, 4, 9)).toEqual({
      attack: 4,
      defence: 9,
      actionsSuppressed: false,
      outOfPosition: false,
      emergencyGoalkeeper: false,
    });
    expect(evaluateGoalkeeperPlacement(card('midfielder', ['CM']), formation.slots[5]!, 8, 7)).toEqual({
      attack: 8,
      defence: 7,
      actionsSuppressed: false,
      outOfPosition: false,
      emergencyGoalkeeper: false,
    });
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

  it('fails when every condition in any required group is false', () => {
    expect(evaluateConditionGroups([
      { group: 1, conditions: [{ type: 'score_state', state: 'winning' }, { type: 'score_state', state: 'level' }] },
      { group: 2, conditions: [{ type: 'period_is', period: 3 }, { type: 'source_sector_is', sectors: ['left'] }] },
    ], {
      period: 4,
      ownScore: 1,
      enemyScore: 1,
      formationKey: 'test',
      source,
      ownActive: [source, teammate],
      occupiedSlotKeys: ['s1', 's2'],
    })).toBe(false);
  });

  it('resolves selected targets only from the requested side and zone', () => {
    const enemy = { ...teammate, cardId: 'enemy' };
    const bench = { ...teammate, cardId: 'bench' };
    expect(resolveTarget({ type: 'selected_player', side: 'own', zone: 'active' }, {
      source,
      ownActive: [source, teammate],
      enemyActive: [enemy],
      ownBench: [bench],
      enemyBench: [],
      selectedPlayerIds: ['enemy', 'b', 'bench', 'b', 'missing'],
    }).playerIds).toEqual(['b']);
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

  it('resolves ranked targets from the requested side with stable tie-breaks and primary ties', () => {
    const enemy = [
      { ...source, cardId: 'expensive', attack: 8, cost: 5 },
      { ...source, cardId: 'cheap', attack: 8, cost: 2 },
      { ...source, cardId: 'weak', attack: 3, cost: 9 },
    ];
    const context = { source, ownActive: [source, teammate], enemyActive: enemy, ownBench: [], enemyBench: [] };

    expect(resolveTarget({ type: 'ranked_players', side: 'enemy', direction: 'strongest', measure: 'attack', count: 2 }, context).playerIds)
      .toEqual(['expensive', 'cheap']);
    expect(resolveTarget({ type: 'ranked_players', side: 'enemy', direction: 'strongest', measure: 'attack', count: 1, includePrimaryTies: true }, context).playerIds)
      .toEqual(['expensive', 'cheap']);
  });
});
