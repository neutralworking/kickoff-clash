# kickoff-clash — backlog

Scope notes for the first-milestone burn-down. Each file is a self-contained delegation pack: outcome, acceptance, boundaries, non-goals, references. Pick one and execute.

**Ordering** (from BASELINE.md, highest-leverage first):

1. `01-power-range-widening.md` — unblocks goal-chance math
2. `02-personality-multiplier-audit.md` — depends on 01 for cleaner numbers
3. `03-zombie-engine-cleanup.md` — independent, safe, low risk
4. `04-archetype-distribution-fix.md` — independent, content-side
5. `05-eslint9-migration.md` — independent, infra
6. `06-archive-stale-design-docs.md` — independent, housekeeping

**Independence map** (which tasks can run in parallel without stepping on each other):

- **Safe-to-parallelize:** 03, 05, 06 (zero overlap with each other, no shared files)
- **Sequential:** 01 → 02 (02 uses the rebalanced numbers from 01)
- **Conflict with 01:** 04 (both edit `kc_characters.json`) — do one after the other

Source: `../BASELINE.md`.
