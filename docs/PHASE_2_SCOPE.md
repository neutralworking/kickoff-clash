# Kickoff Clash — Phase 2 Scope (card-ification)

Agreed scope for the Phase 2 economy pass, produced by the **balance-lab** brain
trust (Card Shark + Gaffer) and signed off by the design owner. This is the build
checklist; decisions below are **locked** unless the owner reopens them.

> North star (non-negotiable): KC is a **roguelike that happens to be football**.
> Everything is a card. No league table. Cash is the only currency. Permadeath —
> one loss ends the run, a draw continues at reduced reward.

## What Phase 1 already did

Cut the league-table vestige (`seasonPoints`/`boardTargetPoints`/`pointsEarned`),
the dead sinks (`actionFans`, `buyFormation`, the manager double-price), and made the
scout read the real generated opponent. Phase 2 builds on that clean base.

## The model

Two thin **pure-data** card record types (no `compute` fn → they serialise cleanly),
surfaced through new `GameCardModel` variants. One render path, distinct payloads.
**No match-engine changes** — the `match-harness` output stays byte-identical across
the whole phase.

| Type | Models | Lifecycle | Trick |
| --- | --- | --- | --- |
| `InvestmentCard` | Stadium Expansion / Youth Academy / Box Office | **consumed on buy** → folds into a `RunState` scalar/flag | shop offers only the *next* tier by reading the current scalar; no owned-array in state |
| `ConsumableCard` | Training Ground / Treatment Table / Scout Report | **buy → apply → gone** | thin card face over the existing `applyTraining`/`healInjuredCard`/scout handlers |
| (Formations) | shapes | **owned, persistent, free** | cosmetic Collection card face — no price, no gating |

```ts
interface InvestmentCard {            // the Balatro voucher
  id: string; kind: 'investment';
  ladder: 'stadium' | 'academy' | 'boxoffice';
  tier: number; name: string; cost: number; description: string;
  effect: { stadiumTier?: number; academyTier?: number; perGoalCash?: number };
}
interface ConsumableCard {
  id: string; kind: 'consumable';
  consumable: 'train' | 'heal' | 'scout';
  name: string; cost: number; description: string; target: 'player' | 'none';
}
```

The card is the **transaction**; the durable thing is the **state scalar**
(`stadiumTier`, `academyTier`, a new `boxOffice` flag). Buying stadium-T3 sets
`stadiumTier = 3`, the card vanishes, next round the shop offers T4. This sidesteps
the non-serialisable rehydration dance and reuses fields already in `RunState`.

## Economy — Option B

```
matchReward = BASE_WIN_CASH[round] × resultFactor × STADIUM_MULT[stadiumTier]  +  boxOfficeBonus
resultFactor = win 1.0 | draw DRAW_REWARD_FACTOR (0.5) | loss 0
boxOfficeBonus = boxOffice ? yourGoals × PER_GOAL_CASH : 0
```

The fan-source gate (`calculateAttendance`) leaves the **reward** path; attendance
survives as a **flavour crowd number** on PostMatch only.

| Round | Opp power | Win | Draw (×0.5) |
| --- | --- | --- | --- |
| 1 | 76 | £8,000 | £4,000 |
| 2 | 81 | £12,000 | £6,000 |
| 3 | 86 | £16,000 | £8,000 |
| 4 | 91 | £22,000 | £11,000 |
| 5 | 96 | £30,000 | — |

`BASE_WIN_CASH = [8000, 12000, 16000, 22000, 30000]`. Draws derive from the existing
`DRAW_REWARD_FACTOR = 0.5` (one source of truth). Loss = 0 (run ends).

**Stadium Expansion** — the compounding income axis *and* the sole gate-tier lever
(Season Tickets folded in; `ticketPriceBonus`/`food_upgrade` retired):

| Tier | `STADIUM_MULT` | Cost to unlock |
| --- | --- | --- |
| 1 (start) | ×1.0 | free |
| 2 | ×1.25 | £10,000 |
| 3 | ×1.6 | £22,000 |
| 4 | ×2.0 | £40,000 |
| 5 | ×2.5 | £70,000 |

- **Youth Academy** — £30k/tier (reuses `ACADEMY_UPGRADE_COST`), delivered as an Investment.
- **Box Office** — one-time unlock **~£18,000** → **+£1,500 per goal you score**
  (`PER_GOAL_CASH = 1500`). Default off; drafting it makes your deck *want* to score,
  re-homing the spectacle-vs-pragmatism tension as an opt-in build. Modelled as an
  Investment (not a Manager) so it sidesteps the manager single-vs-3 question.
- **Interest** — unchanged: 10%, cap £1,500 (the anti-over-banking governor, ECONOMY §4).

## Locked decisions

1. **Box Office ships in Phase 2** (alongside the flat gate) — the Gaffer's must-have.
2. **Distinct football names under a "Boardroom" shelf** — Stadium Expansion / Youth
   Academy / Season Tickets / Box Office. `'investment'` is the internal type only.
3. **Formations stay all-free** — cosmetic Collection cards, no price, no gating.
4. **Season Tickets folds into the stadium ladder** — stadium is the single income
   multiplier; the old `+£5 ticket` upgrade is retired.

## Defaults (conventional — reopen if wrong)

- Consumables are **buy → apply → gone** (no held satchel/inventory).
- **Reroll stays flat £8k** (escalation is a later polish).
- **R1 win ships at £8k**; watch playtest (bump to £10k if the first shop feels dead).
- **Manager single-keystone vs the live max-3 drift is DEFERRED** — Box Office as an
  Investment means Phase 2 doesn't force the call.

## Build order (small verified chunks; harness byte-identical throughout)

0. **Harness baseline** — `npx tsx scripts/match-harness.ts`, capture reference.
1. **Option B reward switch** — `BASE_WIN_CASH`/`STADIUM_MULT` in `economy.ts`;
   GameShell reward reads them; **delete `getStadiumTier(wins,…)`** (stadium tier
   becomes purchase-driven, defaults to 1); keep `calculateAttendance` for display.
2. **`InvestmentCard` + stadium ladder** — type + `STADIUM_INVESTMENTS` +
   `buyInvestment(state, card)` reducer; wire stadium into the shop (next tier only).
3. **Migrate academy → Investment + add Box Office** — retire `food_upgrade`.
4. **`ConsumableCard` faces** — train/heal/scout as cards over existing handlers.
5. **Formation Collection cards** — cosmetic, free.
6. **Designer pass** — re-tab the shop around the new card families (Boardroom shelf).

Each chunk is independently shippable, economy/UI-layer only, and provable-inert on
the harness.
