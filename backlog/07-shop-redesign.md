# 07 — Shop redesign

**Source:** 0.3 owner feedback ("the store screen doesn't make sense in its current guise"). Deferred from the 0.1→0.3 push as a system-design task.

## Outcome

A coherent, legible shop with a single clear offer model the player can read in one glance: what's for sale this cup, why, and what it costs — with a deterministic, rerollable offer.

## Why

The current shop has no coherent offer logic. The 8 `SHOP_ITEMS` (`src/lib/economy.ts` L82–93: card picks 15k/35k, packs 10–20k, manager 25k, utility reroll/heal/scout 8–12k) plus the `InvestmentCard` ladders (stadium/academy/box-office) are scattered across three tabs (Market / Squad / Backroom). Purchases are split across **8 separate callbacks** in `GameShell.tsx` (`handleBuyCard`, `handleBuyJoker`, `handleBuyAcademy`, `handleBuyTacticPack`, `handleBuyInvestment`, `handleRerollShop`, `handleHealPlayer`, `handleScoutOpponent`); `buyShopItem` in `run.ts` only actually handles `scout_report`. There is no single "this is the shop's offer this cup" object — so the offer doesn't regenerate coherently, can't be rerolled as a unit, and reads as a pile of buttons.

## Acceptance criteria

- [ ] A single `ShopOffer` model (seeded from the existing `shopSeed = seed + round*999`) that enumerates the cup's offer: N card picks, M packs, available investments, utilities — generated once per cup, rerollable as a unit.
- [ ] A unified purchase dispatch (one `buy(state, offerItem)` path in `run.ts`) replacing the 8 ad-hoc GameShell callbacks.
- [ ] A clear offer hierarchy in the UI (e.g. always: 1–2 player picks · 1 pack · 1 investment tier-up · utilities) so the player understands the shape.
- [ ] Reroll rerolls the **offer**, deterministically, at a clear cost.
- [ ] `balance-lab` sign-off that the per-cup offer + costs fit the economy curve.

## Boundaries

- Keep the glassy visual system (0.3) — this is an information-architecture + offer-logic task, not a re-skin.
- Don't change the durability/fitness or run-structure models.

## Non-goals

- Player-upgrade depth (see `08`), manager-trait depth (see `09`) — separate.

## References

- `src/lib/economy.ts` (`SHOP_ITEMS`, `InvestmentCard`, `ACADEMY_TIERS`), `src/lib/run.ts` (`buyShopItem`, `buyInvestment`, `addCardToDeck`, `buyTacticPack`, `buyAcademyPlayer`, `interestOn`), `src/components/ShopPhase.tsx`, `GameShell.tsx` shop handlers (~L348–451).

## Done when

The shop presents one coherent, seeded, rerollable offer through one purchase path, and `balance-lab` confirms the curve.
