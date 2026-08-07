import { teamTotals, type V8Board } from './core';

export type V8Side = 'home' | 'away';
export type V8RevealPriorityReason = 'score' | 'attack_edge' | 'board_strength' | 'tiebreak';

export interface V8RevealPriority {
  first: V8Side;
  second: V8Side;
  reason: V8RevealPriorityReason;
}

function opposite(side: V8Side): V8Side {
  return side === 'home' ? 'away' : 'home';
}

/**
 * V8 reveal priority:
 * 1. The team leading the match reveals first.
 * 2. If level, compare each team's current ATT edge over the opposing DEF.
 * 3. If still level, compare total current board strength (ATT + DEF).
 * 4. A seeded deterministic tiebreak resolves a complete tie.
 *
 * Priority is established before the period's hidden commitments reveal and remains fixed
 * for that reveal window. The first side reveals all committed cards in play order, then
 * the second side reveals all committed cards in play order.
 */
export function revealPriority(
  homeScore: number,
  awayScore: number,
  homeBoard: V8Board,
  awayBoard: V8Board,
  seed: number,
): V8RevealPriority {
  if (homeScore !== awayScore) {
    const first: V8Side = homeScore > awayScore ? 'home' : 'away';
    return { first, second: opposite(first), reason: 'score' };
  }

  const home = teamTotals(homeBoard);
  const away = teamTotals(awayBoard);
  const homeAttackEdge = home.attack - away.defence;
  const awayAttackEdge = away.attack - home.defence;

  if (homeAttackEdge !== awayAttackEdge) {
    const first: V8Side = homeAttackEdge > awayAttackEdge ? 'home' : 'away';
    return { first, second: opposite(first), reason: 'attack_edge' };
  }

  const homeStrength = home.attack + home.defence;
  const awayStrength = away.attack + away.defence;
  if (homeStrength !== awayStrength) {
    const first: V8Side = homeStrength > awayStrength ? 'home' : 'away';
    return { first, second: opposite(first), reason: 'board_strength' };
  }

  const mixed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  const first: V8Side = mixed % 2 === 0 ? 'home' : 'away';
  return { first, second: opposite(first), reason: 'tiebreak' };
}
