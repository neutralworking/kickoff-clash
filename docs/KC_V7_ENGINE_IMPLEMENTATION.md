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

## Next slice

The break resolver, which connects this action runtime to the rest of the
match:

1. period chance resolution and dice receipts;
2. break resolver with before/after internal stages (formation changes,
   substitutions and movement, reveal-priority order);
3. ongoing recalculation and chance creation inside resolution;
4. End of Period timing snapshots.
