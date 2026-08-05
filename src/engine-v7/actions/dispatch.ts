import type {
  ActionEffect,
  MatchReceiptEvent,
  PeriodNumber,
  RuntimeActionInstance,
  TeamSide,
  V7ActionDefinition,
} from '../../lib/match-v7/types';
import { receiptEvent } from '../runtime/receipt';
import { evaluateConditionGroups, type ConditionContext } from './conditions';
import { resolveTarget, type TargetContext } from './targets';
import { consumeCharge, hasCharge } from './charges';
import { isActionDisabled, type RuntimeCoords } from './disable';
import { effectRequiresPlayers, isPlayerTarget } from './activate';
import { buildLedgerEffects, dropOriginForSide, type LedgerEffect } from './effects';

// Timing-driven dispatch that isn't a break activation:
//  - Game Start fires the once-per-match `game_start` actions.
//  - Ongoing effects are rebuilt from scratch every period: the previous
//    ongoing records are cleared and regenerated from live state, so an ongoing
//    effect naturally disappears when its source is disabled and reappears when
//    re-enabled. Progress accumulators (e.g. Glass) tick only while enabled, so
//    disabling pauses — rather than resets — their stored progress.
//
// Like activation, neither path mutates match state; both return declarative
// ledger effects, updated instances and typed receipts, and both are
// deterministic given their inputs.

export interface DispatchEntry {
  instance: RuntimeActionInstance;
  action: V7ActionDefinition;
  conditionContext: ConditionContext;
  targetContext: TargetContext;
}

export interface DispatchResult {
  effects: LedgerEffect[];
  receipts: MatchReceiptEvent[];
  instances: RuntimeActionInstance[];
}

export interface OngoingRebuildResult {
  /** The full ledger after clearing + regenerating this side's ongoing effects. */
  ledger: LedgerEffect[];
  /** Just the ongoing effects emitted by this rebuild. */
  effects: LedgerEffect[];
  receipts: MatchReceiptEvent[];
  instances: RuntimeActionInstance[];
}

const GAME_START_COORDS: RuntimeCoords = { period: 1, breakIndex: 0 };

/**
 * Dispatch the `game_start` actions once at kick-off. Non-`game_start` entries
 * are passed through untouched. Disabled sources are skipped (blocked); failed
 * conditions or empty targets fizzle. Successful sources spend a charge (if
 * charged) and mint whole-match / ongoing ledger effects.
 */
export function dispatchGameStart(
  entries: readonly DispatchEntry[],
  side: TeamSide,
  options: { effectivePeriod?: PeriodNumber; durationPeriods?: number } = {},
): DispatchResult {
  const effectivePeriod = options.effectivePeriod ?? 1;
  const effects: LedgerEffect[] = [];
  const receipts: MatchReceiptEvent[] = [];
  const instances: RuntimeActionInstance[] = [];

  const receipt = (
    instance: RuntimeActionInstance,
    action: V7ActionDefinition,
    eventType: string,
    message: string,
    data: Record<string, unknown> = {},
    targetIds?: string[],
  ): MatchReceiptEvent =>
    receiptEvent({
      id: `rcpt:gs:${side}:${instance.instanceId}:${eventType}`,
      period: 1,
      phase: 'game_start',
      eventType,
      message,
      side,
      sourceId: instance.currentOwnerCardId,
      actionName: action.name,
      ...(targetIds ? { targetIds } : {}),
      data,
    });

  for (const { instance, action, conditionContext, targetContext } of entries) {
    if (action.timing !== 'game_start') {
      instances.push(instance);
      continue;
    }
    if (isActionDisabled(instance, GAME_START_COORDS) || !hasCharge(instance)) {
      instances.push(instance);
      receipts.push(receipt(instance, action, 'action_blocked', `${action.name} did not fire at kick-off.`, {
        reason: isActionDisabled(instance, GAME_START_COORDS) ? 'disabled' : 'no_charges',
      }));
      continue;
    }
    if (!evaluateConditionGroups(action.conditionGroups, conditionContext)) {
      instances.push(instance);
      receipts.push(receipt(instance, action, 'action_fizzled', `${action.name} fizzled at kick-off.`, {
        reason: 'condition_failed',
      }));
      continue;
    }

    const resolved = resolveTarget(action.target, targetContext);
    const needsPlayers = action.effects.some(effectRequiresPlayers);
    if (needsPlayers && isPlayerTarget(action.target) && resolved.playerIds.length === 0) {
      instances.push(instance);
      receipts.push(receipt(instance, action, 'action_fizzled', `${action.name} fizzled: no valid target.`, {
        reason: 'invalid_target',
      }));
      continue;
    }

    const produced = buildLedgerEffects(
      {
        instanceId: instance.instanceId,
        actionId: instance.printedActionId,
        cardId: instance.currentOwnerCardId,
        actionName: action.name,
        side,
        origin: 'game_start',
      },
      action.effects,
      resolved,
      { period: 1, breakIndex: 0, effectivePeriod },
      action.duration,
      options.durationPeriods,
    );
    effects.push(...produced);
    instances.push(consumeCharge(instance));
    receipts.push(
      receipt(instance, action, 'game_start_applied', `${action.name} took effect at kick-off.`, {}, resolved.playerIds),
    );
  }

  return { effects, receipts, instances };
}

