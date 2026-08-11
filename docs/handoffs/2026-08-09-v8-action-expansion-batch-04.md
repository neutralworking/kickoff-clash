# V8 Action expansion — Batch 04 audit

Date: 2026-08-09
Branch: `claude/generated-tactical-window-6dxfay`
Parent PR: #106 (draft, unmerged)

## Purpose

Batch 04 starts only after Batch 03 reached 8/8 runtime-ready on an exact green head. This is a fresh source audit, not another tuning pass on the previous cards.

The audit continues the same four criteria:
1. recognizable on-pitch football event;
2. clear source-player identity;
3. mechanically legible V8 consequence;
4. healthy dependency profile.

The live Card Design Tracker owns Action identity/text and any populated Cost. KC reconciliation may supply frozen lab ATT/DEF/Cost only where the Tracker cell is blank. Missing values are never invented.

All eight Batch 04 cards remain `primitive_required`; no runtime behavior is accepted merely because a contract exists.

## Source sample

Selected mixed-position group:
1. Gordon Banks — GK
2. John Terry — CB
3. Bryan Robson — CM
4. Chris Waddle — WF / AM
5. Alan Shearer — CF
6. Alexandra Popp — CF / AM
7. Ali Daei — CF
8. Ellen White — CF

The group is intentionally more finishing-heavy than Batch 03, because the remaining audit pool contains several strong striker identities. It still exercises goalkeeper, defensive sacrifice, midfield comeback scaling, movement, Chance shaping, Cross follow-up and Tactical transformation.

## Source reconciliation

### Gordon Banks
Tracker:
- row 112
- match/full name: Banders / Gordon Banders
- GK
- Action: **IMPOSSIBLE SAVE**
- source effect currently blank

Reconciliation:
- ATT 0 / DEF 11 / Cost 4

Audit: **mechanic design required; keep the name.**

Accepted audit contract:
> **Once per match, the first opposing Chance in ATT with 4 or more ATT is cancelled.**

Why: the name is excellent and uniquely readable as Banks; the mechanic makes the signature save apply to a genuinely dangerous Chance rather than merely duplicating STARFISH's first-Chance-per-period rule.

## John Terry
Tracker:
- row 143
- match/full name: Tory / Jon Tory
- CB
- old Action: **CAPTAIN'S BODY**
- old concept: remove one of multiple opposing Chances, then lose 3 DEF

Reconciliation:
- ATT 1 / DEF 10 / Cost 3

Audit: **rename + V8 translation.**

Rejected name:
- `CAPTAIN'S BODY` — not a recognizable football action and too abstract.

Accepted audit name:
- **HEAD WHERE IT HURTS**

Accepted audit contract:
> **Once per match, when a second opposing Chance in ATT would resolve in the same period, cancel it; then this loses 3 DEF.**

This preserves the throw-yourself-into-danger identity and the self-cost while remaining distinct from Puyol / BODY ON THE LINE, which cancels the first eligible Chance once per match.

## Bryan Robson
Tracker:
- row 36
- match/full name: Robin / Bryan Robin
- CM
- Action: **CAPTAIN MARVEL**
- source concept: End of Period, if losing, +2 ATT / +2 DEF

Reconciliation:
- ATT 5 / DEF 5 / Cost 3

Audit: **keep name, translate timing.**

Accepted audit contract:
> **End of Period: If you are losing the match, gain +2 ATT and +2 DEF for the rest of the match.**

`CAPTAIN MARVEL` is retained: it is a source-specific identity the user has explicitly accepted and describes an in-game all-action midfield effect.

## Chris Waddle
Tracker:
- row 44
- match/full name: Wibble / Chris Wibble
- WF / AM
- Action: **DROP THE SHOULDER**
- old concept: move to another wide/central sector; next Chance becomes Cross

Reconciliation:
- ATT 10 / DEF 1 / Cost 4

Audit: **keep name, translate obsolete lateral-sector movement.**

Accepted audit contract:
> **Moveable once per period between MID and ATT. After this moves, your next Chance in the destination this period becomes a Cross before it resolves.**

This preserves the dribble/shift and delivery sequence without recreating left/right/central sectors.

## Alan Shearer
Tracker:
- row 10
- match/full name: Sharer / Alan Sharer
- CF
- Cost **4**
- Action: **LACES THROUGH IT**
- old effect used a `needs 5` Box-Chance threshold

Reconciliation:
- ATT 11 / DEF 1 / Cost 4

Audit: **keep name, translate dice mechanic.**

