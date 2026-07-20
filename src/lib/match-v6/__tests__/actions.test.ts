/**
 * V6 commit 2 — action event queue + effect lifecycle.
 * Covers the handoff §7 "Actions" cases and spec B3/B4/B6.
 */
import { describe, it, expect } from 'vitest';
import {
  processTriggers,
  rebuildStandingEffects,
  expirePeriodEffects,
  actionToEffects,
  type TriggerEvent,
} from '../actions';
import type { CardInPlay, CardZone, Sector, V6Action, V6Card, V6MatchState } from '../types';

let cid = 0;
function card(sector: Sector, actions: V6Action[], stats?: { attack?: number; defence?: number }): V6Card {
  const id = `c${cid++}`;
  return {
    id,
    name: id,
    position: 'CM',
    sector,
    cost: 3,
    attack: stats?.attack ?? 5,
    defence: stats?.defence ?? 3,
    rarity: 'common',
    actions,
  };
}
const cip = (c: V6Card, zone: CardZone, sector?: Sector): CardInPlay => ({ cardId: c.id, zone, sector: sector ?? c.sector });

function mkState(cards: { card: V6Card; zone: CardZone; sector?: Sector }[], period = 1): V6MatchState {
  const pool: Record<string, V6Card> = {};
  const pCards = cards.map(({ card: c, zone, sector }) => {
    pool[c.id] = c;
    return cip(c, zone, sector);
  });
  return {
    seed: 1,
    period,
    breakIndex: 0,
    priority: 'player',
    energy: 5,
    player: { side: 'player', managerId: 'm', name: 'You', cards: pCards, effects: [], score: 0 },
    opponent: { side: 'opponent', managerId: 'm', name: 'Them', cards: [], effects: [], score: 0 },
    cardPool: pool,
    log: [],
  };
}
const seed = (c: V6Card, trigger: TriggerEvent['trigger']): TriggerEvent => ({ side: 'player', cardId: c.id, trigger, depth: 0 });

// Action builders
const onRevealAtk = (amount: number, cond?: V6Action['condition']): V6Action =>
  ({ kind: 'modify_attack', trigger: 'on_reveal', amount, target: { scope: 'self' }, duration: 'period', condition: cond });
const ongoingAtk = (amount: number): V6Action =>
  ({ kind: 'modify_attack', trigger: 'ongoing', amount, target: { scope: 'sector' }, duration: 'ongoing' });
const onBenchDef = (amount: number): V6Action =>
  ({ kind: 'modify_defence', trigger: 'on_bench', amount, target: { scope: 'sector' }, duration: 'period' });
const ongoingFaces = (): V6Action =>
  ({ kind: 'improve_die_faces', trigger: 'ongoing', faces: [5, 6], target: { which: 'first_in_sector' }, duration: 'ongoing' });
const reactDef = (): V6Action =>
  ({ kind: 'modify_defence', trigger: 'when_subbed_on', amount: 1, target: { scope: 'self' }, duration: 'period' });

