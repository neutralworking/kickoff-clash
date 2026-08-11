# V8 Generated-Tactical Window — implemented 2026-08-08

Branch: `claude/generated-tactical-window-6dxfay` (cut from `agent/v8-three-zone-prototype`)
PR #105 remains draft / unmerged. No source Costs, ATT/DEF or Action values were written back.

**Supersedes the timing contract in `2026-08-08-v8-generated-tactical-timing.md`.** That document's
"banked for the next commitment window" rule is no longer the behaviour; the parts it records about
movement-generated Tacticals and end-of-period generation still hold.

## What changed

A new phase runs in every period, after all reveals and on-reveal effects resolve and **before**
the scoring window:

```
commit → reveal (simultaneous) → on-reveal resolution
  → GENERATED-TACTICAL WINDOW          ← new
  → scoring window → Sinclair decay → period end
```

- **Eligibility** is a plain equality: a Tactical instance carries `metadata.enteredHandPeriod`, and
  only cards whose value equals the current period are window-eligible. Cards held from earlier
  periods are not — they re-enter play through a later commitment phase.
- **Cost** comes out of the side's remaining unused Energy, at printed cost unless a discount is live.
- **Commitment** is blind and simultaneous: both sides choose from the same post-reveal state, one
  pass, no responses.
- **Resolution** is simultaneous. Utility plays (Offside Trap, Trigger Press) from *both* sides apply
  before any Chance resolves, so a window Offside Trap cancels a window Through Ball regardless of the
  order the plays arrive in. Margins and goals are computed only after the whole window has resolved.
- **Carry-over**: an unplayed generated Tactical stays in hand at printed cost, playable in a later
  commitment phase.
- **P4 is live.** The window runs before P4 scoring, so P4 reveal generation is no longer dead.
  End-of-period generation in P4 still fizzles explicitly at FT — there is no later phase of any kind.

THREE LUNGS now works as printed. The calibration text override that read *"Add a Trigger Press to
your hand for next period. It costs 0"* has been removed; the card's own text — *"It costs 0 this
period"* — is once again accurate, and the discount expires with the period that granted it.

### Where the code lives

| File | Change |
| --- | --- |
| `tactical.ts` | `enteredHandPeriod` / `availableFromPeriod` typed onto the metadata bag |
| `calibration-runtime.ts` | `resolveGeneratedTacticalWindow`, `isWindowEligibleTactical`, `windowEligibleCalibrationTacticals`; `window` flag on resolutions; `window_tactical_played` event |
| `calibration-decay.ts` | reveal-generated cards are held for the commitment path only, not banked away from their own window; THREE LUNGS text override dropped |
| `calibration-telemetry.ts` | the four window fields + window-flagged chains |
| `calibration-matchup-matrix.ts` | `planV8CalibrationWindow` (the play-immediately CPU policy) wired into `simulateV8CalibrationMatch` |
| `V8CalibrationLab.tsx` | the window as a discrete UI phase with its own labelled recap step |

## Telemetry

Added per side/period and rolled up to the match, with every pre-existing field untouched so prior
matrix artifacts stay comparable: `windowTacticalsPlayed`, `windowEnergySpent`, `windowTacticalAtt`,
`windowCancellations`. Window-originated chains carry a `[window]` flag in the chain attribution.

## Before / after matrix

Identical fixed-seed matrix both sides: 6 × 6 squads × 32 seeds = **1,152 four-period matches**,
320 non-self samples per squad.

| Squad | Win | Draw | GF | GA | GD | Unused E | Tactical share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cross | 55% → **55%** | 9% → 12% | 8.39 → 8.86 | 7.60 → 7.85 | +0.79 → **+1.01** | 1.25 → **0.65** | 12% → **14%** |
| Through Ball | 53% → 52% | 12% → 11% | 6.98 → 7.08 | 6.24 → 6.50 | +0.74 → +0.58 | 1.60 → **1.44** | 5% → 6% |
| Dribbling / Penalty | 38% → **35%** | 9% → 12% | 6.23 → 6.25 | 6.87 → 7.14 | −0.63 → −0.89 | 2.32 → 2.24 | 1% → 1% |
| Control / Defence | 43% → **40%** | 17% → 15% | 3.05 → 3.05 | 2.98 → 3.13 | +0.07 → **−0.08** | 3.05 → 2.70 | 3% → 3% |
| Long Shot / Set Piece | 20% → **23%** | 16% → 17% | 3.05 → **3.47** | 4.68 → 4.81 | −1.63 → **−1.34** | 1.78 → 1.47 | 6% → **11%** |
| Balanced / Midrange | 54% → 55% | 11% → 14% | 6.43 → 6.68 | 5.76 → 5.95 | +0.67 → +0.73 | 1.77 → 1.55 | 2% → 3% |

Window activity per match (new columns, after only):

| Squad | Window plays | Window Energy | Window Tactical ATT |
| --- | ---: | ---: | ---: |
| Long Shot / Set Piece | 1.39 | 0.36 | **7.64** |
| Balanced / Midrange | 1.23 | 0.23 | 2.78 |
| Through Ball | 1.13 | **0.13** | 1.65 |
| Cross | 1.05 | 0.59 | 4.04 |
| Control / Defence | 0.38 | 0.38 | 0.00 |
| Dribbling / Penalty | 0.08 | 0.08 | 0.08 |

