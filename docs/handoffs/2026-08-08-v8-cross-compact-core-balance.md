# V8 Cross compact-core balance — 2026-08-08

Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base `agent/v8-three-zone-prototype`)

## Why this pass existed

The first broad V8 deck-validation panel exposed a portability problem that the six curated reference XIs could not show. Cross had a healthy reference result, but one nearby variant reached **94% wins / +4.333 GD** while retaining only a compact specialist core and filling the remaining slots with strong standalone cards.

The goal of this pass was therefore not to lower Cross scoring globally. It was to determine how many specialist deck slots Cross really needed, compare that with Through Ball and Set Piece, and identify whether the extreme result came from Cross Tactical ATT, one specific Action pair, Cost efficiency, or the neutral support shell.

Source tracker / reconciliation values remain untouched. Accepted Cost changes below are calibration-lab overrides only.

## Compact-core panel

A deterministic 864-match panel tested nested 3 / 4 / 5-card specialist cores on the same strong neutral support shell.

Initial baseline:

| Family | 3-card core | 4-card core | 5-card core |
| --- | ---: | ---: | ---: |
| Cross | **84%** | **80%** | 56% |
| Through Ball | 45% | 21% | 21% |
| Long Shot / Set Piece | 66% | 24% | 28% |

This confirmed that Cross was unusually efficient at low specialist-card counts; it was not a generic property of all V8 synergy packages.

## Minimal Cross controls

Pair/triple tests on the same shell isolated the most portable Cross pieces:

- Beckham + Wambach: **82%**
- Di María + Wambach: **84%**
- Beckham + Di María: **73%**
- Džajić + Wambach: 51%
- Beckham + Di María + Džajić without Wambach: ~48%

Zero/single-card controls were then added:

- neutral good-card shell: ~**45%**
- Beckham alone: **55%**
- Di María alone: **58%**
- Džajić alone: **37%**
- Wambach alone: **74%**

The main issue was therefore not Cross base ATT by itself. Wambach and Di María were unusually efficient shallow splashes under the lab's blanket `source Cost - 1` rule; Beckham + Di María also formed an efficient creator pair.

## Rejected fixes

### Global / small ATT reductions

Sensitivities included:

- RABONA +3 → +2
- BEND IT +2 → +1
- Wambach ATT Cross rider +4 → +3
- small combinations of those changes

These barely moved the extreme minimal shells because the +7 repeat-goal threshold often swallowed a one-point ATT reduction, while the curated Cross reference deck weakened.

**Reject:** do not solve portability by shaving generic Cross ATT.

### Uniform Cost increases

Raising Beckham, Wambach and Di María from 2 → 3 Energy in the lab normalized the shallow shells, but it crushed the old six-specialist Cross reference XI. Raising any one card alone left another 73–89% two-card shell.

**Reject as a blanket solution.**

### Cost redistribution into deeper specialists

Several sensitivities charged Wambach and/or Di María more while rebating Džajić, Cafu and/or Hegerberg. Shallow splash results improved, but the old six-specialist reference XI still fell to roughly the mid-20s or worse.

This was the point where the design assumption changed: the old six-specialist XI should not be protected merely because it was the original calibration list.

### RABONA semantic rewrite

A sensitivity changed RABONA from raw `+3 ATT` on an existing Cross to making that Cross cost 0 in the current period. This reduced some broad portability but did not solve the Beckham + Di María shell and still badly damaged the old reference XI.

**Reject. Keep RABONA's accepted football-readable behavior for now.**

## Accepted design direction

V8 archetypes should be able to function as **compact 2–4 card synergy packages inside otherwise useful football XIs**. A six-specialist package is not inherently healthier than a compact package.

The accepted Cross solution therefore has two parts.

### 1. Wambach and Di María stay at printed Cost in the calibration lab

Most V8 calibration players still use:

`effective Cost = max(1, source Cost - 1)`

Exceptions:

- Abby Wambach: source Cost 3 → **3 Energy**
- Ángel Di María: source Cost 3 → **3 Energy**

Their source tracker Costs are **not** changed.