describe('effect lifecycle', () => {
  it('temporary (period) effects expire after the period', () => {
    const a = card('centre', [onRevealAtk(2)]);
    let s = mkState([{ card: a, zone: 'active' }]);
    s = processTriggers(s, [seed(a, 'on_reveal')]).state;
    expect(s.player.effects.filter((e) => e.kind === 'stat')).toHaveLength(1);
    s = expirePeriodEffects(s);
    expect(s.player.effects).toHaveLength(0);
  });

  it('ongoing effects disappear when the source leaves the board', () => {
    const b = card('centre', [ongoingAtk(1)]);
    let s = mkState([{ card: b, zone: 'active' }]);
    s = rebuildStandingEffects(s);
    expect(s.player.effects.filter((e) => e.kind === 'stat')).toHaveLength(1);
    // source subbed off → zone 'used'
    s = { ...s, player: { ...s.player, cards: s.player.cards.map((c) => ({ ...c, zone: 'used' as CardZone })) } };
    s = rebuildStandingEffects(s);
    expect(s.player.effects).toHaveLength(0);
  });

  it('On Bench effect stops the moment the card enters (and its Ongoing starts)', () => {
    const c = card('centre', [onBenchDef(1), ongoingAtk(1)]);
    // Benched: only the On Bench (defence) effect is standing.
    let benched = mkState([{ card: c, zone: 'bench' }]);
    benched = rebuildStandingEffects(benched);
    const bEff = benched.player.effects;
    expect(bEff).toHaveLength(1);
    expect(bEff[0].defence).toBe(1);

    // Active: On Bench is gone, the Ongoing (attack) is now standing.
    let active = mkState([{ card: c, zone: 'active' }]);
    active = rebuildStandingEffects(active);
    const aEff = active.player.effects;
    expect(aEff).toHaveLength(1);
    expect(aEff[0].attack).toBe(1);
  });

  it('a legendary two-action card resolves both actions exactly once', () => {
    const legend = card('centre', [onRevealAtk(2), ongoingFaces()], { attack: 9, defence: 2 });
    let s = mkState([{ card: legend, zone: 'active' }]);
    s = processTriggers(s, [seed(legend, 'on_reveal')]).state; // On Reveal one-shot
    s = rebuildStandingEffects(s); // Ongoing standing
    expect(s.player.effects.filter((e) => e.kind === 'stat')).toHaveLength(1);
    expect(s.player.effects.filter((e) => e.kind === 'faces')).toHaveLength(1);
  });
});

describe('conditions', () => {
  it('a period-gated action does not fire out of its window', () => {
    const p = card('centre', [onRevealAtk(3, { when: 'period_is', period: 4 })]);
    let p1 = mkState([{ card: p, zone: 'active' }], 1);
    p1 = processTriggers(p1, [seed(p, 'on_reveal')]).state;
    expect(p1.player.effects).toHaveLength(0);

    let p4 = mkState([{ card: p, zone: 'active' }], 4);
    p4 = processTriggers(p4, [seed(p, 'on_reveal')]).state;
    expect(p4.player.effects).toHaveLength(1);
  });
});

describe('loop safety', () => {
  it('instance-id guard: the same action fires once even if seeded twice', () => {
    const a = card('centre', [onRevealAtk(2)]);
    const s0 = mkState([{ card: a, zone: 'active' }]);
    const { state, reveals } = processTriggers(s0, [seed(a, 'on_reveal'), seed(a, 'on_reveal')]);
    expect(state.player.effects).toHaveLength(1);
    expect(reveals).toHaveLength(1);
  });

  it('depth guard: reactions past maxDepth are dropped', () => {
    const entering = card('centre', []); // no actions, just triggers reactions on entry
    const reactor = card('left', [reactDef()]);
    const base = mkState([
      { card: entering, zone: 'active' },
      { card: reactor, zone: 'active' },
    ]);

    // maxDepth 0 → the depth-1 reaction never fires.
    const blocked = processTriggers(base, [seed(entering, 'on_reveal')], { maxDepth: 0 });
    expect(blocked.state.player.effects).toHaveLength(0);

    // maxDepth 1 → the reactor's When Subbed On fires.
    const allowed = processTriggers(base, [seed(entering, 'on_reveal')], { maxDepth: 1 });
    expect(allowed.state.player.effects.filter((e) => e.defence === 1)).toHaveLength(1);
  });
});

describe('pure dispatch', () => {
  it('resolves an enemy-directed modifier as onEnemy', () => {
    const antag = card('centre', []);
    const effs = actionToEffects(
      { kind: 'modify_enemy_defence', trigger: 'ongoing', amount: -2, target: { scope: 'sector' }, duration: 'ongoing' },
      { sourceCard: antag, sourceSector: 'centre', side: 'player', period: 1, scoreDiff: 0, instanceId: 'x' },
    );
    expect(effs).toHaveLength(1);
    expect(effs[0].onEnemy).toBe(true);
    expect(effs[0].defence).toBe(-2);
    expect(effs[0].targetSector).toBe('centre');
  });
});
