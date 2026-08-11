# Kickoff Clash V8 — Expansion Batch 07 Complete

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; PR #105 remains draft / unmerged / untouched)

## Objective

Continue the source-first real-player Action expansion without reopening global V8 balance.

Rules retained from Batch 06:

1. Card Design Tracker supplies Action identity.
2. KC reconciliation supplies ATT / DEF / Cost.
3. No invented player values.
4. Removed Box/sector/threshold grammar is translated only when V8 has an honest equivalent.
5. Runtime promotion requires focused interaction coverage and mixed-XI compatibility.
6. New cards do not trigger global scoring, Energy, Tactical-value or reference-XI tuning.

## Source audit

Eight players were audited:

- Achraf Hakimi
- Annike Krahn
- Nemanja Vidić
- Rio Ferdinand
- Sol Campbell
- Zlatan Ibrahimović
- Roy Keane
- Nadine Angerer

Seven are now `runtime_ready`.

Nadine Angerer remains `primitive_required` because V8 does not yet expose a generic goalkeeper save event. A generic Chance cancellation is not treated as a save, and the old threshold +1 mechanic is no longer part of V8 grammar. Her tracker name `UNBEATEN` is also achievement-like, so the Action name should be revisited when the real save primitive is designed.

The older source-stat blockers remain unchanged:

- N'Golo Kanté
- Mesut Özil

## Runtime cards

### Achraf Hakimi — BOMB ON

> **Ongoing: While this is in MID and you are losing the match, your first Through Ball or Long Shot played in ATT each period becomes a Cross before it resolves.**

KC values:

- 4 ATT
- 6 DEF
- Cost 3

The old Box/side-sector wording is translated as open-play Chance shaping. Hakimi must actually be in MID, creating a positional cost for bombing forward. No ATT is added.

The first qualifying Through Ball or Long Shot in ATT becomes a Cross only while trailing. The original paid Cost and modifiers are preserved.

### Annike Krahn — STEP ACROSS

> **The first opposing Through Ball played in ATT each period becomes a Cross before it resolves.**

KC values:

- 1 ATT
- 10 DEF
- Cost 3

Krahn does not cancel the Chance. She changes its route: the direct Through Ball becomes a Cross. This keeps the defensive identity as steering the attack away from the direct lane.

The transformation preserves paid Cost and metadata.

An accepted emergent sequence is:

```text
Through Ball
→ STEP ACROSS: Cross
→ CUT INSIDE: Long Shot
```

when Robben is active for the attacking side.

### Nemanja Vidić — PARTNERSHIP

> **Ongoing: +2 DEF. +5 instead while Rio Ferdinand is deployed.**

KC values:

- 1 ATT
- 10 DEF
- Cost 3

The card remains useful alone and gets the stronger defensive payoff from the recognisable partnership.

### Rio Ferdinand — PARTNERSHIP

> **Ongoing: +2 ATT. +5 instead while Nemanja Vidić is deployed.**

KC values:

- 1 ATT
- 10 DEF
- Cost 3

The pair is intentionally asymmetric:

- Vidić contributes defensive dominance;
- Ferdinand contributes progression / ATT.

Partner presence is board presence. The partner's own Action does not need to be enabled for the relationship to exist.

### Sol Campbell — MARSHAL

> **Ongoing: +3 DEF to this zone. Your other wide players have −2 ATT.**

KC values:

- 1 ATT
- 10 DEF
- Cost 3

Important semantic split:

- `+3 DEF to this zone` is **zone contribution**, not hidden Campbell DEF;
- `−2 ATT` on other friendly wide players is a real stat modifier.

Therefore `currentCalibrationDefence(Campbell)` remains his real DEF while `calibrationZoneTotals` receives the +3 contribution.

The contribution is source-tracked through the dynamic refresh layer so repeated refreshes do not stack it and period reset clears/rebuilds it correctly.

Wide-player classification for this trade-off is:

- WF
- WM
- LW
- RW
- LM
- RM

FB/WB are not treated as attacking wide players for MARSHAL.

### Zlatan Ibrahimović — ALPHA

> **Ongoing: +6 ATT. Your other forwards have −2 ATT.**

KC values:

- 11 ATT
- 1 DEF
- Cost 4

This is a real-stat hierarchy aura:

- Zlatan gains +6 ATT;
- other friendly forwards lose 2 ATT;
- Zlatan is excluded from his own penalty;
- non-forwards are unaffected;
- suppressing ALPHA removes both sides of the trade-off on the next ongoing refresh.

Forward classification is:

- CF
- SS
- WF
- LW
- RW
- LF
- RF

### Roy Keane — REDUCER

