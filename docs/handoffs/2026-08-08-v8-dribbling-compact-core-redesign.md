# V8 Dribbling / Penalty compact-core redesign

Date: 2026-08-08
Branch: `claude/generated-tactical-window-6dxfay`
Parent V8 prototype: `agent/v8-three-zone-prototype`

## Decision

Accept a compact Dribbling / Penalty package built around **Duff + Neymar + Panenka**.

The only gameplay Action change is Neymar:

> **RAINBOW FLICK — On Reveal: If an opposing defender is here, add a Penalty to your hand.**

This replaces the previous dependency:

> If an opposing defender here has reduced DEF, add a Penalty.

Neymar now wins the Penalty himself by taking on an opposing defender. Duff remains an independently useful dribbler and Panenka remains the optional conversion specialist.

No Penalty value change is accepted:

- Penalty Cost remains **1 Energy**
- Penalty base ATT remains **+5**
- CHIPPED PENALTY remains **+3 ATT and uncancellable**
- global 2 / 4 / 6 / 8 Energy remains unchanged
- repeat scoring remains **+7 ATT over DEF per goal**
- no player ATT / DEF or source-tracker Cost values change

## Accepted calibration reference XI

`duff, neymar, panenka, schmeichel, gentile, seedorf, iniesta, beckenbauer, makelele, bremner, sinclair`

Defining package:

1. **Duff / KNOCK AND RUN** — independently attacks the opposing line and remains a good football-readable Action.
2. **Neymar / RAINBOW FLICK** — creates the Penalty directly when he confronts an opposing defender.
3. **Panenka / CHIPPED PENALTY** — optional payoff that turns a local Penalty from +5 into +8 ATT and makes it uncancellable.

Garrincha is deliberately **not mandatory** in the reference package. He remains a viable swap / dribbling card rather than another prerequisite.

## Why the old package failed

The first compact diagnostic used 13 neutral-shell decks across all six reference opponents, eight seeds and both home/away orientations: **1,248 matches**.

The old reducer → generator → specialist design was not merely underpowered. It was structurally too dependent:

- Duff and Garrincha were individually playable football cards.
- Duff / Garrincha reductions did land with reasonable frequency.
- Garrincha's `if already reduced` +4 ATT clause activated effectively never in compact shells.
- Neymar generated no meaningful Penalty volume in ordinary 2–3-card packages under the old reduced-DEF prerequisite.
- the package only began to express itself when too many specialist cards were combined.
- adding more specialists then damaged the XI's overall football strength.

The problem was therefore **dependency density / deck-slot tax**, not Penalty +5 or Cost 1.

## Rejected redesigns

### Future combo hoarding

Holding reducer / generator pieces for future periods increased combo attempts but starved normal board development. Rejected.

### Larger Okocha / Ronaldo packages

Adding more Penalty generators made the deck more specialist-heavy and weakened its defensive / general-purpose structure. Rejected.

### FLIP FLAP threshold −3 → −2

Increased Ronaldo activation but worsened overall results. Rejected.

### Self-contained STEPOVER Penalty

Direct Penalty generation from Okocha increased generation without repairing the package. Rejected.

### Free same-period RAINBOW FLICK Penalty

Made generated Penalties easier to cash but did not improve outcomes. Rejected.

### Deferred Neymar condition check

Rechecking the old reduced-defender condition after reveal produced no useful improvement. Rejected.

### Global settled-pitch Dribble phase

Letting Duff / Garrincha resolve against the settled pitch increased reducer hits, but the period-lifetime DEF reduction still rarely overlapped Neymar in a useful 2-card package. It added system complexity without fixing the real deck-building problem. Rejected.

## Accepted Neymar sensitivity

A controlled 1,344-match A/B compared the old reduced-defender dependency with Neymar simply winning a Penalty when facing an opposing defender.

Representative candidate results:

| Compact shell | Candidate W | Candidate GD | Penalties generated |
| --- | ---: | ---: | ---: |
| Neymar | 47% | +0.03 | 24 |
| Neymar + Panenka | 67% | +1.49 | 18 |
| Duff + Neymar | 50% | +0.42 | 29 |
| Garrincha + Neymar | 53% | +0.52 | 29 |
| Duff + Neymar + Panenka | 50% | +0.87 | 29 |
| Garrincha + Neymar + Panenka | 53% | +0.95 | 30 |
| Duff + Garrincha + Neymar + Panenka | 28% | −0.92 | 41 |

The important shape is not the strongest raw shell. It is that Neymar becomes a functioning creator in 1–3-card packages while the four-specialist pile remains poor. More specialists are not automatically better.

## Final six-XI matrix

Exact deterministic matrix:

- 32 seeds
- all ordered 6×6 matchups
- 1,152 four-period matches
- self-matches excluded from squad summary

