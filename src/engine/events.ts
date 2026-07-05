/**
 * KC rebuild engine — the typed event log (KC_REBUILD_PLAN_V1 › architecture).
 *
 * The event stream IS the source of truth: the UI renders it, the post-match
 * dashboard aggregates it, tests assert on it (SM §9 falls out of it for
 * free). Every mechanically-relevant thing that happens in a match appears
 * here, in emission order. Side 0 = the player, side 1 = the opponent.
 */

import type { Posture, WindowKind, ClockBand } from './contexts';

export type Side = 0 | 1;

export interface Clock {
  batch: number;     // 1-based, 1..batches
  increment: number; // 1-based within the batch, 1..incrementsPerBatch
}

export type AdherenceBand = 'native' | 'adjacent' | 'foreign';

export type MatchEvent =
  | {
      type: 'match-start';
      seed: number;
      postures: [Posture, Posture];
      target: number;
      /** Present when a side plays with a formation vs its manager's preference (SM §7). */
      adherence?: [AdherenceBand, AdherenceBand];
    }
  | { type: 'batch-start'; batch: number; telegraph: [Posture, Posture] }
  | { type: 'increment-start'; clock: Clock; band: ClockBand; die: number }
  | {
      type: 'trait-proc';
      side: Side;
      trait: string;
      effect: 'charge' | 'deny' | 'die' | 'accrual' | 'fitness' | 'energy' | 'cash' | 'reweight';
      value: number;
      clock: Clock;
    }
  | { type: 'window-generated'; side: Side; kind: WindowKind; clock: Clock }
  | { type: 'window-decision'; side: Side; kind: WindowKind; decision: 'commit' | 'pass'; clock: Clock }
  | {
      type: 'window-resolved';
      side: Side;
      kind: WindowKind;
      charge: number;
      roll: number;
      die: number;
      threshold: number;
      converted: boolean;
      clock: Clock;
    }
  | { type: 'goal'; side: Side; via: WindowKind; score: [number, number]; clock: Clock }
  | {
      type: 'points-banked';
      side: Side;
      source: 'goal' | 'accrual' | 'goal-bonus';
      mult: number;
      value: number;
      total: number;
      clock: Clock;
    }
  | { type: 'cash-banked'; side: Side; trait: string; value: number; total: number; clock: Clock }
  | { type: 'streak-extended'; side: Side; streak: number; clock: Clock }
  | { type: 'streak-broken'; side: Side; reason: string; atStreak: number; clock: Clock }
  | { type: 'posture-shift'; side: Side; from: Posture; to: Posture; reason: 'tactic' | 'revert'; batch: number }
  | { type: 'tactic-played'; side: Side; card: string; posture: Posture; durationBatches: number; energyCost: number; batch: number }
  | { type: 'substitution'; side: Side; batch: number; subsLeft: number }
  | { type: 'batch-end'; batch: number; cleanFor: [boolean, boolean] }
  | { type: 'early-whistle'; clock: Clock; surplusBatches: number; surplusEnergy: number; surplusCash: number }
  | {
      type: 'full-time';
      score: [number, number];
      points: [number, number];
      target: number;
      result: 'target-met' | 'target-missed';
      surplusCash: number;
      cash: [number, number];
    };
