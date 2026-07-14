/**
 * KC six-contest engine (NW-140) — the tactical deck as timed posture windows.
 *
 * A tactical card opens a POSTURE WINDOW (posture.ts): it overrides the
 * manager's default posture for `durationBatches`, costs energy, and is played
 * BETWEEN batches only. When the window expires the posture reverts (the P1
 * revert scaffolding). Posture is read only as a GATE (gates.ts) — a tactic
 * never resolves a contest; it changes which gated traits are open (Regista
 * ¬attack, Segundo Volante attack).
 *
 * Cards are DATA (law 4); duration and energy cost are stats.
 */

import type { Posture } from './gates';
import type { Contest } from './contests';

export interface TacticalCard {
  id: string;
  name: string;
  posture: Posture;
  durationBatches: number;
  energyCost: number;
  /** Optional class buff while the window is open: flat dial points, applied
   *  ONLY to contests the build is COMMITTED to (COMMIT_MIN — the
   *  no-unconditional law extends to tactics: an uncommitted side playing the
   *  card gets the posture window, not the buff). The KEEP lever (owner
   *  direction, 2026-07): tactics buff a committed class harder. */
  dialBoost?: Partial<Record<Contest, number>>;
}

export const DEFAULT_ENERGY = 5;

export const TACTICS: TacticalCard[] = [
  { id: 'park-the-bus', name: 'Park the Bus', posture: 'defend', durationBatches: 2, energyCost: 2 },
  { id: 'game-management', name: 'Game Management', posture: 'balanced', durationBatches: 2, energyCost: 1 },
  { id: 'high-press', name: 'High Press', posture: 'attack', durationBatches: 1, energyCost: 2 },
  { id: 'all-out-attack', name: 'All-Out Attack', posture: 'attack', durationBatches: 2, energyCost: 3 },
  { id: 'gegenpress', name: 'Gegenpress', posture: 'attack', durationBatches: 1, energyCost: 3 },
  // The possession play: a KEEP-committed side strangles the game for two
  // batches — retain rolls climb, turnovers (and the BREAK counters they feed)
  // dry up. Dead weight for a build that hasn't committed to KEEP, by law.
  { id: 'keep-ball', name: 'Keep Ball', posture: 'balanced', durationBatches: 2, energyCost: 2, dialBoost: { KEEP: 5 } },
];

export const TACTICS_BY_ID: Record<string, TacticalCard> = Object.fromEntries(
  TACTICS.map((t) => [t.id, t])
);

/** A scheduled play: open `tactic`'s window at the start of batch `atBatch`. */
export interface TacticalPlay {
  atBatch: number;
  tactic: TacticalCard;
}
