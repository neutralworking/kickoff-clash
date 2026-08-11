# Kickoff Clash V8 — Expansion Batch 05 Complete

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base PR #105 remains draft / unmerged / untouched)

## Objective

Complete Batch 05 as a source-first real-player expansion without reopening global balance.

The batch deliberately separated:

1. Action-name / football-identity audit;
2. authoritative ATT / DEF / Cost recovery;
3. reusable engine primitives;
4. focused interaction coverage;
5. mixed-XI compatibility;
6. only then runtime promotion.

No global scoring, Energy, Tactical base values, reference-squad composition, or existing player ATT / DEF / Cost was changed.

## Final Batch 05 roster

All eight audited Batch 05 contracts are now `runtime_ready`.

### Peter Shilton — SHUT THE ANGLE

> **Ongoing: The first opposing Through Ball played in ATT each period has −3 ATT.**

Replaces the old non-football `RECORD CAP` direction with a visible goalkeeping action.

Authoritative reconciliation values:

- 0 ATT
- 11 DEF
- Cost 4

### Paul McGrath — AERIAL COMMAND

> **Ongoing: The first opposing Cross played in ATT each period has −3 ATT.**

Shares the typed-Chance suppression primitive with Shilton rather than duplicating bespoke logic.

Authoritative reconciliation values:

- 1 ATT
- 10 DEF
- Cost 3

### Roberto Carlos — THUNDERBOLT

> **On Reveal: If played in MID, add a Long Shot to your hand with +3 ATT; this loses 3 DEF this period.**

The generated Long Shot is immediately eligible in the Generated-Tactical Window; if held, ordinary commitment starts next period.

Authoritative reconciliation values:

- 4 ATT
- 6 DEF
- Cost 3

### Ole Gunnar Solskjær — SUPERSUB

> **On Reveal: If played in P3 or P4 while losing, gain +4 ATT this period and add a Through Ball to your hand.**

The implementation does not infer losing state from board power. Period-end stores the real banked match score in match context; reveal-time SUPERSUB reads that stored score.

The generated Through Ball follows the standard generated-card timing contract: same-period window eligible, ordinary commitment from the following period if held.

Current authoritative reconciliation values:

- 11 ATT
- 1 DEF
- Cost 4

### Tony Adams — SKIPPER

> **Ongoing: Your other defenders have +2 DEF.**

The aura excludes Adams and goalkeepers, disappears when Adams is suppressed, and is rebuilt before live defensive comparisons such as Cannavaro — READS IT EARLY.

Authoritative reconciliation values:

- 1 ATT
- 10 DEF
- Cost 3

### Ronaldinho — SHOWBOAT

> **On Reveal: 50%: +6 ATT this period. Otherwise −2 ATT this period.**

SHOWBOAT uses a deterministic, namespaced Action-RNG context stored in match state.

Properties locked by tests:

- same seed + same Action namespace reproduces the same outcome;
- unrelated future random Actions cannot perturb SHOWBOAT's sequence;
- repeated rolls advance only that Action namespace;
- suppressed Ronaldinho does not consume an RNG roll.

Current authoritative reconciliation values:

- 10 ATT
- 1 DEF
- Cost 4

### Paul Scholes — HOLLYWOOD BALL

Accepted redesign:

> **On Reveal: If played in MID, add a Cross to your hand. It costs 0 this period.**

The earlier transform/relocate proposal was rejected because it duplicated Pirlo — DIAGONAL SWITCH too closely.

The accepted design makes Scholes a tempo-efficient long distributor instead:

- creates a new Cross rather than transforming an existing Chance;
- `freeThroughPeriod` uses the existing Tactical cost primitive;
- same-period normal commitment remains blocked by generated-card timing;
- the Cross is playable at 0 Energy in the Generated-Tactical Window;
- if held, it returns to normal printed Cost next period.

Current authoritative reconciliation values:

- 5 ATT
- 5 DEF
- Cost 3

### Shunsuke Nakamura — DEAD BALL ARTIST

