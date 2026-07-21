/**
 * Migration Phase 2 — live Card → V6Card bridge.
 */
import { describe, it, expect } from 'vitest';
import type { Card } from '../scoring';
import { toV6Card, v6Cost, v6Sector, v6Rarity } from '../v6-bridge';
import { STAT_BUDGET_BY_COST } from '../match-v6';

function mk(o: { id: number; position: string; archetype: string; power: number; rarity: string; tacticalRole?: string }): Card {
  return { name: `Player ${o.id}`, gatePull: 0, ...o } as Card;
}

describe('cost from power', () => {
  it('bands power 52–95 into 1–6', () => {
    expect(v6Cost(mk({ id: 1, position: 'CM', archetype: 'Engine', power: 55, rarity: 'Common' }))).toBe(1);
    expect(v6Cost(mk({ id: 1, position: 'CM', archetype: 'Engine', power: 65, rarity: 'Common' }))).toBe(2);
    expect(v6Cost(mk({ id: 1, position: 'CM', archetype: 'Engine', power: 72, rarity: 'Rare' }))).toBe(3);
    expect(v6Cost(mk({ id: 1, position: 'CM', archetype: 'Engine', power: 80, rarity: 'Rare' }))).toBe(4);
    expect(v6Cost(mk({ id: 1, position: 'CM', archetype: 'Engine', power: 88, rarity: 'Epic' }))).toBe(5);
    expect(v6Cost(mk({ id: 1, position: 'CM', archetype: 'Engine', power: 93, rarity: 'Legendary' }))).toBe(6);
  });
});

describe('sector from position', () => {
  it('central roles play centre; wide roles split left/right by id parity', () => {
    expect(v6Sector(mk({ id: 1, position: 'CF', archetype: 'Finisher', power: 80, rarity: 'Rare' }))).toBe('centre');
    expect(v6Sector(mk({ id: 2, position: 'WF', archetype: 'Dribbler', power: 80, rarity: 'Rare' }))).toBe('left');
    expect(v6Sector(mk({ id: 3, position: 'WM', archetype: 'Dribbler', power: 80, rarity: 'Rare' }))).toBe('right');
  });
});

describe('rarity mapping', () => {
  it('maps live rarity strings to the V6 rarity enum', () => {
    expect(v6Rarity('Legendary')).toBe('legendary');
    expect(v6Rarity('EPIC')).toBe('epic');
    expect(v6Rarity('Rare')).toBe('rare');
    expect(v6Rarity('Common')).toBe('common');
  });
});

describe('toV6Card', () => {
  it('splits the cost budget by the ATK/DEF lean, keeping totals on-budget', () => {
    const attacker = toV6Card(mk({ id: 10, position: 'CF', archetype: 'Finisher', power: 80, rarity: 'Rare' }));
    expect(attacker.cost).toBe(4);
    expect(attacker.attack + attacker.defence).toBe(STAT_BUDGET_BY_COST[4]);
    expect(attacker.attack).toBeGreaterThan(attacker.defence);

    const defender = toV6Card(mk({ id: 11, position: 'CD', archetype: 'Destroyer', power: 80, rarity: 'Rare' }));
    expect(defender.defence).toBeGreaterThan(defender.attack);
  });

  it('gives attackers an attacking action, defenders a defensive one', () => {
    const attacker = toV6Card(mk({ id: 12, position: 'CF', archetype: 'Finisher', power: 70, rarity: 'Common' }));
    expect(attacker.actions[0].kind).toBe('modify_attack');
    const defender = toV6Card(mk({ id: 13, position: 'CD', archetype: 'Destroyer', power: 70, rarity: 'Common' }));
    expect(defender.actions[0].kind).toBe('modify_defence');
    const eliteAttacker = toV6Card(mk({ id: 14, position: 'CF', archetype: 'Finisher', power: 92, rarity: 'Legendary' }));
    expect(eliteAttacker.actions[0].kind).toBe('improve_die_faces');
  });

  it('produces a stable engine id and a serializable card', () => {
    const c = toV6Card(mk({ id: 42, position: 'AM', archetype: 'Creator', power: 77, rarity: 'Epic' }));
    expect(c.id).toBe('live_42');
    expect(typeof c.attack).toBe('number');
    expect(c.actions.length).toBe(1);
  });
});