| Squad | Win | Draw | GF | GA | GD | Tactical share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cross | 48% | 14% | 5.969 | 5.788 | +0.181 | 5% |
| Through Ball | 42% | 15% | 6.300 | 6.288 | +0.013 | 5% |
| **Dribbling / Penalty** | **49%** | **15%** | **6.422** | **5.975** | **+0.447** | **1%** |
| Control / Defence | 35% | 18% | 2.609 | 2.903 | −0.294 | 2% |
| Long Shot / Set Piece | 33% | 17% | 3.800 | 4.372 | −0.572 | 11% |
| Balanced / Midrange | 46% | 17% | 5.959 | 5.734 | +0.225 | 3% |

Dribbling is now a competitive reference rather than the weak outlier.

Selected pairings:

- Cross vs Dribbling: **52 / 6 / 42**, goals **7.406–7.422**
- Through Ball vs Dribbling: **36 / 19 / 45**, goals **7.813–8.016**
- Dribbling vs Control: **44 / 17 / 39**
- Dribbling vs Set Piece: **67 / 9 / 23**
- Dribbling vs Balanced: **45 / 22 / 33**

The Set Piece pairing is favorable, but the full matrix does not show Dribbling as globally dominant.

## Penalty identity in the final matrix

Top Dribbling chains:

- **24×** `RAINBOW FLICK → Penalty → CHIPPED PENALTY +3 = +8 ATT [window]`
- **14×** `RAINBOW FLICK → Penalty = +5 ATT [window]`
- **11×** `RAINBOW FLICK → Penalty → CHIPPED PENALTY +3 = +8 ATT`

The reference averages:

- ~0.119 Generated-Tactical Window plays per match
- ~0.819 ATT per match from those window plays
- 1% total Tactical ATT share

This is deliberately a **visible spike mechanic rather than the majority of the deck's power**.

## Broad 54-deck validation

The broad panel remains:

- 54 deterministic decks
- six strategy families
- base XI + eight nearby 2–4-card variants per family
- eight seeds
- home/away against all six reference XIs
- **5,184 matches**

Final family results after the compact Dribbling redesign:

| Family | Median W | Range | Baseline | Competitive | 50%+ | Median GD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cross | 47% | 22–58% | 47% | 7/9 | 4/9 | +0.250 |
| Through Ball | 41% | 28–49% | 42% | 5/9 | 0/9 | −0.240 |
| **Dribbling / Penalty** | **32%** | **16–47%** | **45%** | **3/9** | **0/9** | **−0.865** |
| Control / Defence | 31% | 5–41% | 40% | 1/9 | 0/9 | −0.635 |
| Long Shot / Set Piece | 31% | 21–66% | 48% | 3/9 | 1/9 | −0.750 |
| Balanced / Midrange | 51% | 40–72% | 43% | 7/9 | 5/9 | +0.458 |

Before the redesign the Dribbling family had roughly a **13–15% median and 0/9 competitive decks**. It now has a viable 45% reference, three competitive nearby variants and no 50%+ Dribbling splash deck.

That is the desired structural repair: **higher floor, no ceiling explosion**.

## Compact-shell evidence after acceptance

The existing compact Dribbling panel now shows:

- Neymar alone: 47% W, 0.146 Penalties/match
- Duff + Neymar: 47% W, +0.406 GD
- Garrincha + Neymar: 53% W, +0.583 GD
- Duff + Neymar + Panenka: 48% W, +0.792 GD
- Garrincha + Neymar + Panenka: 53% W, +0.948 GD
- four-specialist Duff + Garrincha + Neymar + Panenka: **28% W / −0.896 GD**

Again, adding every specialist is actively punished by deck opportunity cost.

## Design conclusion

The Cross lesson generalizes:

> **A V8 mechanic should usually be expressible by one creator + one optional payoff, inside an otherwise useful football XI.**

Dribbling / Penalty now follows that model:

- Duff = independently useful dribbler
- Neymar = creator
- Panenka = payoff
- Garrincha = optional alternative / supporting dribbler

Do **not** reopen Penalty +5, Cost 1, +7 scoring or global Energy to strengthen this package.

Do **not** add a global Dribble phase.

Do **not** make Garrincha mandatory merely to force more named specialists into the archetype.

A later card-quality pass may still revisit Garrincha's effectively dead `already reduced` bonus as an individual Action-design issue, but that is separate from Penalty package viability.

## Verification

Final candidate run: **Verify #248**, run ID `31274881512`.

On the exact gameplay head before this handoff commit:

- focused gate: **21 files / 140 tests passed**
- full Vitest visibility: V8 passes; the same two inherited V7 failures remain (`isolation.test.ts`, `live-integration.test.ts`)
- TypeScript: passed
- changed-file lint: passed
- full lint visibility: inherited unrelated repo errors remain
- static export build: passed
- V7 mobile typed-chance Playwright: **4/4 passed**
- V8 390×844 match-lab Playwright: **7/7 passed**
- overall Verify workflow: **success** because inherited full-suite/full-lint debt is visibility-only

PR #106 must remain **draft / unmerged** until explicit promotion is requested. PR #105 remains untouched. No public V8 preview publication is part of this decision.
