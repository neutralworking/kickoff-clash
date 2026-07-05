/**
 * KC rebuild engine — the step-resolved match loop (SYNERGY_MODEL_V1 §6).
 *
 * 6 batches × 3 increments. Decision points: BETWEEN batches (tactical posture
 * plays — cards arrive in Phase 2, the timed-window mechanism is spine) and ON
 * each of the player's generated windows (commit / pass — no empty turns).
 * The opponent auto-commits; its posture profile plus the matchup matrix IS
 * the opponent system (SM §3).
 *
 * The machine is pure and serialisable: `advance(state, decision)` returns a
 * new state plus the newly-emitted events; RNG is a 32-bit integer field.
 * Same seed + same decisions = same event log, always.
 *
 * Scoring (SM §6): goals are real events on a real scoreline; each goal banks
 * `streak-mult × goal-value` points (streak extends FIRST when the goal is an
 * engine success — the third chained counter banks ×3). Accrual `generate`
 * traits bank flat points per active increment (the Fortress hook). Early
 * whistle when the player's points meet the fixture target; surplus batches +
 * energy convert to cash (cash converts only on a met target — a lost fixture
 * banks nothing). Energy verbs (drain/restore) activate with Phase 2 tactical
 * plays; v1 spends energy only on posture plays.
 */

import { rngNext, rngSeed } from './rng';
import type { Posture, WindowKind, ContextSnapshot } from './contexts';
import { scorelineFor } from './contexts';
import type { EngineTrait, TraitContribution } from './traits';
import {
  chargeContributions,
  denyContributions,
  dieShiftContributions,
  accrualContributions,
  goalEventContributions,
  reweightContributions,
  fitnessDrainContributions,
  sumContributions,
} from './traits';
import type { MatchEvent, Side, Clock, AdherenceBand } from './events';
import type { PostureState } from './posture';
import { createPostureState, activePosture, applyPostureWindow, tickPosture } from './posture';
import type { EngineDef } from './streak';
import {
  extendsOnGoal,
  extendsOnCleanBatch,
  extendsOnSubstitution,
  contradictionOnConcede,
  contradictionOnBatchConceded,
} from './streak';
import {
  BATCHES,
  INCREMENTS_PER_BATCH,
  ENERGY_BUDGET,
  SUBS_BUDGET,
  FITNESS_RESTORE_PER_SUB,
  WINDOW_THRESHOLD,
  DIE_LADDER,
  DEFAULT_DIE_INDEX,
  GOAL_VALUE,
  clockBand,
  SURPLUS_CASH_PER_BATCH,
  SURPLUS_CASH_PER_ENERGY,
  MATCHUP_MATRIX,
} from './data/baseline';
import { adherenceBand, ADHERENCE_FACTOR } from './data/adherence';
import { getTacticalCard } from './data/tactical-cards';

// ---------------------------------------------------------------------------
// Config + state
// ---------------------------------------------------------------------------

export interface SideConfig {
  /** Manager default posture — always active unless a play overrides it. */
  posture: Posture;
  traits: EngineTrait[];
  /** Flat charge on every window resolution, before traits. */
  baseCharge: number;
  engine: EngineDef;
  /** Auto-commit every generated window (the opponent); false surfaces decisions. */
  autoCommit: boolean;
  /** Formation played vs the manager's preference → the adherence band (SM §7).
   *  Omit either to play native (no throttle). */
  formation?: string;
  preferredFormation?: string;
}

export interface MatchConfig {
  seed: number;
  sides: [SideConfig, SideConfig];
  /** Points target for side 0 (the fixture gate). */
  target: number;
  /** Tactical card ids side 0 may play between batches (each once per match). */
  tacticalHand?: string[];
}

interface SideState {
  posture: PostureState;
  goals: number;
  points: number;
  streak: number;
  fitness: number;
  cash: number;
  subsLeft: number;
  subThisBatch: boolean;
  concededThisBatch: boolean;
}

interface PendingWindow {
  side: Side;
  kind: WindowKind;
}

export type MatchStatus = 'awaiting-batch-decision' | 'awaiting-window-decision' | 'complete';

export interface MatchState {
  config: MatchConfig;
  rng: number;
  batch: number; // 0 before kickoff; 1..BATCHES during play
  increment: number; // 0 before the batch's first increment; 1..INCREMENTS_PER_BATCH
  dieIndex: number; // effective ladder index for the current increment
  sides: [SideState, SideState];
  energy: number;
  /** Tactical cards already played (each card plays once per match). */
  playedCards: string[];
  /** Static per-side generation throttle from the adherence band (SM §7). */
  adherenceFactor: [number, number];
  pending: PendingWindow[];
  status: MatchStatus;
  log: MatchEvent[];
}

