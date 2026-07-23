import type { RuntimeActionInstance, V7ActionDefinition } from '../../lib/match-v7/types';

// Charges are printed on the action and initialised on every runtime instance.
// A copied instance gets a fresh printed count of its own (see instances.ts), so
// two instances of the same printed action deplete independently. An action with
// no printed charge count is uncharged — it is limited only by once-per-break.
//
// Every helper is immutable: it returns a new instance and never edits in place.

/** The starting charge count for a fresh instance; `undefined` means uncharged. */
export function initialCharges(action: V7ActionDefinition): number | undefined {
  return action.printedCharges;
}

/** Uncharged actions always have a charge; charged ones need `remaining > 0`. */
export function hasCharge(instance: RuntimeActionInstance): boolean {
  return instance.remainingCharges === undefined || instance.remainingCharges > 0;
}

/** Spend one charge. Uncharged instances are returned untouched. */
export function consumeCharge(instance: RuntimeActionInstance): RuntimeActionInstance {
  if (instance.remainingCharges === undefined) return instance;
  return { ...instance, remainingCharges: Math.max(0, instance.remainingCharges - 1) };
}

/**
 * Restore charges, optionally clamped to the printed maximum. Used by
 * `restore_charge` effects. Uncharged instances are returned untouched.
 */
export function restoreCharge(
  instance: RuntimeActionInstance,
  count: number,
  printedMaximum: number,
  mayExceedPrintedMaximum: boolean,
): RuntimeActionInstance {
  if (instance.remainingCharges === undefined) return instance;
  const raised = instance.remainingCharges + count;
  const capped = mayExceedPrintedMaximum ? raised : Math.min(raised, printedMaximum);
  return { ...instance, remainingCharges: Math.max(0, capped) };
}

/** Grant extra charges with no printed ceiling (used by `add_charge` effects). */
export function addCharge(instance: RuntimeActionInstance, count: number): RuntimeActionInstance {
  if (instance.remainingCharges === undefined) return instance;
  return { ...instance, remainingCharges: Math.max(0, instance.remainingCharges + count) };
}

/** Strip charges without an activation (used by `remove_charge` effects). */
export function removeCharge(instance: RuntimeActionInstance, count: number): RuntimeActionInstance {
  if (instance.remainingCharges === undefined) return instance;
  return { ...instance, remainingCharges: Math.max(0, instance.remainingCharges - count) };
}
