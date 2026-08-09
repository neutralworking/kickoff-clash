# Kickoff Clash V8 — Expansion Batch 05, Slice A

Date: 2026-08-09  
Branch: `claude/generated-tactical-window-6dxfay`  
PR: #106 (draft; base PR #105 remains draft / unmerged / untouched)

## Objective

Start Batch 05 from source truth rather than inventing mechanics or calibration values, then implement only the clean contracts whose football identity, V8 consequence and interaction ordering are already defensible.

No global scoring, Energy, Tactical base values, reference-squad composition, or existing player ATT / DEF / Cost was changed.

## Source-first audit

Eight source-grounded players were selected from the Card Design Tracker and checked against the existing KC reconciliation data before runtime work:

1. Peter Shilton — **SHUT THE ANGLE**
2. Paul McGrath — **AERIAL COMMAND**
3. Roberto Carlos — **THUNDERBOLT**
4. Ole Gunnar Solskjær — **SUPERSUB**
5. Tony Adams — **SKIPPER**
6. Ronaldinho — **SHOWBOAT**
7. Paul Scholes — **HOLLYWOOD BALL**
8. Shunsuke Nakamura — **DEAD BALL ARTIST**

The audit keeps the established quality test:

- recognisable thing happening on the pitch;
- strongly associated with the source player;
- consequence follows naturally in V8's DEF / MID / ATT + Tactical grammar;
- authoritative ATT / DEF / Cost must exist before runtime promotion;
- avoid implementing a new player as a disguised duplicate of an existing Action.

## Slice A — runtime-ready

Four contracts were clean enough to implement immediately.

### Peter Shilton — SHUT THE ANGLE

> **Ongoing: The first opposing Through Ball played in ATT each period has −3 ATT.**

Replaces the old non-football `RECORD CAP` direction.

Reconciliation values used unchanged:

- GK
- 0 ATT
- 11 DEF
- Cost 4

### Paul McGrath — AERIAL COMMAND

> **Ongoing: The first opposing Cross played in ATT each period has −3 ATT.**

Reconciliation values used unchanged:

- CB
- 1 ATT
- 10 DEF
- Cost 3

Shilton and McGrath intentionally share one typed-Chance suppression primitive rather than two bespoke mechanics.

### Roberto Carlos — THUNDERBOLT

> **On Reveal: If played in MID, add a Long Shot to your hand with +3 ATT; this loses 3 DEF this period.**

Reconciliation values used unchanged:

- LB / LWB
- 4 ATT
- 6 DEF
- Cost 3

This preserves the source card's attack / defence trade-off while removing obsolete wide-slot geometry.

The generated Long Shot follows the established timing contract:

- generated in the current period;
- playable immediately in the Generated-Tactical Window;
- if held, ordinary commitment begins next period;
- +3 ATT rider remains attached to the Tactical instance;
- Carlos receives a real −3 DEF period modifier.

### Tony Adams — SKIPPER

> **Ongoing: Your other defenders have +2 DEF.**

Reconciliation values used unchanged:

- CB
- 1 ATT
- 10 DEF
- Cost 3

The aura:

- excludes Adams himself;
- excludes goalkeepers;
- applies to friendly defender cards across the board;
- disappears when Adams' Action is suppressed;
- is rebuilt before older expansion ongoing comparisons such as Cannavaro — READS IT EARLY.

That last ordering is deliberate: Cannavaro should compare opposing ATT against the already-organised back-line DEF, not gain SKIPPER after making his decision.

## Typed-Chance suppression ordering

The most important engine work in this slice was ordering, not the −3 number.

The correct sequence is:

```text
Tactical transformation
→ friendly specialist / Chance enhancement
→ Shilton / McGrath typed suppression
→ threshold / once-match defensive saves
```

This matters for existing cards.

### Shilton + Gordon Banks

A Through Ball can begin above the IMPOSSIBLE SAVE threshold, be reduced by SHUT THE ANGLE below 4 ATT, and therefore **not spend Banks**.

