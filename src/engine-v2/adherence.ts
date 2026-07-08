/**
 * KC six-contest engine (NW-140) — formation adherence.
 *
 * A squad fielded in its manager's PREFERRED formation gets full tilt
 * contribution; an ADJACENT shape throttles it; a FOREIGN shape throttles it
 * hard. Adherence is the formation-level generalisation of the P1 off-position
 * soft-tilt (positional.ts `effectiveTilt`): both throttle the same
 * tilt-contribution term — off-position per card, adherence per squad.
 *
 * Depth = reference-frame only (contests resolve as global totals); adherence
 * does NOT change which contest a tilt feeds, only how much of it counts. The
 * adjacency table is DATA (law 4).
 */

import type { Contest, Position } from './contests';

export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '5-3-2';

export const FORMATIONS: Record<FormationId, Position[]> = {
  '4-3-3': ['GK', 'CD', 'CD', 'WD', 'WD', 'DM', 'CM', 'CM', 'WF', 'CF', 'WF'],
  '4-4-2': ['GK', 'CD', 'CD', 'WD', 'WD', 'WM', 'CM', 'CM', 'WM', 'CF', 'CF'],
  '4-2-3-1': ['GK', 'CD', 'CD', 'WD', 'WD', 'DM', 'DM', 'AM', 'WF', 'WF', 'CF'],
  '3-5-2': ['GK', 'CD', 'CD', 'CD', 'WM', 'WM', 'DM', 'CM', 'CM', 'CF', 'CF'],
  '5-3-2': ['GK', 'CD', 'CD', 'CD', 'WD', 'WD', 'CM', 'CM', 'CM', 'CF', 'CF'],
};

export type AdherenceBand = 'native' | 'adjacent' | 'foreign';

/** Adjacency data: shapes one step apart are ADJACENT; everything else FOREIGN. */
const ADJACENT: Record<FormationId, readonly FormationId[]> = {
  '4-3-3': ['4-2-3-1', '4-4-2'],
  '4-4-2': ['4-3-3', '5-3-2'],
  '4-2-3-1': ['4-3-3', '3-5-2'],
  '3-5-2': ['4-2-3-1', '5-3-2'],
  '5-3-2': ['4-4-2', '3-5-2'],
};

/** Tilt-contribution multiplier per band (tunable; the sim pass calibrates). */
export const ADHERENCE_MULT: Record<AdherenceBand, number> = {
  native: 1.0,
  adjacent: 0.75,
  foreign: 0.5,
};

export function adherenceBand(fielded: FormationId, preferred: FormationId): AdherenceBand {
  if (fielded === preferred) return 'native';
  if (ADJACENT[preferred].includes(fielded)) return 'adjacent';
  return 'foreign';
}

/** Throttle a side's contest dials by its adherence band (tilt contribution). */
export function throttleDials(
  dials: Record<Contest, number>,
  band: AdherenceBand
): Record<Contest, number> {
  const m = ADHERENCE_MULT[band];
  const out = { ...dials };
  for (const k of Object.keys(out) as Contest[]) out[k] *= m;
  return out;
}
