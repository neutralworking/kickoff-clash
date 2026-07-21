/**
 * V6 commit 3 — reveal priority from sector control (spec B5).
 */
import { describe, it, expect } from 'vitest';
import { nextPriority, initialPriority } from '../priority';
import { buildBoard, type ActivePlacement } from '../board';
import type { Sector, V6Card } from '../types';

const card = (id: string, sector: Sector, attack: number, defence: number): V6Card => ({
  id,
  name: id,
  position: 'CM',
  sector,
  cost: 3,
  attack,
  defence,
  rarity: 'common',
  actions: [],
});
const P = (c: V6Card, sector: Sector): ActivePlacement => ({ card: c, sector });

describe('nextPriority', () => {
  it('goes to the side controlling more sectors', () => {
    const player = buildBoard([P(card('a', 'left', 8, 4), 'left'), P(card('b', 'centre', 8, 4), 'centre')], []);
    const opp = buildBoard([P(card('z', 'right', 9, 9), 'right')], []);
    // player controls left + centre (2), opponent controls right (1)
    expect(nextPriority(player, opp, 'opponent')).toBe('player');
  });

  it('breaks a 1–1 sector tie on total strength', () => {
    const player = buildBoard([P(card('pl', 'left', 5, 5), 'left'), P(card('pc', 'centre', 3, 3), 'centre')], []); // left 10, centre 6
    const opp = buildBoard([P(card('or', 'right', 4, 4), 'right'), P(card('oc', 'centre', 3, 3), 'centre')], []); // right 8, centre 6
    // left→player, right→opponent, centre tie ⇒ 1–1; totals 16 vs 14 ⇒ player
    expect(nextPriority(player, opp, 'opponent')).toBe('player');
  });

  it('falls back to alternating when everything is level', () => {
    const player = buildBoard([P(card('pl', 'left', 4, 4), 'left'), P(card('pc', 'centre', 2, 2), 'centre')], []); // left 8, centre 4
    const opp = buildBoard([P(card('or', 'right', 4, 4), 'right'), P(card('oc', 'centre', 2, 2), 'centre')], []); // right 8, centre 4
    // 1–1 sectors, 12 vs 12 totals ⇒ alternate from previous
    expect(nextPriority(player, opp, 'player')).toBe('opponent');
    expect(nextPriority(player, opp, 'opponent')).toBe('player');
  });
});

describe('initialPriority', () => {
  it('is deterministic per seed', () => {
    expect(initialPriority(5)).toBe(initialPriority(5));
    expect(['player', 'opponent']).toContain(initialPriority(999));
  });
});
