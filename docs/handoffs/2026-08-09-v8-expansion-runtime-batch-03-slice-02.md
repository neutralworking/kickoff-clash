# V8 expansion runtime — Batch 03 slice 02

Date: 2026-08-09
Branch: `claude/generated-tactical-window-6dxfay`
Parent PR: #106 (draft, unmerged)

## Scope

This slice implements the second three-card Batch 03 runtime group:

- Lev Yashin — **BLACK SPIDER**
- Edinson Cavani — **GET ACROSS HIM**
- Lucy Bronze — **OVERLAP**

The live Card Design Tracker remains authoritative for Action identity/text. KC reconciliation supplies frozen lab stats/fake names where required.

No global Energy, +7 scoring band, Penalty value, Tactical base value or frozen package-balance input changed.

## BLACK SPIDER — accepted

> **The first opposing Chance played in ATT each period has −2 ATT, to a minimum of 0.**

Calibration card:
- Lev Yashin / Lev Yachon
- match name: Yachon
- GK / DEF
- Cost 4
- ATT 0
- DEF 11
- source card KC-055

BLACK SPIDER is deliberately distinct from Schmeichel / STARFISH. It does not cancel the Chance. It consumes the first opposing ATT Chance attempt each period and reduces a resolving Chance's ATT by up to 2, never below zero.

If the first ATT Chance is already cancelled by another effect, BLACK SPIDER's once-per-period trigger is still consumed but it does not manufacture negative ATT.

## GET ACROSS HIM — accepted

> **The first time each period a Cross played here would be cancelled, prevent that cancellation.**

Calibration card:
- Edinson Cavani / Edinson Cabana
- match name: Cabana
- CF / ATT
- Cost 4
- ATT 11
- DEF 1

The mechanic is a true cancellation interceptor, not blanket uncancellability.

Implementation:
1. resolve the Cross normally through the lower shared Chance pipeline;
2. if it would not be cancelled, Cavani does nothing and remains unused;
3. if it would be cancelled and an enabled Cavani is in the attacking zone, discard that attempted result;
4. replay once from the exact pre-resolution state with that Cross protected from cancellation;
5. consume Cavani's period counter and log GET ACROSS HIM.

Replaying from the pre-resolution state is important: Energy, FIRST TOUCH, specialist counters and other first-Chance effects are represented once in the accepted result rather than being double-spent by the failed cancellation branch.

## OVERLAP — accepted

> **Ongoing: While this is in MID and you have a friendly WF in ATT, this and your highest-ATT friendly WF in ATT have +2 ATT.**

Calibration card:
- Lucy Bronze / Lucy Brass
- match name: Brass
- RB / RWB, natural DEF / MID
- Cost 3
- ATT 4
- DEF 6
- source card KC-017

OVERLAP uses the existing dynamic ongoing rebuild rather than permanent snapshots.

While an enabled Bronze is physically in MID:
- identify the highest-current-ATT friendly WF/LW/RW physically in ATT;
- Bronze gets +2 ATT;
- that WF gets +2 ATT;
- clear/rebuild on board changes, so a stronger arriving WF takes the +2 and the old target loses it;
- no stacking from repeated refreshes.

## Shared Chance reaction layer

New wrapper:
`src/engine-v8/calibration-expansion-chance-reactions.ts`

The public calibration engine now routes direct play, committed Chances and Generated-Tactical Window Chances through the same reaction path.

Current high-level ordering:
1. existing Chance preparation/resolution (FIRST TOUCH, movement protection, ordinary specialists/cancellation, TIMED SLIDE);
2. GET ACROSS HIM cancellation interception;
3. BLACK SPIDER first-ATT-Chance suppression.

Utility-first Generated-Tactical Window ordering remains unchanged.

## Focused runtime proof

`calibration-expansion-batch-03-runtime.test.ts` verifies:

### BLACK SPIDER
- first opposing ATT Cross resolves for 0 ATT from base 2;
- second ATT Through Ball resolves normally for 2;
- first ATT Chance next period is suppressed again.

### GET ACROSS HIM
- Schmeichel would cancel the first Cross;
- Cavani prevents that cancellation and the accepted resolution is live/uncancellable;
- the test deliberately re-arms only Schmeichel's first-Chance counter in the same period;
- a second Cross is then cancelled, proving Cavani's once-per-period use remains consumed.

### OVERLAP
- Bronze in MID + Abedi in ATT gives both +2 ATT;
- Brian Laudrup later arrives as the stronger WF;
- Bronze keeps +2, Abedi loses the old +2, Laudrup receives +2;
- dynamic rebinding works without stacking.

## Verification

Accepted runtime/status head: `c09f07353452f9372871215db913acbc54ec8adf`
Verify: **#348**
Run: `31308527416`
Job: `93232615923`

The workflow completed successfully. Blocking focused tests, full Vitest regression visibility, TypeScript, changed-file lint, static build, Chromium install, V7 typed-chance browser checks and V8 match-lab browser checks all passed their gates. Full-suite visibility continues to retain only the previously documented inherited V7 failures; no Batch 03 V8 failure remained.

Exact test-count text was not exposed by the connector for this completed run, so this handoff intentionally does not infer or fabricate counts.

## Batch 03 status after slice 02

Runtime-ready:
1. Cannavaro — READS IT EARLY
2. Maradona — SLALOM RUN
3. Yashin — BLACK SPIDER
4. Cavani — GET ACROSS HIM
5. Lucy Bronze — OVERLAP
6. Bergkamp — FIRST TOUCH

Remaining transformation slice:
7. Alexia Putellas — THROUGH THE GAP
8. Andrea Pirlo — DIAGONAL SWITCH

## Next direction

Implement Alexia and Pirlo together as one coherent pre-resolution Tactical transformation stage.

Invariants:
- transformation happens before specialist/cancellation resolution;
- original Tactical instance ID, generated source, modifiers and metadata survive;
- original paid Cost survives a type transformation;
- Alexia evaluates the original played zone before Pirlo relocates the Chance;
- Pirlo's relocation/type transformation feeds the final zone/type into all downstream specialists and cancellation rules;
- commitment and Generated-Tactical Window paths use the same transformation stage.
