# 03 — Zombie engine cleanup

**Source:** `BASELINE.md` "Broken / zombie" table.

## Outcome

The v2 match engine in `scoring.ts` and any dead "hand evaluation" layer in `hand.ts` are removed from the repo. `run.ts:12` no longer imports dead symbols. `scoring.ts` becomes the pure types/constants file it should be. Build still passes, harness still runs, UI still boots.

## Why

Three match engines exist in the repo. One is live (`match-v5.ts`). Two are zombies:
1. **v2 engine in `scoring.ts`** — `createMatchState`, `advanceMatchState`, `resolveRound`, `calculateXIStrength`. All live callers are commented out in `run.ts` (lines 761–813 and 815+). Imports at `run.ts:12` still bundle the dead code.
2. **Intermediate "hand evaluation" layer** — referenced by deprecation comments as `evaluateHand + resolveMatch from hand.ts`. May still exist in `hand.ts` or may already be removed. Needs audit.

Dead code bundled into production is worth cleaning up, but more importantly, three engines in one codebase is a readability and safety hazard for future contributors.

## Acceptance criteria

- [ ] Delete from `scoring.ts`:
  - `createMatchState` function
  - `advanceMatchState` function
  - `resolveRound` function
  - `calculateXIStrength` function
  - `MatchState` interface (if unused after the above deletions)
  - `RoundResult` interface (if unused)
  - Any helpers only used by the above
- [ ] Delete from `run.ts:12` the dead imports: `calculateXIStrength, resolveRound, createMatchState, advanceMatchState`. Also delete `MatchState, RoundResult` from the `export type` line at `run.ts:1113` if no live consumers remain.
- [ ] Remove the commented-out `/* export function playRound ... */` block in `run.ts` (lines ~761–813) and the commented-out `/* export function finalizeMatch ... */` block (lines ~815+). Dead commented code is noise.
- [ ] Audit `src/lib/hand.ts` for the intermediate layer:
  - Grep for `evaluateHand`, `resolveMatch` inside `hand.ts`
  - For each, check if it's called from any live path (not inside `/* */`)
  - If dead: delete
  - If live: leave, add a one-line comment explaining what layer it belongs to
- [ ] `npm run build` passes with zero type errors.
- [ ] `npm run dev` boots cleanly.
- [ ] `npx tsx scripts/match-harness.ts` still runs the baseline match end-to-end successfully.
- [ ] Diff summary: lines deleted, files touched, any surprises.

## Boundaries

- Pure deletion only. **No behavior changes.**
- Do not refactor live code in `scoring.ts` or `run.ts` — just remove the dead stuff.
- Do not rename files.
- Do not introduce new abstractions.

## Non-goals

- Don't migrate any tests (none exist yet anyway).
- Don't touch `match-v5.ts` or `chemistry.ts`.
- Don't reformat remaining files beyond trailing-whitespace cleanup.

## Risks / watchouts

- **False positives** — something may look dead but be imported by a file I didn't grep. TypeScript will catch this on `npm run build`. If build fails, revert the specific deletion and report which live path pulled the "dead" symbol.
- `hand.ts` audit is the fuzzy part. If you find something that's clearly live-but-legacy, leave it and document — don't get creative.

## Done when

`grep -rn "createMatchState\|advanceMatchState\|resolveRound\|calculateXIStrength" src/` returns zero results, build passes, harness passes, dev server boots.
