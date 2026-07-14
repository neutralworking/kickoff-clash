/**
 * KC six-contest engine (NW-139 Fork A) — the step-resolved match loop.
 *
 * 6 batches × 3 increments over a typed event log (events.ts). The six contests
 * resolve as GLOBAL TEAM TOTALS (contests.ts); the positional graph only routes
 * targeting. Resolution chain, per CARD_SYSTEM_V2 §2 + _CHANGES §3/§4:
 *
 *   possession split (6 slots, 2–4/side by KEEP−PRESS)
 *     → per-slot RETAIN roll (KEEP vs PRESS); a failed retain feeds the
 *       opponent a BREAK transition chance — the KEEP↔BREAK duel
 *     → CREATE = chance VOLUME (Poisson on CREATE−BREAK)
 *     → quality tier (half|big) + xG
 *     → FINISH = conversion:  goal = 1 − e^(−xG)   (the owner-chosen FINISH model)
 *     → set pieces: a CREATE-fed, DEF-keyed (aerial) dead-ball path (§7)
 *
 * Contexts are GATES only (gates.ts) — posture/scoreline/clock/fitness
 * scale trait magnitude; none resolves a contest. Determinism: one RngStream
 * per match, consumed in fixed order → same seed + same squads = same log.
 *
 * Constants are ported from `scripts/kc_sim.py` and re-tuned for the xG FINISH
 * model so the engine reproduces kc_sim's balance shape (round-robin spread
 * ≈0.55, ~1.2 goals/side mid-vs-mid, no runaway) — the harness is the gate.
 */

import {
  type Card,
  type Contest,
  contestDials,
  backlineDef,
  topAtt,
  topDef,
} from './contests';
import {
  type Gate,
  type GateSnapshot,
  type Posture,
  type Scoreline,
  scorelineFor,
  clockBand,
} from './gates';
import {
  type EngineTrait,
  dialDeltas,
  chanceGenerated,
  chanceDenied,
  xgShift,
  varianceShift,
  fitnessDrain,
} from './traits';
import type { MatchEvent, Side, Clock, ChanceQuality, ChanceOrigin } from './events';
import { RngStream } from './rng';
import {
  type PostureState,
  createPostureState,
  activePosture,
  tickPosture,
  applyPostureWindow,
} from './posture';
import { type Manager, managerTraits, COMMIT_MIN } from './managers';
import { type FormationId, type AdherenceBand, adherenceBand, throttleDials } from './adherence';
import { TACTICS_BY_ID, type TacticalCard, type TacticalPlay } from './tactics';

// ---- tunables (ported from kc_sim.py; xG-model constants re-calibrated) -----
const BATCHES = 6;
const INCREMENTS = 3;

const KEEP_K = 4.0; // possession-split slope (kc_sim)
const RETAIN_BASE = 0.72;
const RETAIN_K = 0.026; // per (KEEP − PRESS) point
const RETAIN_LO = 0.4;
const RETAIN_HI = 0.94;
const FEED_BASE = 0.35; // base prob a turnover becomes an opp transition chance
const FEED_BREAK_K = 0.03; // + per opp BREAK point (the coupling strength)
const FEED_HI = 0.85;

const VOL_BASE = 1.65; // open-play chances per retained possession (Poisson mean)
const VOL_SLIDE = 0.09; // per (CREATE − BREAK)
const VOL_LO = 0.2;
const VOL_HI = 3.4;

const P_BIG_BASE = 0.24;
const P_BIG_K = 0.045; // per (CREATE − BREAK)
const P_BIG_LO = 0.05;
const P_BIG_HI = 0.62;

const XG_HALF = 0.23;
const XG_BIG = 0.6;
const K_FIN = 0.18; // (FINISH − STOP) → xG, log space
const K_STAT = 0.028; // (topAtt − backlineDef) → xG, log space
const K_VAR = 0.15; // variance-verb spread on xG

const SP_BASE = 0.12; // set-piece dead-ball base (kc_sim §7)
const SP_CARRIER = 1.7;
const SP_XG_BASE = 0.32;
const K_SPDEF = 0.014; // (topDef − opp backlineDef) → set-piece xG

