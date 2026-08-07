import { describe, expect, it } from 'vitest';
import type {
  ActionEffect,
  ChanceToken,
  PeriodNumber,
  PositionCode,
  RuntimePlayerState,
  Sector,
  TeamSide,
  V7MatchState,
  V7PlayerCard,
  V7TeamState,
} from '../../lib/match-v7/types';
import {
  applyTokenEffects,
  attributeGoal,
  buildLedgerEffects,
  createRng,
  FINAL_PERIOD,
  MAX_REROLLS_PER_TOKEN,
  playMatch,
  processBoundary,
  resolvePeriod,
  resolveTarget,
  rollToken,
  type CardRegistry,
  type ConditionPlayerView,
  type EffectivePlayer,
  type LedgerEffect,
} from '..';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SLOTS: ReadonlyArray<[string, PositionCode, Sector]> = [
  ['gk', 'GK', 'centre'], ['lf', 'LF', 'left'], ['cf', 'CF', 'centre'], ['rf', 'RF', 'right'],
];

function formation() {
  return {
    id: 'f', formationKey: 'f', name: 'f',
    slots: [
      { slotKey: 'gk', positionCode: 'GK' as const, sector: 'centre' as const, xOrder: 0, yOrder: 0, adjacentSlotKeys: [], partnerLinkKeys: [] },
      { slotKey: 'ld', positionCode: 'CB' as const, sector: 'left' as const, xOrder: 1, yOrder: 1, adjacentSlotKeys: [], partnerLinkKeys: [] },
      { slotKey: 'cd', positionCode: 'CB' as const, sector: 'centre' as const, xOrder: 2, yOrder: 2, adjacentSlotKeys: [], partnerLinkKeys: [] },
      { slotKey: 'rd', positionCode: 'CB' as const, sector: 'right' as const, xOrder: 3, yOrder: 3, adjacentSlotKeys: [], partnerLinkKeys: [] },
      { slotKey: 'lf', positionCode: 'LF' as const, sector: 'left' as const, xOrder: 4, yOrder: 4, adjacentSlotKeys: [], partnerLinkKeys: [] },
      { slotKey: 'cf', positionCode: 'CF' as const, sector: 'centre' as const, xOrder: 5, yOrder: 5, adjacentSlotKeys: [], partnerLinkKeys: [] },
      { slotKey: 'rf', positionCode: 'RF' as const, sector: 'right' as const, xOrder: 6, yOrder: 6, adjacentSlotKeys: [], partnerLinkKeys: [] },
    ],
  };
}

function card(id: string, naturalSector: Sector, attack: number, defence: number, positions: PositionCode[]): V7PlayerCard {
  return { id, cardKey: id, name: id, positionCodes: positions, naturalSector, printedAttack: attack, printedDefence: defence, printedCost: 3, role: 'Test', rarity: 'common', actionIds: [] };
}

function activePlayer(cardId: string, slotKey: string, sector: Sector, order: number): RuntimePlayerState {
  return { cardId, deploymentOrder: order, zone: 'active', currentSlotKey: slotKey, currentSector: sector, periodsParticipated: [], mandatoryRemoval: false, actionInstances: [], activeEffectIds: [], accumulatedStacks: {}, currentCost: 3 };
}

function makeTeam(side: TeamSide): V7TeamState {
  return {
    side, managerId: `${side}-mgr`, formationId: 'f', score: 0, cumulativeGrossChances: 0,
    players: [
      activePlayer(`${side}-gk`, 'gk', 'centre', 0),
      activePlayer(`${side}-lf`, 'lf', 'left', 1),
      activePlayer(`${side}-cf`, 'cf', 'centre', 2),
      activePlayer(`${side}-rf`, 'rf', 'right', 3),
    ],
  };
}

function registry(): CardRegistry {
  const cards = new Map<string, V7PlayerCard>();
  for (const side of ['player', 'opponent'] as const) {
    cards.set(`${side}-gk`, card(`${side}-gk`, 'centre', 1, 8, ['GK']));
    cards.set(`${side}-lf`, card(`${side}-lf`, 'left', 9, 2, ['LF']));
    cards.set(`${side}-cf`, card(`${side}-cf`, 'centre', 9, 2, ['CF']));
    cards.set(`${side}-rf`, card(`${side}-rf`, 'right', 9, 2, ['RF']));
  }
  return { cards, actions: new Map(), formations: new Map([['f', formation()]]) };
}

