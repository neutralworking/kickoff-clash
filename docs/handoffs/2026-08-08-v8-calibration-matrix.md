# Kickoff Clash V8 — Calibration Matchup Matrix

Date: 2026-08-08  
Branch: `agent/v8-three-zone-prototype`  
PR: #105 (keep draft / unmerged)

## Purpose

Run the six V8 calibration squads against each other before changing scoring, Energy, Costs or individual Action/Tactical values.

This is a structural calibration pass, not a balance patch.

## Method

The matrix uses the same deliberately simple deterministic calibration planner on both sides.

- 6 calibration squads
- 32 fixed seeded draws
- every ordered matchup, including both home/away orientations
- 6 × 6 × 32 = **1,152 four-period matches**
- self-matchups are excluded from squad ranking summaries
- each squad therefore has 320 non-self samples
- each unordered pairing has 64 samples across both orientations
- current 2 / 4 / 6 / 8 Energy curve
- current lab-only player Cost compression (source Cost −1, minimum 1)
- current +5 ATT-over-DEF scoring
- current Actions, Tacticals, persistence, OOP and decay rules
- no balance values changed

The run also records period-by-period ATT, DEF, goals, attacking margin, unused Energy, deployed players, Tactical use and Action deltas.

## Important CI correction

During this work we found that `vitest.config.ts` did not include `src/engine-v8/__tests__`, so previous focused commands naming V8 files were silently not executing those files.

The config now explicitly includes V8 tests. Once they genuinely ran, two stale interaction fixtures were exposed and corrected without changing runtime rules:

1. Gentile test: Wambach and Hegerberg are both 11 ATT, so the fixture now makes the deployed-order tiebreak explicit before testing dynamic retargeting.
2. Valderrama test: Shevchenko is established in ATT before PAUSE AND SLIP reveals, matching the literal requirement for the generated Through Ball to receive +2 ATT.

The real focused V8 gate is now green.

## Overall results

| Squad | Win | Draw | GF | GA | GD | Unused Energy | Players deployed | Tacticals / match | Tactical ATT share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Control / Defence | **80.3%** | 7.5% | **9.43** | 5.90 | **+3.53** | 2.36 | **7.92** | 0.88 | 2.8% |
| Balanced / Midrange | 58.8% | 10.3% | 8.83 | 7.45 | +1.38 | 2.53 | 7.25 | 1.72 | 4.6% |
| Dribbling / Penalty | 51.6% | 8.4% | 7.48 | 6.44 | +1.04 | 3.78 | 7.41 | **0.00** | **0.0%** |
| Long Shot / Set Piece | 39.4% | 10.0% | 4.71 | 5.16 | −0.45 | 2.77 | 7.78 | 0.95 | 0.8% |
| Cross | 37.5% | 6.9% | 7.68 | 8.61 | −0.93 | 2.36 | 7.11 | **2.31** | **5.8%** |
| Through Ball | **9.4%** | 3.1% | 4.81 | **9.38** | **−4.57** | **4.21** | **6.30** | 0.90 | 1.1% |

Across the six non-self summaries, average scoring is about **14.31 combined goals per match**. This run does not attempt to tune that baseline yet.

## Pairing extremes

### Control / Defence is clearly dominant

- 90.6% wins vs Cross; +3.95 GD
- 95.3% wins vs Through Ball; +6.91 GD
- 68.8% wins vs Dribbling / Penalty; +2.19 GD
- 75.0% wins vs Long Shot / Set Piece; +2.31 GD
- 71.9% wins vs Balanced / Midrange; +2.30 GD

This is not being driven by Tactical output: only 2.8% of its measured ATT is Tactical ATT.

### Through Ball is structurally non-competitive in this harness

Its only relatively better matchup is still a heavy loss to Cross:

- 10.9% wins vs Cross
- 14.1% vs Dribbling / Penalty
- 4.7% vs Control / Defence
- 10.9% vs Long Shot / Set Piece
- 6.3% vs Balanced / Midrange

The strongest immediate signal is economy/deployment: it leaves 4.21 Energy unused per match and deploys only 6.30 players on average.

### Dribbling / Penalty is winning without its named payoff

It has a 51.6% overall win rate and +1.04 GD while playing **zero Penalty Tacticals** in all 320 non-self appearances.

Therefore this result cannot be used as evidence that the Penalty package is well balanced. It is primarily measuring a high-ATT persistent player package plus its defensive/control support.

### Cross is the only specialist Tactical package firing regularly

Cross averages 2.31 Tacticals per match and has the highest Tactical ATT share at 5.8%.

Observed chains include:

- `BEND IT → Cross → DIVING HEADER +4 = +8 ATT`
- `RABONA → Cross → DIVING HEADER +4 = +6 ATT`
- Cross cancellations against defensive packages

It crushes Through Ball (84.4% wins) but is slightly behind Long Shot / Set Piece and substantially behind Dribbling, Balanced and Control.

## Period development

### Control / Defence

