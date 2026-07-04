# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required first read

The Kickoff Clash rebuild is specified in `docs/`. **Reading order:** `docs/KICKOFF_CLASH_DESIGN.md` → `docs/SYNERGY_MODEL_V1.md` → `docs/KC_REBUILD_PLAN_V1.md` → the remaining specs as referenced.

**Conflict rule: `SYNERGY_MODEL_V1.md` (SM) wins.** Where existing code or any other spec conflicts with SM, SM is right by definition; its five design laws (SM §1 — no unconditional bonuses, loose coupling, closed palettes, managers-are-TraitRecords, dual-axis compounding) are lint rules for every PR. `KC_REBUILD_PLAN_V1.md` is the phase-by-phase execution plan (P0–P7). `KICKOFF_CLASH_DESIGN.md` remains the index for the four companion specs and resolves their older cross-doc drift:

- `docs/ARCHETYPES_V1.md` — verb palette + 11 emergent identities + counter-web (archetype framing superseded by SM §4)
- `docs/CARDS_V1.md` — player model, `TraitRecord`, chemistry, 500-card authoring (flat-bonus model superseded by SM §1/§5)
- `docs/MATCH_ENGINE_V1.md` — increment loop, zonal field, xG→Poisson, dispatcher (inferred-state logic superseded by SM §3/§6)
- `docs/ECONOMY_V1.md` — three card layers, revenue, run loop (extended, not replaced, by SM)

**Rebuild status:** Phase 0–1 landed (NW-139). The new pure engine lives in `src/engine/` (zero React/DOM imports; event log as source of truth; all balance numbers in `src/engine/data/`); `docs/MIGRATION_NOTES.md` is the keep/adapt/delete audit of the legacy `src/lib` modules against SM. The verb dispatcher + `TraitRecord` runtime from NW-138 (`src/lib/verbs.ts` + `src/lib/role-transforms.ts`, wired into `evaluateSplit`) is the keep-baseline and still drives the **live game**; `MATCH_ENGINE_V5.md` (repo root) describes that current live engine. The live game keeps running on `src/lib` until Phase 5 flips the UI to `src/engine/`.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3001
npm run build    # Production build (also runs TypeScript type checking)
npm run lint     # ESLint 9 flat config (eslint.config.mjs)
npm run start    # Serve production build
```

```bash
npm test         # Vitest — the canonical acceptance gate for src/engine/ (determinism + SM distribution checks)
```

The legacy match engine was validated via `scripts/match-harness.ts`, which imports `src/lib` modules directly and can be re-run with `npx tsx scripts/match-harness.ts` (byte-identical across runs — the determinism check for the live engine). The script is ESM with extensionless imports, so `ts-node` fails to resolve them — use `tsx`. `scripts/balance_sim.py` (Python 3, stdlib-only) is the balance *reference* for the rebuild's single-match model; the vitest harness is the canonical gate now that Phase 1 has landed.

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
| `tactics.ts` | 16 tactic cards as per-spell CALLED PLAYS (charges, playClass) — the 3-slot model and the legacy `compute()` path are gone; effects live in `squad-transforms.ts tacticTraits`, opponent plays + telegraphs in `opponent.ts OPPONENT_PLAYS`, call grading in `plays.ts` |
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
  Current anchors: clean-counter swing ~+0.4 xG; best-vs-none +21pp; reading the
  telegraph roughly halves goals against; STRONG rotate+calls ~80% champions.
- `design/` — contains fbal-era (Python/Flask prototype) docs. `design/CLAUDE.md`, `design/README.md`, `design/ROADMAP.md` describe a different codebase and should be treated as historical only.
