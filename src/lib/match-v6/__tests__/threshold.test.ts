/**
 * V6 commit 1 — threshold resolution + out-of-position penalty.
 * Covers the handoff §7 "Threshold resolution" cases and spec A3.
 */
import { describe, it, expect } from 'vitest';
import { naturalChances, capNaturalChances, sectorCeiling } from '../resolver';
import { cardReceipt, buildBoard, sectorControl, type ActivePlacement } from '../board';
import { V6_BALANCE } from '../balance';
import type { ActiveEffect, Sector, V6Card } from '../types';

function card(partial: Partial<V6Card> & Pick<V6Card, 'id' | 'sector'>): V6Card {
  return {
    name: partial.id,
    position: 'CM',
    cost: 3,
    attack: 5,
    defence: 3,
    rarity: 'common',
    actions: [],
    ...partial,
  } as V6Card;
}
const place = (c: V6Card, sector: Sector): ActivePlacement => ({ card: c, sector });

describe('threshold → chances', () => {
  it('19 ATT creates 3 chances', () => {
    expect(naturalChances(19, 0).created).toBe(3);
  });
  it('20 ATT creates 4 chances', () => {
    expect(naturalChances(20, 0).created).toBe(4);
  });
  it('14 DEF cancels 2', () => {
    expect(naturalChances(100, 14).cancelled).toBe(2);
  });
  it('15 DEF cancels 3', () => {
    expect(naturalChances(100, 15).cancelled).toBe(3);
  });
  it('cancellation floors remaining at zero', () => {
    const r = naturalChances(15, 100); // created 3, cancelled 20
    expect(r.created).toBe(3);
    expect(r.cancelled).toBe(20);
    expect(r.remaining).toBe(0);
  });
  it('a clean example nets out: 24 ATT vs 17 DEF → 4 created, 3 cancelled, 1 remains', () => {
    const r = naturalChances(24, 17);
    expect(r).toEqual({ created: 4, cancelled: 3, remaining: 1 });
  });
});

describe('natural cap', () => {
  it('caps natural chances at 4 per sector', () => {
    expect(capNaturalChances(10)).toBe(4);
    expect(capNaturalChances(4)).toBe(4);
    expect(capNaturalChances(3)).toBe(3);
  });
  it('action-created chances may exceed the natural cap by one', () => {
    expect(sectorCeiling(false)).toBe(V6_BALANCE.naturalChanceCapPerSector);
    expect(sectorCeiling(true)).toBe(V6_BALANCE.naturalChanceCapPerSector + 1);
  });
});

describe('out-of-position penalty (A3)', () => {
  it('a card in its natural sector takes no penalty', () => {
    const c = card({ id: 'winger', sector: 'left', attack: 7, defence: 2 });
    const r = cardReceipt(place(c, 'left'), []);
    expect(r.outOfPosition).toBe(false);
    expect(r.attack).toBe(7);
    expect(r.defence).toBe(2);
    expect(r.mods).toHaveLength(0);
  });
  it('a card in a foreign sector loses the flat penalty', () => {
    const c = card({ id: 'winger', sector: 'left', attack: 7, defence: 2 });
    const r = cardReceipt(place(c, 'centre'), []);
    expect(r.outOfPosition).toBe(true);
    expect(r.attack).toBe(7 - V6_BALANCE.outOfPositionPenalty.attack);
    expect(r.defence).toBe(2 - V6_BALANCE.outOfPositionPenalty.defence);
    expect(r.mods[0].label).toBe('Out of position');
  });
  it('a stat effect stacks onto the receipt in order', () => {
    const c = card({ id: 'cf', sector: 'centre', attack: 9, defence: 2 });
    const buff: ActiveEffect = {
      id: 'e1',
      sourceCardId: 'boss',
      sourceLabel: 'Gaffer · Ongoing',
      kind: 'stat',
      onEnemy: false,
      attack: 2,
      targetSector: 'centre',
      duration: 'ongoing',
      createdPeriod: 1,
    };
    const r = cardReceipt(place(c, 'centre'), [buff]);
    expect(r.attack).toBe(11);
    expect(r.mods).toHaveLength(1);
    expect(r.mods[0]).toEqual({ label: 'Gaffer · Ongoing', attack: 2, defence: 0 });
  });
});

describe('board totals + sector control', () => {
  it('sums a sector and picks the stronger controller', () => {
    const mine = buildBoard(
      [
        place(card({ id: 'a', sector: 'centre', attack: 8, defence: 2 }), 'centre'),
        place(card({ id: 'b', sector: 'centre', attack: 4, defence: 3 }), 'centre'),
      ],
      [],
    );
    const theirs = buildBoard([place(card({ id: 'x', sector: 'centre', attack: 3, defence: 3 }), 'centre')], []);
    expect(mine.centre.attack).toBe(12);
    expect(mine.centre.defence).toBe(5);
    const control = sectorControl(mine, theirs);
    expect(control.bySector.centre).toBe('player');
    expect(control.controlled.player).toBe(1);
  });
});
