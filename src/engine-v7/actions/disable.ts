import type { BreakIndex, PeriodNumber, RuntimeActionInstance } from '../../lib/match-v7/types';

// Disabling suspends an action instance: while disabled it cannot activate, its
// Game Start / Ongoing dispatch is skipped, and its `while_active` ledger
// effects vanish. Disabling does NOT reset the instance's runtime bag, so a
// progress accumulator (Glass) is paused, not wiped — re-enabling resumes it
// from where it left off.

export interface RuntimeCoords {
  period: PeriodNumber;
  breakIndex: BreakIndex | 0;
}

export type DisableWindow = NonNullable<RuntimeActionInstance['disabledUntil']>;

/** Suspend an instance until the given window elapses (or the match ends). */
export function disableActionInstance(
  instance: RuntimeActionInstance,
  until: DisableWindow,
): RuntimeActionInstance {
  return { ...instance, disabledUntil: { ...until } };
}

/** Clear an instance's disable window (an explicit re-enable). */
export function enableActionInstance(instance: RuntimeActionInstance): RuntimeActionInstance {
  return { ...instance, disabledUntil: undefined };
}

/**
 * Is this instance disabled at the given coordinates? A window with `matchEnd`
 * is permanent; a `period` window disables through the end of that period; a
 * `break` window disables through that break within the named period.
 */
export function isActionDisabled(instance: RuntimeActionInstance, coords: RuntimeCoords): boolean {
  const window = instance.disabledUntil;
  if (!window) return false;
  if (window.matchEnd) return true;

  if (window.period !== undefined) {
    if (coords.period < window.period) return true;
    if (coords.period > window.period) return false;
    // Same period: a break bound narrows it, otherwise the whole period is out.
    if (window.break !== undefined && coords.breakIndex !== 0) {
      return coords.breakIndex <= window.break;
    }
    return true;
  }

  if (window.break !== undefined && coords.breakIndex !== 0) {
    return coords.breakIndex <= window.break;
  }

  // A window with no bounds at all reads as "disabled until explicitly enabled".
  return true;
}

/** The set of instance ids currently disabled at the given coordinates. */
export function disabledInstanceIdSet(
  instances: readonly RuntimeActionInstance[],
  coords: RuntimeCoords,
): Set<string> {
  const ids = new Set<string>();
  for (const instance of instances) {
    if (isActionDisabled(instance, coords)) ids.add(instance.instanceId);
  }
  return ids;
}

/** Drop a disable window that has already elapsed at these coordinates. */
export function refreshDisableWindow(
  instance: RuntimeActionInstance,
  coords: RuntimeCoords,
): RuntimeActionInstance {
  if (instance.disabledUntil && !isActionDisabled(instance, coords)) {
    return enableActionInstance(instance);
  }
  return instance;
}
