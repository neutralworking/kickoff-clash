# Kickoff Clash V8 — Expansion Runtime Batch 04, Slice 02

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base PR #105 remains draft / unmerged / untouched)

## Objective

Complete the three remaining Batch 04 runtime contracts without reopening global balance, Energy, scoring, Tactical values, or the accepted compact reference XIs.

The three open contracts were:

- Bryan Robson — **CAPTAIN MARVEL**
- Chris Waddle — **DROP THE SHOULDER**
- Alan Shearer — **LACES THROUGH IT**

All eight Batch 04 cards are now `runtime_ready`.

## Bryan Robson — CAPTAIN MARVEL

Text:

> **End of Period: If you are losing the match, gain +2 ATT and +2 DEF for the rest of the match.**

The high-level calibration engine already contained the score-context period-end primitive. This slice locked it with focused regression coverage and fixed the playable V8 lab coordinator so it passes the actual post-period banked score into `endV8CalibrationPeriod`.

Semantics:

- evaluates after that period's goals have been banked;
- only triggers while Robson's Action is active and his side is trailing;
- +2 ATT / +2 DEF are real match-lifetime stat modifiers;
- may trigger again at a later period end if still / again trailing;
- no gain while level or winning.

## Chris Waddle — DROP THE SHOULDER

Text:

> **Moveable once per period between MID and ATT. After this moves, your next Chance in the destination this period becomes a Cross before it resolves.**

Implemented as movement plus an armed one-shot destination transformation.

Rules:

- Waddle moves only MID ↔ ATT;
- once per period;
- destination must have room;
- suppression disables the movement Action;
- after movement, the next Chance played in that destination becomes a Cross;
- only that next Chance is transformed;
- the transform preserves the Tactical instance's original paid Cost and modifiers;
- commitment and Generated-Tactical Window use the same path;
- when DROP THE SHOULDER is armed, its signature Cross transform wins over generic Alexia/Pirlo Chance transformation for that play;
- Ellen White's FIRST-TIME LOB is not consumed by Waddle's transformed Chance and remains available for a later Through Ball.

Movement remains visible to reaction mechanics. In particular, Edgar Davids — PITBULL can follow Waddle and apply its normal −2 ATT consequence.

The playable lab no longer hard-codes movement affordance to Cafu / Beckenbauer. It now uses the card's `moveable` status and understands the current per-period / per-match movement counters for Waddle and the existing expansion movers.

## Alan Shearer — LACES THROUGH IT

Text:

> **Your first Chance in ATT each period has +3 ATT, but it cannot be made uncancellable.**

The important implementation choice is to separate **Chance power** from **Chance protection**.

On the first ATT Chance each period:

- +3 ATT is applied to the Tactical instance;
- the Chance is forced into a cancellable state;
- `protectionLocked` prevents later specialist effects from making it uncancellable.

Protection-granting Actions keep their football power bonuses:

- Hegerberg — FRONT-POST DART still supplies +4 ATT, but not uncancellable protection;
- Morgan — CURVED RUN keeps its Through Ball ATT bonus, but not uncancellable protection;
- Panenka — CHIPPED PENALTY keeps +3 ATT, but not uncancellable protection.

This means LACES THROUGH IT does **not** suppress those players or erase their attacking value. It strips only the protection layer.

The Cavani interaction is also explicit: GET ACROSS HIM must not be consumed pretending to protect a Shearer-locked Chance. If that locked Chance is cancelled, Cavani's protection counter/event is restored so his protection remains available for a later eligible Cross.

Defensive reactions such as Schmeichel and Gordon Banks can therefore cancel a Shearer-powered Chance when their normal conditions are met.

## Runtime architecture

This slice preserves the existing separation between:

1. player stat mutation;
2. movement / Action reactions;
3. Tactical transformation;
4. Tactical ATT shaping;
5. protection / cancellation;
6. defensive post-resolution reactions.

No hidden stat buffs or global Tactical rewrites were introduced.

## Focused regression coverage

Batch 04 runtime tests now cover:

- CAPTAIN MARVEL trailing / level / repeat-trigger behavior;
- DROP THE SHOULDER MID ↔ ATT once-per-period movement;
- original paid Cost preservation;
- one-shot destination transformation;
- PITBULL following Waddle;
- Waddle vs FIRST-TIME LOB transformation ordering;
- Generated-Tactical Window parity;
- LACES THROUGH IT first-Chance-only +3 ATT;
- Hegerberg bonus retained while protection is stripped;
- Panenka bonus retained while Banks can cancel;
- Cavani protection not falsely consumed.

The Batch 04 audit contract now reports all eight cards as `runtime_ready`.

## Playable-lab integration

Two coordinator/UI gaps were closed:

1. period-end now receives `{ home: nextHomeScore, away: nextAwayScore }`, so CAPTAIN MARVEL can fire in the real lab path;
2. deployed movement UI now reads `statuses: ['moveable']` rather than a Cafu/Beckenbauer action-key whitelist.

The telemetry panel also surfaces rules-layer contribution deltas introduced by the TOTAL FOOTBALL resolver pass.

## Verification

Code head before this documentation commit: `720978dc67e3aca6ebc104eb8ae42c89401f1e77`  
Verify: **#383 / run `31327687855`**

Passed:

- focused Vitest gate;
- full Vitest regression visibility;
- V8 calibration matrix evidence generation;
- TypeScript;
- changed-file lint;
- full lint visibility;
- static export;
- Chromium installation / static server;
- mobile typed-Chance browser checks;
- mobile V8 match-lab smoke checks.

Workflow conclusion: **success**.

## State after this slice

Batch 04 is complete. Do not reopen these three mechanics merely to tune numbers from isolated examples.

The next useful expansion step is **mixed-XI integration / larger-roster validation**, not another archetype-specific balance pass. Use the expanded real-player pool to expose repeated engine primitives, ordering conflicts, and cards that remain unavailable in realistic deck construction before deciding whether another mechanical primitive is necessary.
