# Kickoff Clash V7 engine implementation

V7 is implemented beside V6 under `src/engine-v7`. The package is pure TypeScript and must not import React, browser APIs, Supabase clients, or mutable global randomness.

## Live-match slice (`src/game-v7` + `/lab/match-v7`)

The first playable V7 vertical slice runs one complete match through the browser
UI without touching V6 or the default game. It lives in the UI-adjacent
`src/game-v7` layer (which may import the engine; the engine never imports it):

- `adapter/` — `cards` (live `Card` → V7 player contract), `actions` (runtime
  instances), `lineup` (decisions → validated `BreakPlan`), `match` (registry +
  initial state + kickoff dispatch + UI view model). Every adapter returns a
  typed `AdapterResult` — invalid data surfaces as a visible error, never a
  silent patch.
- `receipts.ts` — engine receipts → an ordered UI event feed (authoritative; the
  UI never diffs state to invent events).
- `controller.ts` — a pure-TS `V7MatchController` that sequences the engine
  primitives (period → boundary → break) and enforces legality: no double
  resolve, no illegal plan, no advance past full time; deterministic + restart.
- `fixtures.ts` — a clearly-marked **development** fixture (two managers, two
  formations, full XIs + benches, V7-supported actions, a fixed seed). The
  frontend/DB does not yet emit V7 manager/formation/action contracts, so the
  fixture is authored in V7 shape; the live-card adapter is proven separately.

Entry: the unlinked dev route **`/lab/match-v7`** (mirrors `/lab/match-v6`); the
live root game at `/` stays V6. Gate: `npx vitest run src/game-v7`.

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

## Period resolution slice

Period resolution lives in `resolve/` + the top-level `match-loop.ts`. It rolls
the chances the break resolver created into goals, updates score and period
state, and loops the whole match — deterministically, immutably, receipt-first.

- `rerolls.ts` — the reroll policy. The contract gives a token a `rerolls` count
  but no forced/optional flag, so we resolve it as **mandatory on a miss, never
  on a hit** (rerolling a hit could only un-score it). A safety cap
  (`MAX_REROLLS_PER_TOKEN`) guarantees termination against pathological data.
- `rolls.ts` — `rollToken`: one d6 per token, scores when the roll meets or
  exceeds the token's `minimumGoalRoll`; misses re-roll per the policy, each
  reroll consuming the next RNG value (B2); cancelled tokens never roll. Every
  die (original + rerolls + accepted) is recorded.
- `attribution.ts` — credits a goal to an eligible scorer (active, can attack,
  not an emergency keeper) weighted by effective attack, on a **separate** RNG
  substream (B2 — attribution can't change whether the goal happened). Fizzles
  safely when no one is eligible (the goal is left unattributed, nothing mutated).
- `period.ts` — `resolvePeriod`: applies token-level ledger effects
  (`set_goal_threshold` / `add_reroll` / `cancel_chance`), rolls every token in a
  stable order, attributes goals, updates score immutably, and returns the
  end-of-period snapshot (score, token outcomes, goal events, active lineup,
  effective stats, ledger). Guards against resolving past the final period.
  Direct roll overrides are intentionally NOT implemented — no V7 contract
  permits setting a die result.
  - **Token targeting is explicit, never conventional.** Each token effect
    carries the resolved chance target preserved from the action —
    `LedgerEffect.tokenTarget = { side: own | enemy, selector: first_in_sector |
    all_in_sector }`, populated in `buildLedgerEffects` from the `chance`
    `ActionTarget` (`targets.ts` keeps the relative `own`/`enemy`). `own`
    resolves to the effect's acting `side`, `enemy` to the other side, so
    debuffing enemy chances is `side: enemy` (not an inference from the effect
    type); `first_in_sector` hits the lowest-order token per in-scope sector,
    `all_in_sector` hits every one. `applyTokenEffects` reads this target
    directly — the effect type only decides *what* happens to the selected
    tokens, never *whose*.
- `boundary.ts` — `processBoundary`: expires `period`-scoped effects (match
  effects survive), recomputes priority for the next break (B5), and reports
  match-over at the final period.
- `match-loop.ts` — `playMatch`: pure loop — period 1 opens from the initial
  board, then { break → next period → boundary } repeats to the final whistle.
  Returns state + ledger + per-period snapshots + ordered receipts + final score,
  fully replayable from a seed and the supplied break plans.

Gate: `npx vitest run src/engine-v7` (`__tests__/period-resolver.test.ts` proves
deterministic rolls/scorers/score/receipts, stable ordering, cancelled tokens
never roll, threshold-effect order, reroll consumption + termination, scored/
missed/attribution receipts, eligibility-only attribution + safe fizzle,
immutable score, `period_end` expiry with `match_end` survival, priority
recompute, the final period ending the match without double-resolution, and a
full multi-period replay).

## Next slice

The engine now resolves a full match end to end. Remaining V7 work is above the
match engine: the roguelike run loop + economy, modelled-opponent break-plan
selection (this slice consumes already-legal plans), and the `/lab/match-v7` UI —
all out of scope here and untouched.
