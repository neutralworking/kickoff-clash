# Kickoff Clash V8 — Expansion Batch 06 Slice A

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base PR #105 remains draft / unmerged / untouched)

## Objective

Continue the real-player Action expansion without reopening global V8 balance.

Batch 06 remains source-first:

1. Card Design Tracker defines Action identity;
2. KC reconciliation supplies ATT / DEF / Cost;
3. no invented values;
4. no generic database Action text silently replacing stronger tracker work;
5. reuse existing primitives where they already exist;
6. add a shared primitive only where the Action needs one;
7. keep unresolved designs explicit rather than weakening them to make them playable.

No global scoring, Energy, Tactical base value, reference-squad composition, or accepted Batch 01–05 card value changed.

## Audited Batch 06 cohort

Eight cards were selected:

- Carli Lloyd
- Carlos Valderrama
- Christian Eriksen
- Caroline Graham Hansen
- Jari Litmanen
- Arjen Robben
- Rory Delap
- Keira Walsh

Manuel Neuer, Virgil van Dijk and Éric Cantona were considered but excluded from implementation because neither the reconciliation view nor the underlying KC card table contains authoritative KC ATT / DEF / Cost for them.

## Runtime-ready Slice A

### Carli Lloyd — HALFWAY HIT

> **Ongoing: Long Shots played here have +4 ATT. Your first Long Shot here each match costs 0.**

KC values:

- 6 ATT
- 4 DEF
- Cost 3

The V8 primitive already existed below the card registry. Slice A registers the card and locks the intended distinction:

- every local Long Shot gets +4 ATT;
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

The existing reveal primitive counts friendly CBs committed in ATT and scales the generated Corner. This keeps the effect football-shaped: attacking defenders improve the set-piece delivery but cost defensive position.

### Caroline Graham Hansen — ONE ON ONE

> **The first opposing defender Action each period that targets this player is ignored; gain +2 ATT this period.**

KC values:

- 10 ATT
- 1 DEF
- Cost 4

This required the first genuinely new Batch 06 primitive.

The existing BERBA SPIN layer already intercepted defender Actions after target selection. That hook is now generalized into shared defender-target interception.

ONE ON ONE rules:

- the source must be an opposing defender;
- the first qualifying targeted Action each period is ignored;
- Hansen gains +2 ATT for that period;
- the +2 is Hansen's own modifier, not a reversal of the opposing effect;
- an ignored ongoing source such as Ashley Cole or Tymoshchuk remains bound as ignored for the rest of that period, so a later board refresh cannot silently reapply the same Action;
- a second, different defender Action can still target Hansen normally;
- Gentile MAN MARKER can be intercepted without disabling ONE ON ONE itself.

BERBA SPIN retains its existing movement behaviour on the same shared hook.

### Jari Litmanen — KILLER PASS

> **End of Period: If you won MID, add a Through Ball to your hand. Give it +1 ATT.**

KC values:

- 9 ATT
- 2 DEF
- Cost 4

The existing period-end MID-winner generator is now registered through the real card. A drawn MID produces no reward.

## Mixed-XI compatibility

The integration cohort now contains **43 runtime-ready expansion cards** across four integration-only XIs.

These fixtures remain separate from the six accepted balance squads. They are compatibility / interaction coverage, not balance evidence.

Current expansion state:

- runtime-ready: **43**
- source-stat blockers: **2** — Kanté, Özil
- deliberate Batch 06 design blockers: **3** — Robben, Delap, Walsh

The Alpha fixture was deliberately kept with only three ATT players so Waddle's real MID → ATT movement integration test remains possible. Graham Hansen is covered in the Gamma compatibility XI and has natural-zone behaviour covered separately by focused runtime tests.

## Deliberate design blockers

### Arjen Robben — CUT INSIDE

The tracker identity is excellent, but its source consequence depends on wide-versus-centre geometry removed from V8.

Do not fake CUT INSIDE as ordinary MID → ATT movement. A V8 consequence needs to preserve the idea of turning a wide attacking situation into a direct shooting situation without becoming a duplicate of Ellen White, Waddle, Pirlo or Alexia Putellas.

### Rory Delap — HURLER

The Action identity is strong. The tracker has no consequence; the older KC data says one extra set piece per period.

A long throw is not automatically a Cross or Corner. Runtime promotion is blocked until V8 explicitly decides whether Long Throw deserves its own Tactical / Chance type or another distinct representation.

### Keira Walsh — BEAT THE PRESS

The tracker supplies the strong on-pitch identity but no consequence.

Do not inherit the generic reconciliation `Tempo Breaker` text. The eventual mechanic must remain distinct from:

- Aitana Bonmatí — ESCAPE THE PRESS
- Andrés Iniesta — LA CROQUETA
- Caroline Graham Hansen — ONE ON ONE

## Verification

Verified gameplay head:

`8fbed9c4ece2164cc285d06a0c2a4172024e20ac`

Verify:

- **#445**
- run **`31331382971`**
- conclusion: **success**

Passed:

- focused Vitest gate including both Batch 06 suites and 43-card mixed-XI integration;
- full Vitest regression visibility;
- V8 calibration evidence generation;
- TypeScript;
- changed-file lint;
- full lint visibility;
- static export;
- Chromium setup / static server;
- V7 mobile typed-Chance browser checks;
- V8 mobile match-lab smoke checks.

An earlier Verify #443 exposed two test-fixture bookkeeping issues only: a lexical sorted-list expectation and a full ATT zone preventing Waddle's movement test. Batch 06 runtime itself was 8/8 green in that failed run. Both fixture issues were corrected before #445.

## Next direction

The five accepted Slice A cards are frozen pending larger-roster evidence.

Next work is not numerical tuning. Resolve the three remaining football-grammar questions:

1. CUT INSIDE without lateral sectors;
2. HURLER / Long Throw representation;
3. BEAT THE PRESS without cloning existing evasion Actions.

Only promote them when the consequence is recognisable on the pitch and mechanically distinct in V8.
