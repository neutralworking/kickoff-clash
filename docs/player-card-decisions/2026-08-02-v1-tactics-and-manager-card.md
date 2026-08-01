# V1 tactics and manager-card direction

Date: 2026-08-02

## V1 tactics

Tactic cards are out of scope for V1.

The repository still contains older tactic-card, tactic-pack and charge-system implementation. That code is legacy implementation residue and must not be treated as the current product requirement. V1 should not ask the player to open, select, own or manage tactic cards.

Manager and player actions remain part of the core card battler.

## Manager-card face

Manager cards use their own anatomy rather than player-card corners or tactic-card resources.

Permanent face hierarchy:

1. Manager portrait
2. Full manager name
3. Manager archetype
4. Preferred formation
5. Signature trait/action
6. Rarity treatment

Do not show ATT, DEF, player cost, tactic charges or a generic `MGR` label as primary information.

The compact face should not carry the full effect text. Inspection should explain:

- philosophy
- complete effect
- activation gate
- preferred formation and adherence behaviour
- all readable traits
- economy hooks where applicable

Manager portraits remain provisional until the curated portrait set is final.
