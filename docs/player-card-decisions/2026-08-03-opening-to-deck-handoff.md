# Opening to Deck Handoff — 2026-08-03

## Product flow

The V1 run opening is:

1. manager pack and manager choice;
2. one grouped reveal of 18 player cards;
3. initial active-deck overview;
4. team selection.

There is no tactic-pack stage and no one-card-at-a-time player reveal.

## Initial deck

- The starter player pack contains exactly 18 players.
- All 18 revealed players automatically become the first active deck.
- The opening overview presents that deck as a fixed 3 × 6 grid.
- The overview is confirmation and inspection, not a second mandatory deck-building task.
- Tapping any card opens its dossier.
- Continuing saves the exact 18 IDs to the shared active-deck store before team selection opens.
- Team selection then uses the same deck as 11 starters plus seven substitutes.
- The player can edit the deck later from team selection or the store.

## Screen hierarchy

The opening progress has three steps rather than describing the deck overview as a third pack:

- manager;
- players;
- deck.

The deck overview shows:

- the selected manager;
- an 18/18 deck count;
- the complete 3 × 6 active deck;
- one clear `TEAM SELECTION` continuation action.

## Scope guardrails

- Do not restore tactic selection.
- Do not split the player opening into Rare/Common packs.
- Do not use individual card reveals.
- Do not require the player to rebuild the initial deck before the first team-selection screen.
- Do not change V7 engine rules or live adapters in this UI slice.
