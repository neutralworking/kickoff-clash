import { describe, expect, it } from 'vitest';
import type {
  ActionCondition,
  ActionEffect,
  RuntimeActionInstance,
  V7ActionDefinition,
} from '../../lib/match-v7/types';
import {
  activateAction,
  buildLedgerEffects,
  consumeCharge,
  copyActionInstance,
  createActionInstance,
  createRng,
  disableActionInstance,
  dispatchGameStart,
  effectSurvives,
  enableActionInstance,
  expireLedger,
  filterActiveEffects,
  instantiatePlayerActions,
  rebuildOngoing,
  resetBreakActivations,
  type ActivationContext,
  type ConditionContext,
  type ConditionPlayerView,
  type EffectSource,
  type LedgerEffect,
  type TargetContext,
} from '..';

// ── Fixtures ────────────────────────────────────────────────────────────────

function defineAction(overrides: Partial<V7ActionDefinition> = {}): V7ActionDefinition {
  return {
    id: 'act-1',
    actionKey: 'act_1',
    name: 'Test Action',
    displayText: '',
    ownerType: 'player',
    timing: 'activated',
    conditionGroups: [],
    target: { type: 'self' },
    effects: [{ type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 2 }],
    duration: 'current_period',
    activationLimitPerBreak: 1,
    isNegative: false,
    copyRules: {},
    disableRules: {},
    engineSupportStatus: 'supported',
    ...overrides,
  };
}

const SOURCE: ConditionPlayerView = {
  cardId: 'p1',
  position: 'CM',
  sector: 'centre',
  attack: 9,
  defence: 4,
  cost: 3,
  partnerCardIds: [],
};

function conditionCtx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return {
    period: 2,
    ownScore: 0,
    enemyScore: 0,
    formationKey: 'test',
    source: SOURCE,
    ownActive: [SOURCE],
    occupiedSlotKeys: [],
    ...overrides,
  };
}

function targetCtx(overrides: Partial<TargetContext> = {}): TargetContext {
  return { source: SOURCE, ownActive: [SOURCE], enemyActive: [], ownBench: [], enemyBench: [], ...overrides };
}

function activationCtx(overrides: Partial<ActivationContext> = {}): ActivationContext {
  return {
    side: 'player',
    coords: { period: 1, breakIndex: 1 },
    effectivePeriod: 2,
    conditionContext: conditionCtx(),
    targetContext: targetCtx(),
    ...overrides,
  };
}

function statAmount(effect: LedgerEffect): number {
  const inner = effect.effect;
  return inner.type === 'modify_stat' ? inner.amount : Number.NaN;
}

// ── Charges + instances ──────────────────────────────────────────────────────

describe('printed charge initialization', () => {
  it('seeds remaining charges from the printed count', () => {
    const instance = createActionInstance(defineAction({ printedCharges: 2 }), { cardId: 'p1' });
    expect(instance.remainingCharges).toBe(2);
    expect(instance.activationCountThisBreak).toBe(0);
    expect(instance.currentOwnerCardId).toBe('p1');
    expect(instance.originalSourceCardId).toBe('p1');
  });

  it('leaves an uncharged action with no charge limit', () => {
    const instance = createActionInstance(defineAction({ printedCharges: undefined }), { cardId: 'p1' });
    expect(instance.remainingCharges).toBeUndefined();
  });

  it('instantiates every action a card carries, in order', () => {
    const card = {
      id: 'p1',
      cardKey: 'p1',
      name: 'P1',
      positionCodes: ['CM' as const],
      naturalSector: 'centre' as const,
      printedAttack: 5,
      printedDefence: 5,
      printedCost: 3,
      role: 'Test',
      rarity: 'common' as const,
      actionIds: ['a', 'b', 'missing'],
    };
    const registry = new Map<string, V7ActionDefinition>([
      ['a', defineAction({ id: 'a', printedCharges: 1 })],
      ['b', defineAction({ id: 'b', printedCharges: 3 })],
    ]);
    const instances = instantiatePlayerActions(card, registry);
    expect(instances.map((instance) => instance.printedActionId)).toEqual(['a', 'b']);
    expect(instances.map((instance) => instance.remainingCharges)).toEqual([1, 3]);
  });
});