### 2. Cross reference XI becomes a three-card specialist core

Accepted reference XI:

`beckham, wambach, di-maria, schmeichel, gentile, seedorf, iniesta, beckenbauer, makelele, bremner, sinclair`

Defining Cross core:

- Beckham — BEND IT
- Wambach — DIVING HEADER
- Di María — RABONA

The remaining eight slots are broadly useful structure rather than additional Cross specialists.

A four-card candidate adding Džajić was tested and rejected as the reference shape because broad-family robustness fell substantially.

## Accepted evidence

### Six-XI 1,152-match matrix

With the three-card reference XI and Wambach/Di María printed-Cost exceptions:

- Cross: **51% W / 14% D**
- GF: **6.172**
- GA: **5.641**
- GD: **+0.531**
- Tactical ATT share: ~**5%**

Cross pairings:

- vs Through Ball: **50 / 17 / 33**
- vs Dribbling / Penalty: **66 / 6 / 28**
- vs Control / Defence: **50 / 16 / 34**
- vs Long Shot / Set Piece: **45 / 17 / 38**
- vs Balanced / Midrange: **44 / 14 / 42**

### Broad 54-deck / 5,184-match robustness panel

Cross family after the accepted change:

- median win rate: **50%**
- range: **25–65%**
- reference baseline in this panel: **49%**
- competitive decks (>=40%): **7/9**
- strong decks (>=50%): **5/9**
- median GD: **+0.479**

The former 94% ceiling is gone; the strongest Cross variant is **65%**, which is comparable to the upper tail already present in other healthy/good-card families.

### Compact-core panel after the accepted change

- Cross 3-card core: **42% W / 16% D / −0.021 GD**
- Cross 4-card core: **47% W / 20% D / +0.354 GD**
- Cross 5-card core: **15% W / 8% D / −2.417 GD**

Controls in the same run:

- Through Ball 3-card core: **47%**
- Set Piece 3-card core: **66%**

Cross no longer has disproportionate low-slot upside.

### Minimal Cross panel after the accepted change

- Beckham + Wambach: **58%**
- Di María + Wambach: **28%**
- Džajić + Wambach: **26%**
- Beckham + Di María: **37%**
- Beckham + Di María + Wambach: **35%**
- Beckham + Džajić + Wambach: **52%**
- Di María + Džajić + Wambach: **40%**
- Beckham + Di María + Džajić: **33%**

This is a much healthier splash profile than the original 73–84% two-card peaks.

## Implementation

Accepted code:

- `src/engine-v8/calibration-balance.ts`
  - Wambach and Di María printed-Cost exceptions.
- `src/engine-v8/calibration-squads.ts`
  - Cross reference rebuilt around Beckham / Wambach / Di María.
- `src/engine-v8/__tests__/calibration-balance.test.ts`
  - explicit Cost regression.
- `src/engine-v8/__tests__/calibration-squads.test.ts`
  - compact Cross reference / updated calibration assumptions.
- `src/engine-v8/calibration-compact-core.ts`
- `src/engine-v8/calibration-cross-minimal.ts`
  - retained as reusable balance diagnostics.

The temporary Cross sensitivity workflow was removed after the decision was accepted.

## What this means for V8 deck design

The desired deck-building shape is now clearer:

- synergy packages should generally function with roughly **2–4 defining cards**;
- adding more specialists should have a real opportunity cost;
- strong standalone cards are allowed and desirable;
- the goal is not to force players into all-in archetype XIs;
- a mechanic should not require six mutually dependent cards to become functional.

That principle reinforces the existing Dribbling / Penalty diagnosis. Its broad median remains extremely weak and its previous sensitivities show that simply producing more Penalties does not fix it.

## Next target

Redesign **Dribbling / Penalty** around a compact 2–3 card functional core.

Do not begin by increasing Penalty +5 ATT or reducing its Cost. Instead reduce dependency density: dribblers should provide useful on-pitch value independently, and combining one dribbler with one creator/finisher should be sufficient to express the archetype without consuming most of the XI.
