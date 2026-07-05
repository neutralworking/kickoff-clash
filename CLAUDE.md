# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required first read

**The live game's match model is the FUNNEL (`docs/FUNNEL_MODEL_V1.md`) — read it first.** Possession yields chances, chances yield goals; pressing kills possession, destruction kills chances, defence prevents goals. Every card feeds exactly ONE lane (its skillset's — `src/lib/funnel.ts`), with two sanctioned exceptions: Commander leadership tech cards (team-wide spread) and Antagonists (deny the opposing defence lane). **Conflict rule: FUNNEL_MODEL_V1 wins** over older docs and code for the live game.

**The `src/engine/` rebuild is ABANDONED** (owner decision after the P5 playtest — "we were closer with the old version"). The rebuild specs (`docs/SYNERGY_MODEL_V1.md`, `docs/KC_REBUILD_PLAN_V1.md`, `docs/MIGRATION_NOTES.md`), the `src/engine/` tree, its vitest suite, and the `/rebuild` UI remain on disk as a parked reference but get no further investment; the title-screen entry to `/rebuild` was removed. `npm test` still runs the parked engine's suite (it must stay green as plain CI hygiene), but it is no longer an acceptance gate for live-game work. The older `docs/ARCHETYPES_V1 / CARDS_V1 / MATCH_ENGINE_V1 / ECONOMY_V1` remain background reading where FUNNEL_MODEL_V1 doesn't speak.

