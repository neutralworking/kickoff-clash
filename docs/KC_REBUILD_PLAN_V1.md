# KC_REBUILD_PLAN_V1 — end-to-end implementation plan

**Audience:** Claude Code. **Prerequisite reading order:** `KICKOFF_CLASH_DESIGN.md` → `SYNERGY_MODEL_V1.md` → this document → remaining specs as referenced.

**Prime directive:** `SYNERGY_MODEL_V1.md` (SM) is the spine. Where existing code or specs conflict with it, SM wins. The five design laws (SM §1) are lint rules for every PR.

---

## Architecture principles (apply to all phases)

* **Pure engine, dumb UI.** All game logic lives in a pure TypeScript module (`src/engine/`) with zero React/DOM imports. UI consumes engine output; it never computes game state.
* **Deterministic + seeded.** Single seeded RNG injected into the engine. Same seed + same decisions = same match, always. This enables: replay, acceptance tests, daily-seed mode (v2), and bug reports that reproduce.
* **Event log as source of truth.** The engine emits a typed event stream (`WindowGenerated`, `WindowConverted`, `Goal`, `StreakBroken{reason}`, `PostureShift`, `TraitProc`, …). The UI renders the log; the post-match dashboard aggregates it; tests assert on it. Feedback requirements (SM §9) fall out of this for free — do not build them as separate systems.
* **Data over code.** Posture matchup matrix, adherence adjacency tables, manager definitions, trait templates, challenge rules, target curve: all JSON/TS data files under `src/engine/data/`. Balance changes must never require logic changes.
* **Acceptance harness first.** Port `scripts/balance_sim.py` distributions into vitest: run N seeded headless runs, assert the SM §8 distributions (uncommitted median death 5, ~54% of deaths in fixtures 5–7, 0% completion; committed median 9, 41–49% beat rate, per-engine tolerances). These tests are the definition of "the rebuild works."

## Phase 0 — Repo preparation (blocking, do first)

1. Commit to `/docs`: the five existing spec files + `SYNERGY_MODEL_V1.md` + this plan.
2. Update `CLAUDE.md`: `KICKOFF_CLASH_DESIGN.md` is the required first read; add SM and this plan to the reading order; state the SM-wins conflict rule.
3. Add `scripts/balance_sim.py` (the Python sim) as the balance reference; note in its header that the vitest harness is the canonical acceptance gate once Phase 1 lands.
4. Audit pass: inventory `match-v5.ts`, `scoring.ts`, `jokers.ts`, `tactics.ts`, `hand.ts`, `formations.ts` against SM. Output a short `MIGRATION_NOTES.md`: keep / adapt / delete per module. Expect: trigger-hook mapping survives (`kickoff`→`initMatch` etc.), flat-bonus paths deleted, `abilityName`/`abilityText` fields finally get used.

## Phase 1 — Engine spine (revised NW-138)

**Scope change from original NW-138:** the TraitRecord runtime now requires context evaluation and declared-posture state from day one. "Spine" means:

* Context taxonomy as types (SM §2): postures, phases/events, states. Closed unions — adding a context is a deliberate schema change.
* Verb dispatcher over the closed 10-verb palette.
* TraitRecord runtime: evaluate (verb, context, magnitude) records against current match state each increment.
* Posture state machine: default posture, timed-window overrides with revert (SM §3).
* Event generation from the posture matchup matrix (data file).
* Window resolution: `charge + d(die) ≥ threshold` (SM §6), die size mutable by variance verbs.
* Streak system with per-engine contradiction resets and reason-carrying break events.
* Scoring: goals (scoreline) + points (`streak-mult × goal-value`), early whistle, surplus→cash hook.
* Step-resolved match loop: 6 batches × 3 increments, decision points between batches and on window generation.

**Acceptance:** headless match runs end-to-end with a stub manager and stub squad; event log complete; vitest harness green on single-match distribution checks (mean/variance of points at fixed charge, per sim).

## Phase 2 — Managers, tactical deck, adherence

* 10 managers as TraitRecord bundle data files (SM §4 roster). No manager class.
* Manager selection: choice of three at run start (seeded offer).
* Tactical cards: timed posture windows, duration as stat, energy costs; play-between-batches only.
* Formation adherence: three bands throttling event-generation weights; adjacency table as data.
* Substitutions as events (Tinkerman fuel), fitness drain (Taskmaster), die-size mutation (Gambler/Pragmatist).

**Acceptance:** each manager beats a calibration fixture set at rates within tolerance of the sim's per-engine numbers; Fortress flagged with its own tighter tolerance (SM §4 tuning flag).

## Phase 3 — Dataset regeneration

* `scripts/regenerate_cards.ts`: reads `public/data/kc_characters.json`, assigns 1–2 trait templates per card by position/profile heuristics, magnitude tier from rarity. Deterministic, seeded.
* Trait template pool (~25–30) as a reviewed data file; templates must cover both compounding axes (consistency + amplification) for every major context — this is design law 5 made executable.
* Coverage validation post-pass: per-rarity, per-context fuel thresholds (e.g. ≥15% of Commons carry transition traits). Script fails the build if coverage gaps exist; emits `coverage_report.md`.
* Legendaries: hand-authored file (~20–30), merged over the generated set. (Authoring itself is a design task — Claude.ai side — script just consumes the file.)

**Acceptance:** regenerated 500-card set passes coverage validation; drafting sim (headless shop-bot) can assemble a viable squad for all 10 managers from random shop streams.

## Phase 4 — Run loop, economy, opponents

