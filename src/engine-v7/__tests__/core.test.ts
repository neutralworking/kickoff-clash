import { describe, expect, it } from 'vitest';
import {
  allocateCalculatedChances,
  calculateBreakBudget,
  calculatedChanceCount,
  calculatePlayerStats,
  createRng,
  rankPlayers,
  roundTowardZero,
} from '..';

describe('V7 deterministic foundations', () => {
  it('replays the same RNG sequence for the same seed and namespace', () => {
    const a = createRng(42, 'chance-rolls');
    const b = createRng(42, 'chance-rolls');
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });

  it('rounds multipliers toward zero', () => {
    expect(roundTowardZero(7.5)).toBe(7);
    expect(roundTowardZero(-7.5)).toBe(-7);
  });

  it('applies set, swap, flat modifiers, multipliers, then rounding', () => {
    const result = calculatePlayerStats({
      printedAttack: 3,
      printedDefence: 8,
      attackSetEffects: [{ value: 10, resolvedOrder: 1 }],
      swapStats: true,
      attackFlatModifiers: [2],
      defenceFlatModifiers: [-1],
      attackMultipliers: [1.5],
    });
    expect(result.attack.effective).toBe(15);
    expect(result.defence.effective).toBe(9);
  });

  it.each([
    [0, 0, 0],
    [1, 0, 1],
    [5, 0, 1],
    [6, 0, 2],
    [80, 67, 3],
  ])('creates chances from global difference %i - %i', (attack, defence, expected) => {
    expect(calculatedChanceCount(attack, defence)).toBe(expected);
  });

  it('allocates chances by remaining regional pressure', () => {
    const result = allocateCalculatedChances(3, [
      { sector: 'left', attack: 14, defenceAgainst: 6, attackingPlayers: 3 },
      { sector: 'centre', attack: 10, defenceAgainst: 7, attackingPlayers: 3 },
      { sector: 'right', attack: 8, defenceAgainst: 6, attackingPlayers: 2 },
    ], createRng(7, 'allocation'));
    expect(result).toEqual([
      { sector: 'left', pressure: 8, chances: 2 },
      { sector: 'centre', pressure: 3, chances: 1 },
      { sector: 'right', pressure: 2, chances: 0 },
    ]);
  });

  it('uses 3-5-7 break budgets and net negative incoming costs', () => {
    const result = calculateBreakBudget(2, [
      { sourceId: 'manager', actionId: 'catalyst', amount: 2, guaranteed: true },
      { sourceId: 'player', actionId: 'coin-flip', amount: 5, guaranteed: false },
    ], [
      { cardId: 'a', cost: 6 },
      { cardId: 'b', cost: 3 },
      { cardId: 'c', cost: -2 },
    ]);
    expect(result.availableEnergy).toBe(7);
    expect(result.netIncomingCost).toBe(7);
    expect(result.legalAtSubmission).toBe(true);
  });

  it('ranks strongest attack using defence, cost and deployment tie-breaks', () => {
    const ranked = rankPlayers([
      { id: 'late', attack: 8, defence: 5, cost: 4, deploymentOrder: 2 },
      { id: 'early', attack: 8, defence: 5, cost: 4, deploymentOrder: 1 },
      { id: 'lower-def', attack: 8, defence: 4, cost: 6, deploymentOrder: 0 },
    ], 'strongest', 'attack', createRng(1, 'ranking'));
    expect(ranked.map((player) => player.id)).toEqual(['early', 'late', 'lower-def']);
  });
});
