# Football Balatro — Roadmap

## What it is
A Balatro-style roguelike card game set in football management. Players are cards with archetypes, stats, and synergies. Build your squad hand-by-hand, survive a season. HTML/JS prototype — see `fbal-godot/` for the Godot port.

## Status
- HTML/JS prototype running (`index.html`)
- Python match engine (`match_engine.py`)
- Two branches: `main` (Python/app.py version) and `local-dev` (fuller JS version)

## Phase 1 — Consolidate (Now)
- [ ] Merge `local-dev` into `main` — review PRD.md and MANIFEST.txt
- [ ] Reconcile `app.py` vs `match_engine.py` — pick one match engine
- [ ] Apply `OPPONENT_AI_PATCH.txt`

## Phase 2 — Card System
- [ ] Player archetypes as card types (use transfer_availability archetypes)
- [ ] Synergy system: formation bonuses, combo effects
- [ ] Deck building: squad construction between matches

## Phase 3 — Roguelike Loop
- [ ] Match → reward → upgrade flow
- [ ] Season progression: league table, fixtures, promotion/relegation
- [ ] Random events between matches (injuries, transfers, manager pressure)

## Connects to
- `fbal-godot/` — Godot engine port of this game
- `chief-scout/transfer_availability/` — player archetype model
