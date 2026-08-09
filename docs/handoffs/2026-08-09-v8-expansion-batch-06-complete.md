# Kickoff Clash V8 — Expansion Batch 06 Complete

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base PR #105 remains draft / unmerged / untouched)

## Objective

Continue the real-player V8 Action expansion using the same source-first standard established in Batch 05:

1. recognizable on-pitch football Action first;
2. strong source-player association;
3. consequence that follows naturally from V8's DEF / MID / ATT + Tactical grammar;
4. Card Design Tracker supplies Action identity;
5. KC reconciliation supplies ATT / DEF / Cost;
6. no invented player values;
7. no generic database Action text silently replacing stronger tracker work;
8. runtime promotion only after focused interaction coverage;
9. mixed-XI compatibility before balance conclusions.

No global scoring, Energy, goal-band, reference-squad composition, or accepted player value was tuned in this batch.

## Source audit

Eight Batch 06 cards were selected and all eight are now `runtime_ready`:

- Carli Lloyd
- Carlos Valderrama
- Christian Eriksen
- Caroline Graham Hansen
- Jari Litmanen
- Keira Walsh
- Rory Delap
- Arjen Robben

Manuel Neuer, Virgil van Dijk and Éric Cantona were considered during source selection but excluded because neither the KC reconciliation view nor the underlying KC card table contained authoritative KC ATT / DEF / Cost. No temporary values were invented.

The two older expansion source-stat blockers remain:

- N'Golo Kanté
- Mesut Özil

## Final Batch 06 cards

### Carli Lloyd — HALFWAY HIT

> **Ongoing: Long Shots played here have +4 ATT. Your first Long Shot here each match costs 0.**

KC values:

- 6 ATT
- 4 DEF
- Cost 3

The V8 primitive already existed below the card registry. Batch 06 registers the card and locks the intended distinction:

- every local Long Shot receives +4 ATT;
- only the first local Long Shot in the match is free.

### Carlos Valderrama — PAUSE AND SLIP

> **On Reveal: Add a Through Ball to your hand. If you already have a player in ATT, give it +2 ATT.**

KC values:

- 9 ATT
- 2 DEF
- Cost 4

The board-conditioned Through Ball generator already existed in the V8 reveal path and is now reachable through the real card registry.

### Christian Eriksen — WHIPPED DELIVERY

> **On Reveal: Add a Corner to your hand. Give it +1 ATT for each CB you have in ATT.**

KC values:

- 8 ATT
- 3 DEF
- Cost 4

The generated Corner snapshots friendly CBs committed in ATT. This creates a real positional trade-off rather than simply adding a set-piece stat bonus.

### Caroline Graham Hansen — ONE ON ONE

> **The first opposing defender Action each period that targets this player is ignored; gain +2 ATT this period.**

KC values:

- 10 ATT
- 1 DEF
- Cost 4

Batch 06 generalized the existing BERBA SPIN target-interception seam into a shared defender-target interception layer.

Rules locked by tests:

- the source must be an opposing defender;
- the first qualifying targeted Action each period is ignored;
- Hansen gains +2 ATT for that period as her own modifier;
- an ignored ongoing source stays source-bound as ignored for the rest of that period, so later board refreshes cannot silently reapply the same Action;
- a second, different defender Action can still target Hansen normally;
- Gentile MAN MARKER can be intercepted without disabling ONE ON ONE itself;
- BERBA SPIN retains its existing movement behaviour on the shared hook.

### Jari Litmanen — KILLER PASS

> **End of Period: If you won MID, add a Through Ball to your hand. Give it +1 ATT.**

KC values:

- 9 ATT
- 2 DEF
- Cost 4

The existing period-end MID-winner hook generates the enhanced Through Ball only for a real MID win; a drawn MID produces no reward.

### Keira Walsh — BEAT THE PRESS

> **Ongoing: The first opposing Trigger Press each period adds a Through Ball to your hand with +2 ATT.**

KC values:

- 4 ATT
- 7 DEF
- Cost 3

This is press resistance through progression rather than immunity:

- Trigger Press itself still resolves;
- Walsh exploits the space behind the first opposing press each period;
- the reward is a +2 ATT Through Ball;
- suppression disables BEAT THE PRESS normally;
- the Action is mechanically distinct from ESCAPE THE PRESS, LA CROQUETA and ONE ON ONE.

Generated-Tactical Window behaviour is explicit:

- a window-played Trigger Press still triggers BEAT THE PRESS;
- the newly generated Through Ball cannot be appended to the already-fixed blind window play list;
- it remains in hand with ordinary generated-card timing for the next commitment.

### Rory Delap — HURLER

> **End of Period (P1–P3): Add a Long Throw to your hand.**

KC values:

- 5 ATT
- 5 DEF
- Cost 3

A long throw is not treated as a renamed Cross or Corner. Batch 06 introduces **Long Throw** as a first-class typed Chance.

Long Throw baseline:

- Cost 1
- +2 ATT
- ATT-only
- `isChance: true`
- generic V8 Chance / cancellation / goalkeeper pipeline
- no bespoke scoring privilege

HURLER generates one Long Throw after P1, P2 and P3 while Delap's Action is active. P4 intentionally generates nothing because no next commitment window remains.

The neutral Cost 1 / +2 ATT baseline deliberately matches the ordinary Cross / Through Ball power floor. Specialist or package tuning is deferred until larger-roster evidence exists.

