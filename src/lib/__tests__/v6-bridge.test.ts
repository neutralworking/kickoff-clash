/**
 * Migration Phase 2 — live Card → V6Card bridge.
 */
import { describe, it, expect } from 'vitest';
import type { Card } from '../scoring';
import {
  toV6Card,
  v6Cost,
  v6Sector,
  v6Rarity,
  sectorFromSlot,
  toV6Starters,
  bridgePlayerSquad,
  bridgeOpponentSquad,
  v6OpponentPower,
} from '../v6-bridge';
import { STAT_BUDGET_BY_COST, scaleV6Squad, simulateMatchFromSquads } from '../match-v6';
import { getFormation } from '../formations';

function mk(o: { id: number; position: string; archetype: string; power: number; rarity: string; tacticalRole?: string }): Card {
  return { name: `Player ${o.id}`, gatePull: 0, ...o } as Card;
}

// A formation-distributed squad of real-ish Cards (a GK, a back line, mids, a front).
const SQUAD_ROLES = ['GK', 'WD', 'CD', 'CD', 'WD', 'DM', 'CM', 'CM', 'WF', 'CF', 'WF'];
const SQUAD_ARCH = ['Shotstopper', 'Sprinter', 'Cover', 'Cover', 'Sprinter', 'Destroyer', 'Engine', 'Engine', 'Dribbler', 'Striker', 'Dribbler'];
function squadCards(power: number, idBase: number): { xi: Card[]; bench: Card[] } {
  const xi = SQUAD_ROLES.map((pos, i) => mk({ id: idBase + i, position: pos, archetype: SQUAD_ARCH[i], power, rarity: 'Rare' }));
  const bench = Array.from({ length: 7 }, (_, i) => mk({ id: idBase + 100 + i, position: 'CF', archetype: 'Striker', power: power - 2, rarity: 'Rare' }));
  return { xi, bench };
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

// ── Phase 4: live-run squad building + balance ───────────────────────────────

describe('sectorFromSlot', () => {
  it('maps a formation slot x to a lane', () => {
    expect(sectorFromSlot(10)).toBe('left');
    expect(sectorFromSlot(50)).toBe('centre');
    expect(sectorFromSlot(90)).toBe('right');
  });
});

describe('toV6Starters', () => {
  it('sectors the XI by formation geometry (spreads across all three lanes)', () => {
    const f = getFormation('4-3-3');
    const xi = f.slots.map((_, i) => mk({ id: 300 + i, position: 'CM', archetype: 'Engine', power: 70, rarity: 'Common' }));
    const v6 = toV6Starters(xi, f);
    const lanes = new Set(v6.map((c) => c.sector));
    expect(lanes.has('left')).toBe(true);
    expect(lanes.has('centre')).toBe(true);
    expect(lanes.has('right')).toBe(true);
    expect(v6[1].sector).toBe('left'); // slot 1 is the Left Back (x10)
  });
});

describe('scaleV6Squad', () => {
  it('scales attack/defence independently and preserves shape + name', () => {
    const card = toV6Card(mk({ id: 1, position: 'CF', archetype: 'Finisher', power: 80, rarity: 'Rare' }));
    const scaled = scaleV6Squad({ name: 'X', xi: [card], bench: [card] }, 0.5, 1);
    expect(scaled.name).toBe('X');
    expect(scaled.xi[0].attack).toBe(Math.round(card.attack * 0.5));
    expect(scaled.xi[0].defence).toBe(card.defence); // defence × 1
    expect(scaled.bench).toHaveLength(1);
  });
});

describe('bridgePlayerSquad', () => {
  it('damps attack, keeps defence, and keeps live_ ids', () => {
    const f = getFormation('4-3-3');
    const { xi, bench } = squadCards(80, 400);
    const squad = bridgePlayerSquad('YOU', xi, bench, f);
    expect(squad.xi).toHaveLength(11);
    expect(squad.bench).toHaveLength(7);
    expect(squad.xi.every((c) => /^live_\d+$/.test(c.id))).toBe(true);
    const striker = xi[9];
    const raw = toV6Card(striker);
    const damped = squad.xi.find((c) => c.id === `live_${striker.id}`)!;
    expect(damped.attack).toBeLessThanOrEqual(raw.attack);
    expect(damped.defence).toBe(raw.defence);
  });
});

describe('bridgeOpponentSquad', () => {
  it('builds 11 + 7 distinct cards in a private opp_ namespace (never live_)', () => {
    const sq = bridgeOpponentSquad({ name: 'Foe', round: 3, style: 'Balanced', seed: 42, power: 74 });
    expect(sq.xi).toHaveLength(11);
    expect(sq.bench).toHaveLength(7);
    const ids = [...sq.xi, ...sq.bench].map((c) => c.id);
    expect(new Set(ids).size).toBe(18); // no collisions (else the pool loses cards)
    expect(ids.every((id) => id.startsWith('opp_'))).toBe(true);
    expect(ids.some((id) => /^live_\d+$/.test(id))).toBe(false); // never the player's namespace
  });
});

describe('v6OpponentPower', () => {
  it('leaves sub-knee power untouched and compresses the boss top-end', () => {
    expect(v6OpponentPower(70)).toBe(70);
    expect(v6OpponentPower(90)).toBeLessThan(90);
    expect(v6OpponentPower(90)).toBeGreaterThan(v6OpponentPower(84)); // still monotonic
  });
});

describe('live-run match balance (headless)', () => {
  it('keeps goals in a sane band and rewards the stronger side', () => {
    const f = getFormation('4-3-3');
    let goals = 0;
    let n = 0;
    let strongWins = 0;
    let weakWins = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const strongCards = squadCards(84, 1000);
      const strong = bridgePlayerSquad('S', strongCards.xi, strongCards.bench, f);
      const weakOpp = bridgeOpponentSquad({ name: 'w', round: 1, style: 'Passive', seed, power: 56 });
      const a = simulateMatchFromSquads({ player: strong, opponent: weakOpp, seed });
      goals += a.playerScore + a.opponentScore;
      n += 1;
      if (a.winner === 'player') strongWins += 1;

      const weakCards = squadCards(58, 2000);
      const weak = bridgePlayerSquad('W', weakCards.xi, weakCards.bench, f);
      const strongOpp = bridgeOpponentSquad({ name: 's', round: 4, style: 'Balanced', seed, power: 84 });
      const b = simulateMatchFromSquads({ player: weak, opponent: strongOpp, seed });
      if (b.winner === 'player') weakWins += 1;
    }
    const avgGoals = goals / n;
    expect(avgGoals).toBeGreaterThan(0.5);
    expect(avgGoals).toBeLessThan(8);
    expect(strongWins).toBeGreaterThan(weakWins); // directionality: strength matters
  });
});
