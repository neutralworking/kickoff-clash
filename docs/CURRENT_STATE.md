# Kickoff Clash — Current State

**Last updated:** 2026-08-12
**Canonical branch for the integrated work in progress:** `agent/v8-production-run`
**Canonical review PR:** [#117 — V8 production run](https://github.com/neutralworking/kickoff-clash/pull/117)

This document is the first read for anyone joining the repository. It describes the current product direction, the active branch stack, the boundaries between UI and engine work, and the decisions that supersede older design documents.

## Product direction

Kickoff Clash is a mobile-first football card battler and roguelike. The player builds an 18-player squad, chooses a manager, selects the eleven players who enter the match, and plays through a football-themed card-battle presentation. The other seven players are pre-match alternatives, not in-match substitutes.

The current implementation direction combines:

- the established live run shell for packs, squad selection, cups, rewards, shops, economy and persistence;
- the V8 match controller, rules and presentation for the match itself;
- the newly groomed player- and manager-card family across the live flow.

The implementation version name `V8` is not the product release number. The product scope discussed below is V1.

## Current source of truth

For current work, use sources in this order:

1. this document;
2. the current code on `agent/v8-production-run`;
3. the active PR descriptions in the stack below;
4. dated decision documents in `docs/player-card-decisions/`;
5. older root and `design/` documents only as historical context.

Where an older document conflicts with this file or the active branch, the active branch and this file win.

## Active branch and PR stack

The UI/run-flow work is stacked. The latest branch contains the preceding card and match-integration work.

| PR | Branch | Purpose | Status |
|---|---|---|---|
| [#85](https://github.com/neutralworking/kickoff-clash/pull/85) | `agent/live-v7-match-integration` | Connect the established live run shell to the improved V7 match | Draft, unmerged |
| [#86](https://github.com/neutralworking/kickoff-clash/pull/86) | `agent/player-card-prototype-lab` | Player-card family prototype | Draft, unmerged |
| [#87](https://github.com/neutralworking/kickoff-clash/pull/87) | `agent/player-card-team-selection` | Groomed cards in team selection | Draft, unmerged |
| [#88](https://github.com/neutralworking/kickoff-clash/pull/88) | `agent/player-card-v7-match` | Groomed cards in the V7 match | Draft, unmerged |
| [#89](https://github.com/neutralworking/kickoff-clash/pull/89) | `agent/player-card-dossier` | Shared player dossier | Draft, unmerged |
| [#91](https://github.com/neutralworking/kickoff-clash/pull/91) | `agent/manager-card-system` | Manager-card family | Merged into `agent/player-card-dossier`, not into `main` |
| [#92](https://github.com/neutralworking/kickoff-clash/pull/92) | `agent/manager-production-integration` | Live manager opening, grouped player reveal and iPhone sizing | Active draft, unmerged |
| [#108](https://github.com/neutralworking/kickoff-clash/pull/108) | `agent/v8-opponent-reveal-goals` | Opponent reveal and goal-payoff choreography | Draft, unmerged |
| [#109](https://github.com/neutralworking/kickoff-clash/pull/109) | `agent/v8-snap-layout-intro` | Snap-style match layout and match intro | Draft, unmerged |
| [#110](https://github.com/neutralworking/kickoff-clash/pull/110) | `agent/starter-pack-choice-reveal` | Choice-of-three starter packs and reveal flow | Draft, unmerged |
| [#111](https://github.com/neutralworking/kickoff-clash/pull/111) | `agent/v8-starter-roster-swipe` | V8 roster packs, two-page squad reveal and XI-only match handoff | Active draft, unmerged |
| [#117](https://github.com/neutralworking/kickoff-clash/pull/117) | `agent/v8-production-run` | V8 production match, authored shop roster and end-to-end run integration | Active draft, unmerged |

### Rejected branch

[#90](https://github.com/neutralworking/kickoff-clash/pull/90) (`agent/player-pack-opening`) is not the chosen direction. Its one-card-at-a-time reveal and tactic-pack flow were rejected. Do not base new work on it and do not copy its tactic stage into the current flow.

## Current live-flow target

A fresh V1 run should move through:

1. a blind choice of three sealed manager packs, followed by one hero manager reveal;
2. a new blind choice of three sealed player packs drawn from the implemented V8 historical-player roster;
3. a grouped 18-player reveal presented as two swipeable, complete 3×3 pages;
4. squad/team selection;
5. V8 match;
6. existing post-match, shop, cup and economy flow.

Tactic cards are out of scope for V1. Older tactic-card, tactic-pack and charged-action code remains in the repository as implementation residue. Do not restore it to the starter flow or treat it as the current requirement.

The starter opening now hands the selected manager and selected 18-player pack into team selection directly. The old `onContinue(managerId, tacticId)` callback and no-tactic sentinel are no longer part of this path.

The 18-player squad is a pre-match selection pool: eleven selected players enter the match, while the other seven remain available for quick XI changes before later fixtures. They are not substitutes and do not cross into the current match fixture. The historical bench-capable engine remains in the repository, but the active run handoff is XI-only.

## Locked card decisions

### Player cards

Normal player-card faces show:

- portrait;
- surname/name;
- primary position;
- one cost represented by one pip cluster;
- ATT and DEF;
- action name;
- rarity through frame treatment only.

Fixed corner order, clockwise from top-left:

1. cost;
2. position;
3. DEF;
4. ATT.

Do not add overall rating, fitness, durability, role or written rarity to the normal face. Team-selection cards show the printed primary position, not the slot in which the card is currently deployed.

The full-screen player dossier holds complete rules, secondary positions, contextual match values and other supporting information. The permanent card face retains printed values; match-only changes are shown outside it.

### Manager cards

Managers determine the available formation selector. They do not merely prefer a formation.

Each manager has:

- a named action and readable effect;
- a pool of one, two or three available formations;
- a portrait and rarity frame treatment.

Managers do not have V1 styles, archetypes or class identities. Do not show a generic `MGR` label, written rarity, ATT, DEF, player cost, starting-XI cost/max, tactic charges, class crest or adherence percentage.

The production metadata contract is in `src/lib/manager-v1.ts`. Current migration defaults are intentionally conservative:

- the action name is derived from existing roster data until every manager has a dedicated authored value;
- the formation pool begins with the single existing formation.

Match Energy replaces the former pre-match starting-XI cost cap.

## Mobile layout baseline

The primary QA viewports are:

- 390 × 844;
- 375 × 667.

PR #92 was browser-rendered at both sizes after the initial sizing pass proved insufficient.

Current layout rules include:

- manager selection is a horizontal snap carousel with one readable large card and the next option peeking in;
- team selection presents four readable tactical lines: forwards, midfield, defence and goalkeeper;
- 390 × 844 pitch cards use 60 × 80 dimensions;
- short screens reduce pitch cards to 52 × 69;
- five bench cards fit across a 375px viewport;
- safe areas use `viewport-fit=cover` and environment insets.
- the live V8 match pitch is centred and occupies roughly 40–50% of the phone viewport height;
- the match hand uses two visible rows rather than a horizontal scroller, with the manager Action first;
- match-hand cards support real coarse-pointer drag and drop into a location while retaining tap-to-select and tap-to-place as the fallback;
- the persistent last-period recap and separate resolution panel have been removed; the live score contests carry the scoring payoff above the pitch.
- each committed play now reads literally: the source card flips with its Action, a large consequence badge appears on the affected card or zone, then travels into ATT/DEF before that number updates; generated Tacticals travel toward the hand while blocked Actions stay on their target.
- the period CTA is `CONFIRM`; priority is shown by a ball beside the relevant team score, committed cards flip without reveal narration, ATT/DEF totals update with each card, and every full +5 attacking margin becomes a ball that travels from its contest into the match score before that score increments.

Do not approve phone layouts from desktop screenshots or width arithmetic alone. Render at both target viewports and inspect the full screen.

## Engine and presentation architecture

### Current integrated target

The current match integration uses:

- `src/engine-v8/` — headless deterministic match rules and receipts;
- `src/game-v8/` — controller, authored run roster and live fixture translation;
- `src/components/match-v8/` — match UI;
- the live-to-V8 integration on the active branch;
- `GameShell` as the owner of the complete roguelike run lifecycle.

The match must return a result that the existing live shell can use for score, rewards, records, squad state and progression.

### Historical engine trees

The repository contains several older engine directions and documents. Do not begin new implementation in these areas unless the owner explicitly reopens them:

- `src/engine/` and `/rebuild`;
- `src/engine-v2/`;
- old V5/V6 match documents and legacy match presentation paths;
- the legacy V6 match screen.

Tests for historical code may remain green as repository hygiene, but passing them does not make those systems the current product target.

## Parallel-work boundaries — August 2026

Two workstreams may run simultaneously.

### UI, card and run-flow lane

Current branch: `agent/manager-production-integration` / PR #92.

Primary ownership:

- `src/components/manager-cards/`;
- `src/components/player-cards/`;
- `src/components/PackReveal.tsx`;
- team-selection presentation and mobile sizing;
- dossiers and card inspection;
- manager V1 metadata and run-flow integration;
- product and handoff documentation.

### Engine lane for Claude

Create the engine branch from the latest `agent/manager-production-integration` commit, then keep the PR based on that branch unless the owner explicitly chooses another integration base.

Primary ownership:

- `src/engine-v7/`;
- engine tests under that tree;
- deterministic receipts and rule resolution;
- `src/game-v7/` where controller changes are required by engine receipts;
- engine-specific fixtures and simulation scripts.

Engine work must preserve the UI-facing contracts unless the contract change is documented and coordinated before implementation.

### Shared or conflict-prone files

Coordinate before changing these files because both lanes may need them:

- `src/components/GameShell.tsx`;
- `src/components/SquadScreen.tsx`;
- `src/components/match-v7/*`;
- `src/lib/run.ts`;
- `src/lib/jokers.ts`;
- `src/lib/v6-bridge.ts` and live/V7 adapters;
- `src/lib/formations.ts`;
- starter pack/run-persistence contracts.

Do not make opportunistic UI restyles inside an engine branch, and do not change match rules inside a card/layout branch.

## Immediate next work

### Run and manager integration

- replace the legacy manager/tactic callback with a V1 manager selection contract;
- restrict the team-selection formation selector to the active manager's formations;
- support future formation-unlock consumables without building the full store treatment yet.

### Engine work

- continue rule work in the V8 engine/controller path;
- keep resolution deterministic and receipt-driven;
- preserve the eleven-player match handoff and keep the seven alternatives in pre-match squad selection only;
- add or update tests before changing presentation assumptions;
- document any receipt or adapter contract change in this file or a dated handoff.

### Balance and data

- author final manager action names;
- assign final one-to-three formation pools;
- revisit portrait crops with the curated portrait set;
- tune starter player counts and rarity distribution only after the grouped reveal and squad requirements are settled.

## Validation commands

```bash
npm install
npm run dev       # http://localhost:3001
npm run build
npm run lint
npm test
```

Useful focused commands already present in the repository include the V7/V6 playtest scripts and Vitest suites. Check `package.json` before assuming a historical command is still supported.

## Working rules

- Start from a fresh run when testing major run-state changes; old saved runs are not guaranteed to migrate.
- Keep PRs draft until the owner has reviewed the actual mobile flow.
- Do not merge stacked PRs or rewrite branch history without explicit instruction.
- Record product decisions in the repository, not only in chat or PR comments.
- When a new decision supersedes this file, update this file in the same PR as the implementation.