> **On Reveal: Give the highest-ATT opposing forward −5 ATT for the match. End of Period: 50% chance they recover 2 ATT.**

KC values:

- 4 ATT
- 6 DEF
- Cost 3

The tracker Game Start timing is translated to On Reveal because the calibration board is progressively revealed.

Rules:

- selects the highest current real ATT opposing forward at reveal time;
- applies a bound −5 ATT match modifier;
- P1–P3 each run an independent deterministic namespaced 50% Action RNG check;
- on success the same player recovers up to 2 ATT toward zero;
- recovery never overshoots the original −5 debuff;
- later suppression of Keane does not retroactively erase the already-applied bound effect.

## Angerer blocker

### Nadine Angerer — UNBEATEN

Tracker concept:

> The first time she saves a Chance each period, the remaining opposing Chances that period become harder to finish.

KC values are available:

- 0 ATT
- 11 DEF
- Cost 4

She is blocked for **engine semantics, not data**.

Required future primitive:

```text
Chance resolution
→ explicit goalkeeper save event
→ source goalkeeper + period context
→ subsequent-Chance reaction
```

Do not implement UNBEATEN by listening to every cancellation. Offside Trap, defender Actions and other cancellation effects are not goalkeeper saves.

When the save primitive is designed, revisit the Action name as well: `UNBEATEN` describes an achievement/state rather than the goalkeeper action itself.

## Chance-transform ordering

Batch 07 preserves the existing deterministic ordering:

1. pending movement-specific transformation such as Waddle;
2. attacking player-specific Batch 07 shaping such as BOMB ON;
3. defensive Batch 07 shaping such as STEP ACROSS when still applicable;
4. Batch 06 player-specific transformation such as CUT INSIDE;
5. generic Alexia / Pirlo transformation layer.

Batch 07 transformations temporarily lock the generic transform layer for the current resolution, while lower player-specific transformations remain available.

The same path is used for ordinary commitment and the Generated-Tactical Window.

## Ongoing-effect architecture

Batch 07 adds `refreshV8Batch07OngoingEffects` above the established Batch 05 ongoing layer.

Dynamic modifiers are cleared and rebuilt rather than stacked.

The older ongoing layer is refreshed before and after Batch 07 real-stat auras so dynamic targets/comparisons such as Ashley Cole and Cannavaro read final current stats rather than stale pre-aura values.

The existing invariant remains:

> **Stat mechanics read real stats. Contribution mechanics read resolved contribution.**

Campbell's MARSHAL zone DEF is the key Batch 07 example of this distinction.

## Mixed-XI integration

Expansion state through Batch 07:

- runtime-ready: **53**
- source-stat blockers: **2** — Kanté, Özil
- primitive/design blockers: **1** — Nadine Angerer

A sixth integration XI, `mix_zeta`, was added rather than editing the five established fixtures.

Mix Zeta:

- DEF: Yashin, Krahn, Vidić, Campbell
- MID: Ferdinand, Hakimi, Keane, Walsh
- ATT: Zlatan, Robben, Cavani

The six accepted balance/reference squads remain unchanged. These mixed XIs are compatibility fixtures, not balance evidence.

## Verification

Gameplay / workflow head before this documentation commit:

`d35c78b1ec74f59ac28fe93ac18fe38804bf3cbc`

Verify:

- **#488**
- run **`31333970083`**
- conclusion: **success**

Passed:

- focused Vitest gate including Batch 07 source audit and runtime interactions;
- full Vitest regression visibility;
- V8 calibration evidence generation;
- TypeScript;
- changed-file lint;
- full lint visibility;
- static export;
- Chromium setup and static server;
- V7 mobile typed-Chance browser checks;
- V8 mobile match-lab smoke checks.

Focused Batch 07 coverage includes:

- seven authoritative card registrations;
- Angerer excluded from playable registry;
- Vidić/Ferdinand asymmetric partnership values;
- Campbell zone-contribution vs personal-stat invariant and non-stacking refresh;
- Zlatan forward hierarchy classification;
- Hakimi normal commitment + Generated-Tactical Window transforms;
- paid-Cost preservation;
- Krahn → Robben transform composition;
- deterministic Keane target binding and bounded recovery;
- complete 53-card coverage across six mixed XIs.

## Freeze / next direction

Batch 07 is complete.

Do not tune these seven runtime cards numerically in isolation yet. They were added to expand mechanic coverage, not to start another global balance pass.

Next useful slice is **Batch 08 source-first Action audit**, while keeping one explicit engine backlog item:

- design a real goalkeeper save-event primitive before promoting Angerer or any other save-triggered goalkeeper Action.
