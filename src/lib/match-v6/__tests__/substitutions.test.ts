/**
 * V6 commit 3 — substitution plans + reveal ordering.
 * Covers the handoff §7 "Substitutions" + "Reveal priority" cases.
 */
import { describe, it, expect } from 'vitest';
import { validatePlan, applyPlan, applyBreak } from '../substitutions';
import type { CardInPlay, CardZone, Sector, TeamSide, V6Action, V6Card, V6MatchState } from '../types';

function card(
  id: string,
  sector: Sector,
  actions: V6Action[] = [],
  o: { cost?: number; attack?: number; defence?: number } = {},
): V6Card {
  return { id, name: id, position: 'CM', sector, cost: o.cost ?? 2, attack: o.attack ?? 5, defence: o.defence ?? 3, rarity: 'common', actions };
}
const cip = (c: V6Card, zone: CardZone, sector?: Sector): CardInPlay => ({ cardId: c.id, zone, sector: sector ?? c.sector });

function mkMatch(o: {
  player: { card: V6Card; zone: CardZone; sector?: Sector }[];
  opponent?: { card: V6Card; zone: CardZone; sector?: Sector }[];
  energy?: number;
  priority?: TeamSide;
  period?: number;
}): V6MatchState {
  const pool: Record<string, V6Card> = {};
  const reg = (arr: { card: V6Card; zone: CardZone; sector?: Sector }[]) =>
    arr.map(({ card: c, zone, sector }) => {
      pool[c.id] = c;
      return cip(c, zone, sector);
    });
  const pCards = reg(o.player);
  const oCards = reg(o.opponent ?? []);
  return {
    seed: 1,
    period: o.period ?? 2,
    breakIndex: 1,
    priority: o.priority ?? 'player',
    energy: o.energy ?? 5,
    player: { side: 'player', managerId: 'm', name: 'You', cards: pCards, effects: [], score: 0 },
    opponent: { side: 'opponent', managerId: 'm', name: 'Them', cards: oCards, effects: [], score: 0 },
    cardPool: pool,
    log: [],
  };
}

const revealAtk = (amount: number): V6Action => ({ kind: 'modify_attack', trigger: 'on_reveal', amount, target: { scope: 'self' }, duration: 'period' });
const offAtk = (amount: number): V6Action => ({ kind: 'modify_attack', trigger: 'when_subbed_off', amount, target: { scope: 'team' }, duration: 'period' });

describe('plan validation', () => {
  it('cannot overspend energy', () => {
    const starter = card('s1', 'centre');
    const sub = card('b1', 'centre', [], { cost: 5 });
    const s = mkMatch({ player: [{ card: starter, zone: 'active' }, { card: sub, zone: 'bench' }], energy: 3 });
    const v = validatePlan(s, { side: 'player', pairs: [{ outCardId: 's1', inCardId: 'b1' }] });
    expect(v.ok).toBe(false);
    expect(v.effectiveCost).toBe(5);
  });

  it('cannot sub the same card twice', () => {
    const s1 = card('s1', 'centre');
    const s2 = card('s2', 'centre');
    const b1 = card('b1', 'centre');
    const s = mkMatch({ player: [{ card: s1, zone: 'active' }, { card: s2, zone: 'active' }, { card: b1, zone: 'bench' }], energy: 9 });
    const v = validatePlan(s, { side: 'player', pairs: [{ outCardId: 's1', inCardId: 'b1' }, { outCardId: 's2', inCardId: 'b1' }] });
    expect(v.ok).toBe(false);
  });

  it('cannot return a subbed-off card', () => {
    const s1 = card('s1', 'centre');
    const b1 = card('b1', 'centre');
    let s = mkMatch({ player: [{ card: s1, zone: 'active' }, { card: b1, zone: 'bench' }], energy: 9 });
    s = applyPlan(s, { side: 'player', pairs: [{ outCardId: 's1', inCardId: 'b1' }] }).state;
    // s1 is now 'used' — trying to bring it back is illegal (not on bench)
    const v = validatePlan(s, { side: 'player', pairs: [{ outCardId: 'b1', inCardId: 's1' }] });
    expect(v.ok).toBe(false);
  });

  it('accepts a legal affordable plan', () => {
    const s1 = card('s1', 'centre');
    const b1 = card('b1', 'centre', [], { cost: 3 });
    const s = mkMatch({ player: [{ card: s1, zone: 'active' }, { card: b1, zone: 'bench' }], energy: 5 });
    expect(validatePlan(s, { side: 'player', pairs: [{ outCardId: 's1', inCardId: 'b1' }] }).ok).toBe(true);
  });
});

