# 09 — Manager traits rework

**Source:** 0.3 owner feedback ("Manager traits need a full rework"). Deferred from the 0.1→0.3 push.

## Outcome

Manager (gaffer) cards that play like real Balatro-style jokers: parametrised, conditional, build-defining effects — not eight static "count an archetype, add a flat number" functions with decorative tags.

## Why

`src/lib/jokers.ts` defines 8 `ALL_JOKERS`, each a `JokerCard` with a `compute(xi, connections) → number` that is a shallow filter-and-flat-bonus (e.g. Roy Tanner: +30 per Target/Powerhouse; Iain MacRae: +80 if a Captain is in the XI). `traits` are human-readable flavour tags, not mechanics. There's no parametrisation, no upgrade path, no conditional/multi-turn triggers, and no interaction with the run's decisions — so the manager is a passive number, not a strategy-setter. Per `KICKOFF_CLASH_DESIGN §3`, the Manager is supposed to be a squad-wide, run-long **strategy lean** (amplify a verb family) — the current model doesn't express that.

## Acceptance criteria

- [ ] Managers express **squad-wide strategy** via the verb palette (amplify a verb family), per `docs/ARCHETYPES_V1 §0` / `docs/KICKOFF_CLASH_DESIGN §3`, rather than opaque flat bonuses.
- [ ] At least some traits are **conditional / contextual** (read run or match state — e.g. fires only after conceding, only with bench rotation, scales with chemistry) via a `compute(ctx)` that receives richer context.
- [ ] Traits become **mechanics**, surfaced and explained on the card (tie into the 0.3 card system).
- [ ] `balance-lab` sign-off: no single manager dominates; the manager *rotates* the meta rather than solving it.

## Boundaries

- The dispatcher already supports squad-wide records (`squad-transforms.ts` → the verb dispatcher in `match-v5.ts evaluateSplit`); prefer expressing manager effects as `TraitRecord`s over the verb palette rather than bespoke math.
- Keep determinism (any randomness via the seeded RNG).

## Non-goals

- Player upgrades (`08`), shop (`07`), and player-card rework (`10`) are separate (though `10` should surface manager traits well).

## References

- `src/lib/jokers.ts` (`ALL_JOKERS`, `JokerCard`, `applyJoker`, `rehydrateJokers`), `src/lib/squad-transforms.ts`, `src/lib/verbs.ts` (palette), `src/lib/match-v5.ts` `evaluateSplit` (squad records), `docs/ARCHETYPES_V1.md`, `docs/KICKOFF_CLASH_DESIGN.md §3`.

## Done when

Managers are parametrised, conditional, palette-expressed strategy cards validated by the sweep.
