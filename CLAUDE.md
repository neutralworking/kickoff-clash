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

500 fictional players in `public/data/kc_characters.json`. Power values map from `character.level` (range 71–95, narrower than the 50–99 recommended in `MATCH_ENGINE_V5.md §11.2`). Archetype distribution is uneven — Creator is overrepresented (16.8%), Dribbler underrepresented (1.4%).

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

## Known tech debt

- **Power compression — FIXED (Phase 3A).** `transform.ts levelToPower()` now remaps the
  71–95 source band to 50–99 (§11.2), and the opponent curve was recalibrated to match
  (`ROUND_POWER = [72,77,82,86,90]`, `OPP_COHESION = 1.15`). The sweep win-rate is monotonic
  in deck strength.
- **Personality stacking — FIXED (Phase 3A).** Perfect Dressing Room is additive (+0.15, was
  ×1.5) and the combined personality uplift is clamped at 1.30 in `calculatePersonalityBonus`.
- **Variance floor — lowered (Phase 3A).** `XG_CONVEX 0.9`, possession share `0.30–0.70` so a
  good build reliably clears the blind; the 90' drama multiplier stays as flavour.
- **Archetype distribution skew** — Creator 16.8% / Dribbler 1.4% in `kc_characters.json` still
  warps the counter-web; fix the data before tuning archetype balance.
- `design/` — contains fbal-era (Python/Flask prototype) docs. `design/CLAUDE.md`, `design/README.md`, `design/ROADMAP.md` describe a different codebase and should be treated as historical only.
