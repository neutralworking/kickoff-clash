# Kickoff Clash — Cards & Players v1

Companion to `MATCH_ENGINE_V1.md` and `ARCHETYPES_V1.md`.

## 0. Principle

Archetypes are emergent, so **cards are the entire content layer** — the engine is a stage, the cards
are the play. A card reduces to power + a position-set + archetype + a rarity-scaled loadout of trait
records drawn from the closed verb palette. The engine implements ~10 verbs; designers author trait
records and stamp them across the roster.

## 1. Card data model

```
Card {
  name             // real-player-inspired flavour
  power            // 1–100 scalar = level; scales emission AND trait strength
  positions[]      // eligible positions; in-set = full power, off-set = power penalty
  archetype        // shapes power → attack/defence/creation/finishing (getChanceProfile)
  rarity           // = trait depth: Common 1, Rare 2, Epic 3, Legendary 4+
  traits[]         // TraitRecord[] (§2)
  nation           // chemistry axis
  durability       // 6-tier; governs fitness depletion (glass…phoenix)
  fitness          // 1–6 dynamic condition
  personalityTheme // Captain/etc. — leader & dressing-room flavour
}
```

**Rarity and power are independent axes** — high-power commons and modest legendaries both stay
relevant; the pack economy dangles genuinely different prizes.

## 2. Trait records — the unified mechanic

Every card mechanic, common to legendary, is a record over the **closed palette**:

```
TraitRecord {
  name       // "Dig Out Cross" (flavour)
  verb       // one of the ~10 palette verbs (relocate/amplify/deny/drain/generate/dampen/…)
  params     // magnitude/fraction — magnitude scales with card.power
  scope      // 'slot' | 'zone' | 'global'
  target     // 'zone' | 'self' | 'criterion' | 'enemyCard'
  condition  // optional: in-slot, when-ahead, ≥2 attackers, …
}
```

No bespoke verbs exist. A legendary's signature is a dense composition (4+) of palette verbs with
unusual scopes/params — the engine never grows past the palette.

## 3. Positions & versatility

* Each card lists eligible positions (breadth = utility). Eligible slot → full power; ineligible slot
  → power penalty.
* **Eligibility is broader than trait-lock**: a card can play a position at full power without its
  (slot-scoped) trait firing there.
* **Versatility = positional breadth + global trait scope.** Fluid cards (multi-position, global
  traits) move freely at full value; specialists (single-position, slot-locked traits) anchor a slot.
  This is the mechanical basis of the specialist↔fluid axis and the hidden cost of free reshape.

## 4. Power, rarity, trait depth

* `power` scales **both** emission magnitude and trait strength (high level = better body *and* better
  trait).
* `rarity` = number of traits: **Common 1 / Rare 2 / Epic 3 / Legendary 4+**.
* Orthogonal: collection value splits into raw power vs trait depth.

## 5. Chemistry

* **Pairwise, run-accumulated, no decay.** A co-appearance counter per card-pair increments while
  both are on the pitch; chemistry = f(co-appearances). Resets each run (permadeath).
* **Payoff = a zonal field connection bonus.** A chemistry'd pair placed in connecting zones (per the
  pair's connection rule) emits a synergy bonus into the field, scaling with accumulated chemistry —
  so chemistry rewards stable partnerships (time) AND smart placement (connecting zones).
* This is the combinatorial compounding source from `ARCHETYPES_V1 §0`, **partly earned through
  play**: a settled core peaks toward the run's climax; churn resets a pair to zero (the churn tax is
  foregone accumulation, not active decay).
* Plus **nationality** (static link) and **trait links** (some traits connect).
* New run state: a per-pair co-appearance matrix.

## 6. Authoring — the 500-card solution

* **Trait-templates × levels.** Author a manageable set of templates = (position + archetype + trait);
  instantiate each across many power levels with real-player-flavoured names (e.g. a WM "Dig Out
  Cross" template at L65 / L74 / L75 / L80…). Cards of one template are the same card at different
  power → a clean upgrade ladder; drafting becomes hunting higher-level instances of a build's
  templates.
* Rarity stacks more trait records (1→4+). Legendaries are bespoke 4+ verb compositions, hand-tuned
  but palette-only.
* Grounds on the existing 500-character JSON (levels already present) — a clustering/authoring pass,
  not new data.

## 7. Data mapping (existing fields)

| Existing field | Role in model |
| -- | -- |
| `power` (= `char.level`) | the scalar (§4) |
| `archetype` | power-decomposition shaping |
| `durability` | fitness-depletion tier |
| `nation` | chemistry axis |
| `personalityTheme` | leader (Captain) + dressing-room flavour |
| `abilityName` / `abilityText` | trait records (esp. epic/legendary) |
| `quirk` | per-card flavour; legendary signatures draw from it |
| `strengths` / `weaknesses` / `tags` | candidate chemistry / trait-link inputs |

## 8. Open

* Chemistry curve (co-appearances → bonus) and which connection rule a pair uses.
* Out-of-position penalty magnitude.
* `personalityTheme`: pure flavour-tag for leader-type traits, or its own chemistry axis?
* Which traits form trait-link chemistry.
* Collection / economy loop (acquisition, upgrading, packs) — a separate session.
