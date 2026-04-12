# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**fbal** is a Balatro-style football management roguelike demo. It is a Flask web app where the backend runs a match simulation engine and the frontend is a single-page HTML/JS app.

## Running the App

```bash
pip install flask
python app.py
```

The server runs at `http://localhost:5000`. The app serves `index.html` as the root and all API calls are prefixed with `/api/`.

## Architecture

### Backend (`app.py`) — Flask REST API + Game Engine

All game logic lives in `app.py`. There is a single in-memory `STATE` dict that holds the entire game state (no database).

**Key sections:**
- **Engine constants** (top of file): `PHASES`, `QUALITY_TIERS`, `XG_MAP`, `FATIGUE_TICK_RATE`, `POSITION_WEIGHTS`, `RARITY_RANGES`, `XP_CURVE`, `TRAIT_POOL`, `MULTICLASS_TRAITS`, etc.
- **`SKILL_CARDS` dict**: All manager skill cards with their `effect_type`, `rarity`, and mechanical parameters.
- **`STATE` dict**: Single global mutable state containing `squad`, `cards`, `available_cards`, `season`, `match`, `phase`, `pending_events`.
- **`resolve_turn()`**: Core match simulation. Called once per "turn" (6 turns = 1 match). Computes phase scores (build_up, penetration, finishing, pressing, structure, resistance) using `apply_card_modifiers()`, calculates possession, generates chances (`hn`, `an`), then rolls for goals via `XG_MAP`.
- **`apply_card_modifiers()`** (`amods_fn`): Applies active skill cards to phase scores. Cards have typed effects: `phase_multiplier`, `phase_flat_bonus`, `chance_type_upgrade`, `possession_suppress_chances`, etc.
- **`get_client_state()`**: Serialises `STATE` into the JSON response shape the frontend expects.

**API endpoints:**
- `POST /api/init` — Creates a new game
- `GET /api/state` — Returns current game state
- `POST /api/start_match` — Generates opponent squad, begins match phase
- `POST /api/resolve_turn` — Simulates one 15-minute turn
- `POST /api/post_match` — Awards XP, triggers level-up events
- `POST /api/apply_training` — Pre-match training selection
- `POST /api/toggle_card` — Enable/disable a skill card
- `POST /api/apply_choice` — Resolves a pending level-up trait/class choice

### Frontend (`index.html`) — Single-file SPA

Pure HTML/CSS/JS with no build step or external dependencies. Global state is held in `G` (a JS object mirroring the backend's `get_client_state()` response).

**Render flow:** `render()` → `renderHeader()`, `renderSquad()`, `renderCards()`, `renderCenter()`. The center panel switches based on `G.phase`: `pre_match`, `in_match`, `post_match`, `levelup`.

**Game phases (frontend-visible):**
1. `pre_match` — Training selection + league table view
2. `in_match` — Turn-by-turn match resolution with log
3. `post_match` / `levelup` — XP report + modal prompts for trait/class choices

### Game Mechanics Summary

- **Squad**: ~11 players with position slots, classes (e.g. Finisher, Tackler), traits, level, XP, and fatigue.
- **Match**: 6 turns. Each turn: compute 6 phase scores per team → possession → chance count → goal rolls.
- **Skill cards**: Manager equips up to N cards from `available_cards`. Cards modify phase scores or chance generation for home or away.
- **Progression**: Players earn XP per match based on minutes played and fatigue. At milestone levels (`TRAIT_UNLOCK_LEVELS`, `CLASS_UNLOCK_LEVELS`) a modal prompts the user to pick traits or upgrade classes.
- **Fatigue**: Increases each turn based on `FATIGUE_TICK_RATE` per position. Affects XP multiplier.

### Untracked Files

- `OPPONENT_AI_PATCH.txt` — A patch instruction document describing how to add an opponent AI card system (archetypes, `generate_opponent_loadout()`, passing `away_cards` to `resolve_turn()`). **Not yet applied to `app.py`.**
