# V8 expansion Batch 02 — runtime slice 01 — 2026-08-09

## Scope

Continue the 40-player Action expansion by reusing Batch 01 engine primitives before adding new subsystems. This slice adds four playable mixed-XI cards while leaving frozen Energy, +7 scoring, Tactical base values, compact package balance and the original 30-card Action-quality decisions unchanged.

Tracker owns current Action/name design. Where Tracker ATT/DEF cells are blank, existing KC reconciliation values may supply frozen lab stats; no values are written back to the Tracker in this slice.

## Accepted/runtime-ready

### Anatoliy Tymoshchuk — STEP IN

Lab card:
- Match name: Timoshik
- DM / CM
- Cost 2 from Tracker
- ATT 4 / DEF 7 from reconciliation

Action:
> **Ongoing: While played in MID, the highest-ATT opposing midfielder here has −3 ATT.**

Implementation:
- reuses the dynamic bound-target refresh proven by Ashley Cole
- the old target's −3 modifier is removed before rebuilding
- if a stronger MID-capable opponent enters, STEP IN retargets rather than stacking stale debuffs
- no effect while Tymoshchuk is outside MID

### Alessandro Nesta — TIMED SLIDE

Lab card:
- Match name: Nestor
- CB
- Cost 4 from Tracker
- ATT 1 / DEF 10 from reconciliation

Action:
> **Cancel the first opposing Through Ball here each period.**

Implementation:
- typed-Chance cancellation primitive
- only consumes on an otherwise-resolving cancellable Through Ball
- a second Through Ball in the same period resolves normally
- period reset restores TIMED SLIDE
- uncancellable/already-cancelled Through Balls do not consume the trigger
- routed through direct, committed and Generated-Tactical Window resolution paths

### Brian Laudrup — GLIDING RUN

Lab card:
- Match name: Lauda
- WF / AM
- Cost 4 / ATT 10 / DEF 1 from reconciliation

Action:
> **Moveable once per period to an adjacent zone. Your first Chance in the destination this period cannot be cancelled.**

Implementation:
- once-per-period adjacent movement
- destination is stored as a one-use period protection
- first friendly Chance played in that destination is made uncancellable
- protection is consumed by that Chance; later Chances are ordinary
- move allowance resets at period end

### Edgar Davids — PITBULL

Lab card:
- Match name: Danvers
- CM / DM
- Cost 3 / ATT 4 / DEF 6 from reconciliation

Action:
> **The first time each period an opposing midfielder moves out of this zone, follow them and give them −2 ATT this period.**

Implementation:
- movement-event listener on the public V8 movement path
- only MID-capable opposing movers qualify
- Davids must be in the mover's source zone and have room in the destination
- Davids follows physically into the destination
- mover receives −2 ATT for the period
- once-per-period trigger resets normally

Regression example:
- Abedi moves MID→ATT: JINKING RUN gives +4 ATT, PITBULL then gives −2 ATT, so Abedi ends the period at printed +2
- PITBULL expires at period end while JINKING RUN remains, restoring printed +4

## Public runtime routing

New wrapper:
`src/engine-v8/calibration-expansion-runtime.ts`

The playable `calibration-engine` now routes:
- movement through expansion movement listeners
- direct Tactical plays through expansion Chance rules
- committed Tacticals through the same expansion resolver
- Generated-Tactical Window plays through the same expansion resolver

This avoids cards working only in helper/unit-test paths.

## Batch 02 remaining

### Bobby Moore — READ THE RUN
Needs shared opposing ATT-gain event listener.

### Andy Robertson — RECOVERY RUN
Needs the same ATT-gain listener with wide-attacker filtering translated to V8 role/position semantics.

### Johan Cruyff — TOTAL FOOTBALL
Needs OOP penalty evaluation centralized/wrapped so the rule can be disabled for the friendly team while Cruyff's Action is active.

### Mesut Özil — INVISIBLE
Action contract exists, but current Tracker Cost/ATT/DEF are blank and no reconciliation row was found. Do not invent stats.

## Verification

Gameplay head: `e77c8a9134f41bcd18692490f1cfab8df535e3cb`

Verify #306 / run `31286492226`: **success**.

Passed:
- focused Vitest gate including Batch 02 regressions
- full Vitest regression visibility
- calibration matrix artifact upload
- TypeScript
- changed-file lint
- full lint visibility
- static export
- Chromium installation
- V7 typed-Chance browser checks
- V8 mobile match-lab browser checks

No frozen balance constants changed.
