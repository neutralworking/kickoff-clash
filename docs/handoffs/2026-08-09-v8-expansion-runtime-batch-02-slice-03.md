# V8 expansion runtime — Batch 02 slice 03

Date: 2026-08-09
Branch: `claude/generated-tactical-window-6dxfay`
Parent PR: #106 (draft, unmerged)

## Scope

This slice finishes the rules-layer primitive needed by Johan Cruyff's **TOTAL FOOTBALL**, hardens the expansion regression gate, and fixes one real BERBA SPIN suppression-ordering defect found while validating the new rules layer.

No global Energy, Tactical base value, Penalty value, scoring-band, compact-core package or source Tracker value was changed.

## TOTAL FOOTBALL — accepted

**Johan Cruyff — TOTAL FOOTBALL**

> Ongoing: Your players ignore out-of-position penalties while this Action is active.

Calibration identity/stats:
- Tracker row: 140
- Match/full fake name: Johan Kroyf
- Position: CF / AM
- natural zones: MID / ATT
- Cost: 3
- ATT: 10
- DEF: 1
- stat/cost source: `kc_player_roster_reconciliation_view`
- Action/name/text source: audited Card Design Tracker contract

The reconciliation view's older rules text is not used for V8 behavior. Reconciliation supplies frozen lab stats only; the Tracker/audit remains authoritative for the Action.

## Rules-layer implementation

OOP is now resolved through a single calibration contribution seam in `calibration-runtime-base.ts`:

- `calibrationContributionRules(state, side)`
- `calibrationEffectiveOutOfPositionPenalty(state, player)`
- `calibrationEffectiveStats(state, player)`

`calibrationZoneTotals()` consumes this effective-stat resolver, so team totals, zone winners and period scoring all see the same positional-rule context.

TOTAL FOOTBALL sets the friendly contribution rule `ignoreOutOfPositionPenalty` while Cruyff is deployed and his Action is enabled.

### Deliberate non-effects

TOTAL FOOTBALL does **not** create ATT/DEF modifiers. Therefore it does not:
- change `currentCalibrationAttack()` / `currentCalibrationDefence()`;
- manufacture ATT-gain events;
- alter Ashley Cole / Gentile target ranking through hidden stats;
- pollute modifier telemetry;
- stack a compensating +2/+5 bonus onto OOP players.

It changes only their effective zone contribution.

If Cruyff is suppressed, the ordinary 0 / -2 / -5 OOP rule returns immediately.

## Regression coverage

Focused tests verify:
1. normal OOP penalties exist before Cruyff;
2. with TOTAL FOOTBALL active, representative DEF/MID/ATT misplacements contribute with zero OOP penalty;
3. raw player ATT/DEF remains unchanged and no TOTAL FOOTBALL modifier is created;
4. MAN MARKER suppressing Cruyff immediately restores OOP penalties;
5. expansion reactions/targeting continue to operate on real stat modifiers rather than contribution-rule changes.

## BERBA SPIN defect found and fixed

While promoting expansion regressions into the blocking gate, the MAN MARKER path exposed a real ordering bug.

Previously Gentile wrote `suppressedActions[target]` before BERBA SPIN's interception hook ran. BERBA SPIN then observed itself as disabled and could not intercept the exact defender Action it was meant to ignore.

Accepted fix:
- the suppression currently being intercepted may reach BERBA SPIN;
- a *different already-active suppressor* still prevents BERBA SPIN;
- after interception, MAN MARKER suppression is removed and targeting is rebuilt from the moved board.

Both BERBA SPIN regressions now pass:
- interception of SHOW HIM OUTSIDE;
- interception of MAN MARKER as the first defender Action of the period.

## Test-fixture corrections

Three failures found in non-blocking full-suite visibility were stale/incorrect tests rather than engine defects:

- Kanté / EVERYWHERE now correctly expects resolved `multi_zone_presence` semantics with `stats_required` status.
- STEP IN no longer uses Seedorf as its reduction target because RIDE THE TACKLE intentionally prevents stat reductions.
- READ THE RUN's Ashley-retarget regression now uses Litmanen (9 ATT) followed by Wambach (11 ATT), proving that removal of Ashley's old -5 does not masquerade as a positive ATT modifier.

## CI hardening

Expansion regressions were previously absent from the blocking focused gate and could fail only inside the `continue-on-error` full-suite visibility step.

The Verify workflow now blocks on:
- `calibration-expansion-batch-01.test.ts`
- `calibration-expansion-runtime.test.ts`
- `calibration-expansion-batch-02-runtime.test.ts`

This raises the focused gate to **24 files / 169 tests** and prevents future expansion regressions from being hidden by the visibility-only suite.

## Verification — gameplay head

Gameplay head: `61f70084be4b70da37dfe9fc4f4f4335ced9aa27`
Verify run: `31306972700`
Job: `93228773192`
Calibration artifact: `9036252549`

Results:
- focused gate: **24 files / 169 tests passed**
- full Vitest visibility: **536 passed / 2 failed / 4 todo** across 67 files
- all V8 tests passed
- inherited unrelated V7 failures only:
  1. `src/game-v7/__tests__/isolation.test.ts` — `PlayerDossier.tsx` imports `@/game-v7`
  2. `src/game-v7/__tests__/live-integration.test.ts` — expected live `cm` sector `centre`, received `undefined`
- TypeScript: passed
- changed-file lint: passed
- full lint visibility: inherited repo debt only, **10 errors / 4 warnings**
- static Next export: passed
- Chromium install: passed
- V7 typed-chance browser: **4/4 passed**
- V8 match-lab browser: **7/7 passed**
- workflow conclusion: success

The six-XI +7 scoring matrix remains unchanged by this slice. TOTAL FOOTBALL is not present in those frozen reference XIs.

## Batch 02 status after this slice

Runtime-ready:
1. Tymoshchuk — STEP IN
2. Bobby Moore — READ THE RUN
3. Andy Robertson — RECOVERY RUN
4. Nesta — TIMED SLIDE
5. Brian Laudrup — GLIDING RUN
6. Davids — PITBULL
7. Cruyff — TOTAL FOOTBALL

Blocked on source data:
8. Özil — INVISIBLE — `stats_required`

Do not invent Özil's values. Either reconcile real KC stats or leave the card outside the playable calibration registry.

## Next direction

Do not reopen TOTAL FOOTBALL as a stat buff. The reusable rules-layer contribution seam is now the accepted implementation pattern for future positional-rule Actions.

Next useful work is either:
- reconcile Özil's source stats and finish Batch 02; or
- move to the next audited player batch, reusing the now-proven primitive vocabulary before adding another engine primitive.