describe('copied actions have independent charges', () => {
  it('gives a copy its own printed charges and preserves original provenance', () => {
    const action = defineAction({ printedCharges: 1 });
    const original = createActionInstance(action, { cardId: 'p1' });
    const copy = copyActionInstance(original, action, 'p2', { period: 1, breakIndex: 1 });

    expect(copy.remainingCharges).toBe(1);
    expect(copy.currentOwnerCardId).toBe('p2');
    expect(copy.immediateSourceCardId).toBe('p1');
    expect(copy.originalSourceCardId).toBe('p1');
    expect(copy.instanceId).not.toBe(original.instanceId);
  });

  it('depleting a copy never touches the original', () => {
    const action = defineAction({ printedCharges: 1 });
    const original = createActionInstance(action, { cardId: 'p1' });
    const copy = copyActionInstance(original, action, 'p2', { period: 1, breakIndex: 1 });

    const spentCopy = consumeCharge(copy);
    expect(spentCopy.remainingCharges).toBe(0);
    expect(copy.remainingCharges).toBe(1);
    expect(original.remainingCharges).toBe(1);
  });
});

// ── Activation gates ─────────────────────────────────────────────────────────

describe('once-per-break activation', () => {
  it('lets one instance activate only once per break', () => {
    const action = defineAction({ printedCharges: 3 });
    const instance = createActionInstance(action, { cardId: 'p1' });

    const first = activateAction(instance, action, activationCtx());
    expect(first.outcome).toBe('activated');
    expect(first.instance.activationCountThisBreak).toBe(1);
    expect(first.instance.remainingCharges).toBe(2);

    const second = activateAction(first.instance, action, activationCtx());
    expect(second.outcome).toBe('blocked');
    expect(second.reason).toBe('already_activated_this_break');
    expect(second.effects).toEqual([]);
    expect(second.instance.remainingCharges).toBe(2);
  });

  it('lets different instances each activate in the same break', () => {
    const a = defineAction({ id: 'a', name: 'A' });
    const b = defineAction({ id: 'b', name: 'B' });
    const ia = createActionInstance(a, { cardId: 'p1' });
    const ib = createActionInstance(b, { cardId: 'p1' });

    expect(activateAction(ia, a, activationCtx()).outcome).toBe('activated');
    expect(activateAction(ib, b, activationCtx()).outcome).toBe('activated');
  });

  it('resets the once-per-break flag at a break boundary', () => {
    const action = defineAction({ printedCharges: 3 });
    const instance = createActionInstance(action, { cardId: 'p1' });
    const [reset] = resetBreakActivations([activateAction(instance, action, activationCtx()).instance]);
    expect(reset!.activationCountThisBreak).toBe(0);
    expect(activateAction(reset!, action, activationCtx()).outcome).toBe('activated');
  });
});

describe('charge consumption on activation', () => {
  it('spends a charge only on a successful activation', () => {
    const action = defineAction({ printedCharges: 2 });
    const instance = createActionInstance(action, { cardId: 'p1' });
    expect(activateAction(instance, action, activationCtx()).instance.remainingCharges).toBe(1);
  });

  it('does not spend a charge on a fizzle', () => {
    const action = defineAction({
      printedCharges: 2,
      conditionGroups: [{ group: 1, conditions: [{ type: 'score_state', state: 'winning' }] }],
    });
    const instance = createActionInstance(action, { cardId: 'p1' });
    const result = activateAction(instance, action, activationCtx({
      conditionContext: conditionCtx({ ownScore: 0, enemyScore: 1 }),
    }));
    expect(result.outcome).toBe('fizzled');
    expect(result.instance.remainingCharges).toBe(2);
  });

  it('blocks an activation with no charges left and spends nothing', () => {
    const action = defineAction({ printedCharges: 1 });
    const empty: RuntimeActionInstance = { ...createActionInstance(action, { cardId: 'p1' }), remainingCharges: 0 };
    const result = activateAction(empty, action, activationCtx());
    expect(result.outcome).toBe('blocked');
    expect(result.reason).toBe('no_charges');
    expect(result.instance.remainingCharges).toBe(0);
  });
});

