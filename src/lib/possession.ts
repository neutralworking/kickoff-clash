/**
 * Kickoff Clash — Per-possession match resolution (engine v1)
 *
 * Replaces the single binary goal roll per increment with a possession-based model
 * (chosen with the design owner): each period is a pool of possessions split by
 * control; each possession picks a lane, may become a shot (lane push vs cover), and
 * a shot carries an xG that is then a Bernoulli dice roll. Goals are the sum — so a
 * period can yield 0..n goals, giving a real, tunable goal distribution instead of a
 * clamped coin flip. The zonal contest (field.ts) feeds it directly, so chemistry,
 * fitness, tactics and the opponent all flow in unchanged; only the goal tail changes.
 *
 * Pure + deterministic: every roll is seeded from (seed, increment, side, index).
 * Tuning dials (DESIGN §7) target ~3 total goals/match; calibrated on the sweep.
 */

import { seededRandom } from './scoring';
import type { Lane } from './field';
import { LANES } from './field';

export interface Shot {
  lane: Lane;
  xg: number;
  goal: boolean;
}

export interface SidePeriod {
  possessions: number;
  shots: Shot[];
  xg: number;      // total xG this period
  goals: number;   // dice outcome
}

export interface PeriodOutcome {
  you: SidePeriod;
  opp: SidePeriod;
}

/** One side's resolved field for the period (from evaluateSplit / computeSideField). */
export interface PossessionSide {
  lanePush: Record<Lane, number>;   // attacking push per lane
  laneCover: Record<Lane, number>;  // defensive cover per lane
  shotQuality: number;              // finishing scalar
  defenceScore: number;             // defensive resistance scalar
  control: number;                  // possession-control proxy (creation + attack)
  denial: number;                   // conversion suppression applied to the OTHER side
}

// --- Tuning dials (§7) ---
const POSS_POOL = 20;        // total possessions per 15' period, split by control
const SHARE_MIN = 0.30;     // Phase 3 Foundation: widen the share band so control matters
const SHARE_MAX = 0.70;     // more (a dominant side now takes up to 70% of possessions)
const SHOT_BASE = 0.30;      // P(shot) at lane parity
const SHOT_MIN = 0.04;
const SHOT_MAX = 0.65;    // Called Plays: was 0.55 — a loaded lane saturated at ratio ~1.8,
                          // capping what a telegraphed overload can threaten (and thus what
                          // answering it is worth). Parity contests (ratio ~1) are unaffected.
const XG_BASE = 0.195;       // xG scale
const XG_MIN = 0.02;
const XG_MAX = 0.70;
const DEF_W = 1.2;           // weight on the defender's resistance in the xG ratio
const XG_CONVEX = 0.9;       // Phase 3 Foundation: nearer 1 → less weak-side lift, so a
                            // quality edge converts (good builds reliably clear the blind)
                             // than strong ones, so even matchups still create chances.
const DENIAL_CAP = 0.5;

function prng(seed: number, inc: number, side: number, idx: number, salt: number): number {
  const m =
    (((seed * 73856093) ^ (inc * 19349663) ^ (side * 83492791) ^ (idx * 2654435761) ^ (salt * 40503)) >>> 0);
  return seededRandom(m);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pickLane(push: Record<Lane, number>, r: number): Lane {
  const total = LANES.reduce((s, l) => s + Math.max(0, push[l]), 0) || 1;
  const t = r * total;
  let acc = 0;
  for (const lane of LANES) {
    acc += Math.max(0, push[lane]);
    if (t <= acc) return lane;
  }
  return 'C';
}

/**
 * Resolve one side's possessions into shots and goals against the other side.
 * `drama` scales chance creation late on (90th-minute push); `side` keys the RNG.
 */
function resolveSide(
  atk: PossessionSide,
  def: PossessionSide,
  possessions: number,
  seed: number,
  inc: number,
  side: number,
  drama: number,
): SidePeriod {
  const shots: Shot[] = [];
  let xgTotal = 0;
  let goals = 0;
  const denyMult = 1 - clamp(def.denial ?? 0, 0, DENIAL_CAP); // their deny suppresses you

  for (let i = 0; i < possessions; i++) {
    const lane = pickLane(atk.lanePush, prng(seed, inc, side, i, 1));
    const ratio = atk.lanePush[lane] / Math.max(1, def.laneCover[lane]);
    const pShot = clamp(SHOT_BASE * ratio * drama, SHOT_MIN, SHOT_MAX);
    if (prng(seed, inc, side, i, 2) >= pShot) continue;

    const qRatio = atk.shotQuality / Math.max(1, def.defenceScore * DEF_W);
    const qAdj = Math.pow(qRatio, XG_CONVEX);
    const laneBonus = clamp(ratio, 0.6, 1.8);
    const xg = clamp(XG_BASE * qAdj * laneBonus * drama * denyMult, XG_MIN, XG_MAX);
    const goal = prng(seed, inc, side, i, 3) < xg;
    shots.push({ lane, xg, goal });
    xgTotal += xg;
    if (goal) goals += 1;
  }

  return { possessions, shots, xg: xgTotal, goals };
}

/**
 * Simulate a period. Possessions are pooled and split by control, then each side's
 * possessions resolve against the other's cover/defence.
 */
export function simulatePeriod(
  you: PossessionSide,
  opp: PossessionSide,
  seed: number,
  inc: number,
  drama = 1,
): PeriodOutcome {
  const sum = you.control + opp.control;
  const share = sum > 0 ? clamp(you.control / sum, SHARE_MIN, SHARE_MAX) : 0.5;
  const yourPoss = Math.round(POSS_POOL * share);
  const oppPoss = POSS_POOL - yourPoss;

  return {
    you: resolveSide(you, opp, yourPoss, seed, inc, 0, drama),
    opp: resolveSide(opp, you, oppPoss, seed, inc, 1, drama),
  };
}
