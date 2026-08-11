# V8 expansion runtime — Batch 03 slice 03

Date: 2026-08-09
Branch: `claude/generated-tactical-window-6dxfay`
Parent PR: #106 (draft, unmerged)

## Scope

This slice completes Batch 03 by implementing the two remaining Tactical-transformation Actions:

- Alexia Putellas — **THROUGH THE GAP**
- Andrea Pirlo — **DIAGONAL SWITCH**

Batch 03 is now **8/8 runtime-ready**.

The Card Design Tracker remains authoritative for Action identity/text and populated Cost. KC reconciliation supplies frozen ATT/DEF and fake-name data only where required.

No global Energy, +7 scoring band, Penalty value, Tactical base value or frozen package-balance input changed.

## Source priority

### Alexia Putellas — THROUGH THE GAP

Tracker:
- row 15
- source card KC-062
- Cost **5**
- Action **THROUGH THE GAP**

Reconciliation supplies:
- ATT 6
- DEF 4
- fake name Alexia Portellas / Portellas

The Tracker's populated Cost 5 supersedes the older reconciliation Cost 3.

Accepted V8 text:
> **The first non-Through-Ball Chance played here each period becomes a Through Ball before it resolves.**

### Andrea Pirlo — DIAGONAL SWITCH

Tracker:
- row 19
- source card KC-021
- Cost **5**
- Action **DIAGONAL SWITCH**

Reconciliation supplies:
- ATT 4
- DEF 6
- fake name Andrea Pirola / Pirola

The Tracker's populated Cost 5 supersedes the older reconciliation Cost 3.

Accepted V8 text:
> **Your first Chance played in MID each period resolves in ATT instead; if it was not a Cross, it becomes a Cross before it resolves.**

## Shared pre-resolution transformation stage

Implemented in:
`src/engine-v8/calibration-expansion-chance-reactions.ts`

Transformations happen **before** specialist, protection and cancellation resolution.

Accepted ordering:
1. identify the original Tactical instance and originally requested zone;
2. Alexia evaluates first, using the original played zone;
3. Pirlo evaluates second, using the same original MID-play condition;
4. the final type and final zone enter the existing downstream Chance pipeline;
5. FIRST TOUCH / movement protection / ordinary specialist bonuses / ordinary cancellation / TIMED SLIDE run against that final type and zone;
6. GET ACROSS HIM cancellation interception runs next;
7. BLACK SPIDER suppression runs last.

This ensures a transformed card is a real Through Ball or Cross for downstream rules rather than merely carrying a cosmetic label.

## Tactical instance preservation

Type transformation changes only the fields that belong to Tactical identity:
- `type`
- `name`
- `baseAtt`

It deliberately preserves:
- instance `id`
- `baseCost`
- `costModifier`
- `attModifier`
- `cancellable`
- `generatedBy`
- metadata

That keeps generated-card lineage and per-instance modifiers intact.

## Original paid Cost rule

The transformed Tactical must pay as the **original card that was committed/played**, not as its destination type.

For a normal transformed Chance:
1. calculate/spend the live Cost from the original card in its original zone using the existing Cost path;
2. consume any original live Cost effects there;
3. reinsert that same paid instance into the resolution state;
4. apply Alexia/Pirlo transformations;
5. resolve the transformed card with `ignoreEnergy`;
6. write the already-paid Cost onto the resolution receipt.

This is stronger than preserving `baseCost` alone because live discounts are also preserved.

### Lloyd proof

A Long Shot played with Lloyd's free-Long-Shot effect:
- is paid at **0 Energy** as a Long Shot;
- THROUGH THE GAP then transforms it into a Through Ball;
- the resolution receipt still reports Cost 0;
- team Energy remains unchanged.

Ordinary non-transformed Chances stay on the previous payment/telemetry path. The spend-before-transform path is activated only when Alexia or Pirlo actually intervenes.

## THROUGH THE GAP — runtime behavior

Rules:
- Alexia must be enabled and physically in the originally requested zone;
- only the first eligible non-Through-Ball Chance there each period transforms;
- the transformed instance becomes a Through Ball before downstream rules run;
- an already-Through-Ball Chance does not spend Alexia's trigger;
- period reset restores the trigger.

### Downstream typed interaction

Focused proof includes:
- Alexia in MID;
- opposing Nesta in MID;
- Long Shot played in MID;
- THROUGH THE GAP transforms it to Through Ball;
- TIMED SLIDE sees the final Through Ball and cancels it.

