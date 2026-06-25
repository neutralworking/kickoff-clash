# Kickoff Clash — Economy & Meta-layer v1

Companion to `MATCH_ENGINE_V1`, `ARCHETYPES_V1`, `CARDS_V1`. Authoritative for the **three card
layers** and the run economy. **Supersedes** `MATCH_ENGINE_V1` **§6** ("Action & manager hand"), which
conflated Tactical cards with the Manager.

## 0. The three card layers

All three are **records over the one closed verb palette** (`ARCHETYPES_V1 §1`). They differ only in
*trigger*, *persistence*, and *acquisition* — not in what effects they can carry.

| Layer | What | Persistence | Acquisition |
| -- | -- | -- | -- |
| **Player cards** | the XI + bench | squad (whole run) | shop picks, packs, Academy; merge duplicates |
| **Tactical cards** | in-match deployables | deployed into in-match slots, persist for the match | drafted, capped deck; Tactical packs |
| **Manager card** | single run-lean keystone | run-long, one slot | shop (rarity-tiered), swap only between matches |

Effects draw from **one shared palette**, but **reach and strategy-setting are tiered**:

* **Player cards** are mostly **local** (self / a teammate / a zone) and **cannot set overall
  strategy**; only a few (leaders) reach the whole squad.
* **Manager and Tactical cards** generally **reach all players** and are the **only layers that shape
  overall strategy** (the build-lean).

So the strategic lean that biases your emergent identity lives in Manager + Tactical cards; player
cards express it. The engine still implements the palette once.

## 1. Currency & revenue

* Single currency: **cash**.
* Revenue = **stadium baseline gate** (tier → capacity × ticket price × attendance) + a **small
  performance bonus** + **card sales** + an **entertainment modifier** — entertaining styles
  (possession, attacking) draw bigger crowds, and some Manager/Tactical effects boost it directly. So
  style carries a cash consequence: the pragmatism-vs-spectacle tension. Anti-snowball overall: a
  narrow win funds nearly as well as a rout — right under permadeath.
* Primary income lever = **stadium-tier investment** (compounding). The core economic axis is
  invest-for-later vs spend-now, under elimination pressure.

## 2. Acquisition

* **Shop** (Balatro-style, between matches): Player Pick (1 of 3), Rare+ Pick, Tactical packs, Manager
  (rarity-tiered), Reroll, Heal, slot unlocks.
* **Player packs**: Academy (Common/Rare), Chequebook (Epic/Legendary), Gaffer (any).
* **Academy**: generates fresh cards each round (free-ish); tier upgrade improves generated quality.

## 3. Upgrade ladder

* Acquire higher-level instances **+ merge duplicates** (FUT-style) to climb a template's levels.
* **Merging/upgrading keeps chemistry** (same player, improved); only **replacing** with a different
  card resets it. So you upgrade your core in place without paying the churn tax — making "a duplicate
  of a card I run" a premium pull.

## 4. Save vs spend

* **Interest** on banked cash (compounds) **+ big-ticket sinks** (stadium, academy, manager, slot
  unlocks, legendaries).
* Under permadeath this is engine-building under elimination pressure — over-banking gets you knocked
  out before the compounding pays off.

## 5. Roster

* **Capped**; sell/release cards for cash (`getTransferFee`) — liquidity beyond gate money. The cap
  forces churn decisions; releasing a chemistry'd card is a real loss.

## 6. Tactical cards (in-match)

* A **capped Tactical deck**, drafted between matches from Tactical packs. Rarity-tiered.
* **At kickoff**: pull a random opening hand from the deck. **Each round**: draw 1 from the deck.
* **Deploy into 3 tactical slots** (expandable via shop). Deployed cards persist for the match — an
  in-match board of active effects you build up over the rounds.
* **Deploy gating: one-per-round OR an energy system — OPEN** (undecided).
* Squad-wide tactical instructions carrying any palette verb. Examples: **Press High** (gegenpress
  lean), **Low Block** (defensive lean), **Early Crosses** (wing lean).

## 7. Manager card (run-lean keystone)

* A **single** card, persistent run-long, swapped **only in the shop** between matches.
* **Rarity-tiered** (hunt/swap better gaffers) **and the run-defining lean**: amplifies a verb family,
  biasing your emergent identity — the closest thing to a "build declaration" in an emergent-archetype
  system, so the gaffer choice is enormously high-stakes (one keystone, not five).
* Examples: a **Guardiola** card buffs possession and raises entertainment (→ money); a **Ferguson**
  card lowers xG variance and boosts xG in the last 15 minutes ("Fergie time" — a conditional
  resolution verb).
* Can carry any effect (build-lean, economy hacks, rule-bends, even field verbs).

## 8. Run structure

* **5-match permadeath gauntlet** (FC Warm-Up 500 → The Invincibles 1100); opponent strength,
  actions-per-round, and style all escalate. Lose once → run ends.
* Status flow (`run.ts`): `title → packSelect → [setup → match → postmatch → shop] ×5 → won/lost`.
* **Scouting** (`scoutedOpponentRound`): pay to reveal a future opponent's archetype — the
  info-economy sink.

## 9. Integration map

| Symbol | Role |
| -- | -- |
| `economy.ts` SHOP_ITEMS / STADIUMS / ACADEMY_TIERS | shop, revenue, academy — extend with slot-unlocks + Tactical/Manager rarity pricing |
| `packs.ts` PACK_TYPES | Academy / Chequebook / Gaffer player packs |
| `run.ts` RunState (cash, stadiumTier, academyTier, scoutedOpponentRound, status) | run state & loop |
| `jokers.ts` | the Manager card (single, rarity-tiered) |
| `tactics.ts` | likely home for Tactical cards |
| `getTransferFee` | sell/release pricing |

## 10. Open tuning

* **Tactical deploy gating**: one-per-round vs energy.
* Interest rate/cap; roster cap size; tactical slot-unlock cost curve.
* Scouting cost & ROI; manager rarity power curve; tactical deck size cap.
* **Naming**: the layer is "Tactical cards"; the old in-match subtype also called "Tactical" needs a
  new name (e.g. Plays / Moments / Mind Games) to avoid the collision.
