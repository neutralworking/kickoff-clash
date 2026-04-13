# design/archive

These documents describe the pre-rename **fbal** era of the project. They are preserved for history only.

**Current design source of truth:** `MATCH_ENGINE_V5.md` at repo root.
**Current execution plan:** `BASELINE.md` at repo root + `backlog/` scope notes.

## Why these are here

- The project was renamed from `fbal` to `kickoff-clash` on 2026-04-12 as part of a portfolio cleanse.
- A Day 1 baseline on 2026-04-13 found that `design/README.md` and `design/ROADMAP.md` still described the Python/Flask prototype, referenced `localhost:5055`, linked to issues on the deleted `neutralworking/fbal` GitHub repo, and pointed at the archived `fbal-godot` Godot port.
- They were moved here in a single housekeeping commit via `git mv` rather than deleted, so `git log --follow` still reaches the original fbal history from the archive paths.

## What's here

- `README.md` — original fbal README with Python/Flask prototype instructions (`pip install flask`, `python app.py`, `localhost:5055`) and a Path-A/B/C/D roadmap against the pre-rename architecture.
- `ROADMAP.md` — original fbal Phase 1–3 roadmap: consolidate `app.py` / `match_engine.py`, card system, roguelike loop. References `fbal-godot/` and the `local-dev` / `main` branch split.
- `legacy-python/` — Python prototype snapshot: `app.py` (Flask web app) and `match_engine.py` (Python match resolver). Superseded by the TypeScript `match-v5` engine in `src/lib/match-v5.ts`.

## What is NOT archived

These docs remain under `design/` at their original paths. They need content review rather than blind archival:

- `design/PRD.md`
- `design/Football_PRD_v2.md`
- `design/QUICK_REF.md`
- `design/GETTING_STARTED.md`
- `design/OPPONENT_AI_PATCH.txt`
- `design/CLAUDE.md`

A follow-up task (to be created) will walk each individually and decide: keep, annotate, or archive.
