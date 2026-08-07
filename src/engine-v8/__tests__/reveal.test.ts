import { describe, expect, it } from 'vitest';
import { deployPlayer, emptyV8Board, revealPriority, type V8PlayerCard } from '..';

function player(id: string, attack: number, defence: number, zone: 'DEF' | 'MID' | 'ATT'): V8PlayerCard {
  return {
    id,
    name: id,
    position: zone === 'DEF' ? 'CB' : zone === 'MID' ? 'CM' : 'CF',
    printedAttack: attack,
    printedDefence: defence,
    cost: 3,
    naturalZones: [zone],
  };
}

describe('V8 reveal priority', () => {
  it('gives reveal priority to the team leading the match', () => {
    expect(revealPriority(2, 1, emptyV8Board(), emptyV8Board(), 1)).toEqual({
      first: 'home',
      second: 'away',
      reason: 'score',
    });
    expect(revealPriority(0, 3, emptyV8Board(), emptyV8Board(), 1).first).toBe('away');
  });

  it('uses current ATT edge over opposing DEF when the score is level', () => {
    const home = deployPlayer(emptyV8Board(), player('home-att', 8, 0, 'ATT'), 'ATT', 1);
    const away = deployPlayer(emptyV8Board(), player('away-att', 4, 0, 'ATT'), 'ATT', 1);

    expect(revealPriority(1, 1, home, away, 1)).toEqual({
      first: 'home',
      second: 'away',
      reason: 'attack_edge',
    });
  });

  it('uses total board strength when ATT edge is tied', () => {
    let home = deployPlayer(emptyV8Board(), player('home-att', 6, 0, 'ATT'), 'ATT', 1);
    home = deployPlayer(home, player('home-def', 0, 4, 'DEF'), 'DEF', 2);
    let away = deployPlayer(emptyV8Board(), player('away-att', 6, 0, 'ATT'), 'ATT', 1);
    away = deployPlayer(away, player('away-def', 0, 2, 'DEF'), 'DEF', 2);

    // Both attack edges are 4, but home has the stronger total board.
    expect(revealPriority(0, 0, home, away, 1)).toEqual({
      first: 'home',
      second: 'away',
      reason: 'board_strength',
    });
  });

  it('uses a deterministic seeded tiebreak when every visible metric is tied', () => {
    const first = revealPriority(0, 0, emptyV8Board(), emptyV8Board(), 8082026);
    const replay = revealPriority(0, 0, emptyV8Board(), emptyV8Board(), 8082026);
    const otherSeed = revealPriority(0, 0, emptyV8Board(), emptyV8Board(), 8082027);

    expect(first).toEqual(replay);
    expect(first.reason).toBe('tiebreak');
    expect(otherSeed.reason).toBe('tiebreak');
    expect(first.first).not.toBe(otherSeed.first);
  });
});
