# Kickoff Clash V6 — Spec Decisions (sign-off gate)

**Status: DRAFT — awaiting owner sign-off. Nothing is built from this until it is approved.**

Companion to `KICKOFF_CLASH_V6_CLAUDE_HANDOFF.md`. The handoff's governing clause says:
*"If a rule is ambiguous, choose the simplest implementation that preserves blind simultaneous
deployment and deterministic receipts. Document the assumption rather than expanding scope."*
This file is that documentation, resolved **up front** so the build is unambiguous. Every decision
below has a **default I will build** and, where the call is a matter of taste, the **flip cost** of
overriding it. Read it, then approve or mark changes.

Scope reminder: V6 is an **isolated lab prototype** behind `/lab/match-v6`. It does not touch the live
`SCORING_V2` game (`src/lib/match-v5.ts`, `MatchPhase.tsx`) or the headless six-contest `src/engine-v2/`.

---

## Part A — Design-critical decisions (these change how the game *feels*)

### A1. Reveal order — what "priority" actually buys you
**Decision.** Plans lock blind and simultaneously and **never change after lock** (per handoff). Priority
only sets *resolution order*: the priority side resolves its whole locked sequence first
(`when_subbed_off` → move → incoming `on_reveal`), then the other side resolves its whole sequence.
Card effects that read the board evaluate against **the board state at the instant they resolve** — so a
card revealed *second* can see the enemy cards that just landed; a card revealed *first* cannot. That is
the *only* mechanical consequence of order, and it is card-text-dependent, so neither first nor second is
strictly better.
**Rationale.** Matches the handoff's step order and its "second side does not change its locked move" rule,
and explains the mockup framing "You reveal second" as a (conditional) information edge rather than a loss.
**Watch.** Because priority is granted to the **board leader** (more sector ATT+DEF), there is a theoretical
snowball. We do not fix it pre-emptively; instead the sim reports **lead-stickiness** (see D2) and we revisit
only if it shows a runaway.

### A2. Chance → goal conversion (the #1 fun/skill risk) — made pluggable, defaults to the handoff
**Decision.** Keep the handoff's model as the **default**: each surviving chance rolls one d6, a natural 6
scores. But route it through a single strategy field so the sim can A/B it **without engine changes**:
```ts
V6_BALANCE.conversion = 'd6_six_only'        // DEFAULT — exactly as handoff
// alt for the sim only: 'floor_plus_d6'     // every N net chances = 1 guaranteed goal, d6 for the remainder
```
**Rationale.** The whole strategic layer (thresholds, reveals, priority) only changes the *number* of dice,
not the 1/6 per-die odds — so two players who each earn 3 chances are on a coinflip. That may be the intended
"football is random" flavour, or it may drown the deep decisions in variance. Making conversion pluggable
costs nothing and lets the 10k-match sim answer it empirically instead of us guessing. **The default ships as
written**; the alternative is a sim experiment, not a spec change.
**Flip cost.** Zero — one config value.

### A3. Sector compatibility for substitutions — simplest legal placement
**Decision.** An incoming bench card may replace **any** active card you choose. The incoming card occupies
**its own printed `sector`** (not the outgoing card's), so subbing can reshape sector composition over the
match. The only hard constraints are the handoff's: outgoing is active, incoming is unused, each card appears
once, order is explicit, total cost ≤ current energy. **Role/position is cosmetic in V6** — sector + ATT/DEF
are the only things the engine reads.
**Rationale.** The handoff defers this to "prototype fixture rules" that don't exist, i.e. hands us the call,
and its governing clause says pick the simplest. Free placement is the simplest legal rule and the most
expressive; it avoids inventing a position-matching matrix the prototype was told not to build.
**Flip cost.** Low. Strict same-sector subs are a one-line validator flip (`plan.in.sector === plan.out.sector`)
if you'd rather sectors be sticky. **← This is the one A-level call I'd most like you to confirm.**

### A4. Multiple substitutions in one break — explicit ordered pairing
**Decision.** A break plan is an **ordered list of `{ out, in }` pairs**. UI: tap a bench card, then tap the
active card it replaces, to add a pair; repeat; reorder by drag. A running energy meter blocks the plan the
moment the summed cost would exceed current energy. Each pair shows its own threshold delta on the receipt.
`SubstitutionPlan = { pairs: SubPair[] }`; array order **is** the resolution order.
**Rationale.** Satisfies the handoff's "any number of subs if affordable" + "order is explicit," and replaces
the break mockup's single-line plan tray (which showed one pairing while two cards were selected — a mockup
stub, now superseded).

---

## Part B — Engine-precision decisions (determinism-critical; no taste involved)

### B1. Chance cap ordering
Apply in the handoff's resolver order: create natural (`floor(ATT/5)`) → cancel with `floor(DEF/5)` →
apply post-cancellation action effects → **cap the natural (created−cancelled) token count at 4 per sector** →
roll. Tokens created by an explicit `add_chance` action are tagged and allowed to push a sector to **5** (the
"+1 over natural cap" exception); `cancel_chance` removes specific tokens *before* the cap is measured.

### B2. RNG order and attribution independence
One seed per match; a single mulberry32 stream with an explicit cursor. Fixed consumption order:
for each sector `left → centre → right`, roll surviving tokens in creation order; a `reroll_die` consumes the
**next** value immediately after the die it rerolls. **Attribution consumes no value from the roll stream** —
scorer/saver selection uses a *separate* derived substream keyed by `(seed, period, sector, tokenIndex)`, so
it is deterministic, still ATT/DEF-weighted, and — as the handoff demands — **cannot affect the goal result**.