Matrix-wide: **2,023 window plays**, of which **1,106 are in P4** and **1,341 cost zero Energy**.

### Directional signals

All four expected signals verified, not tuned toward:

1. **Through Ball unused Energy drops** — 1.60 → 1.44.
2. **Cross Tactical ATT share rises** — 12% → 14%.
3. **Park's Trigger Press appears at 0 cost** — 1,341 zero-cost window plays matrix-wide; the direct
   engine check emits `HOME Post-reveal: Trigger Press (0, THREE LUNGS) → ATT.` and activates the
   press with 0 Energy available.
4. **P4 Tactical activations > 0 for generation squads** — P4 window plays per match: Balanced 0.75,
   Long Shot 0.61, Cross 0.57, Through Ball 0.52 (all were structurally 0 before).

⚠️ **The spec's quoted starting figures do not match this branch.** It expects Through Ball unused
Energy "from ~4.21" and Cross Tactical ATT share "from ~5.8%"; the committed head measures 1.60 and
12% respectively, matching the table in `2026-08-08-v8-calibration-matrix.md`. Those spec numbers come
from an earlier matrix run, so the signals above are verified as **directions against the actual
baseline** rather than against the quoted values.

## Balance observations (no numbers changed)

- **Long Shot / Set Piece is the big mover.** `THUNDERBALL → Long Shot → HALFWAY HIT` fires 250×
  (all window-originated) against 155× before, and the package's Tactical ATT share nearly doubles.
  Charlton's Long Shot no longer idles a period before Lloyd can amplify it. It is still the weakest
  package at 23%, so it remains the next real balance target — but from a healthier floor.
- **Control / Defence slips below even** (43% → 40%, GD +0.07 → −0.08). It generates almost nothing
  itself (0.38 window plays, worth 0 ATT), while every opponent now converts generation a period
  sooner. Worth watching: the window is a straight nerf to packages that don't generate.
- **Ramos's 93RD MINUTE payoff shrank**, from `+5` to `+3` in observed chains. Eriksen's Corner now
  resolves in the P3 window instead of being banked into P4, where Ramos's late bonus is larger. This
  is a genuine rules consequence of the window, not a defect — but it is a real change to the set-piece
  package's intended late spike and should be considered when that package is tuned.
- **The planner's play-immediately bias is visible and deliberate.** Control / Defence spends 0.38
  Energy on window plays worth 0 ATT — Trigger Press dropped into an empty ATT zone. Deliberate
  hold/sequencing intelligence is planner Step 3, explicitly out of scope here.

## Tests

`src/engine-v8/__tests__/generated-tactical-window.test.ts` — the ten required deterministic tests:
P1 generation, P4 generation, the THREE LUNGS contract, discount expiry, the hold path, insufficient
Energy, simultaneous resolution (asserted in both processing orders), the same-period Di María chain,
the Pn/Pn+1 eligibility boundary, and the labelled recap step.

Two pre-existing tests were updated to the new contract rather than deleted:

- integration **H** now asserts Park's press is free in its own window and printed cost when held;
- the P4 test now asserts reveal generation is **live through the window** while end-of-period
  generation still fizzles at FT.

A browser test was added to `tests/v8-match-lab.spec.ts` covering the window UI phase and its recap
line at 390×844.

## Verification

| Gate | Result |
| --- | --- |
| V8 Vitest (15 files, 97 tests) | pass |
| Full Vitest suite | 481 pass — 2 pre-existing failures, unrelated (see below) |
| TypeScript | clean |
| Lint | identical to baseline; no findings in any touched file |
| Static export build | pass |
| V8 mobile suite (390×844) | 7 pass |
| V7 browser regression | 4 pass |
| 1,152-match matrix + period artifacts | emitted |

**Two full-suite failures are pre-existing on `agent/v8-three-zone-prototype` and were confirmed
failing on the clean baseline before any change here:** `src/game-v7/__tests__/isolation.test.ts`
(`PlayerDossier.tsx` imports `@/game-v7`, breaking the V7 isolation rule) and
`src/game-v7/__tests__/live-integration.test.ts` (a live formation has no `cm` slot). Neither touches
V8. They are flagged, not fixed — out of scope for this spec.

One note for whoever runs the browser suites next: the pre-installed Chromium in this environment is
`chromium-1194` while `@playwright/test` expects `1217`, so the suites need
`PW_CHROMIUM=/opt/pw-browsers/chromium`. The dev server also needs `NEXT_PUBLIC_BASE_PATH=""`, since
`next.config.ts` otherwise serves the lab under `/kickoff-clash` and Playwright's `baseURL` 404s.

## What to do next

1. Re-run package-level balance on **Long Shot / Set Piece** with the window live — its numbers moved
   enough that the pre-window conclusion is stale.
2. Decide whether Ramos's late-Corner spike should be protected from the window (e.g. a hold policy,
   or moving the bonus off the period boundary).
3. Planner Step 3: real hold/sequencing intelligence, which will change the window's value for every
   package that currently dumps Tacticals into empty zones.