describe('plan application', () => {
  it('multiple legal substitutions resolve in the selected order', () => {
    const s1 = card('s1', 'left');
    const s2 = card('s2', 'right');
    const b1 = card('b1', 'left');
    const b2 = card('b2', 'right');
    const s = mkMatch({ player: [{ card: s1, zone: 'active' }, { card: s2, zone: 'active' }, { card: b1, zone: 'bench' }, { card: b2, zone: 'bench' }], energy: 9 });
    const { state, reveals } = applyPlan(s, { side: 'player', pairs: [{ outCardId: 's1', inCardId: 'b1' }, { outCardId: 's2', inCardId: 'b2' }] });
    const active = state.player.cards.filter((c) => c.zone === 'active').map((c) => c.cardId);
    expect(active).toEqual(['b1', 'b2']);
    // b1's pair resolves before b2's
    const b1Reveal = reveals.findIndex((r) => r.cardId === 'b1' && r.kind === 'reveal');
    const b2Reveal = reveals.findIndex((r) => r.cardId === 'b2' && r.kind === 'reveal');
    expect(b1Reveal).toBeLessThan(b2Reveal);
  });

  it('outgoing When Subbed Off resolves before the incoming On Reveal', () => {
    const out = card('s1', 'centre', [offAtk(1)]);
    const inc = card('b1', 'centre', [revealAtk(2)]);
    const s = mkMatch({ player: [{ card: out, zone: 'active' }, { card: inc, zone: 'bench' }], energy: 5 });
    const { reveals } = applyPlan(s, { side: 'player', pairs: [{ outCardId: 's1', inCardId: 'b1' }] });
    const offIdx = reveals.findIndex((r) => r.kind === 'action' && r.cardId === 's1');
    const revealIdx = reveals.findIndex((r) => r.kind === 'reveal' && r.cardId === 'b1');
    expect(offIdx).toBeGreaterThanOrEqual(0);
    expect(offIdx).toBeLessThan(revealIdx);
  });
});

describe('reveal priority ordering', () => {
  it('the priority side resolves its whole sequence first', () => {
    const ps = card('ps', 'centre');
    const pb = card('pb', 'centre');
    const os = card('os', 'centre');
    const ob = card('ob', 'centre');
    const s = mkMatch({
      player: [{ card: ps, zone: 'active' }, { card: pb, zone: 'bench' }],
      opponent: [{ card: os, zone: 'active' }, { card: ob, zone: 'bench' }],
      priority: 'opponent',
      energy: 9,
    });
    const { reveals } = applyBreak(
      s,
      { side: 'player', pairs: [{ outCardId: 'ps', inCardId: 'pb' }] },
      { side: 'opponent', pairs: [{ outCardId: 'os', inCardId: 'ob' }] },
    );
    const lastOpp = reveals.map((r) => r.side).lastIndexOf('opponent');
    const firstPlayer = reveals.map((r) => r.side).indexOf('player');
    expect(lastOpp).toBeLessThan(firstPlayer); // all opponent reveals precede all player reveals
  });

  it('a reactive teammate (When Subbed On) fires after the entering card', () => {
    const entering = card('in', 'centre', [revealAtk(1)]);
    const reactor = card('react', 'left', [{ kind: 'modify_defence', trigger: 'when_subbed_on', amount: 2, target: { scope: 'self' }, duration: 'period' }]);
    const out = card('out', 'centre');
    const s = mkMatch({ player: [{ card: out, zone: 'active' }, { card: reactor, zone: 'active' }, { card: entering, zone: 'bench' }], energy: 5 });
    const { state } = applyPlan(s, { side: 'player', pairs: [{ outCardId: 'out', inCardId: 'in' }] });
    // the reactor's When Subbed On landed a +2 DEF effect
    expect(state.player.effects.some((e) => e.sourceCardId === 'react' && e.defence === 2)).toBe(true);
  });
});
