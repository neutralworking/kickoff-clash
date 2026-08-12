# V8 score clarity and Tactical Window removal

## Goal

Make the two scoring contests readable at a glance, replace the low-value period recap, expose active card stat changes, and remove the obsolete post-reveal Tactical Window.

## Shipped behavior

- A persistent comparison strip pairs **YOU ATT vs CPU DEF** and **CPU ATT vs YOU DEF**.
- Each comparison shows the signed margin and projected goals beside the two relevant totals.
- The old expandable recap is replaced by a compact, always-visible last-period result with the period score, match score, both scoring comparisons, and recent material changes.
- Deployed player chips show their current ATT/DEF difference from the printed card as positive, negative, or mixed badges (for example `+3A` or `−2D`).
- Generated Tacticals no longer open a separate decision window after reveal.
- A generated Tactical becomes available in hand in the following period and can be committed through the normal flow at its normal Energy cost.
- Resolution order, scoring thresholds, telemetry, and card rules remain unchanged.

## Validation

- Production static build passes.
- TypeScript and targeted lint checks pass.
- The V8 mobile browser suite passes all 14 scenarios, including paired score comparisons, last-period evidence, generated Tactical timing, visible stat modifiers, a complete four-period match, and horizontal overflow checks.
- The repository unit suite passes 654 tests; the inherited `game-v7` isolation test remains the single unrelated failure because `PlayerDossier.tsx` imports `@/game-v7`.
