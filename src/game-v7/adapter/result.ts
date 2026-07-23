// Adapter boundary result type. The adapters never silently patch or drop
// invalid data — they return a typed, visible error the UI can surface, so a
// mis-mapped card or an illegal break plan is a diagnosable failure rather than
// a corrupted match state.

export type AdapterErrorCode =
  | 'missing_field'
  | 'unknown_position'
  | 'unknown_card'
  | 'unknown_action'
  | 'unknown_formation'
  | 'illegal_plan'
  | 'over_budget'
  | 'incomplete_lineup'
  | 'unsupported_combo';

export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  detail?: Record<string, unknown>;
}

export type AdapterResult<T> = { ok: true; value: T } | { ok: false; error: AdapterError };

export const ok = <T>(value: T): AdapterResult<T> => ({ ok: true, value });
export const err = (code: AdapterErrorCode, message: string, detail?: Record<string, unknown>): AdapterResult<never> => ({
  ok: false,
  error: detail ? { code, message, detail } : { code, message },
});

/** Unwrap a result or throw — for call sites that treat an error as a bug. */
export function expect<T>(result: AdapterResult<T>): T {
  if (!result.ok) throw new Error(`[v7-adapter:${result.error.code}] ${result.error.message}`);
  return result.value;
}
