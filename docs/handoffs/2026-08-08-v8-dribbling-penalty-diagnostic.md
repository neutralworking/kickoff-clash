# V8 Dribbling / Penalty diagnostic — 2026-08-08

Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base `agent/v8-three-zone-prototype`)  
Status: **diagnostic complete; no Dribbling / Penalty gameplay change accepted**

## Baseline

Fixed calibration matrix: 32 seeds across every ordered 6×6 matchup (1,152 matches; 320 non-mirror matches per squad summary).

Dribbling / Penalty baseline:

- win rate: **33%**
- draw rate: **11%**
- GF: **6.25**
- GA: **7.36**
- GD: **−1.11**
- Tactical ATT share: ~**1%**
- defining specialist chain: **27×** `RAINBOW FLICK → Penalty → CHIPPED PENALTY +3 = +8 ATT`

Reference period development:

| Period | ATT | DEF | GF | GA |
| --- | ---: | ---: | ---: | ---: |
| P1 | 5.77 | 3.63 | 0.13 | 0.21 |
| P2 | 17.74 | 5.09 | 1.03 | 1.34 |
| P3 | 35.08 | 8.03 | 2.44 | 2.99 |
| P4 | 47.14 | 24.26 | 2.65 | 2.82 |

P3 ATT is already essentially level with Through Ball (35.38) and above Balanced (33.27), so the package is not simply failing to build an attacking board.

## Settled calibration-planner correction

Keep one narrow reactive sequencing rule:

- if a reducer (`Duff`, otherwise `Garrincha`) and `Neymar` are **already in hand and affordable this period**, order reducer → Neymar;
- if `Panenka + reducer + Neymar` all fit, order Panenka → reducer → Neymar;
- otherwise play normally.

No future-period hoarding is allowed. The full fixed-seed matrix is bit-for-bit identical to baseline after this correction, including the same 27 specialist Penalty chains. The rule remains because it encodes the obvious same-period football sequence without granting look-ahead.

## Rejected hypotheses

### 1. Future-hoard the combo

Preserving Duff/Neymar until a later period nearly doubled Penalty chains (~49) but:

- win rate stayed ~33%;
- GF fell to ~4.40;
- board development suffered because playable cards were withheld.

**Reject.**

### 2. Six-attacker Dribbling XI

Adding all of Duff, Garrincha, Okocha, Neymar, Ronaldo and Panenka made Penalty activation easier, but defensive structure collapsed.

With coherent sequencing the deck fell to roughly **24% wins** and **9.47 GA**.

**Reject.**

### 3. Compact Okocha package with future pair preservation

A five-card attacking package with Okocha and a retained defensive spine reached roughly **31% wins**. Defence was healthier, but future combo preservation still taxed deployment.

**Reject as a solution to the baseline issue.**

### 4. FLIP FLAP threshold −3 → −2

Ronaldo was tested as a one-dribble Penalty generator while keeping Penalty at +5.

Result: roughly **16% wins** despite producing the intended Ronaldo/Panenka +10 chain.

**Strong reject. Keep FLIP FLAP at the accepted −3 prerequisite.**

### 5. STEPOVER generates a Penalty from its own successful −2

Two isolated sensitivities were tested without accepting the runtime change.

**Okocha added in place of Beckenbauer:**
- 33% wins
- 5.51 GF / 6.65 GA / −1.14 GD
- 31 direct STEPOVER generations
- no meaningful improvement over baseline; defensive structure weakened.

**Okocha replaces Neymar at equal effective Cost, same package size / same defensive spine:**
- **25% wins**
- 4.57 GF / 6.21 GA / −1.65 GD
- 59 direct STEPOVER generations
- only 21 Penalties actually resolved.

**Reject. Creating more Penalty cards does not fix the matchup profile.**

### 6. RAINBOW FLICK Penalty is free in its generation window

Original XI and original prerequisite were retained. Only Neymar-generated Penalties were marked `freeThroughPeriod = current period`, so they cost 0 in the immediate Generated-Tactical Window and revert to printed Cost 1 if held.

Result:
- **32% wins**
- 13% draws
- 6.28 GF / 7.43 GA / −1.14 GD
- 40 RAINBOW FLICK Penalties marked free
- 40 Penalties resolved in the window
- 27 enhanced (≥8 ATT) resolutions

Pairing win rates:
- vs Cross: 25%
- vs Through Ball: 36%
- vs Control: 34%
- vs Set Piece: 45%
- vs Balanced: 19%

**Reject. Penalty timing / Energy tax is not the main weakness.**

## Conclusion

Do **not** currently change:

- Penalty base ATT (+5)
- Penalty printed Cost (1)
- FLIP FLAP threshold (−3)
- player ATT/DEF or Costs
- global Energy / scoring
- Dribbling XI structure

The evidence says Dribbling / Penalty is **weak but functioning**, and repeated attempts to increase Penalty availability do not improve its win rate. Further Chance tuning would be calibration overfitting.

Freeze the package at the accepted baseline for now. Revisit only after a broader card pool / more representative deck construction or a materially stronger production opponent exists. If it remains an outlier there, inspect overall persistent board value and repeatable Action value before touching Penalty payoff again.
