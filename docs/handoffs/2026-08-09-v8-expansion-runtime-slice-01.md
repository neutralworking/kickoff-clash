# V8 expansion runtime — Slice 01 — 2026-08-09

## Scope

First implementation slice after the 40-card Action expansion audit. This slice intentionally implements only the cleanest reusable primitives before moving on to delayed Cost, dynamic-target and Action-interception work.

Frozen systems remain untouched:

- Energy 2 / 4 / 6 / 8
- +7 repeat scoring
- Penalty Cost 1 / +5 ATT
- Cross / Through Ball / Long Shot / Corner base values
- accepted compact reference XIs
- completed first 30-card Action-quality decisions

## Runtime-ready cards

### Abedi Pelé — JINKING RUN

> Moveable once per match. When this moves from MID to ATT, it gains +4 ATT.

Implementation:

- uses the existing DEF/MID/ATT board movement model
- movement allowance is match-lifetime rather than Cafu/Beckenbauer period-lifetime
- only adjacent natural-zone movement is allowed
- MID → ATT applies +4 ATT for the rest of the match
- second movement attempt is rejected

### Alfredo Di Stéfano — END-TO-END RUN

> Ongoing: While losing, +3 ATT. While winning, +3 DEF. While level, +1 ATT and +1 DEF.

Implementation:

- reusable live match-score modifier refresh
- score state is intentionally supplied by the match coordinator rather than embedded into calibration board state
- refresh replaces the previous END-TO-END RUN modifier instead of stacking it
- level / losing / winning states are covered explicitly

### Clint Dempsey — CHEEKY CHIP

> On Reveal: If you are losing here, gain +5 ATT this period.

Audit correction:

Dempsey is **not** a match-score Action. `losing here` means the current zone confrontation. The primitive is therefore `zone_state_modifier`, not `score_state_modifier`.

Implementation compares the friendly zone power against its opposing depth confrontation after Dempsey reveals. If still behind, +5 ATT applies for the current period.

### Carles Puyol — BODY ON THE LINE

> The first time this match an opposing Chance would resolve here, cancel it; then this loses 3 DEF.

Implementation:

- intercepts the first otherwise-resolving Chance in Puyol's confrontation
- does not consume itself on a Chance already cancelled by another effect
- does not cancel an uncancellable Chance
- cancelled Tactical ATT is removed from the attacking zone
- Puyol then receives −3 DEF for the rest of the match
- subsequent Chances resolve normally

## Card registry

The calibration registry now includes these four expansion cards in addition to the original frozen pool. Tracker identity/cost is used when populated; reconciled ATT/DEF values are used where the Tracker remains blank.

No source Sheet or Supabase data was written back.

## Focused regressions

`src/engine-v8/__tests__/calibration-expansion-runtime.test.ts` covers:

1. JINKING RUN MID → ATT +4 and once-per-match enforcement.
2. CHEEKY CHIP reading zone state rather than match score.
3. END-TO-END RUN level → losing → winning transitions without modifier stacking.
4. BODY ON THE LINE cancelling only the first eligible Chance and applying −3 DEF.
5. BODY ON THE LINE not firing into an uncancellable Chance.

## Verification

Verify #277 / run `31284033935` passed end-to-end on gameplay head `d31b6b05fadc6a83ac4407729c22a6023a521220`:

- focused Vitest gate: passed
- full Vitest regression visibility: passed
- TypeScript: passed
- changed-file lint: passed
- full lint regression visibility: passed
- static export: passed
- Chromium install: passed
- V7 typed-chance browser checks: passed
- V8 mobile match-lab smoke checks: passed

## Remaining Batch 01 work

Not implemented yet:

1. **Aitana Bonmatí — ESCAPE THE PRESS** — delayed one-use next-period MID player Cost modifier.
2. **Ashley Cole — SHOW HIM OUTSIDE** — dynamic strongest-opposing-attacker targeting with safe retargeting.
3. **Dimitar Berbatov — BERBA SPIN** — defender Action interception followed by reactive adjacent-zone movement.
4. **N’Golo Kanté — EVERYWHERE** — still blocked on semantics: condition-presence in all zones vs full stat contribution in all zones must be decided before implementation.

Next implementation order should be Aitana → Ashley Cole → Berbatov. Keep Kanté out until the rules-layer meaning of `present` is explicit.