### B3. Effect durations
Two durations suffice for the prototype:
```ts
type EffectDuration = 'period' | 'ongoing';
```
`'period'` effects expire at period end; `'ongoing'` effects are recomputed each period and vanish when their
source card leaves the board or bench. `game_start` triggers fire **once** at kickoff and declare one of these
durations (usually `'ongoing'`). This covers the handoff's two tests ("temporary expires after the period",
"ongoing disappears when source leaves").

### B4. On-Bench effects
An `on_bench` effect contributes to board/threshold totals **only while its card sits unused on the bench**,
and is removed the moment that card is subbed on (handoff test: "On Bench stops when card enters"). A card that
stays benched all match keeps contributing all match.

### B5. Priority computation
Initial priority is seeded-random and shown pre-kickoff. After each period: a sector is "controlled" by the
side with the greater active `ATT + DEF` in it; **more sectors controlled → priority**; tie → greater total
`ATT + DEF` across all sectors; tie → priority alternates from the previous period.

### B6. Loop safety
Action resolution runs through an explicit event queue with an event-depth guard and action-instance IDs, so a
reactive chain (`when_subbed_on` → effect → …) cannot recurse infinitely (handoff test: "event-depth guard
stops recursive loops"). Never mutate a fixture card object; return new immutable state + ordered `RevealEvent[]`.

---

## Part C — Card & UI decisions

### C1. Two-action legendary layout (fixes a real bug in the mockup)
In the current `kc_v6_card_redesign_mockup.html`, the second (Ongoing) action box **overlaps the corner
ATT/DEF stats** on the full card — there is no vertical room for two actions *plus* corner stats.
**Decision.** On the full/inspect card, when a card has two actions, the ATT/DEF stats move out of the portrait
corners into a compact stat strip **directly above the action stack**. One-action cards keep the corner-stat
treatment. The bench and compact-active variants are unaffected (they already carry stats in a bottom row and
show only the action *prefix*, full text on tap).

### C2. Bench legibility target
Seven bench cards must stay legible across a 390px viewport showing, at minimum: cost, portrait, abbreviated
name, ATT, DEF, action-prefix label/icon (per handoff §6). The break mockup already hits this; hold that bar.

### C3. Goalkeeper / fiction
V6 has **no goalkeeper actor**; saves/blocks are DEF-weighted defender attribution, presentation only. Accepted
as an abstraction. Copy must read naturally regardless of the attributed card's nominal role (a content note,
not an engine concern).

---

## Part D — Governance (so V6 doesn't become the next parked engine)

### D1. Engine map + CLAUDE.md pointer
V6 would be the **fourth** match engine in the repo at once (live `SCORING_V2`; parked `src/engine/`; headless
six-contest `src/engine-v2/`, currently CLAUDE.md's *"direction of record — NW-139"*; new `src/lib/match-v6/`).
V6 **deliberately forks away** from the six-contest model (it's on V6's explicit non-goals list). During the
build I will add a short one-paragraph pointer to the top of `CLAUDE.md` noting V6 is under evaluation behind
`/lab/match-v6` as a *possible* replacement direction, with **no live migration** until a promote decision — so
the next session isn't whipsawed by two conflicting "directions of record."

### D2. Kill/promote gate + two added sim metrics
The repo already contains the tombstone of the last "isolated rebuild we'd playtest before migrating"
(`/rebuild` → `src/engine/`, abandoned). To avoid a repeat, the promote decision is pre-committed:
**V6 becomes a migration candidate only if** the headless sim + one human playtest clear all of —
- average total goals **2.2–3.2**, draw rate **20–35%**, no manager matchup consistently **>55%** (handoff targets);
- **threshold changes in ≥70%** of substitution windows (handoff's decision-relevance metric);
- **[ADDED] decision divergence** — the AI's chosen best sub differs from "do nothing"/a fixed curve in ≥70% of windows (proves board state *drives* the choice, not just that the effect lands);
- **[ADDED] lead-stickiness** — P(team that scores first wins) **< ~65%** (proves it isn't a coinflip-snowball; tests A1's risk).

If the sim shows conversion is pure variance (skill can't move win-rate), we switch A2 to `floor_plus_d6` and
re-run **before** any UI spend. If it still fails, V6 parks — it does not get quietly wired to the live game.

### D3. Delivery order — sim is the go/no-go gate
Build the handoff's commits **1–5 (engine + AI + 10k-match sim) first, with no UI**. The sim report is the gate:
we only spend on commits 6–8 (the `/lab/match-v6` mobile UI) if the model clears D2. This is the handoff's own
ordering, with the gate made explicit.

---

## Part E — Where I need your eyes

Everything above I will build as the stated default. The calls most worth your explicit steer:

1. **A3 — sector compatibility.** Default = free placement (any card replaces any card, keeps its own sector).
   Say the word if you want strict same-sector subs instead.
2. **A2 — conversion default.** Default = pure d6, made pluggable so the sim can test a deterministic-floor
   variant. Confirm you're happy shipping pure d6 as the baseline and letting the sim challenge it.
3. **D2 — promote gate.** Confirm the four-part gate (and the two added metrics) is the bar V6 must clear
   before it's allowed anywhere near the live game.

Approve as-is, or reply with the item numbers you want changed and I'll revise this doc before writing any code.