/**
 * Fire the `subbed_on` actions of cards that have just entered active play. Unlike
 * game_start (once per match), the trigger is the entry EVENT — the caller invokes
 * this each time a card comes on — so a charged action repeats until its charges are
 * spent, and an uncharged one fires on every entry (Law 8 / NW-167). Disabled
 * instances are blocked; failed conditions or empty targets fizzle. Entries must be
 * pre-filtered to the cards that entered this break; suppressed sources are excluded
 * by the caller (emergency goalkeepers) and by the disable check here.
 */
export function dispatchSubbedOn(
  entries: readonly DispatchEntry[],
  side: TeamSide,
  coords: RuntimeCoords,
): DispatchResult {
  const effects: LedgerEffect[] = [];
  const receipts: MatchReceiptEvent[] = [];
  const instances: RuntimeActionInstance[] = [];

  const receipt = (
    instance: RuntimeActionInstance,
    action: V7ActionDefinition,
    eventType: string,
    message: string,
    data: Record<string, unknown> = {},
    targetIds?: string[],
  ): MatchReceiptEvent =>
    receiptEvent({
      id: `rcpt:subon:${side}:${instance.instanceId}:${coords.period}:${coords.breakIndex}:${eventType}`,
      period: coords.period,
      phase: 'break_subbed_on',
      eventType,
      message,
      side,
      sourceId: instance.currentOwnerCardId,
      actionName: action.name,
      ...(targetIds ? { targetIds } : {}),
      data,
    });

  for (const { instance, action, conditionContext, targetContext } of entries) {
    if (action.timing !== 'subbed_on') {
      instances.push(instance);
      continue;
    }
    if (isActionDisabled(instance, coords) || !hasCharge(instance)) {
      instances.push(instance);
      receipts.push(receipt(instance, action, 'action_blocked', `${action.name} did not fire on entry.`, {
        reason: isActionDisabled(instance, coords) ? 'disabled' : 'no_charges',
      }));
      continue;
    }
    if (!evaluateConditionGroups(action.conditionGroups, conditionContext)) {
      instances.push(instance);
      receipts.push(receipt(instance, action, 'action_fizzled', `${action.name} fizzled on entry.`, {
        reason: 'condition_failed',
      }));
      continue;
    }

    const resolved = resolveTarget(action.target, targetContext);
    const needsPlayers = action.effects.some(effectRequiresPlayers);
    if (needsPlayers && isPlayerTarget(action.target) && resolved.playerIds.length === 0) {
      instances.push(instance);
      receipts.push(receipt(instance, action, 'action_fizzled', `${action.name} fizzled: no valid target.`, {
        reason: 'invalid_target',
      }));
      continue;
    }

    const produced = buildLedgerEffects(
      {
        instanceId: instance.instanceId,
        actionId: instance.printedActionId,
        cardId: instance.currentOwnerCardId,
        actionName: action.name,
        side,
        origin: 'subbed_on',
      },
      action.effects,
      resolved,
      { period: coords.period, breakIndex: coords.breakIndex, effectivePeriod: coords.period },
      action.duration,
    );
    effects.push(...produced);
    instances.push(consumeCharge(instance));
    receipts.push(receipt(instance, action, 'subbed_on_fired', `${action.name} fired on entry.`, {}, resolved.playerIds));
  }

  return { effects, receipts, instances };
}

interface ProgressReadout {
  accrues: boolean;
  storedProgress: number;
  perPeriod: number;
}

