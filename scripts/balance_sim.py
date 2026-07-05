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
import os

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


# =============================================================================
# Phase 2 — generic trait evaluator + manager calibration (--calibrate)
#
# Mirrors src/engine/ (traits.ts + match.ts) over the manager bundles exported
# by `npx tsx scripts/export-managers.ts` → scripts/managers_ref.json, so the
# per-manager calibration beat rates here are the reference constants asserted
# by src/engine/__tests__/calibration.test.ts (bit-exact, same seeds).
# Calibration policy (fixed): native formation, no tactical cards, commit every
# window, substitute before batches 3/4/5.
# =============================================================================

SUBS_BUDGET = 3
FITNESS_RESTORE_PER_SUB = 1


def state_ctx_active(ctx, snap):
    """Mirror of contexts.ts stateContextActive (window/goal-event → False)."""
    kind = ctx["kind"]
    if kind == "posture":
        return snap["posture"] == ctx["posture"]
    if kind == "scoreline":
        return snap["scoreline"] == ctx["is"]
    if kind == "clock":
        return snap["clock"] == ctx["band"]
    if kind == "streak":
        return snap["streak"] >= ctx["atLeast"]
    if kind == "fitness":
        if "below" in ctx:
            return snap["fitness"] < ctx["below"]
        return snap["fitness"] >= ctx["atLeast"]
    if kind == "substitution":
        return snap["subThisBatch"]
    return False


def engine_has(engine, on):
    return any(s["on"] == on for s in engine["successes"])


def engine_goal_extends(engine, kind):
    return any(
        s["on"] == "any-goal" or (s["on"] == "window-goal" and s.get("window") == kind)
        for s in engine["successes"]
    )


def engine_concede_reason(engine, kind):
    for c in engine["contradictions"]:
        if c["on"] == "conceded":
            return c["reason"]
        if c["on"] == "turnover-conceded" and kind == "transition":
            return c["reason"]
    return None