describe('fizzle receipts', () => {
  it('fizzles with a receipt when conditions fail', () => {
    const action = defineAction({ conditionGroups: [{ group: 1, conditions: [{ type: 'period_is', period: 4 }] }] });
    const result = activateAction(createActionInstance(action, { cardId: 'p1' }), action, activationCtx({
      conditionContext: conditionCtx({ period: 2 }),
    }));
    expect(result.outcome).toBe('fizzled');
    expect(result.reason).toBe('condition_failed');
    expect(result.receipt.eventType).toBe('action_fizzled');
    expect(result.effects).toEqual([]);
  });

  it('fizzles with a receipt when a required target resolves empty', () => {
    const action = defineAction({
      target: { type: 'ranked_players', side: 'enemy', direction: 'strongest', measure: 'attack', count: 1 },
    });
    const result = activateAction(createActionInstance(action, { cardId: 'p1' }), action, activationCtx({
      targetContext: targetCtx({ enemyActive: [] }),
    }));
    expect(result.outcome).toBe('fizzled');
    expect(result.reason).toBe('invalid_target');
    expect(result.receipt.eventType).toBe('action_fizzled');
    expect(result.effects).toEqual([]);
  });
});

describe('disabled actions cannot trigger', () => {
  it('blocks an activation of a disabled instance without an effect or charge cost', () => {
    const action = defineAction({ printedCharges: 1 });
    const disabled = disableActionInstance(createActionInstance(action, { cardId: 'p1' }), { matchEnd: true });
    const result = activateAction(disabled, action, activationCtx());
    expect(result.outcome).toBe('blocked');
    expect(result.reason).toBe('disabled');
    expect(result.effects).toEqual([]);
    expect(result.instance.remainingCharges).toBe(1);
  });

  it('does not dispatch a disabled Game Start action', () => {
    const action = defineAction({ timing: 'game_start', duration: 'whole_match' });
    const disabled = disableActionInstance(createActionInstance(action, { cardId: 'p1' }), { matchEnd: true });
    const result = dispatchGameStart(
      [{ instance: disabled, action, conditionContext: conditionCtx({ period: 1 }), targetContext: targetCtx() }],
      'player',
    );
    expect(result.effects).toEqual([]);
    expect(result.receipts[0]!.eventType).toBe('action_blocked');
  });
});

// ── Game Start dispatch ──────────────────────────────────────────────────────

describe('Game Start dispatch', () => {
  it('applies game_start effects once and ignores other timings', () => {
    const gs = defineAction({ id: 'gs', name: 'Kickoff Boost', timing: 'game_start', duration: 'whole_match' });
    const other = defineAction({ id: 'act', name: 'Break Action', timing: 'activated' });
    const gsInst = createActionInstance(gs, { cardId: 'p1' });
    const otherInst = createActionInstance(other, { cardId: 'p2' });

    const result = dispatchGameStart(
      [
        { instance: gsInst, action: gs, conditionContext: conditionCtx({ period: 1 }), targetContext: targetCtx() },
        { instance: otherInst, action: other, conditionContext: conditionCtx({ period: 1 }), targetContext: targetCtx() },
      ],
      'player',
    );

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]!.origin).toBe('game_start');
    expect(result.effects[0]!.lifetime).toEqual({ kind: 'match' });
    expect(result.receipts.map((event) => event.eventType)).toEqual(['game_start_applied']);
  });
});

// ── Ongoing rebuilds + disable/pause ─────────────────────────────────────────

