# V1 tactics and manager-card direction

Date: 2026-08-02

## V1 tactics

Tactic cards are out of scope for V1.

The repository still contains older tactic-card, tactic-pack and charge-system implementation. That code is legacy implementation residue and must not be treated as the current product requirement. V1 should not ask the player to open, select, own or manage tactic cards.

Manager and player actions remain part of the core card battler.

## Manager formation ownership

A manager determines the formation selector; they do not merely prefer one shape.

- each manager has a pool of one, two or three available formations
- only formations in the active manager's pool can be selected
- formation-unlock consumables bought in the store can add another formation to that manager's pool
- the existing `preferredFormation` and formation-adherence implementation is legacy data/logic and must be migrated rather than surfaced as the V1 rule
- final formation pools are roster and balance data; the manager-card lab uses representative one/two/three-formation examples only

## Manager-card face

Manager cards use their own anatomy rather than player-card corners or tactic-card resources.

Permanent face hierarchy:

1. Manager portrait
2. Full manager name
3. Available formation pool
4. Manager action text
5. Rarity treatment

Managers do not have a style, archetype or class identity in V1. Do not show the legacy manager class crest, archetype line, `PREFERS` wording or formation-adherence copy.

Do not show ATT, DEF, player cost, tactic charges or a generic `MGR` label as primary information.

Cards that are large enough—including the normal two-choice manager-pack card—must show readable manager action text on the face. Inspection should provide additional context rather than being the only place where the action can be understood:

- philosophy/flavour
- complete action effect
- activation condition
- available formations
- explanation that store consumables can expand the formation pool
- economy hooks where applicable

Manager portraits remain provisional until the curated portrait set is final.
