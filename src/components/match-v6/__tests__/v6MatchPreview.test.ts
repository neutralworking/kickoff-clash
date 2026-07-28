import { describe, expect, it } from 'vitest';
import {
  advancePeriod,
  openBreak,
  startMatchFromSquads,
  type Sector,
  type V6Card,
  type V6Squad,
} from '../../../lib/match-v6';
import { previewPlayerPlan, recommendOutgoing } from '../v6MatchPreview';

function card(id: string, sector: Sector, attack: number, defence: number, cost = 1): V6Card {
  return {
    id,
    name: id,
    shortName: id,
    position: sector === 'centre' ? 'CM' : 'WM',
    role: 'Test player',
    sector,
    cost,
    attack,
    defence,
    rarity: 'common',
    actions: [],
  };
}

function squad(name: string, prefix: string, leftAttack: number, leftDefence: number): V6Squad {
  const xi: V6Card[] = [
    card(`${prefix}-left-key`, 'left', leftAttack, leftDefence),
    card(`${prefix}-left-2`, 'left', 4, 2),
    card(`${prefix}-left-3`, 'left', 4, 2),
    card(`${prefix}-centre-1`, 'centre', 4, 4),
    card(`${prefix}-centre-2`, 'centre', 4, 4),
    card(`${prefix}-centre-3`, 'centre', 4, 4),
    card(`${prefix}-centre-4`, 'centre', 4, 4),
    card(`${prefix}-right-1`, 'right', 4, 4),
    card(`${prefix}-right-2`, 'right', 4, 4),
    card(`${prefix}-right-3`, 'right', 4, 4),
    card(`${prefix}-right-4`, 'right', 4, 4),
  ];
  const bench = [
    card(`${prefix}-bench-centre`, 'centre', 8, 1, 2),
    card(`${prefix}-bench-2`, 'left', 2, 3),
    card(`${prefix}-bench-3`, 'right', 2, 3),
    card(`${prefix}-bench-4`, 'centre', 3, 3),
    card(`${prefix}-bench-5`, 'left', 3, 2),
    card(`${prefix}-bench-6`, 'right', 3, 2),
    card(`${prefix}-bench-7`, 'centre', 2, 4),
  ];
  return { name, xi, bench };
}

function firstBreak() {
  const player = squad('Player', 'p', 1, 6);
  const opponent = squad('Opponent', 'o', 2, 1);
  // Make the opponent's left lane attack/defence exactly 10/5 so the risky
  // centre-card-for-left-card change crosses thresholds in both directions.
  opponent.xi[0] = card('o-left-key', 'left', 2, 1);
  opponent.xi[1] = card('o-left-2', 'left', 4, 2);
  opponent.xi[2] = card('o-left-3', 'left', 4, 2);
  const started = startMatchFromSquads(player, opponent, 42);
  const afterFirst = advancePeriod(started.state, started.rng);
  return openBreak(afterFirst.state);
}

describe('live V6 substitution preview', () => {
  it('shows the upside and downside of an out-of-position attacking change', () => {
    const state = firstBreak();
    const projection = previewPlayerPlan(state, [
      { outCardId: 'p-left-key', inCardId: 'p-bench-centre' },
    ]);

    expect(projection.legal).toBe(true);
    expect(projection.cost).toBe(2);
    expect(projection.deltas.attack).toBe(5);
    expect(projection.deltas.defence).toBe(-7);
    expect(projection.deltas.chancesFor).toBe(1);
    expect(projection.deltas.chancesAgainst).toBe(2);
    expect(projection.incomingReceipts).toEqual([
      expect.objectContaining({
        cardId: 'p-bench-centre',
        outOfPosition: true,
        mods: expect.arrayContaining([
          expect.objectContaining({ label: 'Out of position', attack: -2, defence: -2 }),
        ]),
      }),
    ]);
  });

  it('recommends a deterministic legal outgoing player for a selected substitute', () => {
    const state = firstBreak();
    const first = recommendOutgoing(state, [], 'p-bench-centre');
    const second = recommendOutgoing(state, [], 'p-bench-centre');

    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(first?.projection.legal).toBe(true);
    expect(first?.projection.cost).toBeLessThanOrEqual(state.energy);
  });
});