The test explicitly locks that behavior.

### McGrath + Ali Daei

POWER HEADER marks the first Cross ATT as protected.

AERIAL COMMAND still consumes its first-Cross suppression attempt, but cannot reduce that protected ATT. The next Cross is therefore not suppressed by McGrath.

This matches the existing BLACK SPIDER convention: an attempted defensive reaction can be consumed even when the attack has explicit suppression protection.

## Runtime layering

Batch 05 does not rewrite the old Batch 04 pipeline.

For Chance resolution, the Batch 05 wrapper temporarily defers Gordon Banks / John Terry, lets the established friendly enhancement / transformation pipeline resolve, then restores their live counters and applies:

1. typed Chance suppression;
2. Gordon Banks — IMPOSSIBLE SAVE;
3. John Terry — HEAD WHERE IT HURTS.

This keeps existing Batch 04 semantics while inserting the new defensive layer at the correct causal seam.

## Mixed-XI cohort

The integration harness now contains **34 runtime-ready expansion cards** across four integration-only XIs:

- `mix_alpha`
- `mix_beta`
- `mix_gamma`
- `mix_delta`

`mix_delta` introduces the Batch 05 Slice A cards while retaining existing expansion cards around them.

These fixtures remain separate from the six accepted `V8_CALIBRATION_SQUADS`; no historical balance matrix or archetype result is changed by the larger-roster compatibility gate.

## Explicit blockers

The integration module now distinguishes source blockers from mechanic/design blockers.

### Missing authoritative stats

Still blocked as `stats_required`:

- N'Golo Kanté
- Mesut Özil

Both were rechecked against the Card Design Tracker plus `kc_player_roster_reconciliation_view` and `kc_player_cards`. No authoritative KC ATT / DEF / Cost exists, so no calibration values were invented.

### Batch 05 primitive / design work

Still deliberately **not runtime-ready**:

#### Ole Gunnar Solskjær — SUPERSUB

> On Reveal: If played in P3 or P4 while losing, gain +4 ATT this period and add a Through Ball to your hand.

Needs real match-score context during reveal in all coordinators before implementation.

#### Ronaldinho — SHOWBOAT

> On Reveal: 50%: +6 ATT this period. Otherwise −2 ATT this period.

Needs a deterministic / seeded Action-RNG primitive before entering replayable calibration tests.

#### Paul Scholes — HOLLYWOOD BALL

The obvious V8 translation currently collides with Pirlo — DIAGONAL SWITCH. Keep the strong name / identity, but redesign the consequence rather than shipping a duplicate.

#### Shunsuke Nakamura — DEAD BALL ARTIST

The tracker provides the identity but not an effect. The current Long Shot + Corner choice proposal is intentionally still mechanic-design work; do not treat it as source-authoritative or balance-ready.

## Verification

Code head: `7f565147d5483f01ae813e1948066db5f1ae20b3`  
Verify: **#405 / run `31328998144`**

Passed:

- focused Vitest gate, including Batch 05 audit/runtime and 34-card mixed-XI integration;
- full Vitest regression visibility;
- V8 calibration matrix evidence generation;
- TypeScript;
- changed-file lint;
- full lint visibility;
- static export;
- Chromium installation and static server;
- mobile typed-Chance browser checks;
- mobile V8 match-lab smoke checks.

Workflow conclusion: **success**.

## State after Slice A

Do not reopen the four implemented cards for numerical balance from isolated tests.

The next useful work is to resolve the remaining Batch 05 primitives in this order:

1. define a deterministic Action-RNG context that can support SHOWBOAT without breaking replayability;
2. pass match-score context into reveal resolution so SUPERSUB can be implemented honestly;
3. redesign HOLLYWOOD BALL so it does not clone DIAGONAL SWITCH;
4. only then decide whether DEAD BALL ARTIST's proposed set-piece choice deserves implementation.

Continue adding promoted cards to mixed-XI integration before drawing any balance conclusions from them.
