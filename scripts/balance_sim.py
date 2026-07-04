#!/usr/bin/env python3
"""KC rebuild — balance reference sim (SYNERGY_MODEL_V1, ⚗️ layer).

Python mirror of the Phase-1 single-match model in `src/engine/` (stdlib only).
It implements the SAME mulberry32 RNG bit-for-bit and consumes rolls in the
SAME order as the TS engine's fixed loop, so on the same seeds the two produce
IDENTICAL matches — the distribution numbers this script prints are the baked
reference constants asserted by the vitest harness
(`src/engine/__tests__/distributions.test.ts`).

NOTE: the vitest harness is the CANONICAL acceptance gate now that Phase 1 has
landed (KC_REBUILD_PLAN_V1 §P0.3); this script is the independent reference
implementation used to derive and sanity-check those numbers, and the scratch
instrument for future balance passes. Change a constant here AND in
`src/engine/data/baseline.ts` (they are mirrored by design), then re-bake the
test constants from this script's output.

Usage:
  python3 scripts/balance_sim.py                 # baseline stub, seeds 1..500
  python3 scripts/balance_sim.py --n 20000       # smoother reference run
  python3 scripts/balance_sim.py --variant gambler-opp
  python3 scripts/balance_sim.py --curve         # SM §8 run target curve table
"""

import argparse
import json

# --- constants mirrored from src/engine/data/baseline.ts --------------------

BATCHES = 6
INCREMENTS_PER_BATCH = 3
ENERGY_BUDGET = 5
WINDOW_THRESHOLD = 6
DIE_LADDER = [2, 4, 8, 12]
DEFAULT_DIE_INDEX = 1  # d4
GOAL_VALUE = 2
SURPLUS_CASH_PER_BATCH = 100
SURPLUS_CASH_PER_ENERGY = 50

MATCHUP_MATRIX = {
    ("deep-block", "possession"): {"transition": 0.34, "set-piece": 0.08},
    ("deep-block", "deep-block"): {"transition": 0.12, "set-piece": 0.10},
    ("possession", "deep-block"): {"transition": 0.10, "set-piece": 0.22},
    ("possession", "possession"): {"transition": 0.16, "set-piece": 0.12},
}

# SM §8 run target curve (Phase 4 consumes this; printed with --curve).
def points_target(fixture: int) -> float:
    return 1.8 * (1.42 ** fixture)


def clock_band(batch: int) -> str:
    if batch <= 2:
        return "early"
    if batch <= 4:
        return "mid"
    return "late"


# --- mulberry32, bit-exact with src/engine/rng.ts ----------------------------

M = 0xFFFFFFFF


def rng_next(state: int):
    a = (state + 0x6D2B79F5) & M
    t = (a ^ (a >> 15)) & M
    t = (t * ((1 | a) & M)) & M
    t2 = (t ^ (t >> 7)) & M
    t2 = (t2 * ((61 | t) & M)) & M
    t = ((t + t2) & M) ^ t
    t &= M
    value = ((t ^ (t >> 14)) & M) / 4294967296.0
    return value, a


# --- the P1 stub fixture, mirrored from src/engine/data/stub.ts --------------
# Player: deep-block counter stub. Traits: +3 charge on transition windows,
# +1 on set-piece windows, +2 on all windows while chasing, amplify-variance
# (die step up, both sides) in the late clock band. Engine: streak on
# transition goals, reset (reason "conceded") on conceding.
# Opponent: possession profile, flat charge 2, auto-commit, no traits;
# any-goal streak engine (its streak never gates anything in P1 scoring).

VARIANTS = {
    # opponent turns Gambler: amplify-variance while in possession posture
    # (always true for the stub opponent) — the whole fixture goes swingy.
    "baseline": {"opp_gambler": False},
    "gambler-opp": {"opp_gambler": True},
}


