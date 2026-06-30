# KC Systems Map — design intent → live code

The bridge between the Mechanist/Quartermaster lenses and Kickoff Clash's actual
systems. When this skill proposes a mechanism, it names a file/type from here, expresses
it over the verb palette, then hands the dials to balance-lab and the legibility question
to game-designer.

## The spine (protect it)

`src/lib/verbs.ts` — the closed ~10-verb dispatcher (`relocate · amplify ·
amplify-inverse-power · deny · drain/restore-energy · drain-fitness · generate ·
dampen/amplify-variance`), each `TraitRecord { name, verb, params, scope, target,
condition }`. It's LIVE: `match-v5.ts evaluateSplit` calls `dispatchTraits` for the player
side and again for squad records. Snapshot-read + delta-pool commutativity + a `priority`
escape hatch. **Every system is data over this.** Adding a verb is a spine-level decision,
not a workaround.

Translation layers (where you author):
- `src/lib/squad-transforms.ts` — `tacticTraits` / `managerTraits` / `intentTraits` turn
  managers, tactics, and intent into `TraitRecord`s fed to the dispatcher as a synthetic
  non-emitting source. **This is where manager/tactic mechanics live** — the 09 plumbing
  already exists; what's thin is the authored content.
- `src/lib/role-transforms.ts` — role → trait tables + `ROLE_ALIASES` mapping the
  authentic `kc_cards.json` `best_role` names onto trait sets (fiction kept separate from
  mechanics — a model to copy).

## Where the live game diverges from the design docs (the work)

The 0.3 push changed no systems, so these gaps are exactly as the standup found them:

- **Shop (07, Quartermaster).** `economy.ts SHOP_ITEMS` + scattered `InvestmentCard`
  ladders; 8 separate buy callbacks in `GameShell.tsx`; `run.ts buyShopItem` only handles
  `scout_report`. No single `ShopOffer` object → can't regenerate/reroll as a unit, reads
  as noise. Design: a seeded `ShopOffer` (key off the existing `shopSeed = seed+round*999`)
  + one `buy(state, offerItem)` dispatch. Hierarchy the player can read in one glance.
- **Upgrades (08, Quartermaster).** `applyTraining` (`run.ts ~L1029`): flat +5 power / 8k,
  capped +20 per card but **uncapped squad-wide**; on the 52–95 BRS scale +20 is ~47% of
  the whole range. A non-decision (one always-correct button) and OP. Design: an
  `appliedUpgrades` record + `applyUpgrade(state, upgrade)`; invest **pillars** (couples to
  10), diminishing returns, rarity-aware, opportunity cost. balance-lab tunes the curve.
- **Managers (09, Mechanist).** `jokers.ts` `compute(xi, connections) → number` is shallow
  filter-and-flat-add; `managerTraits` in `squad-transforms.ts` is a hardcoded `switch` of
  mostly unconditional `ampArchetype` calls (only `the_gambler`/`hairdryer`/`chemistry_set`
  read context). Design: parametrised, **conditional** (read run/match state — fires after
  conceding, scales with chemistry, rewards rotation), authored as data; real Balatro-style
  jokers over the palette. Retire flat bonuses.
- **Card model / pillars (10, Mechanist).** `scoring.ts Card` carries 4 pillars
  (technical/tactical/mental/physical 0–100) + personality/theme/quirk/strengths — almost
  all **loaded-but-unread**; the engine reads ~`power + archetype + position + fitness`.
  Design (with balance-lab): do pillars compose power, or gate role/verb effectiveness? Then
  surface the rest in `CardModal`. This is the keystone — do it coupled with 08.
- **Tactics drift.** `tactics.ts` still scores through a legacy `compute()` flat-bonus path
  that duplicates the palette translation — retire it to one source of truth.

## Lanes (so designs hand off cleanly)

- **systems → balance-lab:** you define the mechanism + which dials exist; balance-lab sets
  the numbers and sweeps (`scripts/balance-sweep.ts`, `cup-sweep.ts`). Seam: every backlog
  doc's "balance-lab sign-off".
- **systems → game-designer:** you define the rule; game-designer judges if it reads as a
  fun, legible decision. (Is the shop offer parseable? Is the upgrade a real choice?)
- **systems → content-narrative:** you build the structure (the manager-trait model, the
  upgrade types); content authors the instances (the 20 gaffers, the upgrade flavour).
- **systems → designer/card-designer:** they build the UI for whatever the mechanism needs
  surfaced (the shop offer layout, the pillar radar on the card).

## Validation

Systems designs are validated two ways: (1) **expressibility** — can it be authored as
`TraitRecord`/offer/upgrade data over the spine without bespoke math? If not, reconsider.
(2) **balance-lab sweep** — once numbers are on the dials, the meta stays monotonic in
drafted strength and no degenerate build emerges. Determinism is preserved (any RNG via
the seeded hash). End with the design table + the two handoffs.
