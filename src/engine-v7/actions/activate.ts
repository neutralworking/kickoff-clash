import type {
  ActionEffect,
  ActionTarget,
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
import { buildLedgerEffects, type LedgerEffect } from './effects';

// Activation is the gated path for `activated` / `manager_activated` actions.
// It NEVER touches match state: on success it returns the updated instance
// (charge spent, once-per-break marked) plus the declarative ledger effects and
// a receipt. On a block or fizzle it returns the instance untouched, no effects,
// and a receipt saying why. The whole function is deterministic — any
// randomness enters through the caller-supplied `randomPass` on the condition
// context, so identical inputs reproduce identical receipts.

export type ActivationOutcome = 'activated' | 'fizzled' | 'blocked';

export type ActivationReason =
  | 'disabled'
  | 'already_activated_this_break'
  | 'no_charges'
  | 'not_activatable'
  | 'condition_failed'
  | 'invalid_target';

export interface ActivationContext {
  side: TeamSide;
  /** Where in the match this activation is happening (a break). */
  coords: RuntimeCoords;
  /** The period the produced effects first apply to (usually the next one). */
  effectivePeriod: PeriodNumber;
  conditionContext: ConditionContext;
  targetContext: TargetContext;
  /** For `fixed_periods` effect durations. */
  durationPeriods?: number;
}

export interface ActivationResult {
  outcome: ActivationOutcome;
  instance: RuntimeActionInstance;
  effects: LedgerEffect[];
  receipt: MatchReceiptEvent;
  reason?: ActivationReason;
}

/** Effects that meaningfully need at least one resolved player target. */
export function effectRequiresPlayers(effect: ActionEffect): boolean {
  switch (effect.type) {
    case 'modify_stat':
    case 'swap_stats':
    case 'modify_cost':
    case 'copy_action':
      return true;
    default:
      return false;
  }
}

/** Targets that resolve to a set of players (everything but `chance`). */
export function isPlayerTarget(target: ActionTarget): boolean {
  return target.type !== 'chance';
}

export function activateAction(
  instance: RuntimeActionInstance,
  action: V7ActionDefinition,
  context: ActivationContext,
): ActivationResult {
  const { side, coords } = context;

  const receipt = (
    eventType: string,
    message: string,
    data: Record<string, unknown> = {},
    targetIds?: string[],
  ): MatchReceiptEvent =>
    receiptEvent({
      id: `rcpt:${side}:${instance.instanceId}:${coords.period}:${coords.breakIndex}:${eventType}`,
      period: coords.period,
      phase: 'break_activation',
      eventType,
      message,
      side,
      sourceId: instance.currentOwnerCardId,
      actionName: action.name,
      ...(targetIds ? { targetIds } : {}),
      data,
    });

  const blocked = (reason: ActivationReason, message: string): ActivationResult => ({
    outcome: 'blocked',
    instance,
    effects: [],
    reason,
    receipt: receipt('action_blocked', message, { reason }),
  });

  const fizzled = (reason: ActivationReason, message: string): ActivationResult => ({
    outcome: 'fizzled',
    instance,
    effects: [],
    reason,
    receipt: receipt('action_fizzled', message, { reason }),
  });

  // --- Gates: a blocked action cannot trigger, and never spends a charge. ---
  if (action.timing !== 'activated' && action.timing !== 'manager_activated') {
    return blocked('not_activatable', `${action.name} is not an activatable action.`);
  }
  if (isActionDisabled(instance, coords)) {
    return blocked('disabled', `${action.name} is disabled and cannot activate.`);
  }
  if (instance.activationCountThisBreak >= 1) {
    return blocked('already_activated_this_break', `${action.name} has already activated this break.`);
  }
  if (!hasCharge(instance)) {
    return blocked('no_charges', `${action.name} has no charges remaining.`);
  }

  // --- Fizzles: attempted but the world said no. Still no charge spent. ---
  if (!evaluateConditionGroups(action.conditionGroups, context.conditionContext)) {
    return fizzled('condition_failed', `${action.name} fizzled: its conditions were not met.`);
  }

  const resolved = resolveTarget(action.target, context.targetContext);
  const needsPlayers = action.effects.some(effectRequiresPlayers);
  if (needsPlayers && isPlayerTarget(action.target) && resolved.playerIds.length === 0) {
    return fizzled('invalid_target', `${action.name} fizzled: no valid target.`);
  }

  // --- Success: spend the charge, mark the break, mint the effects. ---
  const nextInstance: RuntimeActionInstance = {
    ...consumeCharge(instance),
    activationCountThisBreak: 1,
  };

  const effects = buildLedgerEffects(
    {
      instanceId: instance.instanceId,
      actionId: instance.printedActionId,
      cardId: instance.currentOwnerCardId,
      actionName: action.name,
      side,
      origin: 'activated',
    },
    action.effects,
    resolved,
    { period: coords.period, breakIndex: coords.breakIndex, effectivePeriod: context.effectivePeriod },
    action.duration,
    context.durationPeriods,
  );

  return {
    outcome: 'activated',
    instance: nextInstance,
    effects,
    receipt: receipt(
      'action_activated',
      `${action.name} activated.`,
      { targetCount: resolved.playerIds.length, ...(resolved.sector ? { sector: resolved.sector } : {}) },
      resolved.playerIds,
    ),
  };
}

/** Clear the once-per-break flag on every instance at a break boundary. */
export function resetBreakActivations(
  instances: readonly RuntimeActionInstance[],
): RuntimeActionInstance[] {
  return instances.map((instance) =>
    instance.activationCountThisBreak === 0 ? instance : { ...instance, activationCountThisBreak: 0 },
  );
}
