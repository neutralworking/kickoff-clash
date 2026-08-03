# Deck Builder and Team Selection — 2026-08-03

## Product decision

Deck building and team selection are separate concepts and separate screens.

## Collection and active deck

- The owned player-card collection can grow well beyond the matchday limit, including 50+ cards.
- The active deck contains exactly 18 player cards.
- The deck-builder screen presents the active deck as a fixed 3 × 6 grid.
- The remaining collection appears below as larger, browseable cards.
- Cards move between the collection and the active deck by tap/swap interactions.
- The deck builder must be accessible from team selection and from the store.

The active deck is not a 16-card deck. Any older wording that describes 16 players as the run deck is superseded.

## Team selection

Team selection works only with the active 18-card deck:

- 11 starters;
- 5 substitutes;
- 2 reserves still inside the active deck.

The two reserves remain available to swap into the starting XI or substitute bench before kickoff, but do not need to occupy permanent card space on the main team-selection screen.

## Team-selection hierarchy

- Screen title is exactly `TEAM SELECTION`.
- Remove the subtitle/context line from the main header.
- ATT, DEF and budget remain but use a smaller compact presentation.
- Remove the DEF / BAL / ATT intent selector; it is no longer a gameplay factor.
- Put the manager control before formation.
- Rename `SHAPE` to `FORMATION`.
- Put the opposition preview in the space released by removing the intent selector.
- Remove the HOME toggle.
- Remove the permanent misfit counter.
- `EDIT DECK` opens the dedicated deck-builder screen rather than editing the full collection inside team selection.
- Use the released screen space to increase card size and make player name, action and corner values meaningfully readable.

## Current prototype

The review route is `/lab/squad-flow` on `agent/deck-builder-team-selection`.

The lab contains:

1. a functional 18-card deck builder with a 3 × 6 active-deck grid and enlarged collection cards;
2. a revised team-selection composition with compact ATT/DEF/budget, manager → formation → opposition controls, five visible substitutes and two reserves behind a focused tray.

Production run-state and store wiring should follow after the mobile lab is approved.
