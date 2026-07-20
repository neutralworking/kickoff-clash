/**
 * V6 commit 3 — full period resolution (the 10 steps composed).
 */
import { describe, it, expect } from 'vitest';
import { resolvePeriod } from '../resolver';
import { rebuildStandingEffects } from '../actions';
import { makeRng } from '../random';
import type { CardInPlay, CardZone, Die, Sector, V6Action, V6Card, V6MatchState } from '../types';

function card(id: string, sector: Sector, actions: V6Action[] = [], o: { attack?: number; defence?: number } = {}): V6Card {
  return { id, name: id, position: 'CM', sector, cost: 3, attack: o.attack ?? 5, defence: o.defence ?? 3, rarity: 'common', actions };
}
const cip = (c: V6Card, sector?: Sector): CardInPlay => ({ cardId: c.id, zone: 'active' as CardZone, sector: sector ?? c.sector });

function mk(player: { card: V6Card; sector?: Sector }[], opponent: { card: V6Card; sector?: Sector }[], period = 1): V6MatchState {
  const pool: Record<string, V6Card> = {};
  const reg = (arr: { card: V6Card; sector?: Sector }[]) =>
    arr.map(({ card: c, sector }) => {
      pool[c.id] = c;
      return cip(c, sector);
    });
  return {
    seed: 1,
    period,
    breakIndex: 0,
    priority: 'player',
    energy: 0,
    player: { side: 'player', managerId: 'm', name: 'You', cards: reg(player), effects: [], score: 0 },
    opponent: { side: 'opponent', managerId: 'm', name: 'Them', cards: reg(opponent), effects: [], score: 0 },
    cardPool: pool,
    log: [],
  };
}

const allFaces = (): V6Action => ({
  kind: 'improve_die_faces',
  trigger: 'ongoing',
  faces: [1, 2, 3, 4, 5, 6] as Die[],
  target: { which: 'all_in_sector' },
  duration: 'ongoing',
});

describe('resolvePeriod', () => {
  it('is deterministic under the same seed', () => {
    const s = mk([{ card: card('p1', 'centre', [], { attack: 12, defence: 2 }) }], [{ card: card('o1', 'centre', [], { attack: 10, defence: 2 }) }]);
    const a = resolvePeriod(s, makeRng(7));
    const b = resolvePeriod(s, makeRng(7));
    expect(a.result.playerGoals).toBe(b.result.playerGoals);
    expect(a.result.opponentGoals).toBe(b.result.opponentGoals);
    expect(a.result.rolls).toEqual(b.result.rolls);
  });

  it('a guaranteed-faces card converts every one of its sector chances', () => {
    // striker: ATT 12 (→ 2 natural chances vs low DEF) with an all-faces ongoing.
    let s = mk(
      [{ card: card('striker', 'centre', [allFaces()], { attack: 12, defence: 0 }) }],
      [{ card: card('o1', 'centre', [], { attack: 0, defence: 3 }) }],
    );
    s = rebuildStandingEffects(s);
    const { result } = resolvePeriod(s, makeRng(1));
    const playerTokens = result.chances.filter((t) => t.side === 'player').length;
    expect(playerTokens).toBeGreaterThan(0);
    expect(result.playerGoals).toBe(playerTokens); // every player chance scored
    expect(result.opponentGoals).toBe(0); // opponent made no chances
  });

  it('applies the out-of-position penalty to the sector total', () => {
    // a natural-left card fielded in centre loses 2 ATT there.
    const s = mk([{ card: card('wide', 'left', [], { attack: 7, defence: 2 }), sector: 'centre' }], [{ card: card('o1', 'centre', [], { attack: 3, defence: 3 }) }]);
    const { state } = resolvePeriod(s, makeRng(1));
    const centre = state.log.find((e) => e.type === 'sector_totals' && e.side === 'player' && e.sector === 'centre');
    expect(centre && centre.type === 'sector_totals' && centre.attack).toBe(5); // 7 − 2
  });

  it('increments the running score and reports next priority', () => {
    let s = mk([{ card: card('striker', 'centre', [allFaces()], { attack: 20, defence: 2 }) }], [{ card: card('o1', 'centre', [], { attack: 0, defence: 0 }) }]);
    s = rebuildStandingEffects(s);
    const { state, result } = resolvePeriod(s, makeRng(3));
    expect(state.player.score).toBe(result.playerGoals);
    expect(result.playerGoals).toBeGreaterThan(0);
    expect(['player', 'opponent']).toContain(result.nextPriority);
  });
});
