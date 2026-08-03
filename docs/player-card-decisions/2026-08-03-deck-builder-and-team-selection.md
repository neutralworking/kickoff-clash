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

All seven substitutes remain visible in one fixed row. Team selection must not scroll vertically or horizontally.

## Team-selection hierarchy

- Screen title is exactly `TEAM SELECTION`.
- There is no subtitle, context line or secondary counter in the header.
- ATT, DEF and budget use one small, single-line readout.
- The DEF / BAL / ATT intent selector is removed.
- Controls appear in this order: manager, formation, opposition.
- `SHAPE` is relabelled `FORMATION`.
- The opposition preview replaces the removed intent-control area.
- The HOME/AWAY toggle is removed.
- The permanent misfit counter is removed.
- `EDIT DECK` opens the dedicated deck-builder screen.
- The screen remains a single fixed phone viewport.
- Released space belongs to the pitch and readable player cards, not more status furniture.

## Player-card anatomy update

The earlier four-corner metric layout is superseded for the compact deck/team-selection family.

- Cost, position, ATT and DEF sit together in a single bottom rail.
- Left-to-right order is: cost, position, ATT, DEF.
- Cost remains one pip cluster.
- ATT and DEF keep explicit micro-labels where card size permits; fixed order carries the meaning at the smallest sizes.
- There is no information icon on the card face or added by the pitch wrapper.
- The entire card opens the player dossier when tapped.
- Compact deck and substitute cards omit action text rather than rendering unreadably small text.
- Pitch and collection cards retain readable name and action text.

## Production implementation

The production `SquadScreen` on `agent/deck-builder-team-selection` now implements the hierarchy above. The earlier `/lab/squad-flow` route remains a grooming aid, but it is no longer the only implementation.

A reusable production deck-builder screen now exists at:

- `src/components/deck-builder/DeckBuilderScreen.tsx`

Team selection opens it through `EDIT DECK`, saves an exact 18-card deck and rebuilds the XI plus seven substitutes from that deck.

## Remaining integration

The same deck-builder screen still needs to be opened from the store with a parent-owned save callback so the edited XI and substitute IDs persist in `RunState`. Do not add a cosmetic store button that cannot save the deck.
