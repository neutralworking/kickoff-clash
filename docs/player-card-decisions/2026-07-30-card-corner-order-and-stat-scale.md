# Decision: card corner order, cost mark and stat scale

**Date:** 2026-07-30  
**Status:** locked  
**Parent spec:** `docs/player-card-system-spec.md`

This decision corrects visual mockups that drifted from the agreed mechanics.

## One cost, one pip cluster

Each player has exactly one energy-cost value from 1 to 6.

The top-left cost element is one compact pip cluster whose arrangement represents that single value. It must not look like multiple dice, multiple resources or a collection of cost objects.

Examples:

```text
1       2       3
  •     • •       •
                •   •

4       5       6
•   •   •   •   •   •
•   •     •     •   •
        •   •   •   •
```

Three and five use a central pip. The cluster has no die outline, face-by-face boxes, numerals or repeated dice.

## Fixed clockwise card order

The four corner mechanics are fixed and consistent on every complete player-card renderer:

1. **top-left:** energy cost pip cluster
2. **top-right:** primary position
3. **bottom-right:** DEF
4. **bottom-left:** ATT

In clockwise order: **cost → position → DEF → ATT**.

The layout must not swap ATT and DEF between variants.

## ATT and DEF scale

Player ATT and DEF values should be designed for a practical range of approximately **-5 to 25**.

Consequences:

- badges must support negative signs and two-digit positive values without changing size
- prototype data should use realistic game-scale values, not football ratings such as 70–90
- typography must keep `-5`, `0`, `9`, `18` and `25` equally legible
- no overall rating or combined total is added

## Team-selection fit examples

Team-selection cards show the **real action name** beneath the nameplate. They must not show role/archetype labels in that location.

Correct examples include action names such as:

- `SECOND BITE`
- `SCANNER`
- `WALL`
- `SHOWBOAT`

Role/archetype remains expanded-view flavour only and has no match-engine function.

## Pitch-card consistency

Every team-selection pitch card must show the same permanent anatomy:

- cost pip cluster
- primary position
- cut-out portrait over KC monogram
- surname nameplate
- action name
- DEF bottom-right
- ATT bottom-left
- rarity frame

Fit, selection and swap states are contextual treatments around that anatomy; they do not replace its content.
