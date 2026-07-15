# Owner directive — the Contest Breakdown (2026-07-15)

> Card design is paused. **The classic match engine is the product.** The match
> and team-selection screens must expose the engine's real resolution chain —
> not a generic squad-strength readout. Visual reference: the "Contest
> breakdown" mock (dark leather panel, per-row bar + `v N` + signed edge,
> collapsible, match feed below, HALF TIME TALK CTA) — keep that layout
> language, replace its five generic rows (ATT/DEF/Possession/Tempo/Set Pieces)
> with the six engine-native rows. Tempo and Set Pieces are NOT first-class
> contests in the engine; showing them would be decorative statistics.

## The panel: six engine-native rows, grouped

**ATTACKING** (your route: Control → Create → Convert)

| Row | Duel | Secondary line |
|---|---|---|
| KEEP | your KEEP v their PRESS | `PROJECTED POSSESSION: 4–2` |
| CREATE | your CREATE v their BREAK | `BIG-CHANCE ODDS: HIGH` |
| FINISH | your FINISH v their STOP | `SORIN 14 v STOP 9 · HALF 35% · BIG 55% · CORNER 30%` |

**DEFENDING** (their route, your answers: Press → Break → Stop)

| Row | Duel |
|---|---|
| PRESS | your PRESS v their KEEP |
| BREAK | your BREAK v their CREATE |
| STOP | your STOP v their FINISH |

Six compact rows in one collapsible panel on a phone, grouped visually into
ATTACKING and DEFENDING.

## Rules

1. **NET is demoted** to a small summary chip — rename to SQUAD EDGE (or
   OVERALL/POWER EDGE). The six contests are the main tactical information.
2. **Commitment bonuses become visible**: `CREATE 44 · +7 COMMITTED` or tier
   pips (`CREATE II`). The player should feel completing a build, not receive a
   hidden numerical jump.
3. **FINISH is shown as the real duel**: likely primary shooter, his effective
   ATK v opponent STOP, goal threshold by chance type. The lane-sum total alone
   overstates its causality.
4. **No parallel maths**: every displayed number derives from the engine's own
   exported resolution functions (`possessionSplit`, `outcomeWeights`,
   `shotNeed`, `likelyShooter`, `contestTotals` in `src/lib/contests.ts` — the
   resolver calls the same functions). No stat may be displayed that the engine
   does not actually resolve.

## Match-screen behaviour: two states

- **Before the period — forecast.** Rows reflect the CURRENT evaluated split
  (XI, positions, fitness, manager, active tactic, intent, chemistry, reds,
  opponent effects). Changing a tactic/shape/intent animates the bars, and a
  called tactic shows its per-contest deltas (e.g. COUNTER TRAP: PRESS +7 ·
  BREAK +4 · KEEP −3 · fitness cost after the period).
- **After the period — outcome.** The same panel briefly transitions to what
  happened, per contest, from the round's existing result ledger: KEEP →
  possession 4–2; CREATE → chances by quality; FINISH → goals/shots (on
  target); PRESS/BREAK → turnovers forced; STOP → saves/blocks. Only stats the
  ledger actually records — where the football word (e.g. "interception") has
  no distinct ledger entry, use the engine's real term.

## The loop this serves

1. Read the contest forecast → 2. choose one intervention → 3. commit to the
period → 4. watch the contest chain resolve → 5. see which cards caused it →
6. adjust at the next break.

## Status

- Engine selectors landed (`src/lib/contest-panel.ts` + pure exports in
  `contests.ts`) — resolution behaviour unchanged, determinism harness green.
- Team-selection hero + match screen panel: to implement against this doc.
