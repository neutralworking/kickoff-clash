# V8 expansion runtime — Batch 04 slice 01

Date: 2026-08-09
Branch: `claude/generated-tactical-window-6dxfay`
PR: #106 (draft / unmerged)

## Scope

This slice implements the five Batch 04 cards that belong in the shared Tactical / Chance reaction pipeline. The existing Batch 03 reaction layer remains intact; Batch 04 adds a wrapper so normal commitment and the Generated-Tactical Window use exactly the same path.

Tracker Action identity/text remains authoritative. Existing `kc_player_roster_reconciliation` values are used only for calibration ATT/DEF/Cost; no source-of-truth database values are changed.

## Runtime-ready cards

### Gordon Banks — IMPOSSIBLE SAVE

> Once per match, the first opposing Chance in ATT with 4 or more ATT is cancelled.

- ignores lower-value Chances without consuming the once-match effect
- only spends on an otherwise-live, cancellable Chance
- evaluates the final live ATT after attacking enhancements/suppression
- does not spend into an uncancellable Chance

Calibration stats: GK · 0 ATT · 11 DEF · Cost 4.

### John Terry — HEAD WHERE IT HURTS

> Once per match, when a second opposing Chance in ATT would resolve in the same period, cancel it; then this loses 3 DEF.

- counts live ATT Chance resolutions in the current period
- cancels the second eligible Chance once per match
- pays a permanent −3 DEF self-cost after the block
- an already-cancelled Chance is not counted/consumed again
- period counting resets naturally while the once-match spend does not

Calibration stats: CB · 1 ATT · 10 DEF · Cost 3.

### Alexandra Popp — CRASH THE BOX

> After your first Cross is played in ATT each period, this gains +3 ATT this period.

- reads the final Tactical type/zone after transformations
- triggers once per period
- the self-buff is period-lifetime and resets at period end
- a Cross counts as played even if a later defensive interceptor cancels its resolution

Calibration stats: CF / AM · 10 ATT · 1 DEF · Cost 3.

### Ali Daei — POWER HEADER

> Your first Cross played here each period has +2 ATT and its ATT cannot be reduced.

- reads the final Tactical type/zone
- adds +2 ATT to the first Cross in Daei's current zone each period
- protects that Cross from current ATT suppression (BLACK SPIDER)
- the final enhanced ATT is visible to downstream defensive interception; e.g. a base 2 Cross becomes 4 ATT and can therefore meet Banks' IMPOSSIBLE SAVE threshold

Calibration stats: CF · 11 ATT · 1 DEF · Cost 4.

### Ellen White — FIRST-TIME LOB

> Once per match, your first Through Ball played here becomes a Long Shot and gains +3 ATT before it resolves.

- only an originally played Through Ball can trigger the effect
- original Tactical Cost is spent before transformation
- final type is Long Shot and final ATT receives +3
- the signature once-match transform is locked for that play so generic Alexia/Pirlo transforms cannot overwrite it
- normal commitment and Generated-Tactical Window share the same transform path

Calibration stats: CF · 11 ATT · 1 DEF · Cost 4.

## Ordering contract

For this slice the pipeline is deliberately deterministic:

1. original-card payment / Ellen signature transformation
2. existing Batch 03 transformations and Tactical resolution
3. Daei Cross enhancement / ATT-suppression protection
4. Popp post-Cross self-buff
5. Banks high-value interception
6. Terry repeated-Chance interception

Later defensive interceptors inspect the current resolution and do not consume if an earlier effect already cancelled it.

## Registration

The five calibration cards are registered by `calibration-expansion-batch-04-cards.ts`. This isolated registry mutates the existing calibration array/map at module initialization so the slice can remain separated from the large historical `calibration-cards.ts` list. Source Tracker/reconciliation records remain untouched.

## Tests

`calibration-expansion-batch-04-runtime.test.ts` covers:

- Banks low/high threshold and uncancellable behavior
- Terry second-Chance cancellation, permanent −3 DEF and once-match lifetime
- Popp once-period Cross trigger/reset
- Daei +2 Cross and Yashin suppression immunity
- Daei → Banks ordering at the 4-ATT threshold
- Ellen once-match Through Ball → Long Shot +3 transform
- Generated-Tactical Window parity

The focused Verify workflow now explicitly includes the Batch 04 runtime test file.

## Still open in Batch 04

These remain `primitive_required` and are intentionally not approximated in this slice:

- Bryan Robson — CAPTAIN MARVEL (`period_end_comeback_scaling`)
- Chris Waddle — DROP THE SHOULDER (`move_chance_transform`)
- Alan Shearer — LACES THROUGH IT (`first_chance_power_with_protection_lock`)

Package/global balance, Energy, Tactical base values, Penalty and the +7 scoring band remain frozen.
