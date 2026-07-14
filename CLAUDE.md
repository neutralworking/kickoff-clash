# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required first read

**Direction of record — NW-139 (July 2026): the match engine is being rebuilt to the six-contest CARD_SYSTEM_V2 model.** Reading order: `docs/KICKOFF_CLASH_DESIGN.md` → `docs/SYNERGY_MODEL_V1.md` (its five design laws, verb palette, and context-taxonomy-as-gates survive) → `docs/CARD_SYSTEM_V2.md` (+ `docs/CARD_SYSTEM_V2_CHANGES.md`, which wins on conflict) → `docs/CARD_ACTIONS_V1.md`. **Revised conflict rule:** for *resolution*, `CARD_SYSTEM_V2` (+ `_CHANGES`) wins over `SYNERGY_MODEL_V1`'s two-window `charge + roll ≥ threshold` resolver (Fork A); for *design law*, SM's five laws + verb palette + contexts-as-gates stay lint rules on every PR (the no-unconditional law stays pure — no exception list; Regista's guaranteed chance is gated ¬Attack, not ungated). **Status: Phase 0 landed the specs; P1–P4 landed the six-contest engine in `src/engine-v2/` (headless, deterministic, vitest-gated); P5 (NW-143) landed its run-loop UI (`src/components/play/`), and that game is now WIRED as the LIVE game at `/` (title → manager → fixture → squad → match → shop loop, localStorage key `kc-v2-run`). `SCORING_V2` below (`src/lib/`) is the CLASSIC engine, parked playable at `/classic` (its own save key; the two games never touch each other's state).** The `src/engine-v2/` spine uses the **xG FINISH model** (`goal = 1 − e^(−xG)`, owner-chosen): six contests as global team totals, tilt→dial aggregation with the `_CHANGES` §7 ceilings, possession split + per-slot retain roll (the KEEP↔BREAK coupling), CREATE→quality→xG→FINISH, set pieces, contexts-as-**gates**, the posture state machine, and the positional graph. (Streaks were spec'd out of this ME version — there is no streak multiplier; scoring is flat.) Its harness (`src/engine-v2/__tests__/six-contest.test.ts`) is the canonical acceptance gate and reproduces `kc_sim.py`'s balance shape (round-robin AVG spread ≈0.51, no runaway, tilt ceilings hold). `scripts/kc_v2_sim.ts` is the TS balance instrument (the counterpart to `scripts/kc_sim.py`). SCORING_V2's `src/lib` structure (KEEP/PRESS · CREATE/BREAK · shot/STOP, chance-quality tier, xG) is *closer* to the six-contest target than the parked `src/engine/` window resolver — see `docs/MIGRATION_NOTES.md`.

**The CLASSIC game's match model (at `/classic`) is SCORING_V2 — one currency, three contests, two dice (`docs/SCORING_V2.md`) — read it first when working on `src/lib/`.** Every effect in the game is a FLAT ±N in card points (ATK/DEF, `deriveStats` in `src/lib/funnel.ts`): traits, managers, tactics, chemistry, personality, fitness and positional penalties all land as ledgered `PointMod`s (`src/lib/points.ts`) — no percentages, no multipliers, no hidden scales. Each 15' round runs three contests (`src/lib/contests.ts`): THE BALL (controllers/passers/engines' ATK v the front line + engines' DEF splits 6 possessions, clamp 2–4, no dice), THE OUTCOME (d100 per possession: turnover/half/big/corner/foul, slid by CREATE−BREAK), THE SHOT (d100 roll-under: GOAL if `d100 ≤ BASE + 3×(shooter ATK − STOP)`, bases half 20 / big 40 / corner 15, clamp 5..80). Fouls feed bookings; a second yellow is a red (≤1/side/match) and the suspension carries to the next fixture (`RunState.suspendedIds`). Position is geometry: wide cards have a preferred flank (wrong side −2/−2) and abilities can target pitch neighbours (Overlap feeds the man ahead in the lane; Screen shields the band behind). The funnel SHAPE survives (possession→chances→goals; the killers press/destroy/defend) but the six-lane grid accounting is gone. **Tactic cards are EQUIPPED (up to 3, pre-kick-off, always-on, flat + situational).** **Conflict rule (within the live engine): SCORING_V2 wins** over FUNNEL_MODEL_V1 and everything older; for the *rebuild direction*, CARD_SYSTEM_V2 (six-contest) supersedes SCORING_V2 as the resolution model of record (NW-139) — see the direction note above.

**The `src/engine/` rebuild is ABANDONED** (owner decision after the P5 playtest — "we were closer with the old version"). The rebuild specs (`docs/SYNERGY_MODEL_V1.md`, `docs/KC_REBUILD_PLAN_V1.md`, `docs/MIGRATION_NOTES.md`), the `src/engine/` tree, its vitest suite, and the `/rebuild` UI remain on disk as a parked reference but get no further investment; the title-screen entry to `/rebuild` was removed. `npm test` still runs the parked engine's suite (it must stay green as plain CI hygiene), but it is no longer an acceptance gate for live-game work. The older `docs/ARCHETYPES_V1 / CARDS_V1 / MATCH_ENGINE_V1 / ECONOMY_V1` remain background reading where FUNNEL_MODEL_V1 doesn't speak.

**The verb dispatcher is RETIRED from the live path** (SCORING_V2): `role-transforms.ts`, `squad-transforms.ts` and `possession.ts` were deleted; `verbs.ts` stays on disk ONLY because the parked `src/engine/` imports its `VerbName` type. The live spine is now `points.ts` (effective cards + the mod ledger) + `contests.ts` (the round) wired into `evaluateSplit`/`resolveIncrement` in `match-v5.ts`. `MATCH_ENGINE_V5.md` (repo root) describes the outer loop; where it describes emission/cascade scoring, SCORING_V2 supersedes it.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3001
npm run build    # Production build (also runs TypeScript type checking)
npm run lint     # ESLint 9 flat config (eslint.config.mjs)
npm run start    # Serve production build
```

```bash
npm test         # Vitest — the src/engine-v2/ six-contest harness (NW-139 P1 acceptance gate)
                 # + the PARKED src/engine/ suite (kept green as CI hygiene; not a live-game gate)
```

The live engine's validation battery: `npx tsx scripts/verb-dispatcher-harness.ts` (the SCORING_V2 invariant harness — determinism, the receipt law, interactions, the ball contest, the d100 shot law, discipline, sanity band; ALL CHECKS must pass), `scripts/match-harness.ts` (runs a full match and prints the contests + forecast; the scripts are ESM with extensionless imports, so `ts-node` fails to resolve them — use `tsx`), and the balance instruments below. `scripts/balance_sim.py` (Python 3, stdlib-only) mirrors the parked two-window `src/engine/` and is superseded as the balance reference by `scripts/kc_sim.py` (the owner's six-contest sim, tuned constants in `docs/CARD_SYSTEM_V2_CHANGES.md` §7) once P1 lands — a seeded vitest harness then becomes the canonical acceptance gate.

## What this is

**Kickoff Clash** is a Balatro-style football management roguelike. Players are cards, your XI is your hand, chemistry connections are synergy bonuses, manager cards are jokers. A run is 5 matches; in **v1 a single loss ends the run** (permadeath), while a draw continues with a reduced reward. Surviving all five fixtures wins the run. (Multi-loss tolerance, a board target, and PvP arrive with later game modes.)

**Source of truth for game design:** `MATCH_ENGINE_V5.md` at repo root.

## Architecture

**Entry points:** `src/app/page.tsx` renders `<PlayShell />` (`src/components/play/` — the LIVE six-contest game; `/play` is a legacy alias). `src/app/classic/page.tsx` renders `<GameShell />` (the classic SCORING_V2 game), which owns all classic run state.

### Game phases (orchestrated by `GameShell.tsx`)

`title` → `setup` → `reveal` → `match` → `postmatch` → `shop` → `end`

`GameShell.tsx` holds `runState` in `useState`, serialises it to `localStorage` key `kickoff-clash-v4-run`, and renders the matching phase component. Non-serialisable fields (joker/tactic compute functions) are stripped before storage and rehydrated on load via `rehydrateJokers(ids)`.

### Engine modules (`src/lib/`)

| File | Purpose |
|---|---|
| `match-v5.ts` | Match orchestrator: `evaluateSplit` builds both effective sides + the forecast; `resolveIncrement` plays the round; discipline ledger (bookings/`sentOffIds`), verdict, subs, fitness drain |
| `points.ts` | THE one-currency core (SCORING_V2): `buildSide` → `EffCard[]` (printed stats + every flat `PointMod`, with source receipts), manager/tactic/intent/chemistry/personality tables, `preferredSide` (flank), `applyEnemyEffects` (Antagonist/Dark Arts) |
| `contests.ts` | The round: `contestTotals` (KEEP/PRESS/CREATE/BREAK/STOP/ATTACK/DEFENCE), `resolveRound` (6 possessions, outcome table, d100 shots, corners, fouls/bookings/reds, trait beats) |
| `funnel.ts` | `deriveStats` (printed ATK/DEF −1..20 from BRS + skillset split + pillar shade), `laneOfCard` (shooter/assister weighting + the card JOB row), `LANE_COPY` |
| `chemistry.ts` | Synergy display layer (archetype pairs / role combos / cross) + `PERSONALITY_THEMES`; match effects are flat mods in points.ts |
| `chem.ts` | Run-accumulated pairwise chemistry (`accrueMatch`/`pruneCard`) + `chemistryLinks` (connecting pairs + strength → flat +1 links in points.ts) |
| `scoring.ts` | Card types, archetypes, playing styles, seeded RNG |
| `transform.ts` | `kc_cards.json` → `Card[]` (position map + `MODEL_TO_ARCHETYPE` map) |
| `formations.ts` | 8 formations, 11 slots each, pitch x/y geometry, max-attacker caps |
| `jokers.ts` | Manager cards; effects are flat mods (points.ts `managerMods`); `ALL_JOKERS` registry used for rehydration |
| `tactics.ts` | 16 tactic cards, EQUIPPED up to 3 pre-kick-off (`equipTactics`/`TACTIC_SLOTS` in match-v5) — flat, situational effects in points.ts `tacticMods` |
| `run.ts` | Roguelike `RunState`: deck, shop, economy, round progression, `suspendedIds` |
| `economy.ts` | Attendance, revenue, shop item generation |
| `packs.ts` | Seeded, weighted card pack draws |
| `hand.ts` | XI roll/selection + `INCREMENT_MINUTES` + event text pools |
| `defining-traits.ts` | The action-trait layer, point-native: `PointTrait` = flat `buff`/`debuff` (thresholds, backline, lane-ahead, band-behind, self) or beat `chance`/`stop`; N by rarity (Common 1 → Legendary 4); `SIGNATURE_OVERRIDES` are the bespoke legends. **Player-only** — the faceless opponent opts out. |
| `trait-copy.ts` | Display-only single source of truth for defining-trait words/icons (`traitCopy(name)` → label/blurb/kind/glyph) — read by the card pills AND the match animations so the two surfaces never drift. |

### Match resolution (per 15' increment) — SCORING_V2

1. **Build** (`points.ts buildSide`, both sides): printed ATK/DEF + flat mods — fitness bands (0/−1/−2/−3), wrong flank / out of position (−2/−2), defining-trait buffs (thresholds read the pass-A snapshot, so order can't matter), manager/tactic/intent/chemistry/personality, opponent cohesion (`OPP_COHESION_PTS` by cup); then cross-side effects (Antagonist −2 DEF on their back line, Dark Arts). Every mod is a named receipt (`split.cardMods`) behind the green/red numbers on the pitch.
2. **Forecast**: the header is the sums — `ATK Σyours v ΣtheirDEF (+edge) / DEF v theirATK (+edge) / NET` (`split.forecast`).
3. **THE BALL**: `max(1, KEEP − their PRESS)` each way splits 6 possessions (clamp 2–4). Deterministic.
4. **THE OUTCOME** (die #1): d100 per possession on turnover/half/big/corner/foul, slid ±10 by `(CREATE − BREAK)/4`. Corners cap at 3/side/round; trait `chance`s inject up to 2 bonus beats; armed `stop`s cancel opposing chances (keeper saves included).
5. **THE SHOT** (die #2): named shooter (weighted by eff ATK + finishing lane); GOAL if `d100 ≤ clamp(BASE + 3×(shooter ATK − STOP), 5, 80)`; the roll and the need print on the beat.
6. **Discipline**: fouls draw a fouler (destroyers likeliest); booking d100 ≤ 30; second yellow = red (≤1/side/match) — his points leave every contest at once and he's suspended next fixture.

### The six-contest engine (`src/engine-v2/`, NW-139 P1 → NW-142 P4) — headless spine

The Fork A rebuild target, built beside the live game (not yet UI-wired). Self-contained, deterministic, vitest-gated. Reuses the `VerbName` palette from `src/lib/verbs.ts` (unchanged; only targets re-point to contest dials). **P1 (NW-139)** landed the resolution spine; **P2 (NW-140)** the manager layer (reweight + tactical deck + adherence); **P3 (NW-141)** the card dataset + action catalogue + coverage + shop-bot; **P4 (NW-142)** the 9-fixture run loop + economy + modelled opponents + challenge rules. Four harnesses gate it: `six-contest.test.ts` (resolution/balance), `managers.test.ts` (reweight/swing/law/tactics/adherence), `cards.test.ts` (catalogue/coverage/draftability), and `run.test.ts` (the permadeath run-distribution — the "game works" gate). Balance instruments: `scripts/kc_v2_sim.ts` (match/manager), `scripts/kc_v2_runsim.ts` (run survival curve); `scripts/kc_v2_regenerate.ts` rebuilds the dataset + `docs/coverage_report_v2.md`. The run is a **Balatro-style points blind**: each fixture you must BANK ≥ the target (`1.42^f`) or the run ends (v1 permadeath). Points come from the build's win-con via **two commitment-gated scoring floors** (flat, no streaks): **goals + a pressure floor for attackers** (an attack-committed side that dominates a batch's chances but doesn't convert still banks territory — the attacker's floor so a shutout isn't zero points), and **clean batches for walls** (a defensive-committed side banks each batch it doesn't concede). Each floor is gated on the matching commitment (`ATTACK_COMMIT`/`DEFENSIVE_COMMIT` vs `COMMIT_MIN`), so a committed build maxes one channel and clears the late bar while an incoherent one — floored by neither — falls short. Per-manager balance is tuned so all 11 managers complete ~24–63% committed (≈43% aggregate) vs ~3% uncommitted; `scripts/kc_v2_runsim.ts` is the instrument. The opponent is **modelled with its card actions too** (CARD_SYSTEM_V2 §8 — not player-only); deny-chance actions are **bounded saves** so they defend without erasing the player's game.

| File | Purpose |
|---|---|
| `contests.ts` | The six contests + mirror-pairs; tilt→dial aggregation (`contestDials`, `relocate`), `TILT_CEILING`, back-line/att helpers |
| `gates.ts` | Context taxonomy as **gates** (posture/scoreline/clock/fitness + per-tilt/per-pos coherence gates + the `committed` gate); `gateScale` never resolves a contest |
| `posture.ts` | Posture state machine: manager default + timed-window override + revert scaffolding (timed windows are NW-140) |
| `positional.ts` | Formation graph (line × lane); `inFront`/`behind`/`beside`/`sameLane`/`opposite` (nearest-in-lane); `effectiveTilt` off-position soft-tilt |
| `traits.ts` | `EngineTrait` = (verb, trigger, **target**, magnitude, **required gate**); `dialDeltas`, chance generate/deny, `xgShift`, `varianceShift`, `fitnessDrain` — the no-unconditional law is a type constraint |
| `managers.ts` (NW-140) | The 11-manager roster as DATA (no class): each is a committed-gated additive **reweight** package (`managerTraits`) + posture + formation + engine/variance/fitness/cash mechanics; `COMMIT_MIN` per contest; seeded `managerOffer` choice-of-three |
| `adherence.ts` (NW-140) | 5 formations + adjacency data; `adherenceBand` (native/adjacent/foreign) → `throttleDials` on tilt contribution (the formation-level generalisation of off-position soft-tilt) |
| `tactics.ts` (NW-140) | Tactical cards = timed posture windows (duration + energy cost), played between batches; consumes the posture state machine + revert. A card may carry a commitment-gated `dialBoost` class buff (Keep Ball: KEEP +5 while open). The match UI plays cards interactively by RE-RESOLVING the fixture with the amended schedule — determinism keeps revealed batches byte-identical |
| `match.ts` | `simulateMatch` — the 6-batch × 3-increment loop: manager reweight (folded into the possession split too) + adherence throttle + fitness → possession split → retain roll (KEEP↔BREAK) → CREATE→quality→xG→FINISH → set pieces → tactical windows (incl. commitment-gated dial boosts) → the CHASE drain (`CHASE_DRAIN`: a KEEP-committed holder tires the chasing side each held batch — possession's teeth) → subs → the two batch-end scoring floors (clean-batch / pressure-batch) → typed event log |
| `squad.ts` | Stub squad builder (port of `kc_sim.py` ROLES/PROFILE/build_xi/build_stopbus) for the harness; sources the role map from `data/roles.ts` |
| `data/roles.ts` (NW-141) | The canonical 45-role map (role = position × contest × tilt), one source of truth for the loader and the squad builder |
| `data/actions.ts` (NW-141) | The 45-role action catalogue (`CARD_ACTIONS_V1`): (verb → target, gate) per role, dual-axis tag (law 5), tier-scaled `actionFor`; `LEGENDARIES` merge hook (empty until NW-146) |
| `cards.ts` (NW-141) | `KCCard` (engine `Card` + name/rarity/nickname); `cardTraits` (a card's action) + JSON loader for `kc_v2_cards.json` |
| `draft.ts` (NW-141) | The headless shop-bot: `draftForManager` fields a legal, committed XI in the manager's formation from a card stream |
| `data/challenges.ts` (NW-142) | The challenge-rule starter set (8) as data (target/opponent modifiers) + authored merge hook (empty until NW-147); `challengeForFixture` (seeded, from fixture 2) |
| `run.ts` (NW-142) | The 9-fixture run: `simulateRun`/`playFixture`, `fixtureTarget` (1.42^f), scaled modelled opponents (bosses every 3rd), economy (cash → deck quality via `dialBonus`), permadeath, serialize/resume |
| `rng.ts` | mulberry32 stream + Gaussian (Box–Muller) + Poisson (Knuth); one seed per match, fixed consumption order |
| `events.ts` | The typed event log (source of truth); `index.ts` is the public API |

The card dataset lives at `public/data/kc_v2_cards.json` (540 cards, six-contest roles + role-correlated stats + rarity → action tier), regenerated by `scripts/kc_v2_regenerate.ts` from the live `kc_cards.json` (which it leaves untouched); coverage is validated on every regen (`docs/coverage_report_v2.md`).

Constants (`match.ts`) are ported from `kc_sim.py` and re-tuned for the xG model; `scripts/kc_v2_sim.ts` is the balance instrument, the harness locks the asserts.

### Character data

**LIVE pool (V3.1 Chief Scout data port):** 540 fictional cards in `public/data/kc_cards.json`, generated from the real Chief Scout distributions by `scripts/generate-cards.ts` (embedded aggregates, no PII). Each card carries skillset (== `archetype`, 13 of them), `best_role`, an evocative cross-role `nickname`, BRS (the power scale **directly** — 52–95, avg 69; `levelToPower` is bypassed), a 4-pillar block, rarity from BRS bands, and a personality theme. `transform.ts transformCards()` bridges it; `run.ts ALL_CARDS` reads it. The old `kc_characters.json` (500 chars, `character.level` 71–95) is **legacy** — retained in `transform.ts` for reference, no live callers.

The skillset mix is now flat (skew fixed: Dribbler 1.4%→8.1%, Creator 16.8%→12%). Regenerate with `npx tsx scripts/generate-cards.ts [count]`.

### State management

No Redux, Zustand, or Context. Pure React hooks. `GameShell.tsx` is the single source of truth. `src/lib/supabase.ts` is wired but has no active call sites — localStorage is the real persistence layer.

### Seeded RNG

`seededRandom(seed)` (multiplicative hash) is used throughout. Match seeds, card draws, and personality rolls are all deterministic from the run seed, enabling reproducible test scenarios.

## Balance: the seed-sweep instrument

Match-engine balance changes MOVE the meta by design, so byte-identical determinism is
the wrong test for them. `scripts/balance-sweep.ts` (`npx tsx scripts/balance-sweep.ts [seeds]`)
sweeps deck-strength tiers × opponent rounds × N seeds and reports win/draw/loss rate,
first-increment forecast NET, and TOP-vs-WEAK attack divergence — the instrument for "do builds
matter, and is the win-rate monotonic in deck strength?" Use it (not the determinism harness)
when tuning `ROUND_POWER`, `OPP_COHESION_PTS`, the shot bases/caps in `contests.ts`, or the
stat budget in `deriveStats`.

Two companion instruments: `scripts/cup-sweep.ts` simulates full 20-match cup runs under
best-XI vs rotate policies (the instrument for `CUP_FINAL_POWER`/`OPENER_DROP` and "does
rotation matter?"), and `scripts/power-probe.ts` sweeps opponent base power against fixed
squad tiers to read the raw power→win-rate curve (used to place the cup finals).

**All three instruments draft LANE-QUOTA squads/XIs** (funnel model): a raw top-N-by-power
slice fields no GK and no defence lane, so it measures the drafting bug, not the curve.
Fixed decks still carry composition/personality roll luck of ±1 tier — the funnel makes
identity matter as much as raw power, by design.

## Known tech debt

- **Power scale — one currency.** BRS (52–95) remains on cards as the shop/rating scale,
  but the ENGINE plays only the derived ATK/DEF (−1..20) + flat mods. `deriveStats`
  budget is `(5 + 15s)×1.15` (floor 5.75 / ceiling 23): the floor was lifted from 3.45
  because generated cup-opener opponents sit on the power-50 saturation point and were
  fielding near-stat-less XIs. The top-end difficulty lever is `OPP_COHESION_PTS`
  (`[0,0,1,1,2]` flat points per opponent card by cup), not power.
  `CUP_FINAL_POWER = [60,68,76,84,90]` + `OPENER_DROP 18`; `ROUND_POWER = [62,68,73,78,84]`.
- **Role %-baselines are DEAD (SCORING_V2).** A card's identity in play is its printed
  stats + position + defining action-traits — nothing invisible. `tacticalRole` remains
  display copy on the card. `role-transforms.ts`/`squad-transforms.ts`/`possession.ts`
  deleted; `verbs.ts` kept ONLY for the parked engine's `VerbName` import.
- **SCORING_V2 dials (owner playtest calibrates).** Shot need clamp 5..80 and outcome
  slide ±10 cap the blowout, but a maxed mismatch still lands ~9–12 goals (chance-volume
  driven: 4 possessions + 2 injections × a hot table). 15-seed sweep: monotonic S1→S5 in
  every round/policy; curated-vs-none +9.8pp; even-strength ~3.4 total goals, draws
  ~8–12%; S4 vs R5 ~40% (deaths concentrate late, as before). Cup-sweep (6 seeds):
  STRONG 100% / UPPER 67% with rotation (0% without — rotation is load-bearing) / MID 0%
  champions reaching cup 4+.
- **Archetype distribution skew — FIXED (data port).** The flat skillset mix in `kc_cards.json`
  (Dribbler 8.1%, Creator 12%) replaces the old Creator-16.8%/Dribbler-1.4% skew.
- **Defining-trait library — point-native (SCORING_V2).** Every archetype pool ≥4 candidates
  incl. the GK pool; traits are flat buffs/debuffs (Marshal/Mentor/Star Service thresholds,
  Overlap lane-ahead, Screen band-behind, Leadership backline, Antagonist enemy backline)
  or beat actions (`chance` injections, `stop` cancels incl. keeper saves). Player-only —
  the faceless opponent opts out. Copy still lives in `trait-copy.ts` by exact name.
- **Suspensions** carry exactly one fixture (`RunState.suspendedIds`, overwritten each
  post-match); enforcement is belt-and-braces (MatchPhase filters the deck; SquadScreen
  gets a filtered pool + a SUSPENDED chip).
- **Chemistry links are fitness-blind by design now**: a link is a flat +1 (+1/+1 when
  settled ≥0.8), capped 2 links per card, and shows on the receipt like everything else.
- `design/` — contains fbal-era (Python/Flask prototype) docs. `design/CLAUDE.md`, `design/README.md`, `design/ROADMAP.md` describe a different codebase and should be treated as historical only.
