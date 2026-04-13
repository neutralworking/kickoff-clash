# Kickoff Clash

A Balatro-style football management roguelike. Players are cards, your XI is your hand, chemistry connections are your poker bonuses, manager cards are jokers.

Formerly known as `fbal`. Renamed to the canonical `kickoff-clash` on 2026-04-12 as part of the portfolio cleanse. The Godot port (`fbal-godot`) has been archived; this Next.js app is the only active codebase.

## Current state

- **Match Engine V5** is implemented in `src/lib/match-v5.ts` (707 lines). Design spec: `MATCH_ENGINE_V5.md`.
- **Game shell** is wired: `GameShell.tsx` orchestrates the phase components (`TitleScreen`, `SetupPhase`, `PackOpening`, `MatchPhase`, `PostMatch`, `ShopPhase`, `EndScreen`).
- **500 characters** in `public/data/kc_characters.json`, mapped through `src/lib/transform.ts` into the engine's archetype model.
- **Next.js 16 + React 19 + Tailwind v4 + TypeScript**.
- **Supabase client** wired in `src/lib/supabase.ts` — used for run persistence.

## Stack

| Piece | What |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind v4 |
| Language | TypeScript 5.9 |
| State | Client-side, Supabase for persistence |
| Dev port | 3001 (avoids conflict with chief-scout at 3000) |

## Getting started

```bash
npm install
npm run dev      # http://localhost:3001
npm run build    # production build
npm run lint
```

## Repo layout

```
kickoff-clash/
├── MATCH_ENGINE_V5.md        → canonical design spec for the current match engine
├── design/                   → older design docs (see "Stale docs" below)
├── public/data/              → kc_characters.json (500 fictional players)
└── src/
    ├── app/                  → Next.js App Router entry (page.tsx → <GameShell />)
    ├── components/           → React components, one per game phase
    └── lib/                  → engine: match-v5, chemistry, scoring, transform, run, jokers, tactics, formations, economy, packs, hand, actions, supabase, fan-geometry
```

## Key engine files

| File | Purpose |
|---|---|
| `src/lib/match-v5.ts` | Active card play match engine: attack/defend split, scoring, goal resolution |
| `src/lib/chemistry.ts` | Positional synergies (attack / defence / cross), personality resonances |
| `src/lib/scoring.ts` | Card types, playing styles, seeded RNG |
| `src/lib/transform.ts` | `kc_characters.json` → `Card[]` mapping (position map + model→archetype map) |
| `src/lib/formations.ts` | 8 formations with attack/defence role allocations |
| `src/lib/jokers.ts` | Manager cards (passive modifiers) |
| `src/lib/tactics.ts` | Tactic cards |
| `src/lib/run.ts` | Roguelike run state |

## Stale docs (triage needed)

`design/` contains historical docs from the fbal era. Most of them no longer describe reality:

- `design/README.md` — describes the Python/Flask prototype, `python app.py`, `localhost:5055`, GitHub issues on `neutralworking/fbal`. **Stale.**
- `design/ROADMAP.md` — references `fbal-godot`, `main` and `local-dev` branches, Python `match_engine.py`, `OPPONENT_AI_PATCH.txt`. **Stale.**
- `design/legacy-python/` — prior prototype. **Keep as history, not a source of truth.**
- `design/PRD.md`, `design/Football_PRD_v2.md`, `design/QUICK_REF.md`, `design/GETTING_STARTED.md`, `design/OPPONENT_AI_PATCH.txt` — unknown status; PO should triage on first pass.

**Source of truth for game design:** `MATCH_ENGINE_V5.md` at repo root.
**Source of truth for execution:** `ROADMAP.md` at repo root (to be created by PO).

## Known tech debt

From `MATCH_ENGINE_V5.md` §11:

- **Power range compression** — characters use levels 71–95 (avg 81). §11.2 recommends widening to 50–99 for more meaningful chemistry impact. Not yet applied.
- **Character data transform** — §11.1 flagged a model-name vs archetype-ID mismatch. `src/lib/transform.ts` now has a `MODEL_TO_ARCHETYPE` map that appears to address this, but the full-coverage audit against all 500 characters is still worth running.

## Ownership

- **Product Owner:** see `../ops/kickoff-clash-po.md` for scope, cadence, and first-week adoption path.
- **Deployment / hosting:** Platform PO (`../ops/platform-po.md`) — not this PO.
- **Upstream football data:** routed via chief-scout PO.
