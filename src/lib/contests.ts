/**
 * Kickoff Clash — CONTESTS (SCORING_V2 §the-round): three contests, two dice.
 *
 * Each 15' round:
 *   1. THE BALL (deterministic): KEEP (Controllers/Passers/Engines' ATK) minus the
 *      other side's PRESS (front-line DEF + Engines' DEF) splits 6 possessions,
 *      clamped 2–4 — the underdog always gets something.
 *   2. THE OUTCOME (die #1): each possession rolls d100 on a five-entry table
 *      (turnover / half-chance / big chance / corner / foul), slid by the craft
 *      margin CREATE − BREAK.
 *   3. THE SHOT (die #2, the d100): a named shooter; GOAL if
 *      d100 ≤ BASE + 3 × (shooter ATK − their STOP), clamped 5..90.
 *      Every point of margin is worth 3 on the die. BASE: half 20 / big 40 /
 *      corner header 15.
 *
 * Fouls draw a fouler (destroyers most likely); a booking is d100 ≤ 30; a second
 * yellow is a red (max 1 red per side per match); a red's points leave every
 * contest immediately and the suspension carries to the next fixture (run.ts).
 *
 * Trait beats: `chance` traits inject bonus possessions (cap 2/side/round);
 * `stop` traits arm once per round and cancel one opposing chance each.
 *
 * Deterministic: every roll is seeded from (seed, increment, side, index, salt).
 */

import { seededRandom } from './scoring';
import { laneOfCard } from './funnel';
import type { Lane } from './field';
import type { EffCard, TeamChance } from './points';

// ---------------------------------------------------------------------------
// Contest totals
// ---------------------------------------------------------------------------

export interface ContestTotals {
  /** Ball-keeping craft: Σ ATK of Controllers, Passers, Engines. */
  keep: number;
  /** Ball-winning: Σ DEF of the front line + Engines (they run both ways). */
  press: number;
  /** Chance craft: Σ ATK of Creators/Dribblers/Sprinters + the front line. */
  create: number;
  /** Midfield destruction: Σ DEF of the MID band. */
  brk: number;
  /** The last line: mean DEF of the DEF band (keeper included), rounded. */
  stop: number;
  /** Σ ATK of the finishing-lane cards (the header's shot-quality readout). */
  finish: number;
  /** The forecast header: Σ effective ATK / DEF of the whole side. */
  attack: number;
  defence: number;
}

const KEEP_IDS = new Set(['Controller', 'Passer', 'Engine']);
const CREATE_IDS = new Set(['Creator', 'Dribbler', 'Sprinter']);

export function contestTotals(cards: EffCard[]): ContestTotals {
  let keep = 0, press = 0, create = 0, brk = 0, finish = 0, attack = 0, defence = 0;
  let stopSum = 0, stopN = 0;
  for (const c of cards) {
    attack += c.atk;
    defence += c.def;
    if (KEEP_IDS.has(c.archetype)) keep += c.atk;
    if (c.band === 'ATT' || c.archetype === 'Engine') press += c.def;
    if (CREATE_IDS.has(c.archetype) || c.band === 'ATT') create += c.atk;
    if (c.band === 'MID') brk += c.def;
    if (c.band === 'DEF') { stopSum += c.def; stopN += 1; }
    if (laneOfCard(c.card) === 'finishing') finish += c.atk;
  }
  return {
    keep: Math.round(keep), press: Math.round(press),
    create: Math.round(create), brk: Math.round(brk),
    stop: stopN ? Math.round(stopSum / stopN) : 0,
    finish: Math.round(finish),
    attack: Math.round(attack), defence: Math.round(defence),
  };
}

// ---------------------------------------------------------------------------
// Tuning dials (docs/SCORING_V2.md — balance-sweep validates)
// ---------------------------------------------------------------------------

export const POSSESSIONS_PER_ROUND = 6;  // total, split by the ball contest
export const POSS_MIN = 2;               // clamp per side (underdog floor)
export const POSS_MAX = 4;