const GOAL_VALUE = 1.9; // flat points per goal (attacking scoring channel). Goals are
// HIGHER-VARIANCE than clean batches, so under a permadeath blind the goal channel needs a
// larger per-event value to give attacking builds the same left-tail margin a wall gets.
const CLEAN_BATCH_VALUE = 0.85; // flat points per clean batch — the DEFENSIVE scoring
// channel, banked only by a defensively-committed build (a wall's clean sheets are its
// goals). Clean batches are common, so this must be gated on commitment or every build
// would floor on it; an attacker keeps clean batches but scores via goals, not these.
const PRESSURE_BATCH_VALUE = 0.7; // flat points per PRESSURE batch — the attacking
// mirror of the clean batch. An attack-committed side that dominates a batch's chances
// but doesn't convert still banks territory. This is the attacker's FLOOR: without it a
// pure attacker banks ZERO on any shutout match and dies at F1 as easily as F9 (a
// defender never scores zero — clean batches are its floor). Small, so a goal (banked
// separately) is always worth far more than the pressure it converts from.
const DEFENSIVE_COMMIT: readonly Contest[] = ['STOP', 'BREAK', 'PRESS', 'KEEP'];
const ATTACK_COMMIT: readonly Contest[] = ['FINISH', 'CREATE'];
const DEFAULT_TARGET = 3;
const DAMPEN_FLOOR = 0.12; // dampen-variance lifts poor chances (consistency axis)
const SAVE_P = 0.5; // a firing keeper/stopper deny cancels one chance with this prob
const DEFAULT_ENERGY = 5;
const CHASE_DRAIN = 2; // chasing the ball is exhausting: per batch a KEEP-committed
// holder makes the OTHER side run, their fitness drains by this (the possession
// win-con's teeth — the KEEP lever, owner direction 2026-07). Commitment-gated
// like every payoff: an uncommitted side holding a batch tires nobody.

/** Tired legs create/finish less — a mild throttle on a side's own dials. */
const fitnessFactor = (f: number) => clamp(0.85 + 0.015 * f, 0.85, 1);

// ---------------------------------------------------------------------------

export interface Squad {
  cards: Card[];
  /** Manager default posture; falls back to the manager's, else 'balanced'. */
  posture?: Posture;
  traits?: EngineTrait[];
  /** Set-piece kit (§7): a taker unlocks dead-balls, a carrier raises the prob. */
  hasTaker?: boolean;
  hasCarrier?: boolean;
  /** NW-140: the manager (reweight + posture + formation + mechanics). */
  manager?: Manager;
  /** Fielded formation; adherence is measured against the manager's preferred. */
  formation?: FormationId;
  /** Tactical plays (timed posture windows), played between batches. */
  tacticalPlays?: TacticalPlay[];
  /** The MANAGER's tactical brain (the modelled opponent / a boss): pick plays
   *  reactively at batch boundaries — trailing chases, leading shuts the door.
   *  Deterministic (pure function of match state), so replay/re-resolve holds. */
  autoTactics?: boolean;
  energy?: number;
  /** Batches at which this side makes a substitution (Tinkerman fuel). */
  subsAtBatch?: number[];
  /** Flat team-strength bonus folded into the contest dials (run.ts deck
   *  quality / opponent scaling — the six-contest analogue of OPP_COHESION_PTS). */
  dialBonus?: Partial<Record<Contest, number>>;
}

export interface MatchOptions {
  seed: number;
  target?: number;
  batches?: number;
}