| Period | GF | GA | ATT | DEF | New players | Unused E |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | 0.63 | 0.68 | 7.38 | 3.08 | 1.00 | 0.56 |
| P2 | **2.67** | 1.86 | 24.78 | 6.36 | 1.91 | **0.20** |
| P3 | **3.52** | 2.37 | 36.88 | 16.82 | 2.22 | 1.00 |
| P4 | 2.62 | **0.99** | 42.83 | **36.32** | **2.80** | 0.59 |

The defining late-match effect is the defensive lock: P4 DEF reaches 36.3 and goals conceded fall below one despite the opposing persistent boards being at their largest.

### Through Ball

| Period | GF | GA | ATT | DEF | New players | Unused E |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | 0.24 | 0.50 | 4.61 | 4.38 | 0.92 | 0.61 |
| P2 | 0.71 | 1.68 | 12.91 | 9.56 | 1.31 | **1.13** |
| P3 | 1.67 | **3.57** | 28.12 | 12.48 | 1.66 | **1.22** |
| P4 | 2.19 | **3.64** | 43.51 | 21.95 | 2.41 | **1.26** |

It catches up in raw ATT only after the opponent has accumulated enough DEF/offence to keep it behind. This is consistent with an expensive/awkward deployment curve rather than simply a weak Through Ball modifier.

### Dribbling / Penalty

| Period | GF | GA | ATT | DEF | New players | Tacticals |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P1 | 0.64 | 0.39 | 7.44 | 4.69 | 1.19 | 0 |
| P2 | 0.91 | 1.25 | 14.17 | 12.11 | 1.53 | 0 |
| P3 | 2.42 | 2.37 | 30.14 | 17.84 | 2.08 | 0 |
| P4 | **3.51** | 2.44 | **48.33** | 26.34 | 2.61 | **0** |

The late surge is raw persistent ATT, not Penalty conversion. This squad needs to be made into an actual mechanic test before any Penalty balance conclusion is valid.

### Long Shot / Set Piece

It develops a very strong defensive board (34.70 DEF in P4) but only 31.26 ATT; its P4 scoring falls to 0.76 goals while Tactical ATT remains small. The current squad behaves more like a defensive MID/DEF shell with occasional set pieces than a sustained specialist scoring package.

### Balanced / Midrange

Balanced is the most useful current benchmark: strong early/midgame, reasonable deployment efficiency and no single specialist package dominating its measured output. It still loses clearly to Control, which makes Control the main outlier rather than Balanced looking obviously weak.

## What the matrix says — and does not say

### Strong evidence

1. **Deployment efficiency matters enormously.** Across only six squads, win rate tracks deployed-player count much more closely than Tactical volume.
2. **Control / Defence is an outlier.** It combines efficient deployment, persistent defensive scaling and enough direct ATT to win rather than merely stall.
3. **Through Ball is being starved before its combo can matter.** High unused Energy and low deployment are more urgent than its +ATT values.
4. **The Dribbling / Penalty squad is not currently testing Penalties.** Its respectable result is misleading if read as mechanic balance.
5. **Specialist Tacticals are a minority of total ATT.** Even Cross, the most active package, gets only 5.8% of measured ATT from Tacticals in this harness.
6. **Persistent boards create very different late-game shapes.** Dribbling becomes an ATT avalanche; Control becomes a DEF lock; Long Shot becomes DEF-heavy; Through Ball arrives late.

### Harness / timing limitations

These results are evidence about the current V8 lab, but not optimal-play balance.

1. The planner is intentionally simple and does not search future turns or combos.
2. It does not move Cafu or Beckenbauer, so PENDOLINO and DER KAISER are underrepresented.
3. It plays available Tacticals before players. This means it will not deliberately hold an existing Cross for RABONA's modify-existing branch.
4. Player On Reveal effects resolve at END PERIOD after commitments. Newly generated Tacticals therefore cannot be committed until the following period.
5. That reveal timing makes Park's current text — `Add a Trigger Press to your hand. It costs 0 this period.` — internally ineffective in the current lab flow: the card is generated at the end-of-period reveal and the free period expires before the next commitment window.
6. Late P4-generated Tacticals have no later period in which to be played.

The Park timing problem is a rules/text consistency issue, not a numerical balance conclusion.

## Recommendation before any balance-number pass

Do **not** change scoring, Energy, Costs or Action/Tactical values from this matrix yet.

The next calibration pass should first make the six test archetypes genuinely comparable:

1. resolve the generated-Tactical timing contract, especially Park's impossible same-period discount;
2. make the calibration planner exercise essential movement/hold decisions that are part of an archetype's identity, without turning it into an optimal AI;
3. revise the six calibration XI compositions so their effective Cost curves are closer and each named mechanic actually activates at a useful rate;
4. rerun the same fixed-seed matrix;
5. only then use residual matchup gaps to tune gameplay numbers.

## Verification / evidence

The matrix and period reports are generated deterministically in Vitest and uploaded from CI as the `v8-calibration-matrix` artifact:

- `v8-calibration-matrix.json`
- `v8-calibration-matrix.txt`
- `v8-calibration-periods.json`
- `v8-calibration-periods.txt`

The V8 test directory is now included in the canonical Vitest configuration, preventing the previous false-green omission.