function readProgress(instance: RuntimeActionInstance): ProgressReadout {
  const state = instance.runtimeState;
  return {
    accrues: state.accrues === true,
    storedProgress: typeof state.progress === 'number' ? state.progress : 0,
    perPeriod: typeof state.accrualPerPeriod === 'number' ? state.accrualPerPeriod : 1,
  };
}

/** Scale a flat stat modifier by an accumulator's progress; leave others alone. */
function scaleEffect(effect: ActionEffect, factor: number): ActionEffect {
  if (effect.type === 'modify_stat' && effect.mode === 'flat') {
    return { ...effect, amount: effect.amount * factor };
  }
  return effect;
}

/**
 * Rebuild one side's ongoing effects for the current period. Clears the prior
 * ongoing records for the side, then regenerates from live state:
 *  - a disabled source contributes nothing (its ongoing effect disappears) and
 *    its progress is frozen;
 *  - an enabled accumulator advances its stored progress and scales its flat
 *    stat effect by the new progress;
 *  - a source whose conditions fail contributes nothing but keeps its progress.
 */
export function rebuildOngoing(
  ledger: readonly LedgerEffect[],
  entries: readonly DispatchEntry[],
  side: TeamSide,
  coords: RuntimeCoords,
): OngoingRebuildResult {
  const cleared = dropOriginForSide(ledger, 'ongoing', side);
  const emitted: LedgerEffect[] = [];
  const receipts: MatchReceiptEvent[] = [];
  const instances: RuntimeActionInstance[] = [];

  const receipt = (
    instance: RuntimeActionInstance,
    action: V7ActionDefinition,
    eventType: string,
    message: string,
    data: Record<string, unknown> = {},
    targetIds?: string[],
  ): MatchReceiptEvent =>
    receiptEvent({
      id: `rcpt:ong:${side}:${instance.instanceId}:${coords.period}:${eventType}`,
      period: coords.period,
      phase: 'ongoing_rebuild',
      eventType,
      message,
      side,
      sourceId: instance.currentOwnerCardId,
      actionName: action.name,
      ...(targetIds ? { targetIds } : {}),
      data,
    });

  for (const { instance, action, conditionContext, targetContext } of entries) {
    if (action.timing !== 'ongoing') {
      instances.push(instance);
      continue;
    }

    const enabled = !isActionDisabled(instance, coords);
    const { accrues, storedProgress, perPeriod } = readProgress(instance);

    // Progress advances only while enabled — disabling pauses, never resets.
    const currentProgress = accrues && enabled ? storedProgress + perPeriod : storedProgress;
    const nextInstance =
      accrues && enabled
        ? { ...instance, runtimeState: { ...instance.runtimeState, progress: currentProgress } }
        : instance;
    instances.push(nextInstance);

    if (!enabled) {
      receipts.push(receipt(instance, action, 'ongoing_suppressed', `${action.name} is disabled; its ongoing effect is off.`, {
        reason: 'disabled',
        ...(accrues ? { progress: storedProgress, paused: true } : {}),
      }));
      continue;
    }

    if (!evaluateConditionGroups(action.conditionGroups, conditionContext)) {
      receipts.push(receipt(instance, action, 'ongoing_inactive', `${action.name}'s ongoing conditions are not met.`, {
        reason: 'condition_failed',
      }));
      continue;
    }

    const resolved = resolveTarget(action.target, targetContext);
    const needsPlayers = action.effects.some(effectRequiresPlayers);
    if (needsPlayers && isPlayerTarget(action.target) && resolved.playerIds.length === 0) {
      receipts.push(receipt(instance, action, 'ongoing_inactive', `${action.name}'s ongoing effect has no valid target.`, {
        reason: 'invalid_target',
      }));
      continue;
    }

    const scaledEffects = accrues
      ? action.effects.map((effect) => scaleEffect(effect, currentProgress))
      : action.effects;

    const produced = buildLedgerEffects(
      {
        instanceId: nextInstance.instanceId,
        actionId: nextInstance.printedActionId,
        cardId: nextInstance.currentOwnerCardId,
        actionName: action.name,
        side,
        origin: 'ongoing',
      },
      scaledEffects,
      resolved,
      { period: coords.period, breakIndex: coords.breakIndex, effectivePeriod: coords.period },
      action.duration,
    );
    emitted.push(...produced);
    receipts.push(
      receipt(instance, action, 'ongoing_applied', `${action.name} is active.`, accrues ? { progress: currentProgress } : {}, resolved.playerIds),
    );
  }

  return { ledger: [...cleared, ...emitted], effects: emitted, receipts, instances };
}
