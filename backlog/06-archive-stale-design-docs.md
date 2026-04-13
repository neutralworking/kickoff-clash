# 06 — Archive stale design docs

**Source:** `BASELINE.md` "Stubbed / partial" + `README.md` "Stale docs (triage needed)".

## Outcome

Pre-rename fbal-era design docs no longer pollute `grep` / `find` results as if they were current. Git history is preserved. `design/` only contains docs that describe the current Next.js reality.

## Why

`design/README.md` and `design/ROADMAP.md` currently describe a Python/Flask prototype running at `localhost:5055`, reference `fbal-godot` and the `local-dev` branch, link to GitHub issues on the deleted `neutralworking/fbal` repo. All of it is false now. Anyone searching the repo for "ROADMAP" hits the wrong one first.

## Acceptance criteria

- [ ] `design/archive/` directory created.
- [ ] These three moved via `git mv` (preserves history):
  - `design/README.md` → `design/archive/README.md`
  - `design/ROADMAP.md` → `design/archive/ROADMAP.md`
  - `design/legacy-python/` → `design/archive/legacy-python/`
- [ ] `design/archive/ARCHIVE.md` written (new file). Content:
  - One paragraph: "These documents describe the pre-rename fbal era. They are preserved for history only. Current design source of truth: `MATCH_ENGINE_V5.md` at repo root."
  - Date archived and reason (portfolio rename 2026-04-12, baseline cleanup 2026-04-13).
- [ ] Single commit with a clear message: `chore: archive pre-rename fbal design docs`.
- [ ] **Do NOT touch:**
  - `design/PRD.md`
  - `design/Football_PRD_v2.md`
  - `design/QUICK_REF.md`
  - `design/GETTING_STARTED.md`
  - `design/OPPONENT_AI_PATCH.txt`
  - `design/CLAUDE.md`
  These need **content review**, not blind archival. A separate task (07 — to be created) will walk them individually.

## Boundaries

- Pure housekeeping. No code changes. No rewriting of archived content.
- `git mv` only — do not delete-and-recreate, that loses history.

## Non-goals

- Don't write new design docs.
- Don't triage the five docs listed in "Do NOT touch" — that's follow-on work.
- Don't update `README.md` (already references these archives correctly in its "Stale docs" section — the new paths will naturally resolve to `design/archive/`).

## Risks / watchouts

- None. This is a git mv + one new file + one commit. Lowest-risk task in the queue.

## Done when

`ls design/README.md design/ROADMAP.md design/legacy-python 2>&1` returns "No such file or directory" for all three, `ls design/archive/` shows the moved content plus the ARCHIVE.md note, `git log --follow design/archive/README.md` shows the full history back to the fbal era.
