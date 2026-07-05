/**
 * KC rebuild engine — formation adherence (SYNERGY_MODEL_V1 §7).
 *
 * Three bands, not a sliding scale: native (manager's preferred formation),
 * adjacent (one structural step away), foreign (anything else). Mechanically
 * the band throttles the DEFAULT posture's event-generation weights — a
 * tactical window's override runs unthrottled (playing out of shape starves
 * your engine's routine; a called play still lands).
 *
 * The adjacency table contents are an SM §12 open question — this v1 table is
 * PROVISIONAL (one back-line or mid-line reshuffle counts as one step), and a
 * balance pass owns the exact percentages. Formation ids match
 * src/lib/formations.ts so the Phase 5 UI can join the two.
 */

import type { AdherenceBand } from '../events';

export const ADHERENCE_FACTOR: Record<AdherenceBand, number> = {
  native: 1.0,
  adjacent: 0.7,
  foreign: 0.4,
};

/** One structural step between formations (provisional — SM §12). */
export const FORMATION_ADJACENCY: Record<string, string[]> = {
  '4-3-3': ['4-2-3-1', '4-4-2', '3-4-3'],
  '4-4-2': ['4-3-3', '4-1-2-1-2', '5-4-1'],
  '3-5-2': ['3-4-3', '5-3-2', '4-1-2-1-2'],
  '4-2-3-1': ['4-3-3', '4-1-2-1-2', '4-4-2'],
  '3-4-3': ['3-5-2', '4-3-3'],
  '5-3-2': ['5-4-1', '3-5-2'],
  '5-4-1': ['5-3-2', '4-4-2'],
  '4-1-2-1-2': ['4-2-3-1', '4-4-2', '3-5-2'],
};

export function adherenceBand(formation: string, preferred: string): AdherenceBand {
  if (formation === preferred) return 'native';
  if ((FORMATION_ADJACENCY[preferred] ?? []).includes(formation)) return 'adjacent';
  return 'foreign';
}
