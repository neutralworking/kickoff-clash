import { describe, expect, it } from 'vitest';
import type {
  ActionEffect,
  FormationDefinition,
  RuntimeActionInstance,
  RuntimePlayerState,
  TeamSide,
  V7ActionDefinition,
  V7PlayerCard,
  V7TeamState,
} from '../../lib/match-v7/types';
import {
  applyCopyEffects,
  MAX_COPY_DEPTH,
  type CardRegistry,
  type CopyBoard,
  type CopyResolutionCoords,
  type LedgerEffect,
} from '..';

// ── Fixtures ────────────────────────────────────────────────────────────────

function action(id: string, overrides: Partial<V7ActionDefinition> = {}): V7ActionDefinition {
  return {
    id, actionKey: id, name: id, displayText: '', ownerType: 'player', timing: 'activated',
    conditionGroups: [], target: { type: 'self' },
    effects: [{ type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 2 }],
    duration: 'current_period', activationLimitPerBreak: 1, isNegative: false,
    copyRules: {}, disableRules: {}, engineSupportStatus: 'supported', ...overrides,
  };
}

function card(id: string): V7PlayerCard {
  return {
    id, cardKey: id, name: id, positionCodes: ['CM'], naturalSector: 'centre',
    printedAttack: 6, printedDefence: 5, printedCost: 3, role: 'Test', rarity: 'common', actionIds: [],
  };
}

function inst(cardId: string, actionId: string, overrides: Partial<RuntimeActionInstance> = {}): RuntimeActionInstance {
  return {
    instanceId: `${cardId}::${actionId}`, printedActionId: actionId, currentOwnerCardId: cardId,
    immediateSourceCardId: cardId, originalSourceCardId: cardId, copyDepth: 0,
    activationCountThisBreak: 0, runtimeState: {}, ...overrides,
  };
}

function player(cardId: string, deploymentOrder: number, instances: RuntimeActionInstance[] = []): RuntimePlayerState {
  return {
    cardId, deploymentOrder, zone: 'active', currentSlotKey: 'cm', currentSector: 'centre',
    periodsParticipated: [], mandatoryRemoval: false, actionInstances: instances,
    activeEffectIds: [], accumulatedStacks: {}, currentCost: 3,
  };
}

function team(side: TeamSide, players: RuntimePlayerState[]): V7TeamState {
  return { side, managerId: `${side}-m`, formationId: 'f', players, score: 0, cumulativeGrossChances: 0 };
}

const FORMATION: FormationDefinition = { id: 'f', formationKey: 'f', name: 'f', slots: [] };

function registry(actions: V7ActionDefinition[], cardIds: string[]): CardRegistry {
  return {
    cards: new Map(cardIds.map((id) => [id, card(id)])),
    actions: new Map(actions.map((a) => [a.id, a])),
    formations: new Map([['f', FORMATION]]),
  };
}

const COORDS: CopyResolutionCoords = { period: 2, breakIndex: 1, seed: 99 };

function copyLedger(
  effect: Extract<ActionEffect, { type: 'copy_action' }>,
  targetIds: string[],
  overrides: Partial<LedgerEffect> = {},
): LedgerEffect {
  return {
    id: 'copy1', side: 'player', origin: 'activated',
    sourceInstanceId: 'owner::copier', sourceActionId: 'copier', sourceCardId: 'owner', actionName: 'Copier',
    effect, targetIds, createdPeriod: 2, createdBreakIndex: 1, lifetime: { kind: 'immediate' }, ...overrides,
  };
}

/** Owner card plus the given source cards, all on the player side. */
function boardWith(sources: RuntimePlayerState[]): CopyBoard {
  return {
    player: team('player', [player('owner', 0), ...sources]),
    opponent: team('opponent', []),
  };
}