Accepted audit contract:
> **Your first Chance in ATT each period has +3 ATT, but it cannot be made uncancellable.**

The raw power is stronger than Bergkamp's FIRST TOUCH, but the protection lock gives it a real trade-off instead of making Shearer a strict upgrade.

## Alexandra Popp
Tracker:
- row 14
- match/full name: Popa / Alexandra Popa
- CF / AM
- Cost **3**
- Action: **CRASH THE BOX**
- old effect generated a Box Chance after two missed Crosses

Reconciliation:
- ATT 10 / DEF 1 / Cost 3

Audit: **keep name, replace obsolete miss/Box dependency.**

Accepted audit contract:
> **After your first Cross is played in ATT each period, this gains +3 ATT this period.**

Popp herself becomes the arriving box threat. The card no longer requires two prior failed Crosses before it exists.

## Ali Daei
Tracker:
- row 17
- match/full name: Dia / Ali Dia
- CF
- Cost **2**
- Action: **POWER HEADER**
- old effect used Cross-to-Box Chance conversion

Reconciliation:
- ATT 11 / DEF 1 / Cost 4

Source priority:
- **Tracker Cost 2 wins over reconciliation Cost 4.**

Audit: **keep name, avoid Wambach/Hegerberg duplication.**

Accepted audit contract:
> **Your first Cross played here each period has +2 ATT and its ATT cannot be reduced.**

This differentiates Daei from:
- Wambach: larger raw Cross ATT payoff;
- Hegerberg: uncancellable first-Cross protection;
- Daei: smaller amplification plus immunity to ATT suppression such as BLACK SPIDER.

## Ellen White
Tracker:
- row 75
- match/full name: Waits / Ellen Waits
- CF
- Action: **FIRST-TIME LOB**
- old effect: first Through Ball becomes a Long Shot with a dice threshold

Reconciliation:
- ATT 11 / DEF 1 / Cost 4

Audit: **keep name, translate dice mechanic.**

Accepted audit contract:
> **Once per match, your first Through Ball played here becomes a Long Shot and gains +3 ATT before it resolves.**

This reuses the now-proven pre-resolution Tactical transformation seam and makes the lob a distinctive conversion rather than a threshold change.

## Duplicate-avoidance decisions

The batch deliberately avoids cloning existing accepted cards:
- Banks is once-per-match + high-value threshold, not Schmeichel first-Chance-per-period.
- Terry reacts to a *second* Chance in one period and pays permanent DEF, not Puyol's first eligible match Chance.
- Shearer is raw first-Chance power with a protection drawback, not Bergkamp's unconditional +2.
- Popp buffs herself after Cross rather than directly buffing the Tactical.
- Daei supplies Cross suppression resistance rather than Wambach raw amplification or Hegerberg cancellation immunity.
- Ellen White transforms Through Ball → Long Shot, distinct from Alexia/Pirlo's broader Through Ball/Cross shaping.

## V7 concepts explicitly not revived

No Batch 04 contract contains or depends on:
- dice target numbers;
- rerolls;
- Box Chance as a separate legacy system;
- left/right/central sectors;
- missed-Chance counters as a prerequisite for the card to become useful.

## Contract status

`src/engine-v8/calibration-expansion-batch-04.ts`

All eight cards are `primitive_required` until focused runtime tests exist.

Audit decisions:
- mechanic design: Banks
- rename + repair: Terry
- keep + translate: Robson, Waddle, Shearer, Popp, Daei, Ellen White

Contract regression:
`src/engine-v8/__tests__/calibration-expansion-batch-04.test.ts`

It locks:
- mixed position coverage;
- no V7 dice/Box/lateral-sector language;
- preservation of strong Action names;
- removal of Terry's `CAPTAIN'S BODY`;
- no premature runtime-ready promotion.

The Batch 04 contract test is part of the blocking Verify focused gate.

## Next implementation slice

Do not implement all eight at once.

Recommended first runtime slice:
1. **Bryan Robson — CAPTAIN MARVEL**
2. **Alexandra Popp — CRASH THE BOX**
3. **Ali Daei — POWER HEADER**

Why:
- all three should reuse existing period counters/modifiers and Chance observation paths;
- they exercise End-of-Period scaling, post-Cross self-buff and Chance ATT-suppression immunity without introducing movement or complex cancellation replay;
- they give a clean checkpoint before the higher-order Banks/Terry/Waddle/Ellen mechanics.

Second slice can then tackle Banks + Terry together as Chance interception rules, followed by Waddle + Ellen as movement/transformation rules.
