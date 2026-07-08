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

export interface TacticalCard {
  id: string;
  name: string;
  posture: Posture;
  durationBatches: number;
  energyCost: number;
}

export const DEFAULT_ENERGY = 5;

export const TACTICS: TacticalCard[] = [
  { id: 'park-the-bus', name: 'Park the Bus', posture: 'defend', durationBatches: 2, energyCost: 2 },
  { id: 'game-management', name: 'Game Management', posture: 'balanced', durationBatches: 2, energyCost: 1 },
  { id: 'high-press', name: 'High Press', posture: 'attack', durationBatches: 1, energyCost: 2 },
  { id: 'all-out-attack', name: 'All-Out Attack', posture: 'attack', durationBatches: 2, energyCost: 3 },
  { id: 'gegenpress', name: 'Gegenpress', posture: 'attack', durationBatches: 1, energyCost: 3 },
];

export const TACTICS_BY_ID: Record<string, TacticalCard> = Object.fromEntries(
  TACTICS.map((t) => [t.id, t])
);

/** A scheduled play: open `tactic`'s window at the start of batch `atBatch`. */
export interface TacticalPlay {
  atBatch: number;
  tactic: TacticalCard;
}