function matchState(period: 1 | 2 | 3 | 4 = 1, priority: TeamSide = 'player'): V7MatchState {
  return { seed: 4242, period, breakIndex: 1, priority, player: makeTeam('player'), opponent: makeTeam('opponent'), receipt: [], resolutionDepth: 0 };
}

function token(side: TeamSide, sector: Sector, order: number, overrides: Partial<ChanceToken> = {}): ChanceToken {
  return {
    id: `t:${side}:${sector}:${order}`,
    side,
    sector,
    origin: 'calculated',
    order,
    minimumGoalRoll: 6,
    rerolls: 0,
    cancelled: false,
    ...overrides,
    chanceType: overrides.chanceType ?? 'box',
  };
}

interface LedgerEffectOptions {
  sector?: Sector;
  tokenTarget?: LedgerEffect['tokenTarget'];
  lifetime?: LedgerEffect['lifetime'];
}

function ledgerEffect(side: TeamSide, effect: ActionEffect, options: LedgerEffectOptions = {}): LedgerEffect {
  const lifetime = options.lifetime ?? { kind: 'period', untilPeriod: 1 };
  return {
    id: `e:${side}:${effect.type}:${options.sector ?? 'all'}:${options.tokenTarget?.side ?? '-'}`,
    side, origin: 'activated', sourceInstanceId: 's', sourceActionId: 'a', sourceCardId: `${side}-cf`, actionName: 'A',
    effect, targetIds: [],
    ...(options.sector ? { sector: options.sector } : {}),
    ...(options.tokenTarget ? { tokenTarget: options.tokenTarget } : {}),
    createdPeriod: 1, createdBreakIndex: 1, lifetime,
  };
}

/** Shorthand for a chance-targeting token effect carrying a preserved target. */
function tokenEffect(
  actingSide: TeamSide,
  effect: ActionEffect,
  target: NonNullable<LedgerEffect['tokenTarget']>,
  sector?: Sector,
): LedgerEffect {
  return ledgerEffect(actingSide, effect, { ...(sector ? { sector } : {}), tokenTarget: target });
}

function eff(cardId: string, sector: Sector, attack: number, overrides: Partial<EffectivePlayer> = {}): EffectivePlayer {
  return { cardId, zone: 'active', sector, naturalSector: sector, attack, defence: 2, cost: 3, outOfPosition: false, emergencyGoalkeeper: false, actionsSuppressed: false, partnerCardIds: [], ...overrides };
}

// ── Rolls + rerolls ──────────────────────────────────────────────────────────

describe('token rolling', () => {
  it('does not roll a cancelled token', () => {
    const roll = rollToken(token('player', 'left', 0, { cancelled: true }), createRng(1, 'r'));
    expect(roll.cancelled).toBe(true);
    expect(roll.rolls).toEqual([]);
    expect(roll.scored).toBe(false);
  });

  it('replays identical rolls for the same seed', () => {
    const a = rollToken(token('player', 'left', 0), createRng(9, 'rolls:1'));
    const b = rollToken(token('player', 'left', 0), createRng(9, 'rolls:1'));
    expect(a).toEqual(b);
  });

  it('consumes rerolls on a miss, records every die, and terminates', () => {
    // Threshold 7 can never be met on a d6, so every reroll is spent.
    const roll = rollToken(token('player', 'left', 0, { minimumGoalRoll: 7, rerolls: 3 }), createRng(5, 'rolls:1'));
    expect(roll.scored).toBe(false);
    expect(roll.rerollsUsed).toBe(3);
    expect(roll.rolls).toHaveLength(4); // original + 3 rerolls
  });

  it('caps rerolls to prevent an unbounded loop', () => {
    const roll = rollToken(token('player', 'left', 0, { minimumGoalRoll: 7, rerolls: 1000 }), createRng(5, 'rolls:1'));
    expect(roll.rerollsUsed).toBe(MAX_REROLLS_PER_TOKEN);
    expect(roll.rolls).toHaveLength(MAX_REROLLS_PER_TOKEN + 1);
  });

  it('accepts the first hit and stops rerolling', () => {
    // seed 4242 / 'rolls:2' opens on a 5, which clears threshold 3 immediately.
    const roll = rollToken(token('player', 'left', 0, { minimumGoalRoll: 3, rerolls: 5 }), createRng(4242, 'rolls:2'));
    expect(roll.scored).toBe(true);
    expect(roll.rerollsUsed).toBe(0);
    expect(roll.rolls).toEqual([5]);
  });
});

// ── Token-level effects ───────────────────────────────────────────────────────

