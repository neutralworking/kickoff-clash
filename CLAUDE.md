# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3001
npm run build    # Production build (also runs TypeScript type checking)
npm run lint     # ESLint 9 flat config (eslint.config.mjs)
npm run start    # Serve production build
```

No test framework is installed. The match engine was validated via `scripts/match-harness.ts`, which imports engine modules directly and can be re-run with `npx ts-node scripts/match-harness.ts`.

## What this is

**Kickoff Clash** is a Balatro-style football management roguelike. Players are cards, your XI is your hand, chemistry connections are synergy bonuses, manager cards are jokers. A run is 5 matches; 3 losses ends the run.

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

## Known tech debt

- **Power range compression** — character levels 71–95 compress deck strength differences; top-11 deck hits the 0.50 goal-chance ceiling in most increments. `MATCH_ENGINE_V5.md §11.2` specifies the fix (widen to 50–99).
- **Personality stacking** — Tier-3 themes + Tier-4 Perfect Dressing Room can compound to ~72–80% uplift. Needs gating audit.
- `design/` — contains fbal-era (Python/Flask prototype) docs. `design/CLAUDE.md`, `design/README.md`, `design/ROADMAP.md` describe a different codebase and should be treated as historical only.
