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

The first production migration records an explicit V1 profile for every current manager. To avoid inventing balance, each profile initially contains the single shape already authored for that manager. The data contract supports up to three formations and can be expanded through run-owned unlocks later.

## Manager starting-XI cost

A manager also carries the maximum total cost allowed in the starting XI. This value must be visible on the manager card before team selection.

The current live game uses the global `MAX_XI_COST` value of 45. The first production profiles therefore store 45 explicitly for every manager. This is a migration baseline, not a claim that all final manager caps should be identical.

## Opening flow

V1 has two starter packs:

1. manager pack — open, inspect and pick one manager
2. player pack — reveal the full group together

The manager pack opens first. There is no tactic-card stage. Player cards do not require individual reveal interactions.

## Manager-card face

Manager cards use their own anatomy rather than player-card corners or tactic-card resources.

Permanent face hierarchy:

1. Available formation pool across the full top band
2. Manager portrait
3. Full manager name
4. Named manager action
5. Readable manager action text
6. Maximum starting-XI cost across the bottom divider

As with player cards, rarity may influence the frame treatment but is not written as a label on the face or in the dossier.

Managers do not have a style, archetype or class identity in V1. Do not show the legacy manager class crest, archetype line, `PREFERS` wording or formation-adherence copy.

Do not show ATT, DEF, player cost, tactic charges or a generic `MGR` label as primary information.

Every manager action has an explicit V1 name. The initial metadata uses the already printed first trait as its migration source, but card rendering now reads a dedicated action-name value rather than inferring the name at render time.

Cards that are large enough—including the normal manager-pack card—must show both the action name and readable action text on the face. Inspection should provide additional context rather than being the only place where the action can be understood:

- philosophy/flavour
- complete action effect
- activation condition
- available formations
- explanation that store consumables can expand the formation pool
- maximum starting-XI cost
- economy hooks where applicable

Manager portraits remain provisional until the curated portrait set is final.
