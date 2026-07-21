# Kickoff Clash V6 — Spec Decisions (sign-off gate)

**Status: APPROVED — owner sign-off 2026-07-20, with refinements to A2 / A3 / D2 folded in below. This is the committed direction; the build proceeds from here.**

Companion to `KICKOFF_CLASH_V6_CLAUDE_HANDOFF.md`. The handoff's governing clause says:
*"If a rule is ambiguous, choose the simplest implementation that preserves blind simultaneous
deployment and deterministic receipts. Document the assumption rather than expanding scope."*
This file is that documentation, resolved **up front** so the build is unambiguous. Every decision
below has a **default I will build** and, where the call is a matter of taste, the **flip cost** of
overriding it. Read it, then approve or mark changes.

Scope reminder: V6 is built in isolation behind `/lab/match-v6` and does not touch the live `SCORING_V2` game
(`src/lib/match-v5.ts`, `MatchPhase.tsx`) *during the build*. Per the owner's D2 call, V6 is now the direction
of record and the six-contest `src/engine-v2/` + parked `src/engine/` are dead (removal scheduled once the lab
route is playable); the live game keeps running only until V6 is ready to replace it.

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

### A2. Chance → goal conversion — d6 only, skill lives in stacking the odds  *(owner-refined)*
**Decision.** Conversion is **always** the d6: each surviving chance rolls one d6 and scores on its current
scoring faces (default `[6]`). **There are no guaranteed goals, ever** — the single die *is* the football
variance. Skill expresses by **stacking a chance toward near-certainty without ever reaching it**, via three
levers:
1. **More dice** — raise sector ATT past each 5-threshold (`floor(ATT/5)`), plus rare `add_chance` actions.
2. **Better faces** — `improve_die_faces` widens the scoring set for a chance/sector (`[5,6]`, then `[4,5,6]`).
   This is a **primary, cross-rarity** skill lever (conditional), *not* rare — it is where most skill lives.
3. **Rerolls** — `reroll_die` re-rolls a miss (consumes one extra RNG value).

The gradient this produces: one unbuilt chance ≈ **17%** (a long shot); a fully-built sector (4 dice, faces
`[4,5,6]`, one reroll) ≈ **95%+**, but never 100%. Building toward the high end is the game.
**Rationale.** The owner's call: guaranteed-goal flooring is explicitly rejected; keeping conversion on the die
preserves the sport's variance while the *action stack* — dice count × face quality × rerolls — carries the
skill. So the `improve_die_faces` / `reroll_die` palette is **first-class, not garnish**; only *directly
adding* a chance stays rare/expensive/legendary (per the handoff's stat-budget note).
**Removed.** The earlier pluggable `V6_BALANCE.conversion` strategy and its `floor_plus_d6` alternative are cut.

### A3. Substitution placement — free placement with an out-of-position penalty  *(owner-refined)*
**Decision.** When you sub, the incoming bench card takes the **slot and sector of the card it replaces** — so
you can place any card anywhere (free placement). Each card has a natural `sector`; whenever a card's *current*
sector ≠ its natural sector it suffers a flat **out-of-position penalty** (`V6_BALANCE.outOfPositionPenalty`,
default **−2 ATT / −2 DEF**), applied uniformly to starters and subs, and to cards relocated by a `move_sector`
action. Threshold math floors effective ATT/DEF at 0. The other constraints are the handoff's: outgoing active,
incoming unused, each card once, order explicit, total cost ≤ energy.
**Rationale.** Directly mirrors the live game's wrong-flank −2/−2. Free placement stays maximally expressive
(you *can* plug a hole in a weak sector with an off-position card) but is no longer consequence-free — doing so
costs stats, so playing a card in its natural sector is rewarded without being mandatory. Position/role beyond
sector stays cosmetic in the prototype.
**Tunable.** Penalty magnitude lives in balance config; flat for any mismatch now, with adjacent-vs-opposite
gradation (centre is adjacent to both wings) noted as a later refinement if the flat value proves too blunt.

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

### D2. V6 is the direction — metrics are tuning targets, not a gate  *(owner-refined)*
Owner decision this session: **V6 is the direction of record. The old engines are dead.** The six-contest
`src/engine-v2/` direction and the parked `src/engine/` get no further investment and are slated for removal
once `/lab/match-v6` is playable (kept temporarily only so `npm test` and `npm run build` stay green through
the transition — not deleted mid-build). The live `SCORING_V2` root game keeps running until V6 is mature
enough to replace it, per the handoff's own "don't break live" constraint.

The former "gate" numbers become the **balance targets we tune V6 toward** (not a go/no-go against a rival
direction). We still watch them because the repo already holds one tombstone (`/rebuild` → `src/engine/`) and
a badly-tuned V6 helps no one:
- average total goals **2.2–3.2**, draw rate **20–35%**, no manager matchup consistently **>55%**;
- **threshold changes in ≥70%** of substitution windows;
- **decision divergence** — the AI's best sub differs from "do nothing" in ≥70% of windows;
- **lead-stickiness** — P(first scorer wins) **< ~65%** (guards against a priority snowball, per A1);
- **[given A2] a scoring-skill gradient** — a well-built sector's P(goal) must dominate an unbuilt one, i.e.
  dice/face/reroll stacking (not luck alone) moves the win rate.

### D3. Delivery order — engine + sim before any UI
Build the handoff's commits **1–5 (engine + AI + 10k-match sim) first, with no UI**, and read the sim report
before spending on commits 6–8 (the `/lab/match-v6` mobile UI). V6 is the committed direction either way; this
ordering just means we tune the model against the D2 targets on cheap headless runs before investing in pixels.

---

## Part E — Sign-off log

Owner sign-off **2026-07-20**:
- **A3** → free placement **with** an out-of-position penalty (−2/−2 default). Folded into A3 above.
- **A2** → **no** guaranteed goals; the d6 is the only converter; skill = stacking dice count + scoring faces +
  rerolls toward near-certainty. The pluggable-conversion idea is dropped. Folded into A2 above.
- **D2** → V6 **is** the direction; the old engines are dead; the metrics are tuning targets. Folded into D2 above.

Build proceeds: this doc committed, then handoff commits 1–5 (engine + sim), then 6–8 (lab UI).
