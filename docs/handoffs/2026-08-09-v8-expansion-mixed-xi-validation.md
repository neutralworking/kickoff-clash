# Kickoff Clash V8 — Expansion Mixed-XI Validation

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base PR #105 remains draft / unmerged / untouched)

## Objective

Move beyond isolated card and archetype tests after Batches 01–04 by validating the expanded real-player runtime in mixed football XIs.

This is **integration validation, not a balance pass**.

No global scoring, Energy, Tactical values, player ATT/DEF/Cost, or six-squad reference matrix values were changed.

## Authoritative expansion state

Across Batches 01–04 there are 32 audited contracts.

- **30 are runtime-ready with authoritative playable values.**
- **2 remain blocked on source stats: N’Golo Kanté and Mesut Özil.**

The blocked state was rechecked against both source systems rather than assumed from old contract flags.

### Card Design Tracker

`Kickoff Clash — Card Design Tracker` → `Players`

- Mesut Özil: tracker row 178, `KC-024`, Action `INVISIBLE`, Peak 91 / Peak-eligible, but Cost / ATT / DEF are blank and the note says he is not in the KC roster.
- N’Golo Kanté: tracker row 186, `KC-043`, Action `EVERYWHERE`, Peak 82, but Cost / ATT / DEF are blank.

### Supabase reconciliation

The KC data exists in the `Chief Scout` Supabase project, not `Chief Scout Prod`.

Checked:

- `kc_player_roster_reconciliation_view`
- `kc_player_cards`

Neither Özil nor Kanté has a matching row / authoritative KC ATT, DEF or Cost to recover.

**Decision:** keep both `stats_required`. Do not invent temporary calibration values merely to make the integration count 32.

## Integration fixtures

Added `calibration-expansion-integration.ts` with three integration-only 11-card fixtures:

- `mix_alpha`
- `mix_beta`
- `mix_gamma`

Their union covers every one of the 30 runtime-ready expansion players at least once.

These fixtures are deliberately separate from `V8_CALIBRATION_SQUADS`; the six accepted reference squads and all existing balance evidence remain unchanged.

## What the harness validates

### Full mixed deployment

Two complete 11-player expansion XIs can deploy through the real high-level reveal / ongoing-effect path and produce finite team ATT / DEF totals.

This exercises cross-batch ongoing refresh and suppression rather than merely checking that each card exists in the registry.

### Waddle + Shearer → Banks

The harness composes:

1. Chris Waddle — `DROP THE SHOULDER`
2. Alan Shearer — `LACES THROUGH IT`
3. Gordon Banks — `IMPOSSIBLE SAVE`

The sequence confirms:

- Waddle's armed Through Ball becomes a Cross;
- its original paid Cost is retained;
- Shearer's first-ATT-Chance +3 applies while protection stays locked;
- Gordon Banks sees the resulting high-value cancellable Chance and cancels it;
- Cavani does not falsely spend `GET ACROSS HIM` trying to make the Shearer-locked Chance uncancellable.

### Ellen White + Bergkamp → Yashin

The mixed-XI harness exposed a useful real interaction that an isolated test would miss.

With Ellen White and Dennis Bergkamp facing Lev Yashin, the first Through Ball resolves as:

1. `FIRST-TIME LOB`: Through Ball → Long Shot and +3 ATT
2. Long Shot base ATT: +2
3. `FIRST TOUCH`: +2 ATT to the first team Chance
4. `BLACK SPIDER`: −2 ATT

Final resolved Tactical ATT: **5**.

The initial mixed test expectation of 3 was corrected because it omitted Bergkamp's live first-Chance enhancement. The implementation was not weakened to satisfy the test; the test now locks the actual cross-batch ordering.

### CAPTAIN MARVEL through period-end

Bryan Robson is validated inside a real mixed XI using banked match-score context at period end.

This confirms the playable-lab integration fix from Batch 04 is consistent with mixed-roster runtime behavior.

## CI gate

`calibration-expansion-integration.test.ts` is now part of the focused Verify gate, so larger-roster coexistence cannot silently regress while later cards are added.

## Verification

Code head: `d391a09d5be2fffd59304778b89d0b0d2b76021d`  
Verify: **#389 / run `31328218715`**

Passed:

- focused Vitest gate, including the new mixed-XI integration suite;
- full Vitest regression visibility;
- V8 calibration evidence generation;
- TypeScript;
- changed-file lint;
- full lint visibility;
- static export;
- Chromium setup and static server;
- mobile typed-Chance browser checks;
- mobile V8 match-lab smoke checks.

Workflow conclusion: **success**.

## State after this slice

The expanded runtime is no longer only a collection of isolated card primitives. Thirty real-player expansion cards are now covered by an explicit mixed-XI compatibility layer.

Kanté and Özil remain data blockers, not engine blockers.

The next useful step is a **Batch 05 source-first Action audit** from the Card Design Tracker. Continue the established rule:

1. Action name should describe recognisable football behavior;
2. it should be strongly associated with the source player;
3. the consequence should translate naturally into V8's DEF / MID / ATT + Tactical grammar;
4. source ATT / DEF / Cost must exist before a card is promoted to runtime-ready;
5. new cards should be added to mixed-XI compatibility fixtures before any balance conclusions are drawn from them.
