# V8 expansion runtime slice 04 — Berbatov + Kanté semantics — 2026-08-09

## Scope

Finish the first eight-card V8 expansion batch without reopening the frozen Energy, +7 scoring, Tactical values, compact package balance or the original 30-card Action-quality decisions.

## Berbatov — BERBA SPIN — accepted/runtime-ready

Text:

> **The first opposing defender Action each period that targets this is ignored; then move this to an adjacent zone.**

Implementation principle:

- defender Action targeting is intercepted after target selection rather than by adding player-id checks to every defender
- the interception consumes once per period
- the targeting Action is ignored
- Berbatov moves to an available adjacent zone
- dynamic targeting/suppression is rebuilt from the changed board

Current covered targeting paths:

1. **Ashley Cole — SHOW HIM OUTSIDE** dynamic stat binding
2. **Gentile — MAN MARKER** Action suppression

Focused regressions prove:

- SHOW HIM OUTSIDE is ignored when it is the first defender Action targeting Berbatov
- Berbatov moves ATT → MID and does not retain Ashley's −5 ATT
- a second defender Action in the same period is not intercepted
- MAN MARKER can be the first intercepted defender Action and does not leave Berbatov suppressed

This is deliberately a reusable interception hook rather than a Berbatov-specific list of opposing Actions.

## Kanté — EVERYWHERE — semantics accepted, stats required

Tracker row `Players!186` currently has:

- Match name: **Konter**
- Full card name: **N’Golo Konter**
- Position: **DM / CM**
- Card ID: **KC-043**
- Action: **EVERYWHERE**
- Effect: **Counts as present in all three sectors.**
- Design status: **Proposed**
- Balance status: **Not balanced**
- Cost / ATT / DEF: **blank**

Accepted V8 translation:

> **Ongoing: This counts as present in all three zones. Its ATT and DEF still contribute only where it is played.**

Meaning:

- EVERYWHERE is a **rules/condition presence** primitive
- Kanté can satisfy conditions such as “a friendly player is here” in DEF, MID and ATT
- his physical card remains in one zone
- printed ATT/DEF contribute only in that physical zone
- if the Action is suppressed/disabled, presence collapses to the physical zone

Rejected interpretation:

- do **not** clone Kanté's ATT/DEF contribution into all three zones; that would effectively turn one card into three scoring bodies and is much stronger than the Tracker wording implies

Runtime status:

- multi-zone presence primitive implemented and tested
- card remains `stats_required` rather than `runtime_ready` because the source-of-truth Tracker has no Cost/ATT/DEF yet
- do not invent temporary numbers just to complete the batch

## Batch 01 status

Runtime-ready:

1. Abedi Pelé — JINKING RUN
2. Aitana Bonmatí — ESCAPE THE PRESS
3. Alfredo Di Stéfano — END-TO-END RUN
4. Ashley Cole — SHOW HIM OUTSIDE
5. Carles Puyol — BODY ON THE LINE
6. Clint Dempsey — CHEEKY CHIP
7. Dimitar Berbatov — BERBA SPIN

Rules-ready / stats required:

8. N’Golo Kanté — EVERYWHERE

## Verification

Gameplay head: `8eb03fd1d3d5a863c97c7cce19a8f3fc03830977`

Verify #296 / run `31285949819`: **success**.

Passed:

- focused Vitest gate, including Berbatov interception and EVERYWHERE presence regressions
- full Vitest regression visibility
- V8 calibration matrix artifact upload
- TypeScript
- changed-file lint gate
- full lint regression visibility
- static export
- Chromium installation
- V7 mobile typed-chance browser checks
- V8 mobile match-lab smoke checks

No frozen balance constants were changed.

## Next

Do not spend more time on Batch 01 mechanics. The next design work should either:

1. balance Kanté's blank Cost/ATT/DEF in the Card Design Tracker, then register the card; or
2. move straight to Batch 02 from the 40-player audit, prioritising cards that reuse the primitives now proven here (dynamic target, delayed Cost, interception, movement, score/zone state, one-shot Chance prevention, rules-layer presence).
