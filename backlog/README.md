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

## 0.3-deferred (next round)

System-design work noted during the 0.1→0.3 push (which shipped flow, the glass design
system, the squad gallery, and the match-info overhaul). These are bigger reworks the
owner asked to hold for the next round:

7. `07-shop-redesign.md` — coherent, seeded, rerollable shop offer + unified purchase path
8. `08-player-upgrade-rework.md` — replace the flat +5/+20 training with bounded, real choices
9. `09-manager-traits-rework.md` — parametrised, conditional, palette-expressed gaffer effects
10. `10-player-card-rework.md` — surface pillars/personality; decide if depth feeds the engine

**Independence:** 07 (economy/UI), 09 (jokers/dispatcher), 10 (card model) are largely
independent; 08 and 10 share the `pillars` surface — coordinate. All four want a
`balance-lab` pass before shipping. Source: 0.3 owner feedback.
