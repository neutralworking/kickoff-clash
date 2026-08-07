import { describe, expect, it } from 'vitest';
import {
  V8_PERIODS,
  V8_ZONE_CAPACITY,
  canDeployToZone,
  canMovePlayer,
  contributionInZone,
  deployPlayer,
  drawPlayers,
  effectiveStatsInZone,
  emptyV8Board,
  goalsFromAttackDefence,
  naturalZonePower,
  openingDraw,
  outOfPositionPenalty,
  resolveChanceCard,
  resolvePeriodScore,
  spendTransientCardEnergy,
  teamTotals,
  type V8ChanceCard,
  type V8ManagerCard,
  type V8PlayerCard,
} from '..';

function player(partial: Partial<V8PlayerCard> & Pick<V8PlayerCard, 'id' | 'position' | 'printedAttack' | 'printedDefence' | 'cost' | 'naturalZones'>): V8PlayerCard {
  return {
    name: partial.id,
    ...partial,
  };
}

describe('V8 three-zone prototype foundations', () => {
  it('uses four football periods', () => {
    expect(V8_PERIODS.map((period) => period.label)).toEqual(['0–22', '22–HT', 'HT–66', '66–FT']);
  });

  it.each([
    [0, 0, 0],
    [4, 0, 0],
    [5, 0, 1],
    [9, 0, 1],
    [10, 0, 2],
    [14, 9, 1],
    [19, 9, 2],
    [-2, -8, 1],
  ])('scores one goal for every complete +5 ATT band: %i vs %i', (attack, defence, expected) => {
    expect(goalsFromAttackDefence(attack, defence)).toBe(expected);
  });

  it('uses DEF only in Defence, both stats in Midfield, and ATT only in Attack', () => {
    const midfielder = player({ id: 'mid', position: 'CM', printedAttack: 6, printedDefence: 4, cost: 4, naturalZones: ['MID'] });

    expect(contributionInZone(midfielder, 'DEF')).toEqual({ attack: 0, defence: 2, penalty: 2 });
    expect(contributionInZone(midfielder, 'MID')).toEqual({ attack: 6, defence: 4, penalty: 0 });
    expect(contributionInZone(midfielder, 'ATT')).toEqual({ attack: 4, defence: 0, penalty: 2 });
  });

  it('applies natural / -2 / -5 out-of-position penalties to both printed stats', () => {
    const striker = player({ id: 'st', position: 'ST', printedAttack: 11, printedDefence: 2, cost: 5, naturalZones: ['ATT'] });

    expect(outOfPositionPenalty(striker, 'ATT')).toBe(0);
    expect(outOfPositionPenalty(striker, 'MID')).toBe(2);
    expect(outOfPositionPenalty(striker, 'DEF')).toBe(5);
    expect(effectiveStatsInZone(striker, 'DEF')).toEqual({ attack: 6, defence: -3, penalty: 5 });
  });

  it('uses the nearest natural zone for flexible players', () => {
    const wingback = player({ id: 'wb', position: 'RWB', printedAttack: 5, printedDefence: 5, cost: 4, naturalZones: ['DEF', 'MID'] });

    expect(outOfPositionPenalty(wingback, 'DEF')).toBe(0);
    expect(outOfPositionPenalty(wingback, 'MID')).toBe(0);
    expect(outOfPositionPenalty(wingback, 'ATT')).toBe(2);
  });

  it('makes natural zone power comparable across specialists and midfielders', () => {
    const defender = player({ id: 'cb', position: 'CB', printedAttack: 1, printedDefence: 9, cost: 5, naturalZones: ['DEF'] });
    const midfielder = player({ id: 'cm', position: 'CM', printedAttack: 5, printedDefence: 4, cost: 5, naturalZones: ['MID'] });
    const attacker = player({ id: 'cf', position: 'CF', printedAttack: 9, printedDefence: 1, cost: 5, naturalZones: ['ATT'] });

    expect(naturalZonePower(defender)).toBe(9);
    expect(naturalZonePower(midfielder)).toBe(9);
    expect(naturalZonePower(attacker)).toBe(9);
  });

  it('caps each zone at four deployed players', () => {
    let board = emptyV8Board();
    for (let index = 0; index < V8_ZONE_CAPACITY; index += 1) {
      board = deployPlayer(board, player({
        id: `cb-${index}`,
        position: 'CB',
        printedAttack: 1,
        printedDefence: 5,
        cost: 3,
        naturalZones: ['DEF'],
      }), 'DEF', index);
    }

    expect(canDeployToZone(board, 'DEF')).toBe(false);
    expect(() => deployPlayer(board, player({
      id: 'fifth',
      position: 'CB',
      printedAttack: 1,
      printedDefence: 5,
      cost: 3,
      naturalZones: ['DEF'],
    }), 'DEF', 5)).toThrow('DEF is full');
  });

  it('starts with three players, then drawing two each period exposes the entire XI by period four', () => {
    const xi = Array.from({ length: 11 }, (_, index) => player({
      id: `p-${index + 1}`,
      position: index === 0 ? 'GK' : 'CM',
      printedAttack: index === 0 ? 1 : 4,
      printedDefence: index === 0 ? 6 : 4,
      cost: 3,
      naturalZones: [index === 0 ? 'DEF' : 'MID'],
    }));

    let draw = openingDraw(xi);
    expect(draw.hand).toHaveLength(3);
    expect(draw.drawPile).toHaveLength(8);
    expect(draw.hand.some((card) => card.position === 'GK')).toBe(true);

    for (let period = 0; period < 4; period += 1) {
      draw = drawPlayers(draw.hand, draw.drawPile);
    }

    expect(draw.hand).toHaveLength(11);
    expect(draw.drawPile).toHaveLength(0);
  });

  it('allows the goalkeeper to be a normal hand card whose natural zone is DEF', () => {
    const keeper = player({ id: 'gk', position: 'GK', printedAttack: 1, printedDefence: 8, cost: 4, naturalZones: ['DEF'] });
    expect(contributionInZone(keeper, 'DEF')).toEqual({ attack: 0, defence: 8, penalty: 0 });
    expect(contributionInZone(keeper, 'MID')).toEqual({ attack: -1, defence: 6, penalty: 2 });
  });

  it('does not allow natural movement unless the player has Moveable status', () => {
    const fixed = player({ id: 'fixed', position: 'CM', printedAttack: 5, printedDefence: 4, cost: 4, naturalZones: ['MID'] });
    const moveable = { ...fixed, id: 'moveable', statuses: ['moveable'] as const };

    expect(canMovePlayer(fixed)).toBe(false);
    expect(canMovePlayer(moveable)).toBe(true);
  });

  it('resolves chance cards as temporary boosts rather than board occupants', () => {
    const cross: V8ChanceCard = {
      kind: 'chance',
      id: 'cross-1',
      name: 'Cross',
      chanceType: 'cross',
      cost: 1,
      targetZone: 'ATT',
      attackBoost: 3,
    };

    expect(resolveChanceCard(cross)).toEqual({ zone: 'ATT', attack: 3, defence: 0 });
    expect(spendTransientCardEnergy(4, cross)).toBe(3);
  });

  it('keeps the manager outside the XI draw and makes the one-shot action spend energy', () => {
    const manager: V8ManagerCard = {
      kind: 'manager',
      id: 'manager',
      name: 'Manager',
      cost: 3,
      action: { id: 'control', name: 'Control', timing: 'on_reveal', text: 'Boost this zone.' },
    };

    expect(spendTransientCardEnergy(5, manager)).toBe(2);
    expect(() => spendTransientCardEnergy(2, manager)).toThrow('Not enough energy');
  });

  it('banks goals independently in both directions at the end of a period', () => {
    const homeForward = player({ id: 'home-st', position: 'ST', printedAttack: 14, printedDefence: 1, cost: 6, naturalZones: ['ATT'] });
    const awayForward = player({ id: 'away-st', position: 'ST', printedAttack: 9, printedDefence: 1, cost: 5, naturalZones: ['ATT'] });
    const homeKeeper = player({ id: 'home-gk', position: 'GK', printedAttack: 0, printedDefence: 4, cost: 3, naturalZones: ['DEF'] });
    const awayKeeper = player({ id: 'away-gk', position: 'GK', printedAttack: 0, printedDefence: 4, cost: 3, naturalZones: ['DEF'] });

    const home = deployPlayer(deployPlayer(emptyV8Board(), homeForward, 'ATT', 1), homeKeeper, 'DEF', 2);
    const away = deployPlayer(deployPlayer(emptyV8Board(), awayForward, 'ATT', 1), awayKeeper, 'DEF', 2);

    expect(resolvePeriodScore(home, away)).toMatchObject({
      homeGoals: 2,
      awayGoals: 1,
      homeAttack: 14,
      homeDefence: 4,
      awayAttack: 9,
      awayDefence: 4,
    });
  });

  it('lets MID contribute simultaneously to attacking and defensive period totals', () => {
    const mid = player({ id: 'mid', position: 'CM', printedAttack: 6, printedDefence: 5, cost: 5, naturalZones: ['MID'] });
    const board = deployPlayer(emptyV8Board(), mid, 'MID', 1);

    expect(teamTotals(board)).toMatchObject({ attack: 6, defence: 5 });
  });
});