describe('ongoing effect rebuilds', () => {
  const ongoing = defineAction({
    id: 'ong',
    name: 'Aura',
    timing: 'ongoing',
    duration: 'ongoing',
    target: { type: 'self' },
    effects: [{ type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 3 }],
  });

  it('rebuilds ongoing effects from live state each period', () => {
    const instance = createActionInstance(ongoing, { cardId: 'p1' });
    const entry = { instance, action: ongoing, conditionContext: conditionCtx(), targetContext: targetCtx() };

    const first = rebuildOngoing([], [entry], 'player', { period: 1, breakIndex: 0 });
    expect(first.effects).toHaveLength(1);
    expect(first.effects[0]!.lifetime).toEqual({ kind: 'while_active' });

    // A second rebuild clears the previous ongoing record and regenerates it —
    // no accumulation of stale effects.
    const second = rebuildOngoing(first.ledger, [entry], 'player', { period: 2, breakIndex: 0 });
    expect(second.ledger.filter((effect) => effect.origin === 'ongoing' && effect.side === 'player')).toHaveLength(1);
  });

  it('makes an ongoing effect disappear while its source is disabled', () => {
    const instance = createActionInstance(ongoing, { cardId: 'p1' });
    const enabled = rebuildOngoing([], [
      { instance, action: ongoing, conditionContext: conditionCtx(), targetContext: targetCtx() },
    ], 'player', { period: 2, breakIndex: 0 });
    expect(enabled.effects).toHaveLength(1);

    const disabled = disableActionInstance(instance, { matchEnd: true });
    const rebuilt = rebuildOngoing(enabled.ledger, [
      { instance: disabled, action: ongoing, conditionContext: conditionCtx(), targetContext: targetCtx() },
    ], 'player', { period: 3, breakIndex: 0 });

    expect(rebuilt.effects).toEqual([]);
    expect(rebuilt.ledger.filter((effect) => effect.origin === 'ongoing' && effect.side === 'player')).toEqual([]);
    expect(rebuilt.receipts[0]!.eventType).toBe('ongoing_suppressed');
  });

  it('hides while-active effects from a disabled source at read time too', () => {
    const instance = createActionInstance(ongoing, { cardId: 'p1' });
    const { ledger } = rebuildOngoing([], [
      { instance, action: ongoing, conditionContext: conditionCtx(), targetContext: targetCtx() },
    ], 'player', { period: 1, breakIndex: 0 });
    expect(filterActiveEffects(ledger, new Set([instance.instanceId]))).toEqual([]);
    expect(filterActiveEffects(ledger, new Set())).toHaveLength(1);
  });
});

describe('paused Glass progress resumes after re-enable', () => {
  const glass = defineAction({
    id: 'glass',
    name: 'Glass',
    timing: 'ongoing',
    duration: 'ongoing',
    target: { type: 'self' },
    effects: [{ type: 'modify_stat', stat: 'defence', mode: 'flat', amount: -1 }],
  });

  it('freezes progress while disabled and resumes it on re-enable', () => {
    let instance = createActionInstance(glass, { cardId: 'p1' }, { runtimeState: { accrues: true, progress: 0 } });
    let ledger: LedgerEffect[] = [];
    const rebuild = (period: 1 | 2 | 3 | 4) => {
      const result = rebuildOngoing(ledger, [
        { instance, action: glass, conditionContext: conditionCtx(), targetContext: targetCtx() },
      ], 'player', { period, breakIndex: 0 });
      instance = result.instances[0]!;
      ledger = result.ledger;
      return result;
    };

    const p1 = rebuild(1);
    expect(instance.runtimeState.progress).toBe(1);
    expect(statAmount(p1.effects[0]!)).toBe(-1);

    const p2 = rebuild(2);
    expect(instance.runtimeState.progress).toBe(2);
    expect(statAmount(p2.effects[0]!)).toBe(-2);

    // Disabled before period 3: progress must not advance and no effect appears.
    instance = disableActionInstance(instance, { period: 3 });
    const p3 = rebuild(3);
    expect(instance.runtimeState.progress).toBe(2);
    expect(p3.effects).toEqual([]);

    // Re-enabled for period 4: progress resumes from 2 → 3, effect scales with it.
    instance = enableActionInstance(instance);
    const p4 = rebuild(4);
    expect(instance.runtimeState.progress).toBe(3);
    expect(statAmount(p4.effects[0]!)).toBe(-3);
  });
});