describe('token-level ledger effects', () => {
  const own = { side: 'own' as const, selector: 'all_in_sector' as const };
  const enemyAll = { side: 'enemy' as const, selector: 'all_in_sector' as const };

  it('sets a goal threshold, applying the latest effect in ledger order', () => {
    const tokens = [token('player', 'left', 0)];
    const out = applyTokenEffects(tokens, [
      tokenEffect('player', { type: 'set_goal_threshold', minimumRoll: 3 }, own),
      tokenEffect('player', { type: 'set_goal_threshold', minimumRoll: 5 }, own),
    ], 'player');
    expect(out[0]!.minimumGoalRoll).toBe(5);
  });

  it('adds rerolls to the acting side and restricts by sector', () => {
    const tokens = [token('player', 'left', 0), token('player', 'right', 1)];
    const out = applyTokenEffects(tokens, [tokenEffect('player', { type: 'add_reroll', count: 2 }, own, 'left')], 'player');
    expect(out.find((t) => t.sector === 'left')!.rerolls).toBe(2);
    expect(out.find((t) => t.sector === 'right')!.rerolls).toBe(0);
  });

  it('cancels the opposing side chances (deny) via an enemy-targeted effect', () => {
    const playerTokens = [token('player', 'left', 0), token('player', 'left', 1)];
    // An opponent cancel_chance targeting `enemy` cancels the player's first left token.
    const out = applyTokenEffects(playerTokens, [tokenEffect('opponent', { type: 'cancel_chance', count: 1 }, enemyAll, 'left')], 'player');
    expect(out[0]!.cancelled).toBe(true);
    expect(out[1]!.cancelled).toBe(false);
  });

  it('ignores a token effect that carries no preserved target', () => {
    const out = applyTokenEffects([token('player', 'left', 0)], [ledgerEffect('player', { type: 'set_goal_threshold', minimumRoll: 3 })], 'player');
    expect(out[0]!.minimumGoalRoll).toBe(6);
  });
});

describe('token target ownership + selector', () => {
  it('resolves own to the acting side and enemy to the other side', () => {
    const playerToken = [token('player', 'centre', 0)];
    const opponentToken = [token('opponent', 'centre', 0)];
    const enemyRaise = tokenEffect('player', { type: 'set_goal_threshold', minimumRoll: 7 }, { side: 'enemy', selector: 'all_in_sector' }, 'centre');

    // The player debuffs the opponent's chances — the opponent's threshold rises…
    expect(applyTokenEffects(opponentToken, [enemyRaise], 'opponent')[0]!.minimumGoalRoll).toBe(7);
    // …and the player's own chances are untouched by the same effect.
    expect(applyTokenEffects(playerToken, [enemyRaise], 'player')[0]!.minimumGoalRoll).toBe(6);
  });

  it('first_in_sector hits one deterministic token; all_in_sector hits each', () => {
    const tokens = [token('player', 'centre', 0), token('player', 'centre', 1)];
    const first = applyTokenEffects(tokens, [tokenEffect('player', { type: 'add_reroll', count: 3 }, { side: 'own', selector: 'first_in_sector' }, 'centre')], 'player');
    expect(first.map((t) => t.rerolls)).toEqual([3, 0]);
    const all = applyTokenEffects(tokens, [tokenEffect('player', { type: 'add_reroll', count: 3 }, { side: 'own', selector: 'all_in_sector' }, 'centre')], 'player');
    expect(all.map((t) => t.rerolls)).toEqual([3, 3]);
  });

  it('cancels exactly one token with first_in_sector rather than the whole sector', () => {
    const tokens = [token('player', 'centre', 0), token('player', 'centre', 1)];
    const out = applyTokenEffects(tokens, [tokenEffect('opponent', { type: 'cancel_chance', count: 1 }, { side: 'enemy', selector: 'first_in_sector' }, 'centre')], 'player');
    expect(out.map((t) => t.cancelled)).toEqual([true, false]);
  });

  it('preserves the resolved chance target through effect creation (resolveTarget → buildLedgerEffects)', () => {
    const source: ConditionPlayerView = { cardId: 'c', sector: 'left', attack: 5, defence: 5, cost: 3, partnerCardIds: [] };
    const resolved = resolveTarget(
      { type: 'chance', side: 'enemy', selector: 'first_in_sector', sector: 'left' },
      { source, ownActive: [], enemyActive: [], ownBench: [], enemyBench: [] },
    );
    const effects = buildLedgerEffects(
      { instanceId: 'i', actionId: 'a', cardId: 'c', actionName: 'A', side: 'player', origin: 'activated' },
      [{ type: 'cancel_chance', count: 1 }],
      resolved,
      { period: 2, breakIndex: 1, effectivePeriod: 2 },
      'this_break',
    );
    expect(effects[0]!.tokenTarget).toEqual({ side: 'enemy', selector: 'first_in_sector' });
    expect(effects[0]!.sector).toBe('left');
  });
});