This verifies transformation occurs before typed cancellation logic.

## DIAGONAL SWITCH — runtime behavior

Rules:
- Pirlo may be deployed anywhere while enabled;
- only the first Chance originally played in MID each period triggers;
- the final resolution zone becomes ATT;
- if the card is not already a Cross at that stage, it becomes a Cross;
- the second MID Chance in the same period resolves normally in MID.

Downstream ATT-zone specialists/cancellation therefore see the switched Chance as a real Cross in ATT.

## Alexia + Pirlo composition

Accepted order is **Alexia before Pirlo**.

Example covered by focused tests:
- original Long Shot in MID;
- Alexia: Long Shot → Through Ball;
- Pirlo: Through Ball → Cross and MID → ATT;
- final resolution: Cross in ATT.

The test uses an instance with:
- original Long Shot base Cost 1;
- `costModifier +2`;
- `attModifier +3`.

Expected accepted result:
- paid Cost **3**, from the original Long Shot instance;
- final type Cross;
- final zone ATT;
- final ATT **5** = Cross base 2 + preserved `attModifier 3`;
- both transformation events recorded.

### Literal Cross interaction

The current contract says Alexia transforms the first **non-Through-Ball** Chance. A Cross is therefore eligible.

With both Alexia and Pirlo active on a first Cross in MID, the literal sequence may be:
`Cross → Through Ball → Cross in ATT`.

This is intentional under the current accepted wording, not an engine defect. If design later wants Cross excluded from THROUGH THE GAP, change the card contract explicitly rather than adding an engine exception.

## Commitment and Generated-Tactical Window

Both surfaces use the same transformation/reaction path.

Focused proof covers:
- a pre-paid committed Long Shot transformed by Alexia while preserving the supplied paid Cost;
- a same-period generated Cross played in the Generated-Tactical Window transformed/relocated by Pirlo;
- returned window metadata exposes the final Cross type and ATT zone.

Utility-first Generated-Tactical Window ordering remains unchanged.

## Verification — transformation gameplay head

Gameplay/test head:
`0328aeb570e3816c39c34848fbc89ccc0788701c`

Verify:
- #353
- run `31309033331`
- job `93233885297`
- conclusion: success

Verified gates:
- blocking focused Vitest gate: success
- full Vitest regression visibility: success
- calibration artifact upload: success
- TypeScript: success
- changed-file lint: success
- full lint visibility: success
- static Next export: success
- Chromium install: success
- V7 typed-chance browser: success
- V8 match-lab browser: success

The connector did not expose reliable exact test-count text for this completed run, so this record intentionally does not infer or fabricate counts.

No V8 expansion regression remained in the successful run. The previously documented inherited V7 regression debt remains outside this slice.

## Batch 03 — complete

All eight contracts are now `runtime_ready`:

1. Cannavaro — READS IT EARLY
2. Maradona — SLALOM RUN
3. Yashin — BLACK SPIDER
4. Cavani — GET ACROSS HIM
5. Lucy Bronze — OVERLAP
6. Alexia Putellas — THROUGH THE GAP
7. Pirlo — DIAGONAL SWITCH
8. Bergkamp — FIRST TOUCH

Do **not** keep tuning these eight merely because Batch 03 is complete. Reopen only for a demonstrated defect or explicit design change.

## CI protection

Batch 03 contract and runtime tests are part of the blocking Verify focused gate, alongside Batch 01/02 expansion tests. Future regressions in these Actions should fail CI rather than appear only in non-blocking full-suite visibility.

## Known telemetry polish note

For transformed normal-play Chances, Energy and the resolution receipt use the correct original paid Cost. The lower runtime's human-readable `tactical_played` event may still describe Cost from the transformed resolution context in a corner case such as Lloyd's free Long Shot.

This is telemetry/UI-copy polish, not a gameplay accounting defect. Do not reopen Batch 03 solely for it unless the event text is surfaced in player-facing UI or telemetry analysis requires exact paid-Cost text.

## Next direction

**Stop Batch 03 here.**

Next useful work is Batch 04 source audit from the remaining real-player Tracker pool:
1. choose another mixed-position group;
2. preserve strong on-pitch Action identities;
3. translate any remaining V7 dice/sector language into existing V8 primitives first;
4. add a new primitive only where repeated card needs justify it;
5. implement in small mixed-XI slices with blocking contract/runtime tests.