function ownerInstances(result: { board: CopyBoard }): RuntimeActionInstance[] {
  return result.board.player.players.find((p) => p.cardId === 'owner')!.actionInstances;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('applyCopyEffects (Law 2)', () => {
  it('does nothing when there are no copy effects this break', () => {
    const reg = registry([action('boost')], ['owner', 'src']);
    const board = boardWith([player('src', 1, [inst('src', 'boost')])]);
    const out = applyCopyEffects(board, [], reg, COORDS);
    expect(out.board).toBe(board);
    expect(out.receipts).toEqual([]);
  });

  it('first copies only the lowest-order eligible source', () => {
    const reg = registry([action('boost')], ['owner', 'src-a', 'src-b']);
    const board = boardWith([
      player('src-b', 2, [inst('src-b', 'boost')]),
      player('src-a', 1, [inst('src-a', 'boost')]),
    ]);
    const out = applyCopyEffects(
      board,
      [copyLedger({ type: 'copy_action', sourceMode: 'first', allowCopiedSource: false }, ['src-a', 'src-b'])],
      reg, COORDS,
    );
    const copies = ownerInstances(out).filter((i) => i.copiedAtPeriod !== undefined);
    expect(copies).toHaveLength(1);
    expect(copies[0]!.immediateSourceCardId).toBe('src-a'); // deployment order 1 < 2
    expect(out.receipts.filter((r) => r.eventType === 'action_copied')).toHaveLength(1);
  });

  it('all copies every eligible source and preserves independence + provenance', () => {
    const reg = registry([action('boost', { printedCharges: 2 })], ['owner', 'src-a', 'src-b']);
    const board = boardWith([
      player('src-a', 1, [inst('src-a', 'boost', { remainingCharges: 1 })]),
      player('src-b', 2, [inst('src-b', 'boost', { remainingCharges: 1 })]),
    ]);
    const out = applyCopyEffects(
      board,
      [copyLedger({ type: 'copy_action', sourceMode: 'all', allowCopiedSource: false }, ['src-a', 'src-b'])],
      reg, COORDS,
    );
    const copies = ownerInstances(out).filter((i) => i.copiedAtPeriod !== undefined);
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      expect(copy.currentOwnerCardId).toBe('owner');
      expect(copy.copyDepth).toBe(1);
      expect(copy.remainingCharges).toBe(2); // fresh printed charges, not the source's depleted 1
      expect(copy.activationCountThisBreak).toBe(0);
      expect(copy.originalSourceCardId).not.toBe('owner'); // provenance preserved to the printed source
    }
  });

  it('refuses a copy that would exceed the depth cap', () => {
    const reg = registry([action('boost')], ['owner', 'src']);
    // Source already at the cap → copy would be depth 2 > MAX_COPY_DEPTH.
    const board = boardWith([player('src', 1, [inst('src', 'boost', { copyDepth: MAX_COPY_DEPTH })])]);
    const out = applyCopyEffects(
      board,
      [copyLedger({ type: 'copy_action', sourceMode: 'first', allowCopiedSource: true }, ['src'])],
      reg, COORDS,
    );
    expect(ownerInstances(out).filter((i) => i.copiedAtPeriod !== undefined)).toHaveLength(0);
    const blocked = out.receipts.find((r) => r.eventType === 'copy_blocked');
    expect(blocked?.data.reason).toBe('depth');
  });

  it('refuses an already-copied source unless allowCopiedSource is set', () => {
    const reg = registry([action('boost')], ['owner', 'src']);
    const copiedSource = () => player('src', 1, [inst('src', 'boost', { copiedAtPeriod: 1, copyDepth: 0 })]);

    const refused = applyCopyEffects(
      boardWith([copiedSource()]),
      [copyLedger({ type: 'copy_action', sourceMode: 'first', allowCopiedSource: false }, ['src'])],
      reg, COORDS,
    );
    expect(ownerInstances(refused).filter((i) => i.copiedAtPeriod !== undefined)).toHaveLength(0);
    expect(refused.receipts.find((r) => r.eventType === 'copy_blocked')?.data.reason).toBe('not_copyable');

    const allowed = applyCopyEffects(
      boardWith([copiedSource()]),
      [copyLedger({ type: 'copy_action', sourceMode: 'first', allowCopiedSource: true }, ['src'])],
      reg, COORDS,
    );
    expect(ownerInstances(allowed).filter((i) => i.copiedAtPeriod !== undefined)).toHaveLength(1);
  });

  it('refuses a source whose printed copyRules bar copying', () => {
    const reg = registry([action('locked', { copyRules: { copyable: false } })], ['owner', 'src']);
    const board = boardWith([player('src', 1, [inst('src', 'locked')])]);
    const out = applyCopyEffects(
      board,
      [copyLedger({ type: 'copy_action', sourceMode: 'first', allowCopiedSource: false }, ['src'])],
      reg, COORDS,
    );
    expect(ownerInstances(out).filter((i) => i.copiedAtPeriod !== undefined)).toHaveLength(0);
    expect(out.receipts.find((r) => r.eventType === 'copy_blocked')?.data.reason).toBe('not_copyable');
  });

  it('bars a copy_action-bearing source by default (loop guard)', () => {
    const copier = action('copier', { effects: [{ type: 'copy_action', sourceMode: 'first', allowCopiedSource: false }] });
    const reg = registry([copier], ['owner', 'src']);
    const board = boardWith([player('src', 1, [inst('src', 'copier')])]);
    const out = applyCopyEffects(
      board,
      [copyLedger({ type: 'copy_action', sourceMode: 'first', allowCopiedSource: false }, ['src'])],
      reg, COORDS,
    );
    expect(ownerInstances(out).filter((i) => i.copiedAtPeriod !== undefined)).toHaveLength(0);
    expect(out.receipts.find((r) => r.eventType === 'copy_blocked')?.data.reason).toBe('not_copyable');
  });

  it('reports no_source when the target holds no actions', () => {
    const reg = registry([action('boost')], ['owner', 'src']);
    const board = boardWith([player('src', 1, [])]);
    const out = applyCopyEffects(
      board,
      [copyLedger({ type: 'copy_action', sourceMode: 'first', allowCopiedSource: false }, ['src'])],
      reg, COORDS,
    );
    expect(out.receipts.find((r) => r.eventType === 'copy_blocked')?.data.reason).toBe('no_source');
  });

  it('random_positive picks only from positive-value sources, deterministically', () => {
    const reg = registry([action('boost'), action('debuff', { isNegative: true })], ['owner', 'pos', 'neg']);
    const board = boardWith([
      player('neg', 1, [inst('neg', 'debuff')]),
      player('pos', 2, [inst('pos', 'boost')]),
    ]);
    const effect = copyLedger({ type: 'copy_action', sourceMode: 'random_positive', allowCopiedSource: false }, ['pos', 'neg']);
    const out = applyCopyEffects(board, [effect], reg, COORDS);
    const copies = ownerInstances(out).filter((i) => i.copiedAtPeriod !== undefined);
    expect(copies).toHaveLength(1);
    expect(copies[0]!.immediateSourceCardId).toBe('pos'); // never the negative source

    const replay = applyCopyEffects(board, [effect], reg, COORDS);
    expect(replay.board).toEqual(out.board);
    expect(replay.receipts).toEqual(out.receipts);
  });

  it('caps total copies at the per-side break budget', () => {
    const reg = registry([action('boost')], ['owner', 'src-a', 'src-b', 'src-c']);
    const board = boardWith([
      player('src-a', 1, [inst('src-a', 'boost')]),
      player('src-b', 2, [inst('src-b', 'boost')]),
      player('src-c', 3, [inst('src-c', 'boost')]),
    ]);
    const out = applyCopyEffects(
      board,
      [copyLedger({ type: 'copy_action', sourceMode: 'all', allowCopiedSource: false }, ['src-a', 'src-b', 'src-c'])],
      reg, COORDS, { copyBudgetPerSide: 2 },
    );
    expect(ownerInstances(out).filter((i) => i.copiedAtPeriod !== undefined)).toHaveLength(2);
    expect(out.receipts.some((r) => r.eventType === 'copy_budget_reached')).toBe(true);
  });

  it('is byte-exact on replay', () => {
    const reg = registry([action('boost')], ['owner', 'src-a', 'src-b']);
    const board = boardWith([
      player('src-a', 1, [inst('src-a', 'boost')]),
      player('src-b', 2, [inst('src-b', 'boost')]),
    ]);
    const effects = [copyLedger({ type: 'copy_action', sourceMode: 'all', allowCopiedSource: false }, ['src-a', 'src-b'])];
    const first = applyCopyEffects(board, effects, reg, COORDS);
    const second = applyCopyEffects(board, effects, reg, COORDS);
    expect(first.board).toEqual(second.board);
    expect(first.receipts).toEqual(second.receipts);
  });
});