### Arjen Robben — CUT INSIDE

> **Ongoing: Your first Cross played in ATT each period becomes a Long Shot before it resolves.**

KC values:

- 10 ATT
- 1 DEF
- Cost 4

V8 no longer has wide-versus-centre lateral sectors, so CUT INSIDE translates the lost geometry into Chance identity:

```text
wide-delivery identity: Cross
→ Robben cuts inside
→ shot identity: Long Shot
```

Important constraints:

- CUT INSIDE adds **no ATT**;
- original paid Cost is preserved;
- existing costModifier / attModifier / cancellation metadata are preserved;
- only the first Cross in ATT each period is transformed;
- the second Cross remains ordinary unless another Action transforms it.

Transform ordering is deterministic:

1. pending movement-specific transformation such as Waddle;
2. player-specific CUT INSIDE;
3. generic Alexia / Pirlo transformation layer.

Therefore:

- a pending Waddle transform takes priority and does not consume CUT INSIDE;
- CUT INSIDE outranks Alexia/Pirlo for the Cross it transforms;
- generic transforms remain available for later Chances.

This keeps Robben distinct from:

- Alexia Putellas — non-Through-Ball → Through Ball;
- Pirlo — MID Chance → ATT / Cross;
- Waddle — movement-armed Cross transformation;
- Ellen White — once-match Through Ball → boosted Long Shot.

## Generated-Tactical Window routing

During Batch 06 a production-path gap was identified before acceptance: the higher Batch 06 Tactical wrapper initially delegated the Generated-Tactical Window back through Batch 05, which would have allowed window-played generated Tacticals to bypass CUT INSIDE and BEAT THE PRESS.

The window now preserves the accepted utility-before-Chance ordering but routes every actual play through the current Batch 06 `playCalibrationTactical` wrapper.

Dedicated tests prove:

- a same-period generated Cross played in the window becomes a Long Shot through CUT INSIDE while preserving paid Cost;
- a Trigger Press played in the window activates BEAT THE PRESS;
- Walsh's newly generated Through Ball does not mutate the fixed blind window play list.

## Tactical grammar

V8 now has eight Tactical definitions:

Chance types:

1. Cross
2. Through Ball
3. Long Shot
4. Corner
5. Penalty
6. Long Throw

Utility Tacticals:

7. Offside Trap
8. Trigger Press

The older integration baseline that explicitly asserted seven Tactical definitions was updated to eight. Long Throw is intentionally part of the public Tactical registry rather than hidden from baseline tests.

## Mixed-XI integration state

The expansion compatibility layer now contains **46 runtime-ready cards**.

Because 46 distinct ready cards can no longer be represented honestly in four 11-card XIs while preserving a real goalkeeper and useful interaction space in every fixture, the integration layer now contains **five** mixed XIs.

These fixtures remain integration-only. They do not modify the six accepted `V8_CALIBRATION_SQUADS` or historical balance evidence.

Current expansion state through Batch 06:

- runtime-ready: **46**
- source-stat blockers: **2** — Kanté, Özil
- primitive/design blockers: **0**

The original Alpha fixture remains intentionally unchanged with only three ATT players so the Waddle MID → ATT movement interaction remains physically possible.

## Verification history

Several intermediate runs were useful evidence rather than hidden failures:

- **Verify #445 / run `31331382971`** — fully green for the first five Batch 06 cards / 43-card cohort.
- **Verify #455 / run `31331848333`** — Walsh focused gate green before later commits superseded the broad run.
- **Verify #463 / run `31332108694`** — exposed only a stale baseline assertion expecting seven Tactical definitions after Long Throw became the eighth; Batch 06 runtime tests themselves passed. Baseline was corrected to eight.

## Final verification

Final gameplay/code head before this documentation commit:

`770134b5f9952bddd384613f278d0ba020e58652`

Verify:

- **#474**
- run **`31332692032`**
- workflow conclusion: **success**

Passed:

- focused Vitest gate including:
  - complete Batch 06 source audit;
  - Lloyd / Valderrama / Eriksen / Litmanen dormant primitives;
  - Graham Hansen defender-target interception;
  - Walsh Trigger Press counter-progression;
  - Delap Long Throw generation;
  - Robben commitment transform ordering;
  - Robben / Walsh Generated-Tactical Window routing;
  - eight-Tactical baseline;
  - complete 46-card mixed-XI compatibility;
- full Vitest regression visibility;
- V8 calibration evidence generation;
- TypeScript;
- changed-file lint;
- full lint visibility;
- static export;
- Chromium setup / static server;
- V7 mobile typed-Chance browser checks;
- V8 mobile match-lab smoke checks.

## Freeze / next direction

Batch 06 is complete.

Do not reopen these eight Actions for isolated numerical tuning before there is larger-roster evidence. In particular, do not immediately tune Long Throw away from its neutral Cost 1 / +2 ATT baseline merely because it is new.

Next useful slice: **Batch 07 source-first Action audit**.

Use the same expansion rules:

1. choose a diverse set of recognizable players from the tracker;
2. reject biography/nickname Actions that do not describe football behaviour;
3. recover authoritative KC ATT / DEF / Cost before promotion;
4. prefer existing reusable primitives where they fit honestly;
5. add new grammar only when the football identity genuinely requires it;
6. maintain mixed-XI compatibility coverage;
7. do not turn the expansion pass into a global balance pass.