// ── Effect ledger expiry ─────────────────────────────────────────────────────

describe('temporary effects expire at the correct period boundary', () => {
  const source: EffectSource = {
    instanceId: 'i1',
    actionId: 'a1',
    cardId: 'p1',
    actionName: 'A',
    side: 'player',
    origin: 'activated',
  };
  const effect: ActionEffect = { type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 1 };
  const make = (duration: V7ActionDefinition['duration']) =>
    buildLedgerEffects(source, [effect], { playerIds: ['p1'] }, { period: 1, breakIndex: 1, effectivePeriod: 2 }, duration)[0]!;

  it('keeps a current-period effect until its period ends', () => {
    const current = make('current_period');
    expect(effectSurvives(current, { type: 'break_end', period: 1, breakIndex: 1 })).toBe(true);
    expect(effectSurvives(current, { type: 'period_end', period: 1 })).toBe(true);
    expect(effectSurvives(current, { type: 'period_end', period: 2 })).toBe(false);
  });

  it('keeps a next-period effect one period longer', () => {
    const next = make('next_period');
    expect(effectSurvives(next, { type: 'period_end', period: 2 })).toBe(true);
    expect(effectSurvives(next, { type: 'period_end', period: 3 })).toBe(false);
  });

  it('drops a this-break effect only at its own break end', () => {
    const thisBreak = make('this_break');
    expect(effectSurvives(thisBreak, { type: 'break_end', period: 1, breakIndex: 2 })).toBe(true);
    expect(effectSurvives(thisBreak, { type: 'break_end', period: 1, breakIndex: 1 })).toBe(false);
  });

  it('drops an instant effect at the first boundary and keeps a whole-match effect to the whistle', () => {
    expect(effectSurvives(make('instant'), { type: 'break_end', period: 1, breakIndex: 1 })).toBe(false);
    expect(effectSurvives(make('whole_match'), { type: 'period_end', period: 3 })).toBe(true);
    expect(effectSurvives(make('whole_match'), { type: 'match_end' })).toBe(false);
  });

  it('partitions the ledger into survivors and expired records', () => {
    const current = make('current_period');
    const next = make('next_period');
    const whole = make('whole_match');
    const { survivors, expired } = expireLedger([current, next, whole], { type: 'period_end', period: 2 });
    expect(expired).toContain(current);
    expect(survivors).toContain(next);
    expect(survivors).toContain(whole);
  });
});

// ── Determinism ──────────────────────────────────────────────────────────────

describe('identical seeds and inputs produce identical receipts', () => {
  it('reproduces an activation result exactly', () => {
    const action = defineAction({ printedCharges: 2 });
    const instance = createActionInstance(action, { cardId: 'p1' });
    expect(activateAction(instance, action, activationCtx())).toEqual(activateAction(instance, action, activationCtx()));
  });

  it('reproduces a probability-gated activation from the same seed', () => {
    const action = defineAction({
      conditionGroups: [{ group: 1, conditions: [{ type: 'probability', numerator: 1, denominator: 2 }] }],
    });
    const pass = (seed: number) => {
      const rng = createRng(seed, 'prob');
      return (condition: Extract<ActionCondition, { type: 'probability' }>) =>
        rng.next() < condition.numerator / condition.denominator;
    };
    const run = (seed: number) =>
      activateAction(createActionInstance(action, { cardId: 'p1' }), action, activationCtx({
        conditionContext: conditionCtx({ randomPass: pass(seed) }),
      }));

    expect(run(123).receipt).toEqual(run(123).receipt);
    expect(run(123).outcome).toBe(run(123).outcome);
  });

  it('reproduces a Game Start dispatch exactly', () => {
    const action = defineAction({ timing: 'game_start', duration: 'whole_match' });
    const instance = createActionInstance(action, { cardId: 'p1' });
    const run = () =>
      dispatchGameStart(
        [{ instance, action, conditionContext: conditionCtx({ period: 1 }), targetContext: targetCtx() }],
        'player',
      );
    expect(run()).toEqual(run());
  });
});
