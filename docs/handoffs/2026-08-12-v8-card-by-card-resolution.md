# V8 card-by-card period resolution

## Goal

Make period resolution readable on the match board without changing V8 balance or engine rules.

## Shipped behavior

- The priority shown before commitment is authoritative for the reveal sequence.
- CPU commitments remain face-down and attached to their real zones.
- Committed plays resolve one at a time, preserving side priority and play order.
- The board, team ATT/DEF totals, hidden CPU cards, and queued player chips update after every play.
- Each beat identifies the card, its Action, and either the engine's specific consequence or the actual ATT/DEF change.
- The active location is highlighted while its play resolves.
- A stable **Skip** control fast-forwards the remaining plays into the same authoritative post-reveal state.
- Generated-Tactical Window, scoring, telemetry, goal payoff, and next-period behavior are unchanged.

## Validation target

The mobile regression covers priority consistency, per-card reveal progress, hidden-card removal, active-location highlighting, the persistent Skip control, and the final resolved board. The existing V8 match suite continues to cover the complete four-period match, Tacticals, Manager play, goals, telemetry, drag interaction, and both mobile viewport sizes.
