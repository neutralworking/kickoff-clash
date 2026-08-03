# Deck Builder and Team Selection — 2026-08-03

## Product decision

Deck building and team selection are separate concepts and separate screens.

## Collection and active deck

- The owned player-card collection can grow well beyond the matchday limit, including 50+ cards.
- The active deck contains exactly 18 player cards.
- The deck-builder screen presents the active deck as a fixed 3 × 6 grid.
- The collection appears below as larger, browseable cards.
- The deck builder is accessible from team selection and from the store.
- Purchased player cards enter the collection only. They never alter the active deck automatically.

The active deck is not a 16-card deck. Any older wording that describes 16 players as the run deck is superseded.

## Deck-builder interaction model

Use the Marvel Snap deck-builder model rather than inventing a separate swap workflow.

- The full collection remains visible below the active deck.
- Cards already present in the active deck remain in the collection and are visibly dimmed.
- Tap a collection card to add it when the deck has space.
- When the deck is full, hold an active-deck card to remove it, then tap a collection card to add the replacement.
- Do not use a two-step “select collection card, then choose deck slot” replacement mode.
- Tap an active-deck card to inspect it.
- Holding an active-deck card is the removal gesture; no remove icon is required.
- Filters are limited to position and cost for V1.
- Only the collection region scrolls. The active 3 × 6 deck and screen controls remain fixed.

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
- AUTO, FILL and CLEAR remain available.

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

The production `SquadScreen` on `agent/deck-builder-team-selection` implements the hierarchy above. The earlier `/lab/squad-flow` route remains a grooming aid, but it is no longer the only implementation.

Reusable production pieces:

- `src/components/deck-builder/DeckBuilderScreen.tsx`
- `src/lib/active-deck.ts`

`active-deck.ts` is the client-side source of truth for the chosen 18 IDs. It:

- persists `activeDeckIds` separately from the owned collection;
- validates saved IDs against the current collection;
- removes duplicates and cards no longer owned;
- fills missing spaces from the collection after a sale, retirement or old save;
- leaves newly purchased cards in the collection until the player explicitly adds them.

Team selection:

- establishes the first active deck during the draft;
- saves it when the player saves the deck or kicks off;
- restores it for later team-talk screens;
- rebuilds the XI and seven substitutes from the restored 18.

Store:

- opens the same deck builder from the existing squad entry;
- saves to the same persistent `activeDeckIds` source;
- keeps sell mode as a separate collection-management view.

The active-deck store is deliberately separate from the engine-owned `RunState` files while UI and engine work proceed in parallel. It can be consolidated into a future versioned run-save schema without changing the deck-builder component contract.
