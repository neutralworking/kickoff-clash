# Kickoff Clash V8 — Calibration Baseline

Date: 2026-08-08  
Branch: `agent/v8-three-zone-prototype`  
PR: #105 — keep draft / unmerged

## Outcome

The calibration harness is now stable enough to stop tuning the six test XIs and begin balancing actual gameplay packages.

The pass resolved three structural problems before changing card numbers:

1. generated-Tactical timing;
2. deterministic planner coverage of important Actions;
3. mismatched calibration-XI curves and placements.

After those were corrected, scoring was tested independently on identical resolved boards. The first actual balance change is now live in V8: **one repeat goal for every complete +7 ATT over opposing DEF**, up from +5.

No source player Costs, ATT/DEF values or Action/Tactical values were written back during this pass.

## Current V8 rules relevant to calibration

- four periods: 0–22, 22–HT, HT–66, 66–FT;
- Energy: 2 / 4 / 6 / 8;
- persistent three-zone board: DEF / MID / ATT;
- four player slots per side per zone;
- OOP penalties: 0 / −2 / −5 ATT+DEF;
- **goal band: +7 ATT over DEF per repeat goal**;
- one commitment window per period;
- On Reveal/end-of-period generated Tacticals are banked for the next commitment window;
- movement-generated Tacticals can still be used immediately during commitment;
- P4 reveal/end generation fizzles explicitly at FT because no commitment window remains;
- THREE LUNGS now generates a Trigger Press that is free in the next period, when it can actually be played;
- Sinclair decay remains +4 → +3 → +2 → +1 after scoring windows.

## Calibration harness

The matrix runs 32 deterministic seeds over every ordered 6×6 squad matchup:

**6 × 6 × 32 = 1,152 four-period matches.**

Self-matches are excluded from the squad ranking summaries, leaving 320 non-self samples per squad.

The planner remains deliberately lightweight rather than optimal. It now exercises only the decisions required to make the named mechanic test valid:

- Cafu moves forward so PENDOLINO actually generates Crosses;
- Beckenbauer exercises DER KAISER where it does not disrupt a deliberately staged archetype;
- one Cross can be held for RABONA;
- Through Ball establishes a runner before creator/payoff play;
- Penalty cards/enablers are staged in ATT, accepting normal OOP penalties;
- Ramos remains back until P3, then goes to ATT for the late Corner payoff;
- Long Shot / Corner can be held briefly for their obvious specialist.

These are calibration policies, not production match AI.

## Final +7 matrix

| Squad | Win | Draw | GF | GA | GD | Unused E | Players | Tactical ATT share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Balanced / Midrange | **54%** | 11% | 6.43 | 5.76 | +0.67 | 1.77 | **7.98** | 2% |
| Cross | **55%** | 9% | **8.39** | 7.60 | +0.79 | **1.25** | 6.58 | **12%** |
| Through Ball | **53%** | 12% | 6.98 | 6.24 | +0.74 | 1.60 | 7.07 | 5% |
| Control / Defence | 43% | **17%** | 3.05 | **2.98** | +0.07 | 3.05 | 7.58 | 3% |
| Dribbling / Penalty | 38% | 9% | 6.23 | 6.87 | −0.63 | 2.32 | 7.87 | 1% |
| Long Shot / Set Piece | **20%** | 16% | 3.05 | 4.68 | **−1.63** | 1.78 | 7.69 | 6% |

The reference group is now credible enough for calibration:

- Cross, Through Ball and Balanced all sit in the low/mid-50s;
- Control is competitive but draw-heavy rather than an 80%+ defensive/attacking super-deck;
- Dribbling / Penalty is weak but its Penalty mechanic now genuinely fires;
- Long Shot / Set Piece is the remaining clear package-level outlier.

## Mechanic activation now observed

The final matrix contains real examples of the intended specialist interactions rather than proxy results from raw stats alone.

### Cross

Frequent chains include:

