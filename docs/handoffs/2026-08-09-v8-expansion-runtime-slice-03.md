# V8 expansion runtime — Slice 03 — Ashley Cole — 2026-08-09

## Accepted card

### Ashley Cole — SHOW HIM OUTSIDE

> Ongoing: The highest-ATT opposing attacker here has −5 ATT.

## V8 semantics

`here` means Ashley Cole's current confrontation: his zone maps to the opposing depth zone using the normal V8 DEF↔ATT / MID↔MID relationship.

`attacker` means a non-GK player whose natural V8 zones include ATT.

The effect is a **dynamic bound target**, not a reveal-time snapshot:

- while Ashley's Action is active, the highest-current-ATT opposing attacker in his confrontation has −5 ATT
- when the board changes, the old bound modifier is removed before a new target is selected
- therefore the −5 never stacks and never remains on a stale target
- the binding refreshes after reveal, movement, period cleanup and live score-state modifier refreshes
- normal Action suppression/target-interception rules still apply because the modifier uses Ashley as its source Action

## Reusable primitive

New module:

`src/engine-v8/calibration-expansion-ongoing.ts`

Primary helper:

`refreshCalibrationExpansionOngoingEffects(state)`

The helper rebuilds dynamic ongoing target modifiers from board truth. Ashley is the first consumer; the pattern is intended for later cards such as STEP IN / INTIMIDATOR-style moving bindings rather than bespoke permanent debuffs.

## Focused regression

The expansion runtime test verifies:

1. Ashley reveals in DEF.
2. Dempsey reveals in the opposing ATT confrontation and receives −5 ATT.
3. A stronger Ronaldo then reveals.
4. Dempsey is restored to his normal ATT and the −5 retargets to Ronaldo.
5. After period cleanup the correct target remains bound and no stale modifier returns.

## Verification

Gameplay head `732ec87311b2e778677fa24611b2e2bd444b7796` passed Verify #287 / run `31284581028` through all functional gates:

- focused Vitest: passed
- full regression visibility: passed
- TypeScript: passed
- changed-file lint: passed
- full lint visibility: passed
- static export: passed
- Chromium: passed
- V7 browser checks: passed
- V8 mobile match-lab check: passed

## Batch 01 status

Runtime-ready:

1. Abedi Pelé — JINKING RUN
2. Aitana Bonmatí — ESCAPE THE PRESS
3. Alfredo Di Stéfano — END-TO-END RUN
4. Ashley Cole — SHOW HIM OUTSIDE
5. Carles Puyol — BODY ON THE LINE
6. Clint Dempsey — CHEEKY CHIP

Remaining implementation:

- Dimitar Berbatov — BERBA SPIN

Semantics decision still required:

- N’Golo Kanté — EVERYWHERE

## Next engineering decision

BERBA SPIN should **not** be implemented by adding Berbatov checks to every known opposing Action. The current engine's general Action-target interception exists internally for Iniesta. The correct next step is to promote that interception point into a reusable primitive that can return an interception outcome and a reactive movement request. Berbatov then consumes that shared hook once per period.
