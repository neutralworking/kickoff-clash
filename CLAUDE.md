# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required first read

The Kickoff Clash match-engine redesign is specified in `docs/`. **Read `docs/KICKOFF_CLASH_DESIGN.md` first** — it is the index, has **precedence**, and resolves cross-doc drift (notably the superseded `MATCH_ENGINE_V1 §6` and the Player/Tactical/Manager naming). It orders the four companion specs:

- `docs/ARCHETYPES_V1.md` — verb palette + 11 emergent identities + counter-web
- `docs/CARDS_V1.md` — player model, `TraitRecord`, chemistry, 500-card authoring
- `docs/MATCH_ENGINE_V1.md` — increment loop, zonal field, xG→Poisson, dispatcher
- `docs/ECONOMY_V1.md` — three card layers, revenue, run loop

Build order is in `DESIGN §8`. Step 1 (verb dispatcher + `TraitRecord` runtime) is in `src/lib/verbs.ts` + `src/lib/role-transforms.ts`, wired into `evaluateSplit`. Step 2 (zonal field + coupled lane contest, §4) is in `src/lib/field.ts`; the contest runs in `resolveIncrement`. Three §4 dials were set with the design owner: **coupled** defence (not independent lanes), convexity **k≈1.1**, and a **gentle** goal model (variance verbs are the opt-in toward Poisson, not the default). `MATCH_ENGINE_V5.md` (repo root) describes the **current** live engine that the redesign is migrating from.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3001
npm run build    # Production build (also runs TypeScript type checking)
npm run lint     # ESLint 9 flat config (eslint.config.mjs)
npm run start    # Serve production build
```

No test framework is installed. The match engine was validated via `scripts/match-harness.ts`, which imports engine modules directly and can be re-run with `npx tsx scripts/match-harness.ts`. (The script is ESM with extensionless imports, so `ts-node` fails to resolve them — use `tsx`.)

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
| `match-v5.ts` | Active match engine: 5 × 15-min increments, attack/defend split, goal resolution |
| `chemistry.ts` | 4-tier synergy: archetype pairs → role combos → personality themes → Perfect Dressing Room |
| `scoring.ts` | Card types, archetypes, playing styles (Tiki-Taka, Gegenpressing, etc.), seeded RNG |
| `transform.ts` | `kc_characters.json` → `Card[]` (position map + `MODEL_TO_ARCHETYPE` map) |
| `formations.ts` | 8 formations, 11 slots each, pitch x/y geometry, max-attacker caps |
| `jokers.ts` | Manager cards (passive modifiers); `ALL_JOKERS` registry used for rehydration |
| `tactics.ts` | 12 tactic cards with contradiction rules |
| `run.ts` | Roguelike `RunState`: deck, shop, economy, round progression |
| `economy.ts` | Attendance, revenue, shop item generation |
| `packs.ts` | Seeded, weighted card pack draws |
| `hand.ts` | Intermediate hand-evaluation layer (status uncertain — verify before editing) |
| `defining-traits.ts` | The action-trait layer (CARDS_V1 §4): `pickDefiningTraits(card)` assigns N action-traits by rarity (Common 1 / Rare 2 / Epic 3 / Legendary 4) over the verb palette; `SIGNATURE_OVERRIDES` are the bespoke showcase legends. **Player-only** — opponents opt out (`computeSideField` `includeDefiningTraits=false`). |
| `trait-copy.ts` | Display-only single source of truth for defining-trait words/icons (`traitCopy(name)` → label/blurb/kind/glyph) — read by the card pills AND the match animations so the two surfaces never drift. |

### Match scoring cascade (per increment)

1. Base power (sum of attacker or defender card powers)
2. Dual-role contribution (Controllers contribute to attack while defending)
3. Synergy bonuses (chemistry.ts tiers 1–4)
4. Playing style multiplier
5. Tactic bonuses
6. Joker bonuses
7. Personality theme multiplier (tier 3: +10–20%; tier 4: ×1.5 if all 5 themes present)
8. Goal chance = `clamp(0.15 + (attack - defence) / 2000, 0.05, 0.50)`

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

## Known tech debt

- **Power scale — V3.1 (data port).** Power is now BRS directly (52–95) from `kc_cards.json`;
  `levelToPower` decompression is bypassed (legacy path only). The opponent curves were
  re-grounded to the (effectively ~13-power-weaker) new pool: `ROUND_POWER = [62,68,73,78,82]`
  (Foundation single-match instrument), `CUP_FINAL_POWER = [48,53,58,63,67]` + `OPENER_DROP 18`
  (the real cup difficulty — `MatchPhase` always passes `cupMatchPower`). cup-sweep: STRONG
  rotate ~37% champions; balance-sweep win-rate monotonic in deck strength.
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
- **Defining-trait library coverage — PARTIAL (Trait v1 vertical slice).** 8 outfield
  action-traits cover ~94% of cards at full rarity depth; **30/540 (5.6%) are under-filled**
  (defining count < rarity count) — **24 are GKs** (the keeper pool is just `Leadership` by
  design, with shot-stopping in the role baseline; keepers need bespoke GK traits — Sweeper
  Keeper / Penalty Specialist — that don't exist yet), the other 6 are Epic/Legendary
  Dribbler/Destroyer/Powerhouse on thin pools. Filling these = the "full trait library across
  540 cards" phase (deferred). The bespoke showcase legends (`SIGNATURE_OVERRIDES`) all show 4.
  Balance was validated on the current pools; padding them re-opens the sweep.
- `design/` — contains fbal-era (Python/Flask prototype) docs. `design/CLAUDE.md`, `design/README.md`, `design/ROADMAP.md` describe a different codebase and should be treated as historical only.