Accepted V8-specific mechanic design:

> **On Reveal: Add a Long Shot and a Corner to your hand. The first of those you play this period has +2 ATT.**

Important source distinction: the tracker provides the strong `DEAD BALL ARTIST` identity but no source-authored consequence. The Long Shot / Corner choice is therefore an explicit V8 design, not presented as recovered source card text.

Rules:

- generates both Long Shot and Corner;
- both are same-period Generated-Tactical Window eligible;
- they share one first-play +2 ATT counter;
- whichever generated card resolves first receives the bonus;
- the second receives no bonus;
- if both cards are held, the +2 opportunity expires at period end;
- ordinary commitment becomes available next period at normal Cost.

Current authoritative reconciliation values:

- 8 ATT
- 3 DEF
- Cost 4

## New reusable engine contexts / primitives

### Deterministic Action RNG

`calibration-action-context.ts` now provides a namespaced deterministic RNG layer for Actions.

The design avoids one global random stream: each Action namespace advances independently, so adding a later random Action does not silently change existing SHOWBOAT replays.

### Stored banked match score

The same Action-context layer stores real banked match score at period end.

This enables reveal-time score-dependent Actions such as SUPERSUB without coupling them to React/component state or guessing from board strength.

### Typed Chance ATT suppression

Shilton and McGrath share one typed suppression primitive.

Ordering remains:

```text
Chance transform
→ friendly Chance enhancement
→ typed ATT suppression
→ Banks / Terry defensive interception
```

This preserves interaction semantics such as:

- Shilton lowering a Through Ball below Banks' 4-ATT threshold so IMPOSSIBLE SAVE is not spent;
- McGrath attempting but failing to reduce Daei's protected POWER HEADER while still consuming the first-Cross attempt.

### Generated set-piece choice

Nakamura reuses existing Long Shot / Corner Tactical types and one shared period counter rather than introducing a new set-piece Tactical type.

## Mixed-XI integration state

The expansion compatibility layer now contains **38 runtime-ready players** across four integration-only XIs.

These fixtures remain separate from the six accepted `V8_CALIBRATION_SQUADS`; no historical balance matrix or archetype evidence is changed.

Current integration state:

- runtime-ready expansion contracts: **38**
- `stats_required`: **2**
- `primitive_required`: **0** through Batch 05

The two source-stat blockers remain:

- N'Golo Kanté
- Mesut Özil

Both were checked against the Card Design Tracker plus the KC Supabase reconciliation/card tables. No authoritative KC ATT / DEF / Cost exists, so no temporary calibration values were invented.

## Verification

Final Batch 05 gameplay/code head before this documentation commit:

`fd175fe81eb683d1ec7d4b0c032af84392b33f11`

Verify:

- **#426**
- run **`31329945517`**
- workflow conclusion: **success**

Passed:

- focused Vitest gate, including:
  - deterministic Action context;
  - Batch 05 source audit;
  - Shilton / McGrath / Roberto Carlos / Adams runtime;
  - SHOWBOAT / SUPERSUB context runtime;
  - Scholes / Nakamura set-piece runtime;
  - complete 38-card mixed-XI integration;
- full Vitest regression visibility;
- V8 calibration evidence generation;
- TypeScript;
- changed-file lint;
- full lint visibility;
- static export;
- Chromium installation / static server;
- V7 mobile typed-Chance browser checks;
- V8 mobile match-lab smoke checks.

## Freeze / next direction

Batch 05 is complete.

Do not reopen these Actions for isolated numerical tuning before there is larger-roster evidence.

The next useful slice is **Batch 06 source-first Action audit** using the same rules:

1. recognizable football action first;
2. strong source-player association;
3. consequence that follows naturally from V8's DEF / MID / ATT + Tactical grammar;
4. no runtime promotion without authoritative ATT / DEF / Cost;
5. reject obvious duplicates of existing Actions;
6. add promoted cards to mixed-XI compatibility before drawing balance conclusions.

Kanté and Özil remain data work, not engine work.
