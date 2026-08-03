# CLAUDE.md

This file provides current guidance to Claude Code when working in this repository.

## Required first read

Read [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) before changing code.

The repository contains several historical engine trees and contradictory older documents. Do not infer the current direction from file names, age, or old root specifications. The active code and `docs/CURRENT_STATE.md` are authoritative.

## Current integration branch

The latest integrated work is on:

```text
agent/manager-production-integration
```

Review PR:

```text
#92 — Start the V1 manager production integration
```

This branch contains the current stacked UI/run-flow work from PRs #85–#89 plus the manager-card work merged by PR #91.

PR #90 is a rejected direction. Do not base work on `agent/player-pack-opening`, do not restore its individual reveal loop, and do not restore its tactic-pack stage.

## Current product rules

- Kickoff Clash is a mobile-first football card battler and roguelike.
- The established `GameShell` continues to own packs, squad selection, cups, rewards, shops, economy, persistence and end states.
- The integrated match target is the V7 engine/controller/presentation path.
- A fresh V1 run opens a manager pack, reveals players as a group, enters team selection and then plays the V7 match.
- Tactic cards are out of scope for V1. Existing tactic code is legacy residue, not a requirement.
- Managers determine the available formation selector and the maximum starting-XI cost.
- Managers have named actions, one to three formations and no V1 style/archetype/class identity.
- Player and manager rarity is communicated through frame treatment, not a written label.

## Engine workstream

For concurrent engine work:

1. pull the latest `agent/manager-production-integration`;
2. create a new engine branch from that exact head;
3. keep the engine PR based on `agent/manager-production-integration` unless the owner explicitly changes the integration base;
4. focus changes on the current V7 path;
5. avoid opportunistic UI/card changes.

Primary engine ownership:

- `src/engine-v7/`;
- tests under `src/engine-v7/`;
- deterministic rule resolution and receipts;
- `src/game-v7/` when controller or presentation translation must change to support the receipts;
- engine fixtures and simulation scripts.

The engine must remain deterministic and receipt-driven. Update or add tests with rule changes.

## Current match architecture

- `src/engine-v7/` — headless match rules and authoritative receipts.
- `src/game-v7/` — match controller and receipt-to-presentation layer.
- `src/components/match-v7/` — match UI.
- PR #85's live-to-V7 integration — adapts the selected live squad and opponent into the V7 match.
- `src/components/GameShell.tsx` — complete run lifecycle and post-match handoff.

Preserve the live result handoff: score, win/draw/loss, goal attribution, player of the match, active XI and remaining bench must continue to feed the existing run progression.

## Do not invest in historical engine paths

Unless the owner explicitly reopens them, do not start new implementation in:

- `src/engine/`;
- `/rebuild`;
- `src/engine-v2/`;
- legacy V5/V6 match presentation paths;
- the old V6 match screen;
- stale design specs that conflict with `docs/CURRENT_STATE.md`.

Historical tests may remain green as repository hygiene. They are not the current product acceptance gate.

## Parallel ownership and conflict avoidance

The UI/card work remains on PR #92.

UI lane primarily owns:

- `src/components/manager-cards/`;
- `src/components/player-cards/`;
- `src/components/PackReveal.tsx`;
- team-selection presentation and phone sizing;
- manager V1 metadata and run-flow integration;
- dossier and card-inspection surfaces.

Coordinate before changing these shared files:

- `src/components/GameShell.tsx`;
- `src/components/SquadScreen.tsx`;
- `src/components/match-v7/*`;
- `src/lib/run.ts`;
- `src/lib/jokers.ts`;
- `src/lib/v6-bridge.ts` or live/V7 adapter files;
- `src/lib/formations.ts`;
- starter-pack and run-persistence contracts.

Do not change match rules in a visual/card branch. Do not restyle cards or team selection in an engine branch.

## Current manager migration state

`src/lib/manager-v1.ts` is the explicit V1 metadata bridge.

Current defaults are migration-safe, not final balance:

- action name currently derives from existing roster data;
- formation pool begins with the existing single formation;
- maximum starting-XI cost begins at 45.

Upcoming run-state work will:

- replace the legacy `(managerId, tacticId)` callback;
- persist manager formations and XI cap;
- restrict team selection to the active manager's formations;
- enforce the manager-owned XI cap;
- leave a future hook for formation-unlock consumables.

Do not bake the temporary no-tactic sentinel into new permanent contracts.

## Card contracts that engine work must not break

Player face, clockwise:

1. cost top-left;
2. primary position top-right;
3. DEF bottom-right;
4. ATT bottom-left.

The normal player face also has portrait, name and action name. It does not have overall, fitness, durability, role or written rarity.

Active match tokens use current effective ATT/DEF and contextual overlays. Permanent printed values and complete rules live in the player dossier.

Manager faces show formations, portrait, name, named action/effect and starting-XI cap. They do not show ATT, DEF, written rarity, class/style/archetype or tactic resources.

## Mobile acceptance baseline

Always verify at:

- 390 × 844;
- 375 × 667.

The team-selection pitch uses four presentation lines: forwards, midfield, defence and goalkeeper. This is a visual mapping only; do not reinterpret it as a change to slot identity, eligibility or engine geometry.

Do not approve a phone layout from desktop rendering or dimension arithmetic alone.

## Commands

```bash
npm install
npm run dev       # http://localhost:3001
npm run build
npm run lint
npm test
```

Check `package.json` before using focused playtest or simulation commands copied from older documents.

## Working rules

- Start major run-state QA with a fresh run.
- Keep new PRs draft until the owner reviews the actual mobile flow.
- Do not merge, rebase or rewrite stacked branches without explicit instruction.
- Preserve deterministic tests and existing integration contracts unless a coordinated migration is part of the task.
- Record a changed product or engine decision in `docs/CURRENT_STATE.md` or a dated handoff in the same PR.
- When documentation conflicts, `docs/CURRENT_STATE.md` and the active branch win.
