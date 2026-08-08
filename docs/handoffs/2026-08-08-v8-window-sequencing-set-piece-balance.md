# V8 Window Sequencing + Set-Piece Balance — 2026-08-08

Branch: `claude/generated-tactical-window-6dxfay`  
Draft PR: #106 → `agent/v8-three-zone-prototype`  
PR #105 remains draft / unmerged / untouched.

## Outcome

The Generated-Tactical Window is now followed by a deliberately narrow calibration sequencing policy and the first post-window package balance change.

Final gameplay changes in this branch:

1. **Generated-Tactical Window** remains live after reveal resolution and before scoring in P1–P4.
2. **Window sequencing**:
   - ordinary generated Chances are played immediately when affordable;
   - THREE LUNGS clears its same-period 0-cost Trigger Press immediately, even if ATT is currently empty;
   - Offside Trap is window-played only when the opponent currently has a window Through Ball to cancel;
   - a P3 Corner may be held for an already-established Ramos so 93RD MINUTE can use its P4 +5 payoff;
   - P4 Chances are always cashed rather than dying in hand.
3. **Long Shot** base Tactical ATT is now **+2** (from +1).
4. **93RD MINUTE** now also has a late attacking-run clause: **From P3, if Ramos is played in ATT, +5 ATT.**
   - Ramos still occupies ATT and therefore gives up his defensive role;
   - the +5 offsets his wrong-depth attacking OOP penalty rather than restoring his DEF contribution;
   - existing Corner bonus remains +3, rising to +5 in the final period.

No global scoring, Energy, player Cost, or printed player ATT/DEF values changed.

## Why the window planner is intentionally small

This pass tested several apparently sensible hold rules and rejected the ones that harmed the actual rules cadence.

### Broad Chance holds — rejected

Holding Cross / Through Ball / Long Shot / Penalty until a named specialist was established looked sensible but was strategically too slow. In the fixed-seed matrix, Through Ball fell from **52% to 39% wins** because a held window card can miss another commitment cycle before the specialist sequence becomes available.

Decision: **cash ordinary generated Chances now**. The calibration planner should not optimize with look-ahead search.

### THREE LUNGS hold — rejected

The largest planner regression came from refusing to spend Trigger Press into an empty ATT zone.

THREE LUNGS generates a Trigger Press that costs 0 only in its current period. If the planner holds it, the card becomes a **1-Energy commitment Tactical next period**. Because the calibration commitment planner spends Tacticals before players, that held Press became a deployment tax.

A direct A/B restored immediate free Trigger Press and Through Ball returned exactly to its post-window baseline:

- win rate: **39% → 52%**;
- unused Energy: back to **1.44**;
- players deployed: back to **7.10**;
- Tactical share: back to **6%**.

Decision: **clear THREE LUNGS in its free window**, even when its current ATT contribution is 0.

### Offside Trap pruning — kept

Holding a window Offside Trap when there is no current opposing window Through Ball did not damage Control / Defence. Cancellation rate remained stable while useless utility commitments disappeared.

Decision: keep this narrow utility rule.

### P3 Corner hold — kept

Holding a P3 Corner for an already-established Ramos restores the intended P4 late spike. The final matrix contains **26× `WHIPPED DELIVERY → Corner → 93RD MINUTE +5 = +9 ATT`**.

This sequencing change by itself did not repair the Set Piece package, so it is a strategic rule rather than the balance fix.

## Set Piece balance experiments

The post-window baseline for Long Shot / Set Piece was:

- **23% wins**;
- 17% draws;
- GF 3.47 / GA 4.81;
- GD −1.34;
- 11% Tactical ATT share.

The package was clearly the remaining balance outlier.

### Global Ramos from DEF — rejected

Two variants allowed Ramos to remain in DEF while still applying 93RD MINUTE globally to Corners.

- Early DEF anchor + global Corner payoff: **74% wins**.
- Ramos deferred until P3, then DEF + global Corner payoff: **63% wins**.

Both were rejected. At current Cost, retaining Ramos's real 9 DEF while also gaining the attacking set-piece payoff is far too efficient.

### Late ATT OOP relief +3 — useful but insufficient

Keeping Ramos committed in ATT, but refunding 3 ATT from P3 onward (wrong-depth −5 behaving like adjacent −2), moved Set Piece to **29% wins**.

This proved the attacking OOP tax was a real structural suppressor, but +3 was not enough.

