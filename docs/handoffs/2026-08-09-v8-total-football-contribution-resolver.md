# Kickoff Clash V8 — TOTAL FOOTBALL contribution resolver completion

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base PR #105 remains draft / untouched)

## Why this pass existed

Repository-wide GitHub code search was misleading because the V8 implementation lives on the draft PR head rather than the indexed default branch. The current PR #106 head already contained a partial rules-layer implementation for Johan Cruyff — TOTAL FOOTBALL, but the handoff still described the earlier pre-resolver state.

The implementation was audited from the actual PR head before making changes.

## Locked semantic model

TOTAL FOOTBALL is **not a stat modifier**.

The runtime keeps three distinct concepts:

1. printed ATT / DEF;
2. current ATT / DEF after real stat modifiers;
3. effective zone contribution after placement/rules evaluation.

The contribution path is:

```text
current ATT / DEF
      +
placement / active rules context
      ↓
calibrationEffectiveStats()
      ↓
zone contribution
      ↓
calibrationZoneTotals()
      ↓
calibrationTeamTotals()
```

Cruyff's Action:

> **TOTAL FOOTBALL — Ongoing: Your players ignore out-of-position penalties while this Action is active.**

is implemented by `calibrationContributionRules()` / `calibrationEffectiveOutOfPositionPenalty()` / `calibrationEffectiveStats()` in `calibration-runtime-base.ts`.

## Important non-resolver reads

Not every ATT/DEF read should become an effective-contribution read.

Raw/current stat reads intentionally remain raw for mechanics whose wording concerns the player's real ATT/DEF state:

- Bobby Moore — READ THE RUN detects real positive ATT modifiers only;
- Andy Robertson — RECOVERY RUN uses the same real ATT-gain primitive;
- Ashley Cole — SHOW HIM OUTSIDE targets by real current ATT, so TOTAL FOOTBALL does not create a fake targeting increase;
- Claudio Gentile — MAN MARKER suppression operates on the real player/action state; suppressing Cruyff disables TOTAL FOOTBALL and immediately restores normal OOP contribution penalties.

This distinction is exactly why TOTAL FOOTBALL must not be represented as hidden `+2` / `+5` ATT/DEF modifiers.

## Completion in this pass

### Telemetry now uses the contribution resolver

Trigger Press telemetry previously recomputed ATT conversion by manually subtracting `outOfPositionPenalty()`. That bypassed TOTAL FOOTBALL even though scoring correctly used `calibrationEffectiveStats()`.

Trigger Press telemetry now reads the same effective DEF contribution as the scoring runtime.

### Rules-layer attribution is explicit

Telemetry now exposes:

- `contributionRuleAttackDelta`
- `contributionRuleDefenceDelta`

These measure board contribution recovered by rules-layer effects such as TOTAL FOOTBALL without contaminating `actionAttackDelta` / `actionDefenceDelta`, which remain real stat-modifier telemetry.

For an OOP player in ATT under Trigger Press, TOTAL FOOTBALL can legitimately recover both:

- the player's direct ATT contribution penalty; and
- the DEF contribution converted to ATT by Trigger Press.

That causal contribution is reported as rules-layer attribution rather than as a player stat gain.

## Regression coverage

Focused tests now lock the following:

1. TOTAL FOOTBALL removes OOP penalties at contribution time and creates no hidden stat modifier.
2. Bobby Moore does not treat TOTAL FOOTBALL contribution recovery as an ATT gain.
3. Ashley Cole remains bound to real ATT while Cruyff restores the target's OOP contribution.
4. Gentile suppressing Cruyff immediately restores the normal OOP penalty.
5. Trigger Press telemetry uses effective contribution under TOTAL FOOTBALL.
6. TOTAL FOOTBALL contribution recovery is attributed separately from Action ATT/DEF deltas.

## Do not change

Do not replace TOTAL FOOTBALL with a hidden ATT/DEF bonus.

Do not make every current-stat targeting/condition read use `calibrationEffectiveStats()`; that would reintroduce the Ashley Cole / Moore / Robertson class of semantic bugs from the opposite direction.

The invariant is:

> **Stat mechanics read real stats. Contribution mechanics read resolved contribution.**
