# V8 shop and team-selection handoff

Date: 2026-08-12

## Player acquisition

The live run now has one canonical authored player pool: `V8_RUN_PLAYER_POOL` in `src/game-v8/roster.ts`.

- starter player packs draw from this pool;
- Player Pick, Card Pick and Rare+ Pick draw from this pool;
- Scout and Elite packs draw from this pool;
- every acquired card carries its V8 player id, real name, printed cost, ATT, DEF and authored Action into later fixtures.

The old `ALL_CARDS` fictional JSON pool remains only for historical compatibility paths. It must not be reintroduced into the live opening or between-match shop.

## Managers and team selection

Match Energy supersedes the old starting-XI cost budget. Manager profiles and manager cards no longer carry or display a maximum XI cost. Team selection does not show or enforce `COST / MAX`.

The team-selection screen now:

- uses the header `TEAM SELECTION v {opponent}`;
- does not show the former HOME/opponent pitch toggle;
- does not show the DEF/BAL/ATT intent selector;
- does not show the player-card information badge on pitch cards;
- keeps the squad ATT and DEF totals.

## Validation

Coverage verifies that every shop offer belongs to the V8 run roster and that a signed shop player enters the next V8 fixture under their authored identity and Action rather than the legacy adapter.