- `PENDOLINO → Cross → DIVING HEADER +4 = +6 ATT`
- `LEFT-FOOT WHIP → Cross → DIVING HEADER +4 = +6 ATT`
- RABONA-modified Crosses

Cross has the highest Tactical ATT share at about 12%.

### Through Ball

Observed chains include:

- `PAUSE AND SLIP → Through Ball → CURVED RUN +1 = +5 ATT`
- `PAUSE AND SLIP → Through Ball → RUNS IN BEHIND +4 = +8 ATT`
- KILLER PASS-generated Through Balls

The original 9.4% win-rate result was largely a timing/curve/harness artefact; the package is now around 53%.

### Dribbling / Penalty

The package now genuinely produces the intended payoff:

- **24×** `RAINBOW FLICK → Penalty → CHIPPED PENALTY +3 = +8 ATT`

That activation rate is still low, but it is no longer zero. Its 38% win rate is therefore a real package-balance signal rather than simply a broken harness.

### Long Shot / Set Piece

The named mechanics are firing:

- **155×** `THUNDERBALL → Long Shot → HALFWAY HIT +4 = +7 ATT`
- **22×** `WHIPPED DELIVERY → Corner → 93RD MINUTE +5 = +9 ATT`

Despite that, the squad wins only 20% of non-self matches. This is now the clearest next **actual gameplay-package balance target**.

## Scoring decision

The high-score problem was tested by re-scoring the same 960 non-mirror resolved boards under several policies, so reveal order, card draws and board construction stayed identical.

| Scoring | Avg total | Median | P90 | 18+ goals | Draw rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| repeat +5 | 17.35 | 16 | 29 | 46% | 9% |
| repeat +6 | 13.88 | 13 | 24 | 33% | 13% |
| **repeat +7** | **11.38** | **11** | **20** | **19%** | **13%** |
| repeat +8 | 9.59 | 9 | 17 | 8% | 16% |
| +5, max 3/period | 12.76 | 13 | 19 | 18% | 17% |
| bank each +5 threshold once | 8.49 | 8 | 14 | 2% | 22% |

The +7 option was chosen because it preserves the simple repeat-margin rule and keeps explosive scorelines in the game without making them routine.

A 10–8-type match remains a high-scoring result rather than being designed out: about 19% of non-mirror matches still reach 18+ combined goals on these calibration boards.

Raising the threshold did **not** solve package imbalance by itself; squad rankings were broadly stable across +5/+6/+7/+8. That is useful evidence that scoring temperature and archetype strength are separate problems.

## Period shape under +7

Late-game boards are still deliberately large and consequential:

- Cross P4: 58.95 ATT, 3.89 GF;
- Through Ball P4: 55.26 ATT, 3.53 GF;
- Balanced P4: 49.33 ATT, 3.02 GF;
- Control P4: 38.49 DEF, 0.50 GF / 1.15 GA;
- Set Piece P4: 33.66 ATT / 29.67 DEF, 1.04 GF.

The +7 band reduces scoreboard multiplication without flattening those distinct board identities.

## Verification

The current gameplay head passes:

- focused V8 + V7 acceptance tests;
- full Vitest suite with V8 actually included;
- 1,152-match matrix artifact;
- period-development artifact;
- scoring-sensitivity artifact;
- TypeScript;
- changed-file lint;
- full lint;
- static export;
- V7 mobile browser regression;
- V8 390×844 browser suite.

## What to do next

Freeze the calibration squad/planner work unless a genuine harness defect appears.

Next balance work should be on **Long Shot / Set Piece as a real package**, using the current +7 scoring baseline. Inspect whether the problem is the Tactical values, the cost/payoff of Charlton/Lloyd/Eriksen/Ramos, or the amount of board ATT sacrificed to assemble the package.

Dribbling / Penalty is the secondary package to revisit after Set Piece.

Do not reopen global scoring, Energy or blanket Cost changes unless package-level tuning fails to produce a healthier matrix.