// ── Attribution ────────────────────────────────────────────────────────────

describe('goal attribution', () => {
  it('selects only eligible players (active, can attack, not an emergency keeper)', () => {
    const players = [
      eff('striker', 'centre', 5),
      eff('bench', 'centre', 9, { zone: 'bench' }),
      eff('emergency', 'centre', 0, { emergencyGoalkeeper: true }),
      eff('passenger', 'centre', 0),
    ];
    const result = attributeGoal('player', 'centre', players, createRng(1, 'attr'));
    expect(result.scorerId).toBe('striker');
    expect(result.eligibleIds).toEqual(['striker']);
    expect(result.fizzled).toBe(false);
  });

  it('falls back to any eligible attacker when the sector has none', () => {
    const result = attributeGoal('player', 'left', [eff('centre-only', 'centre', 6)], createRng(1, 'attr'));
    expect(result.scorerId).toBe('centre-only');
  });

  it('fizzles safely when no eligible scorer exists', () => {
    const result = attributeGoal('player', 'centre', [eff('passenger', 'centre', 0), eff('keeper', 'centre', 0, { emergencyGoalkeeper: true })], createRng(1, 'attr'));
    expect(result.fizzled).toBe(true);
    expect(result.scorerId).toBeUndefined();
  });

  it('replays the same scorer for the same seed', () => {
    const pool = [eff('a', 'centre', 5), eff('b', 'centre', 5), eff('c', 'centre', 5)];
    expect(attributeGoal('player', 'centre', pool, createRng(77, 'attr')).scorerId)
      .toBe(attributeGoal('player', 'centre', pool, createRng(77, 'attr')).scorerId);
  });
});

// ── Period resolution ────────────────────────────────────────────────────────

describe('period resolution', () => {
  const baseInput = (chances: Record<TeamSide, ChanceToken[]>, ledger: LedgerEffect[] = []) => ({
    state: matchState(1), ledger, chances, registry: registry(),
  });

  it('scores a chance that clears its threshold and records goal + attribution receipts', () => {
    // Period-1 roll stream (seed 4242) opens 2, 6…; threshold 3 with one reroll scores on the 6.
    const out = resolvePeriod(baseInput({ player: [token('player', 'centre', 0, { minimumGoalRoll: 3, rerolls: 1 })], opponent: [] }));
    expect(out.state.player.score).toBe(1);
    const types = out.receipts.map((event) => event.eventType);
    expect(types).toEqual(expect.arrayContaining(['chance_roll', 'goal_scored', 'attribution']));
  });

  it('misses an impossible chance and records a miss receipt', () => {
    const out = resolvePeriod(baseInput({ player: [token('player', 'centre', 0, { minimumGoalRoll: 7 })], opponent: [] }));
    expect(out.state.player.score).toBe(0);
    expect(out.receipts.some((event) => event.eventType === 'chance_missed')).toBe(true);
    expect(out.receipts.some((event) => event.eventType === 'goal_scored')).toBe(false);
  });

  it('never rolls a cancelled token', () => {
    const out = resolvePeriod(baseInput({ player: [token('player', 'centre', 0, { cancelled: true, minimumGoalRoll: 3 })], opponent: [] }));
    expect(out.tokenOutcomes[0]!.rolls).toEqual([]);
    expect(out.state.player.score).toBe(0);
    expect(out.receipts.some((event) => event.eventType === 'chance_cancelled')).toBe(true);
    expect(out.receipts.some((event) => event.eventType === 'chance_roll')).toBe(false);
  });

  it('updates score immutably', () => {
    const input = baseInput({ player: [token('player', 'centre', 0, { minimumGoalRoll: 3, rerolls: 1 })], opponent: [] });
    const before = input.state.player.score;
    const out = resolvePeriod(input);
    expect(before).toBe(0);
    expect(input.state.player.score).toBe(0); // original untouched
    expect(out.state.player.score).toBe(1);
    expect(out.state).not.toBe(input.state);
  });

  it('applies a threshold-lowering ledger effect before rolling', () => {
    // Threshold 7 can never be met; lowering it to 3 lets the reroll (a 6) score.
    const chances = { player: [token('player', 'centre', 0, { minimumGoalRoll: 7, rerolls: 1 })], opponent: [] };
    expect(resolvePeriod(baseInput(chances)).state.player.score).toBe(0);
    const lower = tokenEffect('player', { type: 'set_goal_threshold', minimumRoll: 3 }, { side: 'own', selector: 'all_in_sector' }, 'centre');
    const out = resolvePeriod(baseInput(chances, [lower]));
    expect(out.state.player.score).toBe(1);
  });

  it('orders tokens stably and replays identically for the same seed and inputs', () => {
    const chances = {
      player: [token('player', 'right', 1, { minimumGoalRoll: 3 }), token('player', 'left', 0, { minimumGoalRoll: 3 })],
      opponent: [token('opponent', 'centre', 0, { minimumGoalRoll: 3 })],
    };
    const first = resolvePeriod(baseInput(chances));
    const second = resolvePeriod(baseInput(chances));
    expect(first.tokenOutcomes).toEqual(second.tokenOutcomes);
    expect(first.receipts).toEqual(second.receipts);
    expect(first.goals).toEqual(second.goals);
    // Player left (order 0) rolls before player right (order 1) before opponent.
    expect(first.tokenOutcomes.map((outcome) => outcome.tokenId)).toEqual([
      't:player:left:0', 't:player:right:1', 't:opponent:centre:0',
    ]);
  });

  it('refuses to resolve beyond the final period', () => {
    const state: V7MatchState = { ...matchState(FINAL_PERIOD), period: (FINAL_PERIOD + 1) as unknown as PeriodNumber };
    expect(() => resolvePeriod({ state, ledger: [], chances: { player: [], opponent: [] }, registry: registry() })).toThrow();
  });
});