The live game's spine is unchanged: the verb dispatcher + `TraitRecord` runtime (`src/lib/verbs.ts`, tables in `role-transforms.ts` / `squad-transforms.ts` / `defining-traits.ts`), wired into `evaluateSplit`. `MATCH_ENGINE_V5.md` (repo root) describes the live engine's loop; where it describes the old blended four-zone emission model, FUNNEL_MODEL_V1 supersedes it.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3001
npm run build    # Production build (also runs TypeScript type checking)
npm run lint     # ESLint 9 flat config (eslint.config.mjs)
npm run start    # Serve production build
```

```bash
npm test         # Vitest — the PARKED src/engine/ suite (kept green as CI hygiene; not a live-game gate)
```

The live engine's validation battery: `npx tsx scripts/verb-dispatcher-harness.ts` (dispatcher + funnel invariants — ALL CHECKS must pass), `scripts/match-harness.ts` (runs a full match and prints the six lane stats; the scripts are ESM with extensionless imports, so `ts-node` fails to resolve them — use `tsx`), and the balance instruments below. `scripts/balance_sim.py` (Python 3, stdlib-only) belongs to the parked rebuild.

## What this is

**Kickoff Clash** is a Balatro-style football management roguelike. Players are cards, your XI is your hand, chemistry connections are synergy bonuses, manager cards are jokers. A run is 5 matches; in **v1 a single loss ends the run** (permadeath), while a draw continues with a reduced reward. Surviving all five fixtures wins the run. (Multi-loss tolerance, a board target, and PvP arrive with later game modes.)

**Source of truth for game design:** `MATCH_ENGINE_V5.md` at repo root.

## Architecture

**Entry point:** `src/app/page.tsx` renders `<GameShell />`, which owns all run state.

### Game phases (orchestrated by `GameShell.tsx`)

`title` → `setup` → `reveal` → `match` → `postmatch` → `shop` → `end`

`GameShell.tsx` holds `runState` in `useState`, serialises it to `localStorage` key `kickoff-clash-v4-run`, and renders the matching phase component. Non-serialisable fields (joker/tactic compute functions) are stripped before storage and rehydrated on load via `rehydrateJokers(ids)`.

### Engine modules (`src/lib/`)

| File | Purpose |
|---|---|
| `match-v5.ts` | Active match engine: 5 × 15-min increments, funnel emission + cascade, goal resolution |
| `funnel.ts` | The one-card-one-lane model (FUNNEL_MODEL_V1): `laneOfCard`, `LANE_BAND` band-fit weights, `LEAD_SPREAD`, `LANE_COPY` display strings (the card modal's JOB row reads it) |
| `chemistry.ts` | 4-tier synergy: archetype pairs → role combos → personality themes → Perfect Dressing Room |
| `scoring.ts` | Card types, archetypes, playing styles (Tiki-Taka, Gegenpressing, etc.), seeded RNG |
| `transform.ts` | `kc_characters.json` → `Card[]` (position map + `MODEL_TO_ARCHETYPE` map) |
| `formations.ts` | 8 formations, 11 slots each, pitch x/y geometry, max-attacker caps |
| `jokers.ts` | Manager cards (passive modifiers); `ALL_JOKERS` registry used for rehydration |
| `tactics.ts` | 16 tactic cards as per-spell CALLED PLAYS (charges, playClass) — the 3-slot model and the legacy `compute()` path are gone; effects live in `squad-transforms.ts tacticTraits`, opponent plays + telegraphs in `opponent.ts OPPONENT_PLAYS`, call grading in `plays.ts` |
| `run.ts` | Roguelike `RunState`: deck, shop, economy, round progression |
| `economy.ts` | Attendance, revenue, shop item generation |
| `packs.ts` | Seeded, weighted card pack draws |
| `hand.ts` | Intermediate hand-evaluation layer (status uncertain — verify before editing) |
| `defining-traits.ts` | The action-trait layer (CARDS_V1 §4): `pickDefiningTraits(card)` assigns N action-traits by rarity (Common 1 / Rare 2 / Epic 3 / Legendary 4) over the verb palette; `SIGNATURE_OVERRIDES` are the bespoke showcase legends. **Player-only** — opponents opt out (`computeSideField` `includeDefiningTraits=false`). |
| `trait-copy.ts` | Display-only single source of truth for defining-trait words/icons (`traitCopy(name)` → label/blurb/kind/glyph) — read by the card pills AND the match animations so the two surfaces never drift. |

### Match resolution (per 15' increment) — the funnel

1. **Emission**: each card's fitness-scaled power feeds its ONE lane (`funnel.ts laneOfCard`), weighted by band fit (`LANE_BAND`); Commanders spread across all six at `LEAD_SPREAD`.
2. **Dispatch**: role/defining/squad `TraitRecord`s transform the 9×6 grid (`verbs.ts`); `deny` with `denyZone` knocks a fraction off the OPPONENT's named lane (the Antagonist path), plain `deny` suppresses conversion.
3. **Cascade**: synergy/style/weakness/play-pattern totals become ONE multiplier over the three attacking lanes (and one over the three counter lanes), personality on top — distributed as the cube root per stage because the stages multiply downstream.
4. **Stage 1**: possessions split by control after each side's pressing erases part of the other's control (`possession.ts PRESS_W`, floor `PRESS_FLOOR`).
5. **Stage 2**: per possession, P(shot) from creation lane-push vs destruction lane-cover in the pitch lane (L/C/R).
6. **Stage 3**: per shot, xG from finishing vs defence (`XG_CONVEX`), suppressed by denial; goal = dice roll.

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
personality `attackMod`, and TOP-vs-WEAK attack divergence — the instrument for "do builds
matter, and is the win-rate monotonic in deck strength?" Use it (not the determinism harness)
when tuning `ROUND_POWER`, `OPP_COHESION`, `XG_CONVEX`, the personality cap, or the power scale.

Two companion instruments: `scripts/cup-sweep.ts` simulates full 20-match cup runs under
best-XI vs rotate policies (the instrument for `CUP_FINAL_POWER`/`OPENER_DROP` and "does
rotation matter?"), and `scripts/power-probe.ts` sweeps opponent base power against fixed
squad tiers to read the raw power→win-rate curve (used to place the cup finals).

**All three instruments draft LANE-QUOTA squads/XIs** (funnel model): a raw top-N-by-power
slice fields no GK and no defence lane, so it measures the drafting bug, not the curve.
Fixed decks still carry composition/personality roll luck of ±1 tier — the funnel makes
identity matter as much as raw power, by design.

## Known tech debt

- **Power scale — funnel re-anchor.** Power is BRS directly (52–95) from `kc_cards.json`.
  The cup curve was re-placed for the funnel model (a lane-coherent XI plays well above its
  raw average): `CUP_FINAL_POWER = [60,68,76,84,90]` + `OPENER_DROP 18` (the real cup
  difficulty — `MatchPhase` always passes `cupMatchPower`); `ROUND_POWER = [62,68,73,78,84]`
  is the single-match instrument fallback. cup-sweep (30 seeds): STRONG best-xi 40% /
  rotate 83% / rotate+calls 100% champions; UPPER & MID rotate+calls ~53%; deaths
  concentrate in cups 4–5. balance-sweep (40 seeds): win-rate monotonic S1→S5 in every
  round and policy.
- **Role coverage — V3.1 (data port).** The new pool's authentic `best_role` names resolve to
  trait sets via `ROLE_ALIASES` in `role-transforms.ts` (dispatcher coverage 100%), without
  overwriting the role shown on the card.
- **Personality stacking — FIXED (Phase 3A).** Perfect Dressing Room is additive (+0.15, was
  ×1.5) and the combined personality uplift is clamped at 1.30 in `calculatePersonalityBonus`
  (balance-sweep confirms `attackMod` peaks ~1.29 on the new pool).
- **Variance floor — lowered (Phase 3A).** `XG_CONVEX 0.9`, possession share `0.30–0.70` so a
  good build reliably clears the blind; the 90' drama multiplier stays as flavour.
- **Archetype distribution skew — FIXED (data port).** The flat skillset mix in `kc_cards.json`
  (Dribbler 8.1%, Creator 12%) replaces the old Creator-16.8%/Dribbler-1.4% skew, so the
  counter-web is now evenly grounded.
- **Defining-trait library coverage — CLOSED (full trait library).** The library now fills
  **0/540** under-filled (was 30/540): a bespoke **GK pool** (`Shot Stopper`/`Sweeper Keeper`/
  `Commander of the Box`/`Distribution`/`Big-Game Keeper` — 5 candidates, all `deny`/`generate`/
  `amplify-inverse-power` gated on `is-defending`/`backline-count`/`late-game`, no new verb) plus
  thin-outfield fillers (`Take-On`/`Mazy Run` for Dribbler, `Interceptor`/`Last-Ditch` for
  Destroyer, `Aerial Threat`/`Hold-Up Play` for Powerhouse+Target, `Deep Distributor`/`Screen`
  for Controller, `Runner in Behind` for Sprinter, `Late Run` for Engine) take every pool to ≥4.
  Copy lives in `trait-copy.ts` (one new `TraitKind` — `save` — for keeper shot-stops, animated
  via the existing `trait-tackle` keyframe). GK traits are **player-only** (opponent opts out), so
  they only make your own keeper concede less (~0.05 fewer ga for an Epic vs Common keeper — a
  deliberate low-band `deny` of 0.11–0.12). balance-sweep (40 seeds) unchanged in-band: S5-top vs
  R1 100%, vs R5 68%, TOP/WEAK divergence 75%, ga sane. `SIGNATURE_OVERRIDES` legends still show 4.
- **Variance verbs are inert** (found in the Called Plays balance pass): `possession.ts`
  never reads the dispatcher's `variance` accumulator, so `dampen/amplify-variance`
  records do nothing. No card text claims them any more; wiring it is a scheduled
  engine change.
- **Called Plays instrument** — `balance-sweep.ts` carries a `callPolicy` axis
  (none/random/best) + per-play swing tables; `cup-sweep.ts` a `rotate+calls` policy.
  Funnel anchors (40 seeds): clean-counter swing ~+0.55 xG; best-vs-none +21pp; reading
  the telegraph cuts goals against ~3× (2.45 → 0.77); an even contest totals ~6 goals.
  Play `generate` magnitudes were rescaled to the thinner per-lane totals.
- **Chemistry generates are fitness-blind** (funnel pass finding): `chem.ts` amounts use
  raw `card.power`, so a fully tired XI's possession lane can tick UP via chemistry while
  its own emission falls (the dispatcher-harness tired-XI check asserts on the funnel SUM
  for this reason). Scaling chemistry by live fitness is a scheduled engine change.
- `design/` — contains fbal-era (Python/Flask prototype) docs. `design/CLAUDE.md`, `design/README.md`, `design/ROADMAP.md` describe a different codebase and should be treated as historical only.
