# V8 broad deck validation — 2026-08-08

## Purpose

The six curated V8 calibration XIs were useful for mechanics calibration, but they could not tell us whether a package was genuinely robust or merely tuned to one hand-built list. This pass deliberately freezes gameplay values and broadens only deck construction.

No Cost, ATT/DEF, Tactical value, Energy, scoring or Action text is changed by this slice.

## Cohort

The harness builds 54 deterministic 11-player XIs from the current 30-card calibration pool:

- six archetype families
- one existing curated XI per family
- eight nearby variants per family
- each generated variant swaps 2–4 cards
- Schmeichel remains in every XI
- a small family-defining core is retained
- effective Cost stays within ±2 of the family base XI
- generated variants retain basic DEF / MID / ATT natural-zone coverage
- all 11 cards are unique

The six families are Cross, Through Ball, Dribbling / Penalty, Control / Defence, Long Shot / Set Piece and Balanced / Midrange.

Each candidate deck keeps its family's existing lightweight calibration play profile. This is intentional: the test asks whether a strategy remains viable when deck construction changes, not whether a generic production AI can infer arbitrary deck intent.

## Match panel

Each of the 54 candidate decks plays:

- each of the six curated reference XIs
- home and away
- eight fixed deterministic seeds

That is 96 matches per candidate deck and **5,184 four-period matches total**.

This panel is a robustness test, not a replacement for the existing 32-seed 1,152-match six-XI matrix. Baseline percentages differ because the opponent set and seed count differ.

## Family robustness

| Family | Median win rate | Range | Broad-panel base | Competitive (>=40%) | Strong (>=50%) | Median GD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cross | **52%** | **30–94%** | 52% | **7/9** | **5/9** | **+0.542** |
| Through Ball | 42% | 30–66% | 43% | 5/9 | 1/9 | -0.042 |
| Dribbling / Penalty | **17%** | **2–32%** | 25% | **0/9** | 0/9 | **-2.031** |
| Control / Defence | 42% | 12–57% | 42% | 5/9 | 1/9 | -0.302 |
| Long Shot / Set Piece | **49%** | **17–71%** | 49% | **5/9** | 3/9 | **+0.448** |
| Balanced / Midrange | **54%** | 35–71% | 43% | **8/9** | **5/9** | **+0.760** |

## Main conclusions

### 1. Set Piece survives deck variation

Long Shot / Set Piece no longer looks like a package calibrated only to its exact reference XI. Five of nine decks are competitive and three clear 50%. The accepted Long Shot +2 and late Ramos ATT behavior should remain frozen for now.

### 2. Balanced is robust

Balanced / Midrange has the strongest overall robustness: eight of nine variants are competitive. This is positive evidence that V8 supports decks built from several independent good cards rather than requiring every XI to be a narrow combo list.

### 3. Through Ball and Control are viable but sensitive

Both have a 42% median and five competitive variants. Their floors are low, so construction matters, but neither currently warrants another direct balance pass.

### 4. Dribbling / Penalty is a genuine structural weakness

The earlier six-XI result could still have been an artifact of one bad list. This broader panel removes that explanation:

- median win rate: **17%**
- best variant: only **32%**
- **0/9** variants reach the 40% competitive threshold
- median GD: **-2.031**

This now justifies revisiting the package. However, previous controlled sensitivities already rejected simple Penalty-frequency, same-window-free-Penalty and FLIP FLAP-threshold buffs. The next redesign should reduce **dependency density / deck-slot tax** or give the dribblers more independent persistent value when the full Penalty chain is absent.

### 5. Cross may be too portable as a compact package

Cross is robust in a different and potentially unhealthy way. Its best variant reaches **94% wins / +4.333 GD**.

The strongest variant keeps:

- Beckham
- Wambach
- Džajić
- Di María
- Schmeichel
- Gentile
- Seedorf

and swaps out Cafu, Hegerberg, Makélélé and Park for:

- Beckenbauer
- Eriksen
- Iniesta
- Panenka

Full XI:

`beckham, wambach, dzajic, di-maria, schmeichel, gentile, seedorf, eriksen, panenka, iniesta, beckenbauer`

The important signal is not that those four incoming cards should immediately be nerfed. It is that a relatively compact Cross core appears able to retain its specialist upside while the remaining slots are upgraded to strong standalone/control cards.

Before changing Cross ATT values, test **core-size sensitivity**: how well do three-, four- and five-card Cross packages perform inside otherwise generic shells, and how does that compare with Through Ball and Set Piece compact cores?

## Selected top variants

- Cross v3: **94%**, +4.333 GD
- Cross v2: 83%, +3.344
- Cross v4: 73%, +2.104
- Set Piece v3: 71%, +1.948
- Balanced v5: 71%, +1.594
- Through Ball v4: 66%, +1.802

## Selected bottom variants

- Dribbling v1: **2%**, -4.208 GD
- Dribbling v8: 6%, -2.833
- Dribbling v2: 12%, -3.375
- Control v7: 12%, -2.323
- Dribbling v5: 16%, -2.000
- Dribbling v3: 17%, -2.344

## Card-association caution

Some cards correlate with stronger or weaker variants, but samples are small and deck-family construction remains a confound. These are diagnostic associations, not causal balance findings. Do not directly nerf or buff individual cards from this report alone.

## Recommended next test

Keep Set Piece frozen. Do not reopen global scoring or Energy.

Run a **compact-core sensitivity matrix**:

1. Cross shells with 3 / 4 / 5 defining cards.
2. Equivalent Through Ball and Set Piece shells as controls.
3. Generic high-quality support slots held as comparable as possible.
4. Measure whether Cross keeps disproportionate upside at low specialist-card counts.
5. In parallel, prototype Dribbling changes that reduce the number of deck slots required to access its football identity rather than simply making Penalty stronger.

The broad-validation generator and results are implemented in `src/engine-v8/calibration-deck-validation.ts` and `src/engine-v8/__tests__/calibration-deck-validation.test.ts`. CI writes `test-results/v8-calibration-deck-validation.json` and `.txt` into the existing V8 calibration artifact.
