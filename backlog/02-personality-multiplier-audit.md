# 02 — Personality multiplier audit

**Source:** `BASELINE.md` "Personality bonuses stack aggressively".

## Outcome

A documented decision on whether tier-3 personality resonances stacking with Perfect Dressing Room (tier-4) is a bug or a feature. Output is a numbers-backed recommendation, not an implementation.

## Why

Top-11-by-power XI in the baseline run unintentionally triggered **three simultaneous tier-3 themes** (Silk + Siege Mentality + a third) PLUS Perfect Dressing Room, yielding 1.72x attack and 1.80x defence multipliers. `MATCH_ENGINE_V5.md §5.4` reduced Perfect Dressing Room from 2.0x to 1.5x specifically to prevent dominance — but that reduction assumed PDR fires alone, not stacked on top of three themes.

## Acceptance criteria

- [ ] `design/balance-notes/personality-stacking.md` exists.
- [ ] Three harness scenarios captured at varied power bands:
  - **Low:** cards 400–410 (power ~72–74)
  - **Mid:** cards 200–210 (power ~78–80)
  - **High:** top 11 by power (power ~92–95) — already in baseline
- [ ] For each scenario, record:
  - Which resonances fire
  - Combined personality multiplier (attack / defence)
  - Total attack/defence score vs opponent baselines at round 1 and round 5
  - Whether PDR was triggered
- [ ] **Recommendation section** with one of:
  - **LEAVE AS-IS** — with rationale (e.g. "top-tier deck should feel legendary")
  - **REDUCE tier-3 multipliers** — by X%, with before/after simulation
  - **GATE Perfect Dressing Room** — e.g. "only if 0 or 1 tier-3 themes also fire"
  - **MUTUAL EXCLUSIVITY** — redesign so at most one tier-3 theme can fire per match

## Boundaries

- **Analysis only.** Do not touch `chemistry.ts`, `match-v5.ts`, or the design spec.
- Implementation of whatever is recommended is a separate task (03-follow-on) that will only exist if this audit concludes change is needed.
- Extend `scripts/match-harness.ts` with a band-selection CLI arg rather than duplicating it.

## Non-goals

- Don't modify any multipliers, even if the answer seems obvious.
- Don't audit other tiers (archetype synergies, cross synergies) — out of scope.
- Don't rewrite `MATCH_ENGINE_V5.md §5.3` or `§5.4`.

## Depends on

- **Task 01** (power range widening) — if 01 is done first, mid-band and low-band numbers will be cleaner and more representative of real play. If 01 is blocked or skipped, run this task against the current 71–95 range and note the caveat.

## Done when

The balance note exists with numbers, scenarios, and a single clear recommendation sentence.