/** Outcome-table base weights (d100 bands). */
const W_TURNOVER = 48, W_HALF = 20, W_BIG = 8, W_CORNER = 12, W_FOUL = 12;
/** Per point of craft margin m: half +0.8, big +0.4, turnover −1.2 (floor 2). */
const MARGIN_DIV = 4, MARGIN_CAP = 10;

/** Shot bases: every point of ATK−STOP margin is worth 3 on the d100. */
export const SHOT_BASE: Record<'half' | 'big' | 'corner', number> = { half: 20, big: 40, corner: 15 };
export const MARGIN_PER_POINT = 3;
/** No shot is ever surer than 80 (a 1-in-5 always survives) or hopeless below 5 —
 *  the blowout ceiling: a cracked build still wins big, not 13–0 big. */
const NEED_MIN = 5, NEED_MAX = 80;
/** Non-goals within this window over the need are ON TARGET (a save). */
const SAVE_WINDOW = 25;
/** Final-round drama: late chances convert a touch more (flavour, kept small). */
const LATE_DRAMA = 5;

const BOOKING_CHANCE = 30;        // d100 ≤ 30 on a foul
const CORNERS_CAP = 3;            // per side per round
const INJECT_CAP = 2;             // bonus trait/tactic chances per side per round

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

export type BeatOutcome =
  | 'goal' | 'save' | 'miss'          // a resolved shot (roll/need attached)
  | 'turnover' | 'corner' | 'foul'    // possession events
  | 'booking' | 'red'                 // the cards
  | 'stop'                            // a stop-trait cancelled a chance
  | 'spell';                          // the round's possession summary

export interface RoundBeat {
  minute: number;
  clock: number;                      // seconds into the match
  time: string;                       // mm:ss
  side: 'you' | 'opp';
  lane: Lane;
  /** The d100 receipt for a shot: rolled `roll`, needed ≤ `need`. */
  xg: number;                         // need/100 for shots, else 0
  roll?: number;
  need?: number;
  quality?: 'half' | 'big' | 'corner';
  outcome: BeatOutcome;
  scorerId: number | null;            // shooter / fouler / stopper
  scorerName: string | null;
  assisterId: number | null;          // creator (goals + trait chances)
  assisterName: string | null;
  /** Set when a defining trait made this beat (animates via trait-copy). */
  traitName?: string;
  text: string;
}

export interface RoundBooking { side: 'you' | 'opp'; cardId: number; name: string; red: boolean }

export interface RoundOutcome {
  yourPossessions: number;
  oppPossessions: number;
  beats: RoundBeat[];
  yourGoals: number;
  oppGoals: number;
  yourXG: number;
  oppXG: number;
  yourShots: number;
  oppShots: number;
  yourOnTarget: number;
  oppOnTarget: number;
  bookings: RoundBooking[];
  /** Trait firings this round (moment animations): stops + injected chances. */
  firedTraits: { cardId: number; name: string }[];
}

export interface RoundSide {
  cards: EffCard[];
  teamChances: TeamChance[];
}

export interface RoundContext {
  seed: number;
  increment: number;                  // 0–4
  minute: number;                     // the round's closing minute (display)
  windowStart: number;                // the round's opening minute
  /** Match-level yellow-card ledger (cardId → yellows so far). */
  bookings: Record<number, number>;
  /** Sides that have already had a red this match (cap 1). */
  redUsed: { you: boolean; opp: boolean };
}

// ---------------------------------------------------------------------------
// Seeded helpers
// ---------------------------------------------------------------------------

function prng(seed: number, inc: number, side: number, idx: number, salt: number): number {
  const m =
    (((seed * 73856093) ^ (inc * 19349663) ^ (side * 83492791) ^ (idx * 2654435761) ^ (salt * 40503)) >>> 0);
  return seededRandom(m);
}

