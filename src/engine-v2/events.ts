/**
 * KC six-contest engine (NW-139 Fork A) — the typed event log.
 *
 * The event stream IS the source of truth (KC_REBUILD_PLAN architecture): the
 * UI renders it, the post-match dashboard aggregates it, and the vitest harness
 * asserts on it. Every mechanically-relevant thing in a match appears here in
 * emission order. Side 0 = the player, side 1 = the opponent.
 *
 * The six-contest resolution is visible end to end: possession split → per-slot
 * retain roll (with the KEEP↔BREAK coupling flagged) → CREATE chance volume →
 * quality tier + xG → FINISH conversion (goal = 1 − e^(−xG)) → goal + points.
 */

import type { Contest } from './contests';
import type { Posture, Scoreline, ClockBand } from './gates';

export type Side = 0 | 1;

export interface Clock {
  batch: number; // 1-based
  increment: number; // 1-based within the batch
}

export type ChanceQuality = 'half' | 'big';
export type ChanceOrigin = 'open-play' | 'transition' | 'set-piece' | 'trait';

export type MatchEvent =
  | {
      type: 'match-start';
      seed: number;
      postures: [Posture, Posture];
      dials: [Record<Contest, number>, Record<Contest, number>];
      target: number;
      managers?: [string | null, string | null];
      adherence?: ['native' | 'adjacent' | 'foreign', 'native' | 'adjacent' | 'foreign'];
    }
  | { type: 'batch-start'; batch: number; band: ClockBand; postures: [Posture, Posture] }
  | { type: 'posture-shift'; side: Side; to: Posture; reason: 'revert' | 'tactic'; batch: number }
  | { type: 'tactic-played'; side: Side; card: string; posture: Posture; durationBatches: number; energyCost: number; energyLeft: number; batch: number }
  | { type: 'substitution'; side: Side; batch: number; subsLeft: number }
  | { type: 'fitness-drained'; side: Side; amount: number; fitness: number; batch: number }
  | { type: 'cash-banked'; side: Side; value: number; total: number; clock: Clock }
  | { type: 'increment-start'; clock: Clock; scoreline: [Scoreline, Scoreline] }
  | { type: 'possession-split'; clock: Clock; slots: [number, number] }
  | {
      type: 'retain-roll';
      side: Side;
      clock: Clock;
      slot: number;
      p: number;
      retained: boolean;
      /** Set when a failed retain feeds the opponent a BREAK transition chance. */
      fedTransition?: boolean;
    }
  | {
      type: 'chance';
      side: Side;
      clock: Clock;
      origin: ChanceOrigin;
      quality: ChanceQuality;
      xg: number;
      converted: boolean;
      roll: number;
    }
  | { type: 'trait-proc'; side: Side; clock: Clock; name: string; effect: string; value: number }
  | { type: 'goal'; side: Side; via: Contest; origin: ChanceOrigin; score: [number, number]; clock: Clock }
  | {
      type: 'points-banked';
      side: Side;
      source: 'goal';
      mult: number;
      value: number;
      total: number;
      clock: Clock;
    }
  | { type: 'streak-extended'; side: Side; streak: number; clock: Clock }
  | { type: 'streak-broken'; side: Side; reason: string; atStreak: number; clock: Clock }
  | { type: 'batch-end'; batch: number; cleanFor: [boolean, boolean]; score: [number, number] }
  | { type: 'early-whistle'; clock: Clock; reason: string }
  | {
      type: 'full-time';
      score: [number, number];
      points: [number, number];
      target: number;
      result: 'target-met' | 'target-missed';
    };
