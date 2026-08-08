# V8 expansion runtime — Slice 02 — Aitana — 2026-08-09

## Accepted card

### Aitana Bonmatí — ESCAPE THE PRESS

> On Reveal: Your first MID player next period costs 1 less.

## V8 semantics

`MID player` is implemented as a player whose V8 natural zones include MID. This avoids reintroducing old positional/sector machinery and makes the discount readable from the card's playable-zone identity.

The effect is deliberately **next-period only**:

- revealing Aitana in Period N arms a discount for Period N+1
- the first MID-capable player removed from hand / committed in that period costs 1 less Energy
- the discount is consumed immediately on that first qualifying player
- non-MID players do not consume it
- if unused, it expires automatically when the game advances beyond the armed period
- minimum Cost is 0
- P4 reveal does not arm a nonexistent P5 discount

## Runtime primitive

New public runtime helper:

`previewCalibrationPlayerCost(state, side, cardId)`

The normal player-from-hand payment path now consumes the same calculated discount, so preview and actual Energy spend cannot diverge.

The primitive stores only the armed period in match state; it does **not** permanently rewrite card Cost in hand.

## Source values

Tracker remains authoritative for Aitana's populated Cost:

- Cost: 6
- ATT/DEF remain sourced from reconciliation while Tracker stats are blank: 6 / 4

No Sheet or Supabase write-back was made.

## Verification

Gameplay head `012462cb42e339a9dcc2f79e64ced13d4cff8e0f` passed Verify #281 / run `31284313198` end-to-end:

- focused Vitest gate: passed
- full Vitest regression visibility: passed
- TypeScript: passed
- changed-file lint: passed
- full lint regression visibility: passed
- static export: passed
- Chromium: passed
- V7 typed-chance browser checks: passed
- V8 mobile match-lab smoke checks: passed

Focused regressions cover both use and expiry of ESCAPE THE PRESS.

## Batch 01 status

Runtime-ready:

1. Abedi Pelé — JINKING RUN
2. Aitana Bonmatí — ESCAPE THE PRESS
3. Alfredo Di Stéfano — END-TO-END RUN
4. Carles Puyol — BODY ON THE LINE
5. Clint Dempsey — CHEEKY CHIP

Still to implement:

- Ashley Cole — SHOW HIM OUTSIDE
- Dimitar Berbatov — BERBA SPIN

Semantics required before implementation:

- N’Golo Kanté — EVERYWHERE

Next engineering target: **Ashley Cole / dynamic opponent targeting**, then Berbatov / Action interception + reactive movement.
