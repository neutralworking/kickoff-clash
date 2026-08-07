import { describe, expect, it } from 'vitest';
import {
  deployPlayer,
  emptyV8Board,
  prototypeBoardWithOngoing,
  prototypeCrossReceiverBonus,
  prototypeFollowAttackBoost,
  prototypeKeeperReactionBoost,
  prototypePressurePenalty,
  teamTotals,
  type V8PlayerCard,
} from '..';

function player(
  id: string,
  attack: number,
  defence: number,
  zone: 'DEF' | 'MID' | 'ATT',
  prototypeAction?: 'wall' | 'cross_receiver',
): V8PlayerCard & { prototypeAction?: 'wall' | 'cross_receiver' } {
  return {
    id,
    name: id,
    position: zone === 'DEF' ? 'CB' : zone === 'MID' ? 'CM' : 'CF',
    printedAttack: attack,
    printedDefence: defence,
    cost: 2,
    naturalZones: [zone],
    prototypeAction,
  };
}

describe('V8 prototype Action interactions', () => {
  it('maps FRONT FOOT pressure to the stats that actually contribute in each zone', () => {
    expect(prototypePressurePenalty('DEF')).toEqual({ attack: 0, defence: 2 });
    expect(prototypePressurePenalty('MID')).toEqual({ attack: 2, defence: 2 });
    expect(prototypePressurePenalty('ATT')).toEqual({ attack: 2, defence: 0 });
  });

  it('makes STARFISH reactive to an opposing ATT reveal that happened first', () => {
    expect(prototypeKeeperReactionBoost(0)).toBe(0);
    expect(prototypeKeeperReactionBoost(1)).toBe(3);
    expect(prototypeKeeperReactionBoost(3)).toBe(3);
  });

  it('makes RUNNER reward being sequenced after another friendly ATT reveal', () => {
    expect(prototypeFollowAttackBoost(0)).toBe(0);
    expect(prototypeFollowAttackBoost(1)).toBe(2);
    expect(prototypeFollowAttackBoost(2)).toBe(2);
  });

  it('keeps WALL inactive alone and adds +2 DEF once it has a DEF teammate', () => {
    const wall = player('wall', 1, 5, 'DEF', 'wall');
    const partner = player('partner', 1, 4, 'DEF');
    const solo = deployPlayer(emptyV8Board(), wall, 'DEF', 1);
    const paired = deployPlayer(solo, partner, 'DEF', 2);

    expect(teamTotals(prototypeBoardWithOngoing(solo)).defence).toBe(5);
    expect(teamTotals(prototypeBoardWithOngoing(paired)).defence).toBe(11);
    expect(teamTotals(paired).defence).toBe(9);
  });

  it('only gives the Cross receiver bonus while the receiver is actually in ATT', () => {
    const receiver = player('receiver', 8, 1, 'ATT', 'cross_receiver');
    const inAttack = deployPlayer(emptyV8Board(), receiver, 'ATT', 1);
    const outOfPosition = deployPlayer(emptyV8Board(), receiver, 'MID', 1);

    expect(prototypeCrossReceiverBonus(inAttack)).toBe(2);
    expect(prototypeCrossReceiverBonus(outOfPosition)).toBe(0);
  });
});