/** d100: an integer 1..100. */
function d100(seed: number, inc: number, side: number, idx: number, salt: number): number {
  return 1 + Math.floor(prng(seed, inc, side, idx, salt) * 100);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Deterministic weighted pick (weights clamped to a small positive floor). */
function weightedPick(pool: EffCard[], weightOf: (c: EffCard) => number, r: number): EffCard | null {
  if (!pool.length) return null;
  const weights = pool.map((c) => Math.max(0.25, weightOf(c)));
  const total = weights.reduce((s, w) => s + w, 0);
  let t = r * total;
  for (let i = 0; i < pool.length; i++) {
    t -= weights[i];
    if (t <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function pickShooter(cards: EffCard[], r: number): EffCard | null {
  const pool = cards.filter((c) => !c.gk);
  return weightedPick(pool, (c) => {
    const lane = laneOfCard(c.card);
    const w = lane === 'finishing' ? 2 : lane === 'creation' ? 1 : 0.5;
    return Math.max(0.25, c.atk) * w;
  }, r);
}

function pickCornerHeader(cards: EffCard[], r: number): EffCard | null {
  const pool = cards.filter((c) => !c.gk);
  return weightedPick(pool, (c) => {
    const aerial = (c.archetype === 'Target' || c.archetype === 'Powerhouse') ? 3
      : c.position === 'CD' ? 1.5 : 1;
    return Math.max(0.25, c.atk) * aerial;
  }, r);
}

function pickAssister(cards: EffCard[], shooterId: number, r: number): EffCard | null {
  const SOLO = 0.18;
  if (r < SOLO) return null;
  const pool = cards.filter((c) => !c.gk && c.id !== shooterId);
  return weightedPick(pool, (c) => {
    const lane = laneOfCard(c.card);
    const w = lane === 'creation' ? 1.5 : lane === 'possession' ? 1 : 0.5;
    return Math.max(0.25, c.atk) * w;
  }, (r - SOLO) / (1 - SOLO));
}

function pickFouler(cards: EffCard[], excludeBooked: Set<number> | null, r: number): EffCard | null {
  let pool = cards.filter((c) => !c.gk && (c.band === 'MID' || c.band === 'DEF'));
  if (!pool.length) pool = cards.filter((c) => !c.gk);
  if (excludeBooked) {
    const clean = pool.filter((c) => !excludeBooked.has(c.id));
    if (clean.length) pool = clean;
  }
  return weightedPick(pool, (c) => {
    const nasty = (c.archetype === 'Destroyer' || c.archetype === 'Powerhouse') ? 2 : 1;
    return Math.max(0.25, c.def) * nasty;
  }, r);
}

// ---------------------------------------------------------------------------
// The round
// ---------------------------------------------------------------------------

interface LiveSide {
  label: 'you' | 'opp';
  idx: 0 | 1;
  cards: EffCard[];
  totals: ContestTotals;
  teamChances: TeamChance[];
  stops: { cardId: number; name: string; save?: boolean }[];
  cornersUsed: number;
  goals: number;
  xg: number;
  shots: number;
  onTarget: number;
}

interface PossessionPlan {
  /** An injected trait/tactic chance forces the outcome. */
  forced?: { quality: 'half' | 'big'; shooterId: number | null; creatorId: number | null; traitName: string };
}

export function resolveRound(you: RoundSide, opp: RoundSide, ctx: RoundContext): RoundOutcome {
  const { seed, increment: inc } = ctx;
  const sides: [LiveSide, LiveSide] = [
    { label: 'you', idx: 0, cards: [...you.cards], totals: contestTotals(you.cards), teamChances: you.teamChances, stops: [], cornersUsed: 0, goals: 0, xg: 0, shots: 0, onTarget: 0 },
    { label: 'opp', idx: 1, cards: [...opp.cards], totals: contestTotals(opp.cards), teamChances: opp.teamChances, stops: [], cornersUsed: 0, goals: 0, xg: 0, shots: 0, onTarget: 0 },
  ];
  const beats: RoundBeat[] = [];
  const bookings: RoundBooking[] = [];
  const firedTraits: { cardId: number; name: string }[] = [];
  const roundYellows: Record<number, number> = {};

  // --- Contest 1: THE BALL (deterministic split of 6 possessions) -------------
  const score = (a: LiveSide, b: LiveSide) => Math.max(1, a.totals.keep - b.totals.press);
  const yourScore = score(sides[0], sides[1]);
  const oppScore = score(sides[1], sides[0]);
  const yourPoss = clamp(
    Math.round(POSSESSIONS_PER_ROUND * (yourScore / (yourScore + oppScore))),
    POSS_MIN, POSS_MAX,
  );
  const oppPoss = POSSESSIONS_PER_ROUND - yourPoss;

  // --- Arm the stop traits (once per round, seeded per trait) -----------------
  for (const side of sides) {
    const sorted = [...side.cards].sort((a, b) => a.id - b.id);
    for (const c of sorted) {
      c.stopTraits.forEach((st, ti) => {
        if (prng(seed, inc, side.idx, c.id, 210 + ti) < st.p) {
          side.stops.push({ cardId: c.id, name: st.name, save: st.save });
        }
      });
    }
  }

  // --- Collect injected chances (trait + tactic, cap 2/side) ------------------
  const injections: [PossessionPlan[], PossessionPlan[]] = [[], []];
  for (const side of sides) {
    const list = injections[side.idx];
    const sorted = [...side.cards].sort((a, b) => a.id - b.id);
    for (const c of sorted) {
      c.chanceTraits.forEach((chT, ti) => {
        if (list.length >= INJECT_CAP) return;
        if (prng(seed, inc, side.idx, c.id, 310 + ti) < chT.p) {
          list.push({ forced: { quality: chT.quality, shooterId: chT.asShooter ? c.id : null, creatorId: c.id, traitName: chT.name } });
          firedTraits.push({ cardId: c.id, name: chT.name });
        }
      });
    }
    side.teamChances.forEach((tc, ti) => {
      if (list.length >= INJECT_CAP) return;
      if (prng(seed, inc, side.idx, 9999, 410 + ti) < tc.p) {
        list.push({ forced: { quality: tc.quality, shooterId: null, creatorId: null, traitName: tc.name } });
      }
    });
  }

  // --- Helpers over live state -------------------------------------------------
  const yellowsOf = (id: number) => (ctx.bookings[id] ?? 0) + (roundYellows[id] ?? 0);

  const beatClock = (sideIdx: number, i: number): { clock: number; time: string } => {
    const f = prng(seed, inc, sideIdx, i, 14);
    const clock = Math.round(ctx.windowStart * 60 + f * 870);
    const mm = Math.floor(clock / 60).toString().padStart(2, '0');
    const ss = (clock % 60).toString().padStart(2, '0');
    return { clock, time: `${mm}:${ss}` };
  };

  const pushBeat = (b: Omit<RoundBeat, 'minute'>) => beats.push({ minute: ctx.minute, ...b });

  /** Resolve one shot (goal roll + receipt beat). Returns goal?. */
  const resolveShot = (
    att: LiveSide, def: LiveSide, i: number,
    quality: 'half' | 'big' | 'corner',
    shooter: EffCard, creator: EffCard | null, traitName: string | undefined,
    clock: { clock: number; time: string },
  ): void => {
    const margin = shooter.atk - def.totals.stop;
    const drama = inc === 4 ? LATE_DRAMA : 0;
    const need = clamp(SHOT_BASE[quality] + MARGIN_PER_POINT * margin + drama, NEED_MIN, NEED_MAX);
    const roll = d100(seed, inc, att.idx, i, 3);
    att.shots += 1;
    att.xg += need / 100;
    const goal = roll <= need;
    const onTarget = goal || roll <= Math.min(95, need + SAVE_WINDOW);
    if (onTarget) att.onTarget += 1;
    if (goal) att.goals += 1;
    const outcome: BeatOutcome = goal ? 'goal' : onTarget ? 'save' : 'miss';
    const assister = goal
      ? (creator ?? pickAssister(att.cards, shooter.id, prng(seed, inc, att.idx, i, 4)))
      : creator;
    const gk = def.cards.find((c) => c.gk);
    const qWord = quality === 'big' ? 'a big chance' : quality === 'corner' ? 'the corner' : 'a half-chance';
    const text = goal
      ? `${shooter.name} buries ${qWord} — GOAL! (rolled ${roll}, needed ${need})`
      : onTarget
        ? `${shooter.name} forces a save${gk ? ` from ${gk.name}` : ''} (rolled ${roll}, needed ${need})`
        : `${shooter.name} puts ${qWord} wide (rolled ${roll}, needed ${need})`;
    pushBeat({
      ...clock, side: att.label, lane: shooter.lane,
      xg: need / 100, roll, need, quality, outcome,
      scorerId: shooter.id, scorerName: shooter.name,
      assisterId: assister?.id ?? null, assisterName: assister?.name ?? null,
      traitName, text,
    });
  };

  /** A chance arises for `att`: the defence's armed stops get first refusal. */
  const contestChance = (
    att: LiveSide, def: LiveSide, i: number,
    quality: 'half' | 'big' | 'corner',
    forced: PossessionPlan['forced'] | undefined,
    clock: { clock: number; time: string },
  ): void => {
    const stop = def.stops.shift();
    if (stop) {
      const stopper = def.cards.find((c) => c.id === stop.cardId);
      firedTraits.push({ cardId: stop.cardId, name: stop.name });
      pushBeat({
        ...clock, side: def.label, lane: stopper?.lane ?? 'C', xg: 0,
        outcome: 'stop', quality,
        scorerId: stop.cardId, scorerName: stopper?.name ?? null,
        assisterId: null, assisterName: null, traitName: stop.name,
        text: stop.save
          ? `${stopper?.name ?? 'The keeper'} smothers it — ${stop.name}!`
          : `${stopper?.name ?? 'The defence'} snuffs it out — ${stop.name}!`,
      });
      return;
    }
    const shooter = quality === 'corner'
      ? pickCornerHeader(att.cards, prng(seed, inc, att.idx, i, 8))
      : forced?.shooterId != null
        ? att.cards.find((c) => c.id === forced.shooterId) ?? pickShooter(att.cards, prng(seed, inc, att.idx, i, 2))
        : pickShooter(att.cards, prng(seed, inc, att.idx, i, 2));
    if (!shooter) return;
    const creator = forced?.creatorId != null && forced.creatorId !== shooter.id
      ? att.cards.find((c) => c.id === forced.creatorId) ?? null
      : null;
    resolveShot(att, def, i, quality, shooter, creator, forced?.traitName, clock);
  };

  /** One possession for `att` against `def`. */
  const resolvePossession = (att: LiveSide, def: LiveSide, i: number, plan: PossessionPlan): void => {
    const clock = beatClock(att.idx, i);

    if (plan.forced) {
      contestChance(att, def, i, plan.forced.quality, plan.forced, clock);
      return;
    }

    // Outcome table, slid by the craft margin.
    const m = clamp(Math.round((att.totals.create - def.totals.brk) / MARGIN_DIV), -MARGIN_CAP, MARGIN_CAP);
    const wTurn = Math.max(2, W_TURNOVER - 1.2 * m);
    const wHalf = Math.max(2, W_HALF + 0.8 * m);
    const wBig = Math.max(2, W_BIG + 0.4 * m);
    const wCorner = att.cornersUsed >= CORNERS_CAP ? 0 : W_CORNER;
    const total = wTurn + wHalf + wBig + wCorner + W_FOUL;
    const r = prng(seed, inc, att.idx, i, 1) * total;

    if (r < wTurn) {
      pushBeat({
        ...clock, side: att.label, lane: 'C', xg: 0, outcome: 'turnover',
        scorerId: null, scorerName: null, assisterId: null, assisterName: null,
        text: att.label === 'you' ? 'Move breaks down — possession lost' : 'They lose it — you win the ball back',
      });
      return;
    }
    if (r < wTurn + wHalf) { contestChance(att, def, i, 'half', undefined, clock); return; }
    if (r < wTurn + wHalf + wBig) { contestChance(att, def, i, 'big', undefined, clock); return; }
    if (r < wTurn + wHalf + wBig + wCorner) {
      att.cornersUsed += 1;
      pushBeat({
        ...clock, side: att.label, lane: prng(seed, inc, att.idx, i, 7) < 0.5 ? 'L' : 'R', xg: 0,
        outcome: 'corner', scorerId: null, scorerName: null, assisterId: null, assisterName: null,
        text: att.label === 'you' ? 'Corner won' : 'They win a corner',
      });
      contestChance(att, def, i, 'corner', undefined, clock);
      return;
    }

    // Foul by the defending side.
    const redAvailable = !ctx.redUsed[def.label];
    const fouler = pickFouler(
      def.cards,
      redAvailable ? null : new Set(Object.keys(roundYellows).map(Number).concat(
        Object.keys(ctx.bookings).filter((k) => (ctx.bookings[Number(k)] ?? 0) > 0).map(Number),
      )),
      prng(seed, inc, att.idx, i, 5),
    );
    if (!fouler) return;
    const booked = d100(seed, inc, att.idx, i, 6) <= BOOKING_CHANCE;
    if (!booked) {
      pushBeat({
        ...clock, side: def.label, lane: fouler.lane, xg: 0, outcome: 'foul',
        scorerId: fouler.id, scorerName: fouler.name, assisterId: null, assisterName: null,
        text: `${fouler.name} brings the move down — free kick`,
      });
      return;
    }
    const secondYellow = yellowsOf(fouler.id) >= 1;
    if (secondYellow && redAvailable) {
      // Off he goes: his points leave every contest immediately.
      ctx.redUsed[def.label] = true;
      def.cards = def.cards.filter((c) => c.id !== fouler.id);
      def.totals = contestTotals(def.cards);
      def.stops = def.stops.filter((s) => s.cardId !== fouler.id);
      bookings.push({ side: def.label, cardId: fouler.id, name: fouler.name, red: true });
      pushBeat({
        ...clock, side: def.label, lane: fouler.lane, xg: 0, outcome: 'red',
        scorerId: fouler.id, scorerName: fouler.name, assisterId: null, assisterName: null,
        text: `${fouler.name} — second yellow, RED CARD! Down to ${def.cards.length}, suspended next match`,
      });
    } else {
      roundYellows[fouler.id] = (roundYellows[fouler.id] ?? 0) + 1;
      bookings.push({ side: def.label, cardId: fouler.id, name: fouler.name, red: false });
      pushBeat({
        ...clock, side: def.label, lane: fouler.lane, xg: 0, outcome: 'booking',
        scorerId: fouler.id, scorerName: fouler.name, assisterId: null, assisterName: null,
        text: `${fouler.name} goes in the book — yellow card`,
      });
    }
  };

  // --- The spell summary beat, then the possessions ---------------------------
  {
    const mm = ctx.windowStart.toString().padStart(2, '0');
    pushBeat({
      clock: ctx.windowStart * 60, time: `${mm}:00`,
      side: yourPoss >= oppPoss ? 'you' : 'opp', lane: 'C', xg: 0, outcome: 'spell',
      scorerId: null, scorerName: null, assisterId: null, assisterName: null,
      text: `On the ball: you ${yourPoss} — ${oppPoss} them`,
    });
  }

  const plansFor = (side: LiveSide, count: number): PossessionPlan[] => [
    ...Array.from({ length: count }, (): PossessionPlan => ({})),
    ...injections[side.idx],
  ];
  const yourPlans = plansFor(sides[0], yourPoss);
  const oppPlans = plansFor(sides[1], oppPoss);
  yourPlans.forEach((plan, i) => resolvePossession(sides[0], sides[1], i, plan));
  oppPlans.forEach((plan, i) => resolvePossession(sides[1], sides[0], i, plan));

  beats.sort((a, b) => a.clock - b.clock);

  return {
    yourPossessions: yourPoss,
    oppPossessions: oppPoss,
    beats,
    yourGoals: sides[0].goals,
    oppGoals: sides[1].goals,
    yourXG: sides[0].xg,
    oppXG: sides[1].xg,
    yourShots: sides[0].shots,
    oppShots: sides[1].shots,
    yourOnTarget: sides[0].onTarget,
    oppOnTarget: sides[1].onTarget,
    bookings,
    firedTraits,
  };
}
