/**
 * The CONTEST BREAKDOWN selector (owner directive, 2026-07) — pure, display-only.
 *
 * Turns an evaluated split into the six engine-native contest rows, grouped
 * ATTACKING (KEEP / CREATE / FINISH — Control → Create → Convert) and DEFENDING
 * (PRESS / BREAK / STOP — Press → Break → Stop), each `yours v theirs ± edge`
 * plus the secondary line the row actually drives:
 *   KEEP   → the projected possession split (the resolver's own formula)
 *   CREATE → the big-chance odds band (the resolver's own outcome weights)
 *   FINISH → the likely shooter and his goal thresholds by chance type
 * Commitment step bonuses (the build-around payoff) surface per row instead of
 * hiding inside the total. NET stays available as a small SQUAD EDGE summary.
 *
 * Every number comes from the SAME exported functions the resolver runs
 * (possessionSplit / outcomeWeights / shotNeed / likelyShooter / contestTotals)
 * — nothing here re-implements engine maths, so forecast and resolution cannot
 * drift. No RNG, no state: selectors only.
 */

import {
  type ContestTotals,
  type OutcomeWeights,
  possessionSplit,
  outcomeWeights,
  shotNeed,
  likelyShooter,
  commitTierOf,
} from './contests';
import type { EffCard } from './points';

export type ContestKey = 'KEEP' | 'CREATE' | 'FINISH' | 'PRESS' | 'BREAK' | 'STOP';

export interface ContestRowView {
  key: ContestKey;
  /** Your total in this duel and the opposing total it is measured against. */
  yours: number;
  theirs: number;
  edge: number;
  /** Commitment step (0 none / 1 / 2) + the flat bonus it contributes. */
  commitTier: 0 | 1 | 2;
  commitBonus: number;
}

export interface ShooterView {
  id: number;
  name: string;
  atk: number;
  stop: number;
  /** Goal thresholds (d100 ≤ need, %) by chance quality, commitment included. */
  needs: { half: number; big: number; corner: number };
}

export type OddsBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AttackRouteView {
  keep: ContestRowView;
  create: ContestRowView;
  finish: ContestRowView;
  /** KEEP's secondary line: the deterministic possession split (you, them). */
  possession: [number, number];
  /** CREATE's secondary line: per-possession chance mix (%, one decimal). */
  chanceMix: { turnover: number; half: number; big: number; corner: number; foul: number };
  bigChanceOdds: OddsBand;
  /** FINISH's secondary line: the likely shooter's duel, null with no XI. */
  shooter: ShooterView | null;
}

export interface ContestPanelView {
  /** Your attacking route vs their defensive answer. */
  attack: AttackRouteView;
  /** Their attacking route vs your defensive answer (your PRESS/BREAK/STOP rows). */
  defence: AttackRouteView;
  /** The demoted summary number (forecast NET): SQUAD EDGE. */
  squadEdge: number;
}

const pct = (w: number, total: number): number => Math.round((1000 * w) / total) / 10;

/** Band the big-chance weight relative to its unslid baseline (8/100 ≈ neutral). */
function bandOf(w: OutcomeWeights): OddsBand {
  const total = w.turnover + w.half + w.big + w.corner + w.foul;
  const share = w.big / total;
  if (share >= 0.1) return 'HIGH';
  if (share >= 0.065) return 'MEDIUM';
  return 'LOW';
}

/** One side's attacking route (their three duels against the defender's answers). */
export function attackRoute(att: EffCard[], attTotals: ContestTotals, defTotals: ContestTotals): AttackRouteView {
  const w = outcomeWeights(attTotals.create, defTotals.brk);
  const total = w.turnover + w.half + w.big + w.corner + w.foul;
  const s = likelyShooter(att);
  return {
    keep: {
      key: 'KEEP',
      yours: attTotals.keep,
      theirs: defTotals.press,
      edge: attTotals.keep - defTotals.press,
      commitTier: commitTierOf('keep', attTotals.commit.keep),
      commitBonus: attTotals.commit.keep,
    },
    create: {
      key: 'CREATE',
      yours: attTotals.create,
      theirs: defTotals.brk,
      edge: attTotals.create - defTotals.brk,
      commitTier: commitTierOf('create', attTotals.commit.create),
      commitBonus: attTotals.commit.create,
    },
    finish: {
      key: 'FINISH',
      yours: attTotals.finish,
      theirs: defTotals.stop,
      edge: attTotals.finish - defTotals.stop,
      commitTier: commitTierOf('finish', attTotals.commit.finish),
      commitBonus: attTotals.commit.finish,
    },
    possession: possessionSplit(attTotals, defTotals),
    chanceMix: {
      turnover: pct(w.turnover, total),
      half: pct(w.half, total),
      big: pct(w.big, total),
      corner: pct(w.corner, total),
      foul: pct(w.foul, total),
    },
    bigChanceOdds: bandOf(w),
    shooter: s
      ? {
          id: s.id,
          name: s.name,
          atk: s.atk,
          stop: defTotals.stop,
          needs: {
            half: shotNeed('half', s.atk, defTotals.stop, attTotals.commit.finish),
            big: shotNeed('big', s.atk, defTotals.stop, attTotals.commit.finish),
            corner: shotNeed('corner', s.atk, defTotals.stop, attTotals.commit.finish),
          },
        }
      : null,
  };
}

/** The full six-row panel from an evaluated split's parts. `squadEdge` is the
 *  forecast NET the caller already has (kept as the small summary). */
export function contestPanel(
  youEff: EffCard[],
  oppEff: EffCard[],
  yourTotals: ContestTotals,
  oppTotals: ContestTotals,
  squadEdge: number,
): ContestPanelView {
  return {
    attack: attackRoute(youEff, yourTotals, oppTotals),
    defence: attackRoute(oppEff, oppTotals, yourTotals),
    squadEdge,
  };
}