### Long Shot sensitivity

With Ramos +3 late relief:

- Long Shot **+2**: Set Piece reached **33% wins**, GD −0.72.
- Long Shot **+3**: Set Piece reached **35% wins**, GD −0.46.

The extra generic Long Shot point had diminishing returns and would make the generic Tactical stronger than Cross / Through Ball merely to rescue one package. +3 was rejected.

Decision: **Long Shot = +2 ATT**.

### Full Ramos late-run relief — accepted

The final sensitivity kept Long Shot at +2 and gave Ramos +5 ATT when committed to ATT from P3. This fully offsets his attacking wrong-depth penalty while still sacrificing his defensive slot.

Sensitivity result: ~37% wins / −0.43 GD.

The same rule was then moved into the **real Action runtime**, the matrix-only helper was removed, and the deterministic matrix was rerun.

## Final real-runtime matrix

32 fixed seeds × every ordered 6×6 pairing = **1,152 matches**; self-matches excluded from squad summaries.

| Squad | Win | Draw | GF | GA | GD | Unused E | Tactical share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Balanced / Midrange | **52%** | 14% | 6.68 | 6.14 | +0.54 | 1.55 | 3% |
| Cross | 51% | 11% | **8.86** | 8.15 | **+0.71** | **0.65** | **14%** |
| Through Ball | 48% | 12% | 7.09 | 6.78 | +0.31 | 1.44 | 6% |
| Control / Defence | 39% | 15% | 3.05 | 3.19 | −0.14 | 3.03 | 3% |
| **Long Shot / Set Piece** | **38%** | 15% | **4.53** | 4.82 | **−0.29** | 1.52 | **11%** |
| Dribbling / Penalty | 33% | 11% | 6.25 | 7.36 | −1.11 | 2.31 | 1% |

Set Piece head-to-head:

- vs Cross: **42% win / 13% draw / 45% loss**;
- vs Through Ball: **34 / 16 / 50**;
- vs Dribbling / Penalty: **47 / 8 / 45**;
- vs Control / Defence: **41 / 25 / 34**;
- vs Balanced / Midrange: **27 / 16 / 58**.

This is the intended landing: the package is no longer dead, is roughly competitive with Control and Dribbling, but retains a clear bad matchup into Balanced and remains below the reference attack packages.

## Final mechanic evidence

Long Shot / Set Piece top chains in the real-runtime matrix:

- **250×** `THUNDERBALL → Long Shot → HALFWAY HIT +4 = +8 ATT [window]`;
- **55×** `THUNDERBALL → Long Shot = +4 ATT [window]`;
- **26×** `WHIPPED DELIVERY → Corner → 93RD MINUTE +5 = +9 ATT`;
- 19× `WHIPPED DELIVERY → Corner = +4 ATT`;
- 17× `WHIPPED DELIVERY → Corner = +4 ATT [window]`.

P4 Set Piece board shape after the final change:

- ATT **39.36**;
- DEF **29.66**;
- GF **1.71**;
- GA **2.36**.

The package still has a distinct late set-piece identity rather than becoming a generic high-ATT deck.

## Tests and evidence

New / updated regression coverage includes:

- Generated-Tactical Window contract;
- window sequencing policy;
- free THREE LUNGS carryover-tax regression;
- Offside Trap current-window targeting;
- P3 Corner hold / P4 cash;
- Ramos pre-P3 vs P3 ATT behavior;
- Long Shot +2 / Lloyd-amplified THUNDERBALL = +8;
- V8 mobile Generated-Tactical Window UI at 390×844.

The focused CI gate explicitly includes the window and set-piece tests.

Tracked deterministic evidence is refreshed at:

- `test-results/v8-calibration-matrix.json`
- `test-results/v8-calibration-matrix.txt`
- `test-results/v8-calibration-periods.json`
- `test-results/v8-calibration-periods.txt`

Temporary sensitivity/finalizer/evidence workflows were removed after use.

## Next gameplay balance target

Do **not** reopen global scoring, Energy, or Long Shot / Set Piece immediately.

The next clear package-level outlier is now **Dribbling / Penalty at 33%**, with only ~1% Tactical ATT share and a low Penalty activation rate. Inspect whether its reduced-DEF prerequisites are too difficult / poorly sequenced before adding raw Penalty ATT or buffing elite attacker stats.
