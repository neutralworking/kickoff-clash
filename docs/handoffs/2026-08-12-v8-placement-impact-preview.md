# V8 placement-impact preview

## Goal

Make the consequence of a player placement understandable before the player commits it, without changing V8 balance or adding another modal/panel to the phone layout.

## Shipped behavior

- Selecting a player previews that card in every legal zone.
- Each zone heading shows the projected player-side ATT and DEF change, effective OOP treatment, and any change to the goal or goals-against thresholds.
- The existing decision rail expands the most relevant legal zone into a deterministic preview containing:
  - team ATT before and after placement;
  - team DEF before and after placement;
  - the card's Action and its resolved effect;
  - natural, effective OOP, or Action-based OOP-ignore treatment;
  - projected goals and goals against before and after placement.
- Dragging over another zone updates the expanded preview before the card is released.
- Existing queued home plays resolve first in the preview, so the shown delta represents the incremental effect of the newly selected card.
- The preview uses the same V8 resolver as the real reveal. Random Actions remain deterministic because preview resolution runs against a cloned state.
- The UI labels this as a visible-board projection: unrevealed CPU commitments can still change the final contest.
- CPU planning, reveal order, scoring, Energy, Actions, and balance values are unchanged.

## Validation

- The focused mobile regression checks tap selection, all three zone summaries, natural/OOP treatment, Action text, ATT/DEF deltas, threshold evidence, and live drag-over updates.
- The V8 mobile match suite passes 16/16, including full-period resolution and the 390×844 and 375×667 placement-preview gates.
- TypeScript and changed-file lint pass.
- Production static export passes with the repository's local font fallback; the production source remains on the canonical Google fonts.
- The repository unit suite remains at 654 passing tests with the inherited `PlayerDossier` isolation failure unchanged.
