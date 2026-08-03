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

Team selection uses the entire active 18-card deck:

- 11 starters;
- 7 substitutes;
- no reserves outside the substitute bench.

The substitute strip can scroll horizontally on narrow phones so the cards remain readable rather than shrinking all seven into the viewport.

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
- Use the released screen space to increase card size and make player name and action meaningfully readable.

## Player-card anatomy update

The earlier four-corner metric layout is superseded for the compact deck/team-selection family.

- Cost, position, ATT and DEF sit together in a single bottom rail.
- Left-to-right order is: cost, position, ATT, DEF.
- Cost remains one pip cluster.
- ATT and DEF keep explicit micro-labels where card size permits; the fixed order remains the fallback at very small sizes.
- The top-right is reserved for the information icon.
- Tapping the card opens the player dossier; the information icon is the visual affordance for that interaction.
- Moving all gameplay metrics to the bottom gives the portrait a larger uninterrupted area and removes competing corner furniture.

## Current prototype

The review route is `/lab/squad-flow` on `agent/deck-builder-team-selection`.

The lab contains:

1. a functional 18-card deck builder with a 3 × 6 active-deck grid and enlarged collection cards;
2. a revised team-selection composition with compact ATT/DEF/budget, manager → formation → opposition controls and seven substitutes in a readable horizontal strip;
3. the bottom-rail player-card anatomy across deck, collection, pitch and substitute sizes.

Production run-state and store wiring should follow after the mobile lab is approved.
