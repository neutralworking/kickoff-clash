# Kickoff Clash

A mobile-first football card battler and roguelike. Build a squad, choose a manager, select an XI and seven-player bench, then play matches through a football-themed card-battle presentation.

## Read this first

The repository has passed through several engine and design directions. Many older root and `design/` documents are retained for history but no longer describe the active implementation.

**Canonical project handoff:** [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)

That document records:

- the active branch and PR stack;
- the current V1 product decisions;
- the player- and manager-card contracts;
- the current V7 engine/presentation architecture;
- mobile QA targets;
- parallel-work boundaries for UI and engine development;
- immediate next work.

## Current integration point

As of 2026-08-03, the latest integrated work is:

- branch: `agent/manager-production-integration`;
- PR: [#92 — Start the V1 manager production integration](https://github.com/neutralworking/kickoff-clash/pull/92);
- base stack: PRs #85–#89, with PR #91 merged into the PR #89 branch.

PR #90 is a rejected opening-flow direction and must not be used as a base.

## Current product flow

The target fresh-run flow is:

```text
Manager pack and choice
        ↓
Grouped player-pack reveal
        ↓
Squad / team selection
        ↓
V7 match
        ↓
Existing post-match, shop, cup and economy flow
```

Tactic cards are out of scope for V1. Legacy tactic code may remain in the repository, but it is not the current product requirement.

## Architecture at a glance

- `src/components/GameShell.tsx` owns the complete roguelike run lifecycle.
- `src/engine-v7/` contains the current headless deterministic match rules and receipts.
- `src/game-v7/` contains the V7 controller and presentation translation.
- `src/components/match-v7/` contains the current match presentation.
- `src/components/player-cards/` contains the groomed player-card and dossier family.
- `src/components/manager-cards/` contains the groomed manager-card and dossier family.
- `src/lib/manager-v1.ts` contains the V1 manager metadata bridge.
- `src/lib/run.ts` remains the live run-state model and is due for the manager formation/cost-cap migration.

Do not begin new work in `src/engine/`, `src/engine-v2/`, `/rebuild`, or legacy match-screen paths unless the product owner explicitly reopens them.

## Mobile baseline

Primary QA viewports:

- 390 × 844;
- 375 × 667.

Phone layouts must be rendered and inspected at both sizes. Desktop screenshots and calculated dimensions are not sufficient approval evidence.

## Getting started

```bash
npm install
npm run dev       # http://localhost:3001
npm run build
npm run lint
npm test
```

The project uses Next.js 16, React 19, TypeScript and Tailwind CSS. Check `package.json` for the current focused playtest and simulation commands before using commands from older documentation.

## Parallel engine work

Engine work should branch from the latest `agent/manager-production-integration` commit and focus on `src/engine-v7/`, its tests, and necessary `src/game-v7/` controller changes.

UI/card work remains on PR #92. Coordinate before changing shared integration files such as `GameShell.tsx`, `SquadScreen.tsx`, `src/lib/run.ts`, adapters or `src/components/match-v7/*`.

See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the complete ownership and conflict map.
