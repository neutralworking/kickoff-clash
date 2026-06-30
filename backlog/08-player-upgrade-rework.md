# 08 — Player upgrade rework

**Source:** 0.3 owner feedback ("upgrading players is way too simplistic and OP"). Deferred from the 0.1→0.3 push.

## Outcome

A player-progression system with real decisions and diminishing returns — not a flat power slider that lets a Common buy its way into Rare territory.

## Why

Training is the **only** upgrade path: `applyTraining` (`src/lib/run.ts` ~L1029) costs 8k and adds **+5 power**, capped at **+20** total (`TRAINING_MAX`), tracked in `RunState.trainingApplied[cardId]`. There is no build depth — no stat reallocation, no role/position teaching, no synergy unlocks, no diminishing returns. The effect is OP: a Common (50 power) reaches 70 (Rare-band) for 40k, flattening the rarity economy and making drafting quality nearly irrelevant. It's also a non-decision — there's only one button and it's always correct.

## Acceptance criteria

- [ ] An upgrade model with **meaningful choices** (e.g. multi-axis: a pillar/role/position investment rather than raw power; or a small skill tree per card).
- [ ] **Diminishing returns** and/or a rarity-aware cap so upgrades can't erase the drafted-quality gap.
- [ ] An `appliedUpgrades` record on `RunState` (replacing/extending `trainingApplied`) with an `applyUpgrade(state, upgrade)` that mutates the relevant `Card` fields.
- [ ] `balance-lab` sign-off (sweep) that upgraded squads stay monotonic in *drafted* strength and don't collapse the rarity bands.

## Boundaries

- The `Card` model already carries `pillars` (technical/tactical/mental/physical) — a natural upgrade surface — but the engine does **not** read pillars yet (see `10`). Decide with `10` whether upgrades feed power directly or via pillars.
- Keep the glassy shop visuals (0.3).

## Non-goals

- Shop offer redesign (`07`) and manager traits (`09`) are separate.

## References

- `src/lib/run.ts` `applyTraining` / `TRAINING_MAX` / `trainingApplied`, `src/lib/scoring.ts` `Card` (`pillars`, `power`), `src/components/ShopPhase.tsx` training UI, `scripts/balance-sweep.ts`.

## Done when

Upgrading is a real, bounded decision validated by the sweep — drafted quality still matters.
