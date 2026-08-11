# V8 expansion runtime — Batch 02 slice 02

## Scope

This slice completes the shared opponent ATT-gain listener used by Bobby Moore / READ THE RUN and Andy Robertson / RECOVERY RUN.

No Energy, Penalty, +7 scoring-band, Cross, Through Ball, Set Piece, Dribbling package or original 30-card calibration values were changed.

## Accepted cards

### Bobby Moore — READ THE RUN

**Text**

> The first time each period an opposing central attacker here gains ATT, gain the same DEF this period.

V8 central-attacker classification: CF / SS / AM.

The Action observes increases in positive ATT contribution by modifier source. It does not trigger when a negative ATT modifier disappears, and it does not retrigger merely because a live modifier is replaced by another modifier with the same source and value.

### Andy Robertson — RECOVERY RUN

**Text**

> The first time each period an opposing wide attacker here gains ATT, gain the same DEF this period.

V8 wide-attacker classification: WF / LW / RW / LM / RM.

The same shared ATT-gain listener is used. The defender must currently face the attacker through the normal DEF ↔ ATT / MID ↔ MID confrontation.

## Engine primitive

`src/engine-v8/calibration-expansion-reactions.ts`

The primitive compares positive ATT contribution by source before and after public engine operations. This deliberately distinguishes a real attacking buff from net ATT restored by removal/retargeting of a debuff such as Ashley Cole / SHOW HIM OUTSIDE.

The listener is wired across reveal, movement and live score-state refresh operations in `calibration-engine.ts`.

## Regression coverage

`src/engine-v8/__tests__/calibration-expansion-batch-02-runtime.test.ts`

Coverage includes:

- READ THE RUN triggering from Di Stéfano's real positive ATT modifier.
- once-per-period consumption and period reset.
- same-value live score modifier replacement not being treated as a fresh ATT gain.
- Ashley Cole retargeting restoring ATT without falsely triggering READ THE RUN.
- RECOVERY RUN reacting to Abedi Pelé / JINKING RUN as a wide attacker enters Robertson's confrontation.

## Batch 02 state after this slice

Runtime-ready:

- Tymoshchuk — STEP IN
- Bobby Moore — READ THE RUN
- Andy Robertson — RECOVERY RUN
- Nesta — TIMED SLIDE
- Brian Laudrup — GLIDING RUN
- Davids — PITBULL

Still open:

- Cruyff — TOTAL FOOTBALL: requires an OOP rules-layer override; do not emulate this with visible stat buffs because targeting/reaction code reads current player stats before OOP penalties are applied.
- Özil — INVISIBLE: Action semantics are specified, but source ATT/DEF/Cost remain unavailable in the current Tracker/reconciliation data.

## Design note for TOTAL FOOTBALL

The correct implementation point is the effective OOP contribution calculation. A compensating +ATT/+DEF modifier would be observably wrong because it would change targeting and ATT-gain reactions even though OOP penalties are only meant to affect zone contribution. TOTAL FOOTBALL therefore remains `primitive_required` until the OOP rule can be centralized cleanly.
