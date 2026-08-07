# Kickoff Clash V8 — tempo layer and transient slot lifecycle

Date: 2026-08-07
Branch: `agent/v8-three-zone-prototype`
PR: #105

## Energy baseline

The current preferred Energy curve is:

- Period 1: **3**
- Period 2: **5**
- Period 3: **7**
- Period 4: **9**

`4 / 6 / 8 / 10` remains available in the lab only as an intentionally more explosive comparison.

The 3-Energy opener felt better in direct playtesting because the opening draw matters more and the player cannot simply dump high-value cards immediately.

## First 1-cost tempo experiment

Each development XI now contains three genuine 1-cost players rather than discounting existing high-output cards.

The test archetypes are:

1. **Flexible full-back / wing-back** — around 2 ATT / 2 DEF, natural in DEF and MID.
2. **Cheap defensive body** — around 0 ATT / 3 DEF, natural in DEF.
3. **Cheap attacking runner** — around 3 ATT / 0 DEF, natural in ATT.

The point is to test tempo, setup and flexibility. Cost is not rarity and a 1-cost card should not visually read as a low-prestige card.

The deterministic economy simulation now reports:

- average 1-cost players deployed per team;
- rate at which a team makes 2+ player deployments in Period 1.

This is intended to detect whether the lower curve creates combinations rather than simply creating dead opening hands.

## Four physical slots means four committed cards

Each DEF / MID / ATT zone has four physical play slots.

During a commitment/reveal window, **every card played into a zone reserves one of those four slots**:

- Player card — reserves a slot, then remains there after reveal.
- Manager card — reserves a slot while queued/revealing, resolves its Action, then disappears and releases the slot.
- Chance card — reserves a slot while queued/revealing, resolves its effect, then disappears and releases the slot.

Therefore:

- a Manager cannot be played into a zone already containing four players;
- a Chance cannot be played into a full ATT zone;
- if a zone has three persistent players and a Manager is queued there, no fifth card can also be committed there that period;
- after the Manager or Chance resolves, its slot is available again next period.

This lifecycle is now an engine-level contract through slot reservations, not only a UI convention.

## Playable presentation

The lab shows queued Manager / Chance cards inside the same four-slot grid as players. They use a transient visual treatment and disappear immediately after End Period resolution.

The current interaction remains click card → click zone. Drag-and-drop is still the intended later interaction model.

## Next questions

Playtest the 1-cost layer before adding more low-cost cards:

- Does Period 1 usually present at least two plausible lines without becoming automatic?
- Are 1-cost cards still useful when drawn in Period 3 or 4?
- Is the flexible 1-cost DEF/MID card too efficient because MID counts both stats?
- Does reserving a physical slot for a Chance make typed chances more tactical, or does it make full ATT zones frustrating?
- Does Manager slot occupancy create meaningful timing pressure?

Do not rebalance toward realistic football scorelines. The target remains decision quality and match drama.