// ── Boundary ────────────────────────────────────────────────────────────────

describe('boundary processing', () => {
  it('expires period-scoped effects and keeps match effects', () => {
    const periodEffect = ledgerEffect('player', { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 1 }, { sector: 'left', lifetime: { kind: 'period', untilPeriod: 1 } });
    const matchEffect = ledgerEffect('player', { type: 'modify_stat', stat: 'defence', mode: 'flat', amount: 1 }, { sector: 'right', lifetime: { kind: 'match' } });
    const result = processBoundary(matchState(1), [periodEffect, matchEffect], registry());
    expect(result.expired.map((effect) => effect.id)).toEqual([periodEffect.id]);
    expect(result.ledger.map((effect) => effect.id)).toEqual([matchEffect.id]);
  });

  it('recomputes priority for the next break', () => {
    // Player forwards (attack 9) beat opponent forwards on every sector → player priority.
    const state: V7MatchState = { ...matchState(1, 'opponent') };
    const result = processBoundary(state, [], registry());
    expect(result.priority).toBe('player');
    expect(result.state.priority).toBe('player');
    expect(result.receipts.some((event) => event.eventType === 'priority_set')).toBe(true);
  });

  it('marks the match over at the final period and not before', () => {
    expect(processBoundary(matchState(1), [], registry()).matchOver).toBe(false);
    expect(processBoundary(matchState(FINAL_PERIOD), [], registry()).matchOver).toBe(true);
  });
});

// ── Match loop ────────────────────────────────────────────────────────────────

describe('match loop', () => {
  it('plays a full four-period match and reports the match over', () => {
    const result = playMatch({ state: matchState(1), registry: registry() });
    expect(result.snapshots).toHaveLength(FINAL_PERIOD);
    expect(result.snapshots.map((snapshot) => snapshot.period)).toEqual([1, 2, 3, 4]);
    expect(result.matchOver).toBe(true);
    expect(result.state.period).toBe(FINAL_PERIOD);
  });

  it('replays a complete match deterministically from the seed and supplied plans', () => {
    const first = playMatch({ state: matchState(1), registry: registry() });
    const second = playMatch({ state: matchState(1), registry: registry() });
    expect(first.finalScore).toEqual(second.finalScore);
    expect(first.receipts).toEqual(second.receipts);
    expect(first.snapshots).toEqual(second.snapshots);
  });

  it('produces end-of-period snapshots carrying score, outcomes, lineup, effective stats and ledger', () => {
    const snapshot = playMatch({ state: matchState(1), registry: registry() }).snapshots[0]!;
    expect(snapshot.score).toHaveProperty('player');
    expect(snapshot.lineup.player.length).toBeGreaterThan(0);
    expect(snapshot.effective.player.length).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.tokenOutcomes)).toBe(true);
    expect(Array.isArray(snapshot.ledger)).toBe(true);
  });
});