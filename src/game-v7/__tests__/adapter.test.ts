import { describe, expect, it } from 'vitest';
import type { MatchReceiptEvent } from '@/engine-v7';
import type { Card } from '@/lib/scoring';
import {
  adaptPlayerCard,
  buildBreakPlan,
  buildInitialMatch,
  scriptedOpponentPlan,
  translateReceipts,
  v7Fixture,
} from '@/game-v7';

function liveCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 42,
    name: 'Test Player',
    position: 'CF',
    archetype: 'Finisher',
    power: 84,
    rarity: 'Epic',
    gatePull: 0,
    durability: 'standard',
    ...overrides,
  };
}

describe('card adapter', () => {
  it('adapts a live card into a valid V7 player contract', () => {
    const result = adaptPlayerCard(liveCard());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = result.value;
    expect(card.id).toBe('live-42');
    expect(card.positionCodes).toEqual(['CF']);
    expect(card.naturalSector).toBe('centre');
    expect(card.printedAttack).toBeGreaterThan(card.printedDefence); // CF leans attack
    expect(card.printedAttack).toBeLessThanOrEqual(12);
    expect(card.printedCost).toBeGreaterThanOrEqual(1);
    expect(card.rarity).toBe('epic');
  });

  it('returns a typed error for an unknown position', () => {
    const result = adaptPlayerCard(liveCard({ position: 'SW' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unknown_position');
  });

  it('returns a typed error for missing power', () => {
    const result = adaptPlayerCard(liveCard({ power: Number.NaN }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('missing_field');
  });
});

describe('initial match adapter', () => {
  it('builds a valid initial match from the fixture', () => {
    const result = buildInitialMatch(v7Fixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.value;
    expect(state.period).toBe(1);
    expect(state.player.players.filter((p) => p.zone === 'active')).toHaveLength(11);
    expect(state.opponent.players.filter((p) => p.zone === 'active')).toHaveLength(11);
    // Game-start talisman took effect at kickoff → ledger carries a whole-match effect.
    expect(result.value.ledger.some((e) => e.origin === 'game_start')).toBe(true);
  });
});

describe('lineup adapter', () => {
  const built = buildInitialMatch(v7Fixture());
  const initial = built.ok ? built.value : null;

  it('builds a legal no-op break plan', () => {
    if (!initial) throw new Error('fixture failed');
    const plan = buildBreakPlan('player', initial.state.player, { subs: [] }, 1, initial.registry, initial.state.seed);
    expect(plan.ok).toBe(true);
  });

  it('rejects an over-budget substitution before resolution', () => {
    if (!initial) throw new Error('fixture failed');
    // A cost-4 bench card cannot come on at break 1 (energy 3).
    const activeCf = initial.state.player.players.find((p) => p.zone === 'active' && p.currentSlotKey === 'cf');
    const plan = buildBreakPlan('player', initial.state.player, { subs: [{ outCardId: activeCf!.cardId, inCardId: 'h_b1' }] }, 1, initial.registry, initial.state.seed);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error.code).toBe('illegal_plan');
  });

  it('accepts an affordable substitution', () => {
    if (!initial) throw new Error('fixture failed');
    const activeCf = initial.state.player.players.find((p) => p.zone === 'active' && p.currentSlotKey === 'cf');
    const plan = buildBreakPlan('player', initial.state.player, { subs: [{ outCardId: activeCf!.cardId, inCardId: 'h_b3' }] }, 1, initial.registry, initial.state.seed);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.outgoingCardIds).toContain(activeCf!.cardId);
    expect(plan.value.incomingAssignments[0]!.cardId).toBe('h_b3');
  });

  it('produces a deterministic opponent plan', () => {
    if (!initial) throw new Error('fixture failed');
    const a = scriptedOpponentPlan(initial.state.opponent, 1);
    const b = scriptedOpponentPlan(initial.state.opponent, 1);
    expect(a).toEqual(b);
    expect(a.outgoingCardIds).toEqual([]);
  });
});

describe('receipt translation', () => {
  const receipt = (eventType: string, data: Record<string, unknown> = {}): MatchReceiptEvent => ({
    id: `r-${eventType}`, period: 1, phase: 'test', eventType, message: eventType, data,
  });

  it('maps the core event types', () => {
    const events = translateReceipts([
      receipt('formation_switch'),
      receipt('substitution_on'),
      receipt('movement'),
      receipt('action_activated'),
      receipt('action_fizzled'),
      receipt('action_blocked', { reason: 'disabled' }),
      receipt('game_start_applied'),
      receipt('effect_expired'),
      receipt('chance_cancelled'),
      receipt('chance_missed'),
      receipt('goal_scored'),
      receipt('attribution'),
      receipt('attribution_fizzled'),
      receipt('period_end'),
      receipt('priority_set'),
    ]);
    expect(events.map((e) => e.kind)).toEqual([
      'formation_change', 'substitution', 'movement', 'action_activation', 'action_fizzle',
      'disabled_action', 'effect_applied', 'effect_expired', 'chance_cancelled', 'miss',
      'goal', 'attribution', 'unattributed_goal', 'period_end', 'priority_change',
    ]);
  });

  it('fans a rerolled roll into a die-roll plus a reroll event, preserving order', () => {
    const events = translateReceipts([
      receipt('chance_roll', { rolls: [2, 6], finalRoll: 6, rerollsUsed: 1 }),
      receipt('goal_scored'),
    ]);
    expect(events.map((e) => e.kind)).toEqual(['die_roll', 'reroll', 'goal']);
  });

  it('preserves engine order across many receipts', () => {
    const receipts = Array.from({ length: 10 }, (_, i) => receipt('period_end', { i }));
    const events = translateReceipts(receipts);
    expect(events.map((e) => e.id)).toEqual(receipts.map((r) => r.id));
  });
});