def run_match(seed: int, target: float = 10, opp_gambler: bool = False):
    rng = seed & M
    goals = [0, 0]
    points = [0, 0]
    streak = [0, 0]
    conceded_this_batch = [False, False]
    energy = ENERGY_BUDGET
    committed = converted = 0
    streak_peak = 0
    done = False
    early = False
    postures = ("deep-block", "possession")

    for batch in range(1, BATCHES + 1):
        if done:
            break
        band = clock_band(batch)
        for _inc in range(1, INCREMENTS_PER_BATCH + 1):
            if done:
                break
            # die shifts: player Late Chaos (late band) + optional opp gambler
            idx = DEFAULT_DIE_INDEX
            if band == "late":
                idx += 1
            if opp_gambler:
                idx += 1
            idx = max(0, min(len(DIE_LADDER) - 1, idx))
            die = DIE_LADDER[idx]

            # window generation — fixed roll order: side 0 then 1, transition then set-piece
            pending = []
            for side in (0, 1):
                own = postures[side]
                opp = postures[1 - side]
                rates = MATCHUP_MATRIX[(own, opp)]
                for kind in ("transition", "set-piece"):
                    value, rng = rng_next(rng)
                    if value < rates[kind]:
                        pending.append((side, kind))

            # resolution — commit-all policy (the reference policy)
            for side, kind in pending:
                if done:
                    break
                chasing = goals[side] < goals[1 - side]
                if side == 0:
                    charge = (3 if kind == "transition" else 1) + (2 if chasing else 0)
                else:
                    charge = 2
                value, rng = rng_next(rng)
                roll = 1 + int(value * die)
                if side == 0:
                    committed += 1
                if charge + roll >= WINDOW_THRESHOLD:
                    if side == 0:
                        converted += 1
                    goals[side] += 1
                    conceded_this_batch[1 - side] = True
                    # streak: player engine extends on transition goals only;
                    # opponent stub extends on any goal
                    if (side == 0 and kind == "transition") or side == 1:
                        streak[side] += 1
                        if side == 0:
                            streak_peak = max(streak_peak, streak[0])
                    mult = max(1, streak[side])
                    points[side] += mult * GOAL_VALUE
                    # conceder contradiction: both stub engines reset on conceding
                    streak[1 - side] = 0
                    if points[0] >= target:
                        early = True
                        done = True
        # batch end: stub engines have no clean-batch/batch-conceded rules
        conceded_this_batch = [False, False]

    target_met = points[0] >= target
    surplus_cash = 0
    if target_met:
        # the whistle blows the moment the target is met, so a met target always
        # banks remaining full batches + unspent energy (mirrors checkEarlyWhistle)
        surplus_batches = BATCHES - batch if early else 0
        surplus_cash = surplus_batches * SURPLUS_CASH_PER_BATCH + energy * SURPLUS_CASH_PER_ENERGY
    return {
        "points": points[0],
        "goals_for": goals[0],
        "goals_against": goals[1],
        "committed": committed,
        "converted": converted,
        "target_met": target_met,
        "streak_peak": streak_peak,
        "surplus_cash": surplus_cash,
    }


def stats(n: int, target: float, opp_gambler: bool):
    tot = {k: 0.0 for k in ("points", "goals_for", "goals_against", "committed", "converted", "streak_peak")}
    met = 0
    for seed in range(1, n + 1):
        r = run_match(seed, target=target, opp_gambler=opp_gambler)
        for k in tot:
            tot[k] += r[k]
        met += 1 if r["target_met"] else 0
    return {
        "n": n,
        "meanPoints": tot["points"] / n,
        "meanGoalsFor": tot["goals_for"] / n,
        "meanGoalsAgainst": tot["goals_against"] / n,
        "conversionRate": tot["converted"] / max(1.0, tot["committed"]),
        "targetMetRate": met / n,
        "meanStreakPeak": tot["streak_peak"] / n,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--target", type=float, default=10)
    ap.add_argument("--variant", choices=sorted(VARIANTS), default="baseline")
    ap.add_argument("--curve", action="store_true", help="print the SM §8 run target curve")
    args = ap.parse_args()

    if args.curve:
        for f in range(1, 10):
            print(f"fixture {f}: target {points_target(f):.2f}")
        return

    cfg = VARIANTS[args.variant]
    out = stats(args.n, args.target, cfg["opp_gambler"])
    out["variant"] = args.variant
    out["target"] = args.target
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