export type BatchDecision =
  | { type: 'none' }
  | { type: 'posture-play'; posture: Posture; durationBatches: number }
  | { type: 'tactic-play'; cardId: string }
  | { type: 'substitution' };

export type WindowDecision = { type: 'commit' } | { type: 'pass' };

export interface AdvanceResult {
  state: MatchState;
  /** Events emitted by this advance call, in order (also appended to state.log). */
  events: MatchEvent[];
  /** What the machine is waiting for, or null when complete. */
  awaiting: { kind: 'batch-start'; batch: number } | { kind: 'window'; window: PendingWindow } | null;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createMatch(config: MatchConfig): AdvanceResult {
  const bands: [AdherenceBand, AdherenceBand] = [bandOf(config.sides[0]), bandOf(config.sides[1])];
  const state: MatchState = {
    config,
    rng: rngSeed(config.seed),
    batch: 0,
    increment: 0,
    dieIndex: DEFAULT_DIE_INDEX,
    sides: [freshSide(config.sides[0]), freshSide(config.sides[1])],
    energy: ENERGY_BUDGET,
    playedCards: [],
    adherenceFactor: [ADHERENCE_FACTOR[bands[0]], ADHERENCE_FACTOR[bands[1]]],
    pending: [],
    status: 'awaiting-batch-decision',
    log: [],
  };
  const events: MatchEvent[] = [
    {
      type: 'match-start',
      seed: config.seed,
      postures: [config.sides[0].posture, config.sides[1].posture],
      target: config.target,
      ...(config.sides[0].formation || config.sides[1].formation ? { adherence: bands } : {}),
    },
  ];
  state.log.push(...events);
  return { state, events, awaiting: { kind: 'batch-start', batch: 1 } };
}

function bandOf(cfg: SideConfig): AdherenceBand {
  if (!cfg.formation || !cfg.preferredFormation) return 'native';
  return adherenceBand(cfg.formation, cfg.preferredFormation);
}

function freshSide(cfg: SideConfig): SideState {
  return {
    posture: createPostureState(cfg.posture),
    goals: 0,
    points: 0,
    streak: 0,
    fitness: 10,
    cash: 0,
    subsLeft: SUBS_BUDGET,
    subThisBatch: false,
    concededThisBatch: false,
  };
}

// ---------------------------------------------------------------------------
// The step function
// ---------------------------------------------------------------------------

export function advance(prev: MatchState, decision: BatchDecision | WindowDecision): AdvanceResult {
  if (prev.status === 'complete') throw new Error('advance() on a completed match');
  const state = cloneState(prev);
  const events: MatchEvent[] = [];
  const emit = (e: MatchEvent) => {
    events.push(e);
    state.log.push(e);
  };

  if (state.status === 'awaiting-batch-decision') {
    if (decision.type === 'commit' || decision.type === 'pass') {
      throw new Error('expected a batch decision');
    }
    startBatch(state, decision, emit);
  } else {
    if (decision.type !== 'commit' && decision.type !== 'pass') {
      throw new Error('expected a window decision');
    }
    resolveHeadWindow(state, decision.type, emit);
  }

  run(state, emit);
  return { state, events, awaiting: awaitingOf(state) };
}

function awaitingOf(state: MatchState): AdvanceResult['awaiting'] {
  if (state.status === 'awaiting-window-decision') return { kind: 'window', window: state.pending[0] };
  if (state.status === 'awaiting-batch-decision') return { kind: 'batch-start', batch: state.batch + 1 };
  return null;
}

/** True once full time has been called. A function so TS can't over-narrow
 *  `state.status` across the mutating helper calls inside run()'s loop. */
function isComplete(state: MatchState): boolean {
  return state.status === 'complete';
}

/** Drive the machine until the next decision point or full time. */
function run(state: MatchState, emit: (e: MatchEvent) => void): void {
  while (!isComplete(state)) {
    // Drain pending windows; a player window without autoCommit pauses the machine.
    while (state.pending.length > 0) {
      const head = state.pending[0];
      if (head.side === 0 && !state.config.sides[0].autoCommit) {
        state.status = 'awaiting-window-decision';
        return;
      }
      resolveHeadWindow(state, 'commit', emit);
      if (isComplete(state)) return; // early whistle mid-queue
    }
    if (state.increment < INCREMENTS_PER_BATCH) {
      runIncrement(state, emit);
      if (isComplete(state)) return;
      continue;
    }
    endBatch(state, emit);
    if (state.batch < BATCHES) {
      state.status = 'awaiting-batch-decision';
      return;
    }
    finish(state, emit, null);
    return;
  }
}

// ---------------------------------------------------------------------------
// Batch lifecycle
// ---------------------------------------------------------------------------

function startBatch(state: MatchState, decision: BatchDecision, emit: (e: MatchEvent) => void): void {
  state.batch += 1;
  state.increment = 0;

  // Expire due posture windows — revert to the manager default (SM §3).
  for (const side of [0, 1] as const) {
    const before = activePosture(state.sides[side].posture);
    const { state: next, reverted } = tickPosture(state.sides[side].posture, state.batch);
    state.sides[side].posture = next;
    if (reverted) {
      emit({ type: 'posture-shift', side, from: before, to: activePosture(next), reason: 'revert', batch: state.batch });
    }
  }

  // The player's between-batch play: a raw timed posture window (1 energy)…
  if (decision.type === 'posture-play') {
    if (state.energy < 1) throw new Error('posture-play with no energy left');
    state.energy -= 1;
    openPostureWindow(state, decision.posture, decision.durationBatches, emit);
  }
  // …or a tactical CARD from the hand: duration + cost are card stats (SM §3),
  // each card plays once per match, between batches only.
  if (decision.type === 'tactic-play') {
    const card = getTacticalCard(decision.cardId);
    if (!card) throw new Error(`unknown tactical card: ${decision.cardId}`);
    if (!(state.config.tacticalHand ?? []).includes(card.id)) {
      throw new Error(`tactical card not in hand: ${card.id}`);
    }
    if (state.playedCards.includes(card.id)) throw new Error(`tactical card already played: ${card.id}`);
    if (state.energy < card.energyCost) throw new Error(`not enough energy for ${card.id}`);
    state.energy -= card.energyCost;
    state.playedCards.push(card.id);
    emit({
      type: 'tactic-played',
      side: 0,
      card: card.id,
      posture: card.posture,
      durationBatches: card.durationBatches,
      energyCost: card.energyCost,
      batch: state.batch,
    });
    openPostureWindow(state, card.posture, card.durationBatches, emit);
  }
  // …or a substitution: an instantaneous event (SM §2) restoring a little
  // fitness, feeding substitution-context traits for the rest of the batch,
  // and extending substitution-success engines (Tinkerman fuel).
  if (decision.type === 'substitution') {
    if (state.sides[0].subsLeft <= 0) throw new Error('no substitutions left');
    state.sides[0].subsLeft -= 1;
    state.sides[0].subThisBatch = true;
    state.sides[0].fitness = Math.min(10, state.sides[0].fitness + FITNESS_RESTORE_PER_SUB);
    emit({ type: 'substitution', side: 0, batch: state.batch, subsLeft: state.sides[0].subsLeft });
    const def = state.config.sides[0].engine;
    if (extendsOnSubstitution(def)) {
      state.sides[0].streak += 1;
      emit({
        type: 'streak-extended',
        side: 0,
        streak: state.sides[0].streak,
        clock: { batch: state.batch, increment: 0 },
      });
    }
  }

  // Telegraph: both sides' active postures for this batch (opponent shifts are
  // static in P1 — profile-driven shifts arrive with Phase 2/4 opponents).
  emit({
    type: 'batch-start',
    batch: state.batch,
    telegraph: [activePosture(state.sides[0].posture), activePosture(state.sides[1].posture)],
  });
}

/** Open a timed posture window for side 0 and emit the shift. */
function openPostureWindow(
  state: MatchState,
  posture: Posture,
  durationBatches: number,
  emit: (e: MatchEvent) => void
): void {
  const from = activePosture(state.sides[0].posture);
  state.sides[0].posture = applyPostureWindow(state.sides[0].posture, posture, state.batch, durationBatches);
  emit({ type: 'posture-shift', side: 0, from, to: posture, reason: 'tactic', batch: state.batch });
}

function endBatch(state: MatchState, emit: (e: MatchEvent) => void): void {
  const cleanFor: [boolean, boolean] = [
    !state.sides[0].concededThisBatch,
    !state.sides[1].concededThisBatch,
  ];
  const clock: Clock = { batch: state.batch, increment: INCREMENTS_PER_BATCH };

  for (const side of [0, 1] as const) {
    const def = state.config.sides[side].engine;
    if (cleanFor[side] && extendsOnCleanBatch(def)) {
      state.sides[side].streak += 1;
      emit({ type: 'streak-extended', side, streak: state.sides[side].streak, clock });
    }
    if (!cleanFor[side]) {
      const reason = contradictionOnBatchConceded(def);
      if (reason && state.sides[side].streak > 0) {
        emit({ type: 'streak-broken', side, reason, atStreak: state.sides[side].streak, clock });
        state.sides[side].streak = 0;
      }
    }
    state.sides[side].concededThisBatch = false;
    state.sides[side].subThisBatch = false;
  }

  emit({ type: 'batch-end', batch: state.batch, cleanFor });
}

// ---------------------------------------------------------------------------
// Increment lifecycle
// ---------------------------------------------------------------------------

function runIncrement(state: MatchState, emit: (e: MatchEvent) => void): void {
  state.increment += 1;
  const clock: Clock = { batch: state.batch, increment: state.increment };
  const band = clockBand(state.batch);
  const snaps: [ContextSnapshot, ContextSnapshot] = [snapshotOf(state, 0), snapshotOf(state, 1)];

  // Variance verbs step the shared resolution die for this increment (SM §6).
  const dieShifts = dieShiftContributions(
    [state.config.sides[0].traits, state.config.sides[1].traits],
    snaps
  );
  let idx = DEFAULT_DIE_INDEX;
  for (const c of dieShifts) {
    idx += c.value;
    emitProc(emit, sideOfTrait(state, c), c, clock);
  }
  state.dieIndex = Math.max(0, Math.min(DIE_LADDER.length - 1, idx));
  emit({ type: 'increment-start', clock, band, die: DIE_LADDER[state.dieIndex] });

  for (const side of [0, 1] as const) {
    // Accrual: active `generate` traits bank their resource goallessly
    // (points — the Fortress hook — or cash).
    for (const c of accrualContributions(state.config.sides[side].traits, snaps[side])) {
      emitProc(emit, side, c, clock);
      if (c.effect === 'cash') {
        state.sides[side].cash += c.value;
        emit({ type: 'cash-banked', side, trait: c.trait.name, value: c.value, total: state.sides[side].cash, clock });
        continue;
      }
      state.sides[side].points += c.value;
      emit({
        type: 'points-banked',
        side,
        source: 'accrual',
        mult: 1,
        value: c.value,
        total: state.sides[side].points,
        clock,
      });
    }
    // Fitness drain (Taskmaster fuel).
    for (const c of fitnessDrainContributions(state.config.sides[side].traits, snaps[side])) {
      emitProc(emit, side, c, clock);
      state.sides[side].fitness = Math.max(0, state.sides[side].fitness - c.value);
    }
  }
  if (checkEarlyWhistle(state, emit, clock)) return;

  // Window generation from the posture matchup matrix — fixed roll order:
  // side 0 then side 1, transition then set-piece (determinism contract).
  // Manager relocate traits reweight the rates first (conserving total), then
  // the adherence band throttles DEFAULT-posture generation only (SM §7 — a
  // tactical window's override runs unthrottled).
  for (const side of [0, 1] as const) {
    const own = activePosture(state.sides[side].posture);
    const opp = activePosture(state.sides[side === 0 ? 1 : 0].posture);
    const base = MATCHUP_MATRIX[own][opp];
    const onDefault = own === state.config.sides[side].posture;
    const throttle = onDefault ? state.adherenceFactor[side] : 1;
    for (const kind of ['transition', 'set-piece'] as const) {
      const reweights = reweightContributions(state.config.sides[side].traits, kind);
      let rate = base[kind];
      for (const c of reweights) rate += c.value;
      rate = Math.max(0, rate) * throttle;
      const { value, next } = rngNext(state.rng);
      state.rng = next;
      if (value < rate) {
        for (const c of reweights) {
          if (c.value > 0) emitProc(emit, side, c, clock);
        }
        emit({ type: 'window-generated', side, kind, clock });
        state.pending.push({ side, kind });
      }
    }
  }
}

function snapshotOf(state: MatchState, side: Side): ContextSnapshot {
  const me = state.sides[side];
  const them = state.sides[side === 0 ? 1 : 0];
  return {
    posture: activePosture(me.posture),
    scoreline: scorelineFor(me.goals, them.goals),
    clock: clockBand(Math.max(1, state.batch)),
    streak: me.streak,
    fitness: me.fitness,
    subThisBatch: me.subThisBatch,
  };
}

function sideOfTrait(state: MatchState, c: TraitContribution): Side {
  return state.config.sides[0].traits.includes(c.trait) ? 0 : 1;
}

function emitProc(emit: (e: MatchEvent) => void, side: Side, c: TraitContribution, clock: Clock): void {
  emit({ type: 'trait-proc', side, trait: c.trait.name, effect: c.effect, value: c.value, clock });
}

// ---------------------------------------------------------------------------
// Window resolution — charge + d(die) ≥ threshold (SM §6)
// ---------------------------------------------------------------------------

function resolveHeadWindow(state: MatchState, decision: 'commit' | 'pass', emit: (e: MatchEvent) => void): void {
  const window = state.pending.shift();
  if (!window) throw new Error('no pending window to resolve');
  const clock: Clock = { batch: state.batch, increment: state.increment };
  state.status = 'awaiting-batch-decision'; // neutral; run() re-derives pauses

  emit({ type: 'window-decision', side: window.side, kind: window.kind, decision, clock });
  if (decision === 'pass') return;

  const side = window.side;
  const other = (side === 0 ? 1 : 0) as Side;
  const snap = snapshotOf(state, side);
  const oppSnap = snapshotOf(state, other);

  const charges = chargeContributions(state.config.sides[side].traits, window.kind, snap);
  const denies = denyContributions(state.config.sides[other].traits, window.kind, oppSnap);
  for (const c of charges) emitProc(emit, side, c, clock);
  for (const c of denies) emitProc(emit, other, c, clock);

  const charge = state.config.sides[side].baseCharge + sumContributions(charges) - sumContributions(denies);
  const die = DIE_LADDER[state.dieIndex];
  const { value, next } = rngNext(state.rng);
  state.rng = next;
  const roll = 1 + Math.floor(value * die);
  const converted = charge + roll >= WINDOW_THRESHOLD;

  emit({
    type: 'window-resolved',
    side,
    kind: window.kind,
    charge,
    roll,
    die,
    threshold: WINDOW_THRESHOLD,
    converted,
    clock,
  });
  if (!converted) return;

  // GOAL — honest scoreline + points banked at streak-mult × goal-value.
  state.sides[side].goals += 1;
  state.sides[other].concededThisBatch = true;
  emit({
    type: 'goal',
    side,
    via: window.kind,
    score: [state.sides[0].goals, state.sides[1].goals],
    clock,
  });

  const def = state.config.sides[side].engine;
  if (extendsOnGoal(def, window.kind)) {
    state.sides[side].streak += 1;
    emit({ type: 'streak-extended', side, streak: state.sides[side].streak, clock });
  }
  const mult = Math.max(1, state.sides[side].streak);
  const banked = mult * GOAL_VALUE;
  state.sides[side].points += banked;
  emit({
    type: 'points-banked',
    side,
    source: 'goal',
    mult,
    value: banked,
    total: state.sides[side].points,
    clock,
  });

  // Goal-event generates: the scorer's 'scored' hooks (bonus points, cash) and
  // the conceder's 'conceded' hooks (SM §2 goal-event).
  for (const c of goalEventContributions(state.config.sides[side].traits, 'scored', window.kind)) {
    emitProc(emit, side, c, clock);
    bankGoalEvent(state, side, c, emit, clock);
  }
  for (const c of goalEventContributions(state.config.sides[other].traits, 'conceded', window.kind)) {
    emitProc(emit, other, c, clock);
    bankGoalEvent(state, other, c, emit, clock);
  }

  // The conceder's engine contradiction — the reset IS the punishment (SM §6).
  const oppDef = state.config.sides[other].engine;
  const reason = contradictionOnConcede(oppDef, window.kind);
  if (reason && state.sides[other].streak > 0) {
    emit({ type: 'streak-broken', side: other, reason, atStreak: state.sides[other].streak, clock });
    state.sides[other].streak = 0;
  }

  checkEarlyWhistle(state, emit, clock);
}

/** Bank a goal-event contribution to its resource: bonus points or cash. */
function bankGoalEvent(
  state: MatchState,
  side: Side,
  c: TraitContribution,
  emit: (e: MatchEvent) => void,
  clock: Clock
): void {
  if (c.effect === 'cash') {
    state.sides[side].cash += c.value;
    emit({ type: 'cash-banked', side, trait: c.trait.name, value: c.value, total: state.sides[side].cash, clock });
  } else {
    state.sides[side].points += c.value;
    emit({
      type: 'points-banked',
      side,
      source: 'goal-bonus',
      mult: 1,
      value: c.value,
      total: state.sides[side].points,
      clock,
    });
  }
}

// ---------------------------------------------------------------------------
// Full time
// ---------------------------------------------------------------------------

function checkEarlyWhistle(state: MatchState, emit: (e: MatchEvent) => void, clock: Clock): boolean {
  if (state.sides[0].points < state.config.target) return false;
  const surplusBatches = BATCHES - state.batch;
  const surplusCash = surplusBatches * SURPLUS_CASH_PER_BATCH + state.energy * SURPLUS_CASH_PER_ENERGY;
  emit({
    type: 'early-whistle',
    clock,
    surplusBatches,
    surplusEnergy: state.energy,
    surplusCash,
  });
  finish(state, emit, surplusCash);
  return true;
}

function finish(state: MatchState, emit: (e: MatchEvent) => void, earlySurplus: number | null): void {
  const met = state.sides[0].points >= state.config.target;
  // Cash converts only on a met target; a natural FT win still cashes unspent energy.
  const surplusCash = earlySurplus ?? (met ? state.energy * SURPLUS_CASH_PER_ENERGY : 0);
  emit({
    type: 'full-time',
    score: [state.sides[0].goals, state.sides[1].goals],
    points: [state.sides[0].points, state.sides[1].points],
    target: state.config.target,
    result: met ? 'target-met' : 'target-missed',
    surplusCash,
    cash: [state.sides[0].cash, state.sides[1].cash],
  });
  state.status = 'complete';
  state.pending = [];
}

// ---------------------------------------------------------------------------
// Cloning (advance is pure — callers keep old states for replay)
// ---------------------------------------------------------------------------

function cloneState(s: MatchState): MatchState {
  return {
    ...s,
    sides: [
      { ...s.sides[0], posture: { ...s.sides[0].posture, override: s.sides[0].posture.override && { ...s.sides[0].posture.override } } },
      { ...s.sides[1], posture: { ...s.sides[1].posture, override: s.sides[1].posture.override && { ...s.sides[1].posture.override } } },
    ],
    pending: [...s.pending],
    log: [...s.log],
  };
}

// ---------------------------------------------------------------------------
// Headless runner
// ---------------------------------------------------------------------------

export interface HeadlessPolicy {
  onBatch(state: MatchState, batch: number): BatchDecision;
  onWindow(state: MatchState, window: PendingWindow): WindowDecision;
}

/** The reference policy: play nothing, commit every window (mirrored by balance_sim.py). */
export const COMMIT_ALL: HeadlessPolicy = {
  onBatch: () => ({ type: 'none' }),
  onWindow: () => ({ type: 'commit' }),
};

export function runHeadless(config: MatchConfig, policy: HeadlessPolicy = COMMIT_ALL): MatchState {
  let res = createMatch(config);
  let guard = 10_000;
  while (res.awaiting && guard-- > 0) {
    const decision =
      res.awaiting.kind === 'batch-start'
        ? policy.onBatch(res.state, res.awaiting.batch)
        : policy.onWindow(res.state, res.awaiting.window);
    res = advance(res.state, decision);
  }
  if (guard <= 0) throw new Error('runHeadless: no termination');
  return res.state;
}

/** Aggregate result read off the completed state (the log stays the truth). */
export function matchResult(state: MatchState) {
  if (state.status !== 'complete') throw new Error('matchResult() on a live match');
  return {
    score: [state.sides[0].goals, state.sides[1].goals] as [number, number],
    points: [state.sides[0].points, state.sides[1].points] as [number, number],
    target: state.config.target,
    targetMet: state.sides[0].points >= state.config.target,
    energyLeft: state.energy,
    cash: [state.sides[0].cash, state.sides[1].cash] as [number, number],
  };
}

/** Build a player SideConfig from a manager definition (law 4: the manager IS
 *  this data — default posture + trait bundle + engine; no manager object). */
export function sideFromManager(
  manager: {
    defaultPosture: Posture;
    preferredFormation: string;
    traits: EngineTrait[];
    engine: EngineDef;
  },
  opts?: { baseCharge?: number; formation?: string }
): SideConfig {
  return {
    posture: manager.defaultPosture,
    traits: manager.traits,
    baseCharge: opts?.baseCharge ?? 0,
    engine: manager.engine,
    autoCommit: false,
    formation: opts?.formation ?? manager.preferredFormation,
    preferredFormation: manager.preferredFormation,
  };
}