def run_generic_match(seed, sides, target, sub_batches):
    """sides: [{posture, baseCharge, traits, engine, autoCommit}, ...] mirroring SideConfig."""
    rng = seed & M
    goals = [0, 0]
    points = [0.0, 0.0]
    cash = [0.0, 0.0]
    streak = [0, 0]
    fitness = [10.0, 10.0]
    subs_left = SUBS_BUDGET
    sub_this_batch = [False, False]
    conceded_this_batch = [False, False]
    postures = (sides[0]["posture"], sides[1]["posture"])
    done = False
    batch_reached = 0

    def snap(s, inc_batch):
        other = 1 - s
        if goals[s] > goals[other]:
            sl = "leading"
        elif goals[s] < goals[other]:
            sl = "chasing"
        else:
            sl = "level"
        return {
            "posture": postures[s],
            "scoreline": sl,
            "clock": clock_band(max(1, inc_batch)),
            "streak": streak[s],
            "fitness": fitness[s],
            "subThisBatch": sub_this_batch[s],
        }

    for batch in range(1, BATCHES + 1):
        if done:
            break
        batch_reached = batch
        # calibration policy: substitution before batches in sub_batches (side 0)
        if batch in sub_batches and subs_left > 0:
            subs_left -= 1
            sub_this_batch[0] = True
            fitness[0] = min(10.0, fitness[0] + FITNESS_RESTORE_PER_SUB)
            if engine_has(sides[0]["engine"], "substitution"):
                streak[0] += 1

        for _inc in range(1, INCREMENTS_PER_BATCH + 1):
            if done:
                break
            snaps = [snap(0, batch), snap(1, batch)]
            # die shifts (both sides' variance verbs, state-scoped)
            idx = DEFAULT_DIE_INDEX
            for s in (0, 1):
                for t in sides[s]["traits"]:
                    v = t["verb"]
                    if v not in ("amplify-variance", "dampen-variance"):
                        continue
                    k = t["context"]["kind"]
                    if k in ("window", "goal-event"):
                        continue
                    if not state_ctx_active(t["context"], snaps[s]):
                        continue
                    idx += 1 if v == "amplify-variance" else -1
            idx = max(0, min(len(DIE_LADDER) - 1, idx))
            die = DIE_LADDER[idx]

            # accruals then drains, side 0 then side 1 (mirrors runIncrement)
            for s in (0, 1):
                for t in sides[s]["traits"]:
                    if t["verb"] != "generate":
                        continue
                    k = t["context"]["kind"]
                    if k in ("window", "goal-event"):
                        continue
                    if not state_ctx_active(t["context"], snaps[s]):
                        continue
                    if t.get("resource") == "cash":
                        cash[s] += t["magnitude"]
                    else:
                        points[s] += t["magnitude"]
                for t in sides[s]["traits"]:
                    if t["verb"] != "drain-fitness":
                        continue
                    k = t["context"]["kind"]
                    if k in ("window", "goal-event"):
                        continue
                    if not state_ctx_active(t["context"], snaps[s]):
                        continue
                    fitness[s] = max(0.0, fitness[s] - t["magnitude"])
            if points[0] >= target:
                done = True
                break

            # generation: side 0 then 1, transition then set-piece; relocate reweights
            pending = []
            for s in (0, 1):
                own = postures[s]
                opp = postures[1 - s]
                rates = MATCHUP_MATRIX[(own, opp)]
                for kind in ("transition", "set-piece"):
                    rate = rates[kind]
                    for t in sides[s]["traits"]:
                        if t["verb"] != "relocate" or t["context"]["kind"] != "window":
                            continue
                        rate += t["magnitude"] if t["context"]["window"] == kind else -t["magnitude"]
                    rate = max(0.0, rate)
                    value, rng = rng_next(rng)
                    if value < rate:
                        pending.append((s, kind))

            # resolution — commit-all; fresh snapshots per resolution
            for s, kind in pending:
                if done:
                    break
                other = 1 - s
                my = snap(s, batch)
                theirs = snap(other, batch)
                charge = sides[s]["baseCharge"]
                for t in sides[s]["traits"]:
                    if t["verb"] != "amplify":
                        continue
                    c = t["context"]
                    if c["kind"] == "window":
                        if c["window"] == kind:
                            charge += t["magnitude"]
                    elif state_ctx_active(c, my):
                        charge += t["magnitude"]
                for t in sides[other]["traits"]:
                    if t["verb"] != "deny":
                        continue
                    c = t["context"]
                    if c["kind"] == "window":
                        if c["window"] == kind:
                            charge -= t["magnitude"]
                    elif state_ctx_active(c, theirs):
                        charge -= t["magnitude"]
                value, rng = rng_next(rng)
                roll = 1 + int(value * die)
                if charge + roll < WINDOW_THRESHOLD:
                    continue
                goals[s] += 1
                conceded_this_batch[other] = True
                if engine_goal_extends(sides[s]["engine"], kind):
                    streak[s] += 1
                mult = max(1, streak[s])
                points[s] += mult * GOAL_VALUE
                # goal-event generates: scorer 'scored', conceder 'conceded'
                for holder, on in ((s, "scored"), (other, "conceded")):
                    for t in sides[holder]["traits"]:
                        if t["verb"] != "generate" or t["context"]["kind"] != "goal-event":
                            continue
                        if t["context"]["on"] != on:
                            continue
                        if t["context"].get("via") and t["context"]["via"] != kind:
                            continue
                        if t.get("resource") == "cash":
                            cash[holder] += t["magnitude"]
                        else:
                            points[holder] += t["magnitude"]
                reason = engine_concede_reason(sides[other]["engine"], kind)
                if reason and streak[other] > 0:
                    streak[other] = 0
                if points[0] >= target:
                    done = True

        # batch end: clean-batch extensions, resets
        clean = [not conceded_this_batch[0], not conceded_this_batch[1]]
        for s in (0, 1):
            if clean[s] and engine_has(sides[s]["engine"], "clean-batch"):
                streak[s] += 1
        conceded_this_batch = [False, False]
        sub_this_batch = [False, False]

    return {"points": points[0], "goals": goals, "cash": cash[0], "target_met": points[0] >= target,
            "batch": batch_reached}


def calibrate(ref_path, n_override=None):
    with open(ref_path) as f:
        ref = json.load(f)
    cal = ref["calibration"]
    n = n_override or cal["seeds"]
    target = cal["target"]
    sub_batches = set(cal["subBatches"])
    report = {}
    for mgr in ref["managers"]:
        player = {
            "posture": mgr["defaultPosture"],
            "baseCharge": 0,
            "traits": mgr["traits"],
            "engine": mgr["engine"],
        }
        per_opp = {}
        for opp in cal["opponents"]:
            met = 0
            for seed in range(1, n + 1):
                r = run_generic_match(seed, [player, opp["side"]], target, sub_batches)
                met += 1 if r["target_met"] else 0
            per_opp[opp["id"]] = met / n
        agg = sum(per_opp.values()) / len(per_opp)
        report[mgr["id"]] = {"perOpponent": per_opp, "aggregate": agg}
    return {"n": n, "target": target, "managers": report}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--target", type=float, default=10)
    ap.add_argument("--variant", choices=sorted(VARIANTS), default="baseline")
    ap.add_argument("--curve", action="store_true", help="print the SM §8 run target curve")
    ap.add_argument("--calibrate", action="store_true", help="per-manager calibration beat rates (Phase 2)")
    args = ap.parse_args()

    if args.curve:
        for f in range(1, 10):
            print(f"fixture {f}: target {points_target(f):.2f}")
        return

    if args.calibrate:
        ref_path = os.path.join(os.path.dirname(__file__), "managers_ref.json")
        print(json.dumps(calibrate(ref_path), indent=2))
        return

    cfg = VARIANTS[args.variant]
    out = stats(args.n, args.target, cfg["opp_gambler"])
    out["variant"] = args.variant
    out["target"] = args.target
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