* 9-fixture run: target curve `1.8 × 1.42^f`, challenge rules from fixture 2–3, boss every third with manager/legendary-weighted post-boss shop.
* Challenge rule catalogue v1 (~10 rules): implemented as TraitRecords applied to the match (they're just traits on the fixture) — e.g. "away goals double" = amplify @ goal-event; "Fast Start" = mid-match target gate.
* Shop: dual-axis stocking guarantee (consistency + amplification parts always present), rare manager slots priced ≥ ~2 shops of player spend, reroll, sell.
* Opponents: posture profile + small engine per archetype, data-driven; posture shifts telegraphed one batch ahead; visible opponent streak.
* Economy: match rewards, early-whistle surplus→cash, Financier hooks. Extends `ECONOMY_V1.md`, honours its precedence over MATCH_ENGINE §6.
* Persistence: run state autosave (resume mid-run), collection unlocks (store purchase = permanent + starter-pack eligible, per product requirement).

**Acceptance:** the full vitest run-distribution harness goes green — this is the rebuild's exit criterion for "the game works."

## Phase 5 — UI screens (function before flourish)

Screens, in build order:

1. **Run start:** manager choice-of-three; one-line win condition, default posture, preferred formation per card.
2. **Fixture/route screen:** upcoming fixture card — opponent posture profile, challenge rule, reward.
3. **Squad selection:** XI + bench grid; **regime pre-evaluation** on every card (lit/dim/red per SM §9); adherence band indicator live as formation changes; energy/tactical hand preview.
4. **Match:** ticker of increment events; batch decision bar (tactical hand, energy); window commit/pass prompts; streak meter with projected payout; honest scoreline + points meter + target; opponent engine strip; telegraphed opponent shift.
5. **Post-match dashboard:** trait uptime per player, windows generated vs converted, streak peaks + break reasons, cash earned. One-line diagnosis heuristic ("engine ran, parts didn't convert — buy consistency").
6. **Shop**, **run summary/death screen** (run stats + seed).

## Phase 6 — Design, animation, juice

**Art direction:** minimalist, utility-focused, urban — matchday-programme-meets-terrace, not FIFA gloss. Flat colour blocks, one display face + one mono face for engine numbers, high-contrast state colours (lit/dim/red readable without hue alone — pair with icon/weight). Dark pitch-slate base, single accent per manager (the run inherits its manager's accent — the whole UI tints to your identity; cheap, huge).

**Juice priorities (Balatro's lesson: animate the *accounting*):**

1. **Streak meter is the star.** Odometer count-up on every bank; glow/scale steps up per mult level; at high mult the meter physically strains (jitter, heat shimmer). Break = hard desaturation + crack + reason line slams in ("STREAK BROKEN — CONCEDED"). This one component carries more retention than any other visual work; budget accordingly.
2. **Window resolution as a moment:** window card slides in, commit/pass beat, chunky die roll (d4 visibly small — variance managers' d8/d12 visibly bigger, teaching the mechanic), threshold bar fills, convert → stinger.
3. **Goal sequence:** scoreline flip (physical flipboard), goal banks points as flying digits into the meter with the math shown ("×3 → 6"), crowd-noise swell scaled to mult.
4. **Selection screen light-up:** on manager/fixture load, traits flicker to lit/dim in a wave across the squad — the "machine assembling" feel; red challenge-rule kills stamp on.
5. **Early whistle:** whistle, surplus batches/energy count into cash coin-by-coin.
6. **Pack rip** for shop packs (exists in `packs.ts` domain — keep the ritual).
7. Trait-proc toasts: small, fast, stacking; never block input.
8. Sound: minimal kit — turnstile clunk (UI), whistle, crowd bed that tracks streak, dry mono tick for meter. No music before v1.1.

**Motion rules:** every animation interruptible/skippable; nothing over 400ms on the critical path; `prefers-reduced-motion` honoured with instant-state equivalents.

## Phase 7 — QOL and release readiness

* Match speed toggle (×1 / ×2 / skip-to-next-decision).
* Tooltips on every engine term, pulling definitions from one glossary data file (same strings the specs use — no drift).
* Undo within squad selection (pre-kickoff only); confirm-on-kickoff with dead-card warning ("3 traits red — kick off anyway?").
* Run seed visible + copyable on death/summary screens; seed input on new run (dev + sharing).
* Autosave every decision point; resume banner on load.
* Run history: last 10 runs — manager, death fixture, peak streak, one-line cause.
* Keyboard: number keys for tactical hand, space to advance batch, enter to commit window.
* Colourblind-safe state palette; text labels accompany all colour states.
* Mobile: 44px targets, meter/ticker stack vertically; the batch-decision bar is the thumb zone.
* Dev tools: debug panel with event-log inspector, force-seed, force-fixture, engine-state dump.

## Suggested ticket structure

* NW-138 **(revise scope):** Phase 0 + Phase 1. The spine, now including contexts/postures/windows/streaks/scoring. *(Executed as NW-139.)*
* **New:** Phase 2 (managers/tactical/adherence) · Phase 3 (dataset regen) · Phase 4 (run loop/economy/opponents) · Phase 5 (UI screens) · Phase 6 (design/juice) · Phase 7 (QOL/release). One ticket each, sequenced, all under NW-5/NW-6, `focus/next` on Phases 2–3 once 138 moves to `focus/now`.
* Hand-authoring Legendaries + challenge rule catalogue: separate design tickets (Claude.ai side), feeding Phase 3/4 data files.

## Definition of done (v1 release gate)

1. Vitest distribution harness green (the SM §8 curves reproduced).
2. All 10 managers playable, each with a distinct viable line to a run win.
3. Coverage validation green on the regenerated 500 + Legendaries.
4. SM §9 feedback surfaces all present (selection pre-eval, streak meter, dashboard).
5. A lost run tells you why in one screen.
6. Full run playable on mobile, autosave-safe, reduced-motion clean.
