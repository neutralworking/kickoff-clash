/**
 * KC rebuild engine — posture state machine (SYNERGY_MODEL_V1 §3).
 *
 * The manager's default posture is always active unless a tactical play opens
 * a timed override window; when the window expires the posture REVERTS to the
 * default. Postures are declared, never inferred. Tactical *cards* are Phase 2
 * — the override mechanism (and its revert) is spine and ships now.
 */

import type { Posture } from './contexts';

export interface PostureState {
  default: Posture;
  /** Active timed override, if any. `untilBatch` is EXCLUSIVE: reverts at its batch-start. */
  override: { posture: Posture; untilBatch: number } | null;
}

export function createPostureState(defaultPosture: Posture): PostureState {
  return { default: defaultPosture, override: null };
}

export function activePosture(s: PostureState): Posture {
  return s.override ? s.override.posture : s.default;
}

/** Open a timed posture window for `durationBatches` starting at `batch`. */
export function applyPostureWindow(
  s: PostureState,
  posture: Posture,
  batch: number,
  durationBatches: number
): PostureState {
  return { ...s, override: { posture, untilBatch: batch + durationBatches } };
}

/**
 * Batch-start tick: expire a due override. Returns the new state plus whether
 * a revert happened (the caller emits the posture-shift event).
 */
export function tickPosture(s: PostureState, batch: number): { state: PostureState; reverted: boolean } {
  if (s.override && batch >= s.override.untilBatch) {
    return { state: { ...s, override: null }, reverted: true };
  }
  return { state: s, reverted: false };
}