export interface MatchResult {
  events: MatchEvent[];
  score: [number, number];
  points: [number, number];
  cash: [number, number];
  result: 'target-met' | 'target-missed';
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Even-spread holder schedule: `h` batches to side 0, the rest to side 1. */
function possessionSchedule(h: number, total: number): Side[] {
  // Bresenham-style distribution so holders alternate deterministically.
  const out: Side[] = [];
  let acc = 0;
  for (let b = 0; b < total; b++) {
    acc += h;
    if (acc >= total) {
      acc -= total;
      out.push(0);
    } else {
      out.push(1);
    }
  }
  return out;
}

interface SideCtx {
  cards: Card[];
  postureState: PostureState;
  traits: EngineTrait[];
  baseDials: Record<Contest, number>;
  /** baseDials + the manager's committed reweight (un-throttled). The possession
   *  split reads THIS, so a possession manager (KEEP/PRESS reweight) actually
   *  controls the ball — the reweight isn't confined to per-increment contests. */
  planDials: Record<Contest, number>;
  posCounts: Record<string, number>;
  hasTaker: boolean;
  hasCarrier: boolean;
  bldef: number;
  att: number;
  aerialDef: number;
  /** True if the build commits to a defensive contest — unlocks clean-sheet points. */
  defensiveCommit: boolean;
  /** True if the build commits to an attacking contest — unlocks pressure-batch points. */
  attackCommit: boolean;
  /** Every contest the build's card tilts commit to (COMMIT_MIN) — gates the
   *  chase drain (KEEP) and which tactic dialBoost entries actually apply. */
  committed: Set<Contest>;
  /** An open tactical window's dial buff (commitment-filtered at play time)
   *  and the last batch it covers. */
  windowBoost: Partial<Record<Contest, number>> | null;
  windowBoostUntil: number;
  band: AdherenceBand;
  energy: number;
  fitness: number;
  cashOnGoal: number;
  managerId: string | null;
  tacticalPlays: TacticalPlay[];
  autoTactics: boolean;
  subsAtBatch: number[];
  subsLeft: number;
}

function makeCtx(sq: Squad): SideCtx {
  const posCounts: Record<string, number> = {};
  for (const c of sq.cards) posCounts[c.pos] = (posCounts[c.pos] ?? 0) + 1;
  const mgr = sq.manager;
  const posture = sq.posture ?? mgr?.posture ?? 'balanced';
  const formation = sq.formation ?? mgr?.formation ?? '4-3-3';
  const band: AdherenceBand = mgr ? adherenceBand(formation, mgr.formation) : 'native';
  // adherence throttles CARD tilt contribution; the flat team-strength dialBonus
  // (deck quality) rides on top, un-throttled (the manager reweight, a trait, is
  // added later in effectiveDials).
  const rawDials = contestDials(sq.cards); // card tilts only (the build's commitment)
  const committed = new Set<Contest>(
    (Object.keys(rawDials) as Contest[]).filter((c) => rawDials[c] >= COMMIT_MIN[c])
  );
  const defensiveCommit = DEFENSIVE_COMMIT.some((c) => committed.has(c));
  const attackCommit = ATTACK_COMMIT.some((c) => committed.has(c));
  const baseDials = throttleDials({ ...rawDials }, band);
  if (sq.dialBonus) for (const k of Object.keys(baseDials) as Contest[]) baseDials[k] += sq.dialBonus[k] ?? 0;
  // planning dials fold in the manager's reweight, but only if the build actually
  // clears the manager's commitment gate (the no-unconditional law — an uncommitted
  // squad's split gets no free possession from a manager it doesn't earn).
  const favOpen = mgr ? rawDials[mgr.favoured] >= COMMIT_MIN[mgr.favoured] : false;
  const planDials = { ...baseDials };
  if (favOpen && mgr) for (const [c, pts] of Object.entries(mgr.reweight) as [Contest, number][]) planDials[c] += pts;
  return {
    cards: sq.cards,
    postureState: createPostureState(posture),
    traits: [...(sq.traits ?? []), ...(mgr ? managerTraits(mgr) : [])],
    baseDials,
    planDials,
    posCounts,
    hasTaker: !!sq.hasTaker,
    hasCarrier: !!sq.hasCarrier,
    bldef: backlineDef(sq.cards),
    att: topAtt(sq.cards),
    aerialDef: topDef(sq.cards),
    defensiveCommit,
    attackCommit,
    committed,
    windowBoost: null,
    windowBoostUntil: 0,
    band,
    energy: sq.energy ?? DEFAULT_ENERGY,
    fitness: 10,
    cashOnGoal: mgr?.cashOnGoal ?? 0,
    managerId: mgr?.id ?? null,
    tacticalPlays: sq.tacticalPlays ?? [],
    autoTactics: !!sq.autoTactics,
    subsAtBatch: sq.subsAtBatch ?? [],
    subsLeft: 3,
  };
}

function snapshot(
  side: SideCtx,
  posture: Posture,
  scoreline: Scoreline,
  clock: ReturnType<typeof clockBand>,
  states: Set<'turnover' | 'retain-survived'>
): GateSnapshot {
  return {
    posture,
    scoreline,
    clock,
    fitness: side.fitness,
    dials: side.baseDials,
    posCounts: side.posCounts,
    states,
  };
}

/**
 * Effective dials = fitness-throttled base tilts + own manager/trait amplifies
 * − opponent denies, per snapshot. The manager reweight rides on the trait
 * amplifies (not fitness/adherence-throttled — it is the manager's own points).
 */
function effectiveDials(me: SideCtx, meSnap: GateSnapshot, foe: SideCtx, foeSnap: GateSnapshot): Record<Contest, number> {
  const mine = dialDeltas(me.traits, meSnap);
  const theirs = dialDeltas(foe.traits, foeSnap);
  const ff = fitnessFactor(me.fitness);
  const out = { ...me.baseDials };
  for (const k of Object.keys(out) as Contest[]) {
    out[k] = out[k] * ff + mine.own[k] - theirs.opp[k] + (me.windowBoost?.[k] ?? 0);
  }
  return out;
}

/**
 * The manager's tactical brain — reactive and football-plain: a trailing side
 * chases (all-out attack, or a high press on short legs); a leading side shuts
 * the door late (Keep Ball if the build can strangle it, else park the bus).
 * Pure function of match state → deterministic under the match seed.
 */
function aiTactic(me: SideCtx, b: number, scoreDiff: number): TacticalCard | null {
  if (scoreDiff < 0 && b >= 3) {
    if (me.energy >= 3) return TACTICS_BY_ID['all-out-attack'];
    if (me.energy >= 2) return TACTICS_BY_ID['high-press'];
  }
  if (scoreDiff > 0 && b >= 4 && me.energy >= 2) {
    return me.committed.has('KEEP') ? TACTICS_BY_ID['keep-ball'] : TACTICS_BY_ID['park-the-bus'];
  }
  return null;
}

export function simulateMatch(home: Squad, away: Squad, opts: MatchOptions): MatchResult {
  const rng = new RngStream(opts.seed);
  const batches = opts.batches ?? BATCHES;
  const target = opts.target ?? DEFAULT_TARGET;
  const events: MatchEvent[] = [];

  const ctx: [SideCtx, SideCtx] = [makeCtx(home), makeCtx(away)];
  const score: [number, number] = [0, 0];
  const points: [number, number] = [0, 0];
  const cash: [number, number] = [0, 0];
  const chancesInBatch: [number, number] = [0, 0]; // reset each batch (pressure floor)

  // Possession split (batch-level 6 slots, clamp 2–4). Base dials, no per-inc
  // gating on the split itself (posture is a gate on traits, not a resolver).
  const p0 = ctx[0].planDials;
  const p1 = ctx[1].planDials;
  const net = p0.KEEP - p1.PRESS - (p1.KEEP - p0.PRESS);
  const hPoss = clamp(Math.round(batches / 2 + net / KEEP_K), 2, batches - 2);
  const schedule = possessionSchedule(hPoss, batches);

  events.push({
    type: 'match-start',
    seed: opts.seed,
    postures: [activePosture(ctx[0].postureState), activePosture(ctx[1].postureState)],
    dials: [ctx[0].baseDials, ctx[1].baseDials],
    target,
    managers: [ctx[0].managerId, ctx[1].managerId],
    adherence: [ctx[0].band, ctx[1].band],
  });

  const scorelines = (): [Scoreline, Scoreline] => [
    scorelineFor(score[0], score[1]),
    scorelineFor(score[1], score[0]),
  ];

  // Resolve one chance for `att` attacking `def`; emit + bank if converted.
  function resolveChance(
    att: Side,
    def: Side,
    origin: ChanceOrigin,
    via: Contest,
    clock: Clock,
    aerial: boolean
  ): void {
    const A = ctx[att];
    const D = ctx[def];
    const sl = scorelines();
    const aSnap = snapshot(A, activePosture(A.postureState), sl[att], clockBand(clock.batch, batches), new Set());
    const dSnap = snapshot(D, activePosture(D.postureState), sl[def], clockBand(clock.batch, batches), new Set());
    const aDials = effectiveDials(A, aSnap, D, dSnap);
    const dDials = effectiveDials(D, dSnap, A, aSnap);

    const createEdge = aDials.CREATE - dDials.BREAK;
    const pBig = clamp(P_BIG_BASE + P_BIG_K * createEdge, P_BIG_LO, P_BIG_HI);
    const quality: ChanceQuality = rng.float() < pBig ? 'big' : 'half';

    // xG: base tier × exp(FINISH−STOP + stat-margin), aerial paths read DEF.
    const finEdge = aerial ? A.aerialDef - D.bldef : aDials.FINISH - dDials.STOP;
    const statMargin = aerial ? A.aerialDef - D.bldef : A.att - D.bldef;
    const base = origin === 'set-piece' ? SP_XG_BASE : quality === 'big' ? XG_BIG : XG_HALF;
    const kMargin = aerial ? K_SPDEF : K_STAT;
    let xg = base * Math.exp(K_FIN * (aerial ? 0 : finEdge) + kMargin * statMargin) * xgShift(A.traits, aSnap);
    // variance verbs (Gambler/Pragmatist): amplify → mean-preserving spread
    // (boom or bust); dampen → lift poor chances toward a floor (consistency).
    const v = varianceShift(A.traits, aSnap);
    if (v > 0) xg *= rng.float() < 0.5 ? 1 + K_VAR : 1 - K_VAR;
    else if (v < 0) xg = Math.max(xg, DAMPEN_FLOOR);
    xg = Math.max(0.01, xg);

    const roll = rng.float();
    const converted = roll < 1 - Math.exp(-xg);
    chancesInBatch[att] += 1; // territory this batch (feeds the pressure floor)
    events.push({ type: 'chance', side: att, clock, origin, quality, xg: +xg.toFixed(3), converted, roll: +roll.toFixed(3) });
    if (!converted) return;

    score[att] += 1;
    events.push({ type: 'goal', side: att, via, origin, score: [score[0], score[1]], clock });

    // goal points — flat (the attacking scoring channel toward the run's blind).
    points[att] += GOAL_VALUE;
    events.push({ type: 'points-banked', side: att, source: 'goal', value: GOAL_VALUE, total: points[att], clock });

    // cash on goal (Financier economy hook)
    if (A.cashOnGoal > 0) {
      cash[att] += A.cashOnGoal;
      events.push({ type: 'cash-banked', side: att, value: A.cashOnGoal, total: cash[att], clock });
    }
  }

  for (let b = 1; b <= batches; b++) {
    const band = clockBand(b, batches);
    const holder = schedule[b - 1];
    const defender: Side = holder === 0 ? 1 : 0;
    chancesInBatch[0] = chancesInBatch[1] = 0; // territory resets each batch
    // posture tick: expire any due tactical window (and its dial buff) and revert.
    for (const s of [0, 1] as Side[]) {
      const { state, reverted } = tickPosture(ctx[s].postureState, b);
      ctx[s].postureState = state;
      if (reverted) events.push({ type: 'posture-shift', side: s, to: reverted, reason: 'revert', batch: b });
      if (ctx[s].windowBoost && b > ctx[s].windowBoostUntil) ctx[s].windowBoost = null;
    }
    // tactical plays (between-batch): open a timed posture window if affordable.
    const openWindow = (s: Side, tactic: TacticalCard): boolean => {
      if (ctx[s].energy < tactic.energyCost) return false;
      ctx[s].energy -= tactic.energyCost;
      ctx[s].postureState = applyPostureWindow(ctx[s].postureState, tactic.posture, b, tactic.durationBatches);
      // the card's class buff, filtered by the build's commitments (the
      // no-unconditional law) — an unearned boost entry simply never applies.
      if (tactic.dialBoost) {
        const earned = Object.entries(tactic.dialBoost).filter(([c]) => ctx[s].committed.has(c as Contest));
        ctx[s].windowBoost = earned.length ? Object.fromEntries(earned) : null;
        ctx[s].windowBoostUntil = b + tactic.durationBatches - 1;
      }
      events.push({
        type: 'tactic-played',
        side: s,
        card: tactic.name,
        posture: tactic.posture,
        durationBatches: tactic.durationBatches,
        energyCost: tactic.energyCost,
        energyLeft: ctx[s].energy,
        batch: b,
      });
      events.push({ type: 'posture-shift', side: s, to: tactic.posture, reason: 'tactic', batch: b });
      return true;
    };
    for (const s of [0, 1] as Side[]) {
      let played = false;
      for (const play of ctx[s].tacticalPlays) {
        if (play.atBatch === b && openWindow(s, play.tactic)) played = true;
      }
      // the manager's tactical brain (a modelled boss): reactive, deterministic,
      // no RNG — so replay and the UI's re-resolve contract are untouched.
      if (!played && ctx[s].autoTactics && !ctx[s].postureState.override) {
        const other: Side = s === 0 ? 1 : 0;
        const pick = aiTactic(ctx[s], b, score[s] - score[other]);
        if (pick) openWindow(s, pick);
      }
    }
    // substitutions (fresh legs): emit the event for the log / UI (rotation depth).
    for (const s of [0, 1] as Side[]) {
      if (!ctx[s].subsAtBatch.includes(b) || ctx[s].subsLeft <= 0) continue;
      ctx[s].subsLeft -= 1;
      events.push({ type: 'substitution', side: s, batch: b, subsLeft: ctx[s].subsLeft });
    }
    // fitness drain (Taskmaster): a committed press chips the opponent's legs.
    // Plus the chase: a KEEP-committed holder makes the defender run this batch
    // — possession's teeth. Both are commitment-gated, both land the same way.
    for (const s of [0, 1] as Side[]) {
      const other: Side = s === 0 ? 1 : 0;
      const drainSnap = snapshot(ctx[s], activePosture(ctx[s].postureState), scorelines()[s], band, new Set());
      let amount = fitnessDrain(ctx[s].traits, drainSnap);
      if (s === holder && ctx[s].committed.has('KEEP')) amount += CHASE_DRAIN;
      if (amount > 0) {
        ctx[other].fitness = Math.max(0, ctx[other].fitness - amount);
        events.push({ type: 'fitness-drained', side: other, amount, fitness: ctx[other].fitness, batch: b });
      }
    }
    events.push({
      type: 'batch-start',
      batch: b,
      band,
      postures: [activePosture(ctx[0].postureState), activePosture(ctx[1].postureState)],
    });
    const H = ctx[holder];
    const D = ctx[defender];
    const cleanBefore: [number, number] = [score[0], score[1]];

    for (let i = 1; i <= INCREMENTS; i++) {
      const clock: Clock = { batch: b, increment: i };
      events.push({ type: 'increment-start', clock, scoreline: scorelines() });

      if (i === 1) {
        // possession split announced once, at the batch's first increment
        events.push({ type: 'possession-split', clock, slots: holder === 0 ? [hPoss, batches - hPoss] : [batches - hPoss, hPoss] });

        // ---- retain roll (KEEP vs PRESS) ----
        const sl = scorelines();
        const hSnap = snapshot(H, activePosture(H.postureState), sl[holder], band, new Set());
        const dSnap = snapshot(D, activePosture(D.postureState), sl[defender], band, new Set());
        const hDials = effectiveDials(H, hSnap, D, dSnap);
        const dDials = effectiveDials(D, dSnap, H, hSnap);
        const pRetain = clamp(RETAIN_BASE + RETAIN_K * (hDials.KEEP - dDials.PRESS), RETAIN_LO, RETAIN_HI);
        const retained = rng.bernoulli(pRetain);

        if (retained) {
          events.push({ type: 'retain-roll', side: holder, clock, slot: b, p: +pRetain.toFixed(3), retained: true });
          // open-play CREATE volume for the retained phase
          const volEdge = hDials.CREATE - dDials.BREAK;
          const rate = clamp(VOL_BASE + VOL_SLIDE * volEdge, VOL_LO, VOL_HI);
          let n = Math.max(0, rng.poisson(rate) + chanceGenerated(H.traits, hSnap)); // generate → chance
          // deny → opp chance volume is a bounded SAVE, not a flat subtraction:
          // each firing keeper/stopper action ATTEMPTS to cancel one chance. It
          // can't drive volume negative or erase a build — the opponent defends,
          // it does not delete the game (so opponents carry their actions safely).
          const saves = chanceDenied(D.traits, dSnap);
          for (let s = 0; s < saves && n > 0; s++) if (rng.bernoulli(SAVE_P)) n--;
          for (let k = 0; k < n; k++) {
            const cClock: Clock = { batch: b, increment: 1 + (k % 2) }; // spread across inc 2–3
            resolveChance(holder, defender, 'open-play', 'FINISH', cClock, false);
          }
        } else {
          // ---- turnover → the KEEP↔BREAK coupling ----
          const pFeed = clamp(FEED_BASE + FEED_BREAK_K * dDials.BREAK, 0, FEED_HI);
          const fed = rng.bernoulli(pFeed);
          events.push({ type: 'retain-roll', side: holder, clock, slot: b, p: +pRetain.toFixed(3), retained: false, fedTransition: fed });
          if (fed) {
            // defender counters: a transition chance scored via BREAK
            resolveChance(defender, holder, 'transition', 'BREAK', { batch: b, increment: 2 }, false);
          }
        }
      }

      if (i === INCREMENTS) {
        // ---- set-piece path (§7): CREATE-fed, taker-gated, DEF-keyed ----
        if (H.hasTaker) {
          const sl = scorelines();
          const hSnap = snapshot(H, activePosture(H.postureState), sl[holder], band, new Set());
          const dSnap = snapshot(D, activePosture(D.postureState), sl[defender], band, new Set());
          const hDials = effectiveDials(H, hSnap, D, dSnap);
          const possShare = (holder === 0 ? hPoss : batches - hPoss) / batches;
          const createBoost = 1 + 0.03 * Math.max(0, hDials.CREATE);
          const pDead = clamp(SP_BASE * (possShare * 2) * (H.hasCarrier ? SP_CARRIER : 1) * createBoost, 0, 0.6);
          if (rng.bernoulli(pDead)) {
            resolveChance(holder, defender, 'set-piece', 'STOP', clock, true);
          }
        }
      }
    }

    // ---- batch-end: clean-sheet (defensive) points ----
    // A build scores through its win-con: goals for attackers (banked at the goal
    // site), CLEAN SHEETS for defenders (banked here, flat per clean batch). A
    // wall keeps more clean batches than a leaky attacker, so this is the
    // defensive scoring channel toward the run's blind — no multiplier, no streak.
    const cleanFor: [boolean, boolean] = [score[1] === cleanBefore[1], score[0] === cleanBefore[0]];
    const bClock: Clock = { batch: b, increment: INCREMENTS };
    for (const s of [0, 1] as Side[]) {
      if (!cleanFor[s] || !ctx[s].defensiveCommit) continue;
      points[s] += CLEAN_BATCH_VALUE;
      events.push({ type: 'points-banked', side: s, source: 'clean-batch', value: CLEAN_BATCH_VALUE, total: points[s], clock: bClock });
    }

    // ---- batch-end: pressure (attacking) points — the attacker's FLOOR ----
    // The mirror of the clean batch. An attack-committed side that created chances
    // this batch but did NOT score still banks territory, so a pure attacker never
    // banks zero on a barren match (which would kill it at F1). Scoring supersedes:
    // a batch that produced a goal already banked GOAL_VALUE (worth far more), so it
    // pays no pressure — pressure is strictly the consolation for dominance unconverted.
    for (const s of [0, 1] as Side[]) {
      const scored = score[s] > cleanBefore[s];
      if (scored || !ctx[s].attackCommit || chancesInBatch[s] === 0) continue;
      points[s] += PRESSURE_BATCH_VALUE;
      events.push({ type: 'points-banked', side: s, source: 'pressure-batch', value: PRESSURE_BATCH_VALUE, total: points[s], clock: bClock });
    }

    events.push({ type: 'batch-end', batch: b, cleanFor, score: [score[0], score[1]] });

    // early whistle: a side already past target with the lead late in the match
    if (b >= batches - 1) {
      for (const s of [0, 1] as Side[]) {
        const other = s === 0 ? 1 : 0;
        if (points[s] >= target && score[s] > score[other] && b < batches) {
          events.push({ type: 'early-whistle', clock: { batch: b, increment: INCREMENTS }, reason: 'target-met-with-lead' });
        }
      }
    }
  }

  const result: 'target-met' | 'target-missed' = points[0] >= target ? 'target-met' : 'target-missed';
  events.push({ type: 'full-time', score: [score[0], score[1]], points: [points[0], points[1]], target, result });
  return { events, score, points, cash, result };
}
