/**
 * KC six-contest engine (NW-139 Fork A) — the posture state machine.
 *
 * A side's manager default posture is always active unless a timed tactical
 * window overrides it; when the window expires the posture REVERTS to the
 * default (a revert emits a posture-shift event). Postures are DECLARED, never
 * inferred, and read only as GATES (gates.ts) — posture never resolves a
 * contest (Regista's chance is gated ¬attack, Segundo Volante gated attack).
 *
 * Timed tactical *cards* that open windows are NW-140; the state machine + the
 * revert scaffolding are spine and ship now (P1). In P1 no window is opened, so
 * activePosture always returns the default — but the machinery is here and the
 * revert is tested.
 */

import type { Posture } from './gates';

export interface PostureState {
  default: Posture;
  /** Active timed override; `untilBatch` is EXCLUSIVE (reverts at its start). */
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
 * Batch-start tick: expire a due override. Returns the new state plus whether a
 * revert happened and the posture it reverted to (the caller emits the shift).
 */
export function tickPosture(s: PostureState, batch: number): { state: PostureState; reverted: Posture | null } {
  if (s.override && batch >= s.override.untilBatch) {
    return { state: { ...s, override: null }, reverted: s.default };
  }
  return { state: s, reverted: null };
}
