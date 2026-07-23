# Kickoff Clash V7 engine implementation

V7 is implemented beside V6 under `src/engine-v7`. The package is pure TypeScript and must not import React, browser APIs, Supabase clients, or mutable global randomness.

## First vertical slice

Implemented:

- serializable V7 contracts;
- namespaced deterministic RNG;
- stat order: printed → latest set → swap → flats → multipliers → round toward zero;
- global chance count;
- regional chance allocation;
- strongest/weakest ranking;
- 3/5/7 break-budget receipts;
- initial break-plan validation;
- typed receipt creation;
- foundational Vitest coverage.

## Package boundaries

- `core/`: deterministic calculations with no match orchestration.
- `actions/`: conditions, targets, effects, copy and disable resolution.
- `formations/`: geometry, compatibility and automatic mapping.
- `planning/`: plan construction and legality.
- `runtime/`: match orchestration and event receipts.
- `data/`: validated static definitions.
- `__tests__/`: headless engine tests.

## Action runtime slice

The action runtime lives in `actions/` and is the layer that turns printed
actions into runtime instances and turns their firing into ledger effects and
receipts. Its one design rule: **actions create deterministic receipts and
effects; they never reach into match state and mutate scores, stats or
chances.** A later break resolver reads the ledger and applies it.

- `instances.ts` — `createActionInstance` / `instantiatePlayerActions` build a
  `RuntimeActionInstance` from a printed action; `copyActionInstance` mints an
  independent copy that re-rolls its own printed charges (depleting a copy never
  touches the original) while preserving the original printed source.
- `charges.ts` — printed charge initialisation and immutable
  consume/restore/add/remove. An action with no printed count is uncharged and
  gated only by once-per-break.
- `activate.ts` — the gated activation path for `activated` /
  `manager_activated` actions: disabled / already-activated-this-break /
  no-charges are **blocks** (no charge spent); failed conditions and empty
  required targets are **fizzles** (no charge spent); success spends one charge,
  marks `activationCountThisBreak`, and mints `activated`-origin ledger effects.
  `resetBreakActivations` clears the flag at a break boundary.
- `dispatch.ts` — `dispatchGameStart` fires the once-per-match `game_start`
  actions; `rebuildOngoing` regenerates one side's ongoing effects from live
  state each period (clear + regenerate), so an ongoing effect disappears when
  its source is disabled and returns on re-enable. Progress accumulators (e.g.
  Glass, seeded `runtimeState.accrues`) tick only while enabled — disabling
  **pauses** stored progress rather than resetting it.
- `effects.ts` — the `LedgerEffect` record, deterministic ids, and
  `EffectDuration → EffectLifetime` translation; immutable ledger ops.
- `expiry.ts` — `effectSurvives` / `expireLedger` remove temporary effects at
  `break_end` / `period_end` / `match_end` boundaries, as a pure function of
  lifetime and boundary.
- `disable.ts` — `disable`/`enable`/`isActionDisabled` and the disabled-id set.

Gate: `npx vitest run src/engine-v7` (`__tests__/action-runtime.test.ts` proves
charge init, copy independence, once-per-break, cross-action activation, charge
consumption only on success, fizzle receipts, disabled suppression, ongoing
disappear-while-disabled, paused-then-resumed Glass progress, period-boundary
expiry, and byte-identical replay).

## Break resolver slice

The break resolver lives in `resolve/` and turns two locked break plans into the
next period's opening state. It consumes the action runtime and holds to the same
rule — new immutable state, an appended effect ledger, and an ordered receipt
trail; it resolves lineups and effects, it does not roll dice (that is the next
slice).

- `stats.ts` — the effective-stat ledger: folds every stat-touching
  `LedgerEffect` (set → swap → flat → multiply, in ledger order) onto printed
  stats, then applies the emergency-goalkeeper rule and the A3 out-of-position
  penalty (current sector ≠ natural sector, −2/−2, floored at 0). Produces
  `EffectivePlayer` records; reads the ledger, never writes it. Also holds
  `CardRegistry` (the static cards / actions / formations the resolver hydrates).
- `priority.ts` — V6 spec B5: sector control by ATT+DEF → more sectors →
  priority; tie → total strength; tie → alternate. `resolutionOrder` puts the
  leader first.
- `lineup.ts` — applies a plan's formation switch + ordered subs (subbed-off →
  `removed`; incoming bench card takes the replaced card's slot + sector, free
  placement) + movement, immutably, with a receipt per change.
- `context.ts` — the bridge that builds the action runtime's `ConditionContext`
  / `TargetContext` views from live state + effective stats, rebuilt at the
  instant each side resolves (so the trailing side sees the leader's landed
  cards — A1).
- `chances.ts` — chance CREATION for the upcoming period: global count
  `ceil((teamATT − enemyDEF)/5)`, regional allocation, capped at the natural
  per-sector max, defaulting to the d6-only goal threshold.
- `break.ts` — `resolveBreak`: reset once-per-break flags → in priority order,
  each side runs before-lineup activations → applies its lineup → runs
  after-lineup activations → recompute both sides' ongoing effects → create the
  upcoming chances. Returns new state + ledger + per-side chances + receipts.

Gate: `npx vitest run src/engine-v7` (`__tests__/break-resolver.test.ts` proves
priority, effective-stat folds + positional penalties, subs/free-placement,
staged activation with A1 ordering, ongoing recompute, chance creation, and
deterministic replay).

## Next slice

Period resolution — the dice, wired onto the chances this resolver creates:

1. chance resolution: roll each surviving token (d6 ≥ its `minimumGoalRoll`),
   `add_reroll` / `set_goal_threshold` / cancel-chance token effects, and the
   attribution substream (scorer/saver, separate from the roll stream — B2);
2. goal + score updates and the dice receipts;
3. End of Period timing snapshots + priority recompute for the next break;
4. the full match loop tying periods and breaks together.
