# Kickoff Clash — Design Index (v1)

The entry point. Reads first; orders the four specs, resolves where they drifted, consolidates the
open decisions, and ends with the build order and the scoped first task. **Where any spec conflicts
with this index, the index wins.**

## 1. What it is

A football-management roguelike with a Marvel-Snap/Balatro spine. You field a fixed XI of player
cards against a deterministic, *solvable* opponent across a 5-match permadeath gauntlet. The board is
Football Manager (set squad, reposition tactically, free reshape); the hand is Snap (draw and deploy
Tactical cards). You win by reading the opponent's emergent identity and out-allocating it on a zonal
power field. The luck is in your draws and the xG dice; the opponent is pure skill.

## 2. The load-bearing idea

**Every mechanical thing in the game — player traits, Tactical cards, the Manager, archetype verbs —
is a record over one closed palette of ~10 verbs.** Implement the palette once; everything else is
authoring (data). This is what makes a game this broad buildable by a small team, and it is the single
most important architectural commitment.

Palette: `relocate · amplify · amplify-inverse-power · deny · drain-energy · restore-energy · drain-fitness · generate · dampen-variance · amplify-variance`. Each carries a `target`
(`zone | self | criterion | enemyCard`) and optional `condition`.

## 3. The three card layers (scope model)

| Layer | Reach | Sets strategy? | Persistence | Acquisition |
| -- | -- | -- | -- | -- |
| **Player cards** | mostly **local** (self/teammate/zone); few squad-wide (leaders) | **no** | squad (run) | shop picks, packs, Academy; merge dupes |
| **Tactical cards** | **squad-wide** | **yes** | deployed into in-match slots, persist for the match | drafted capped deck; Tactical packs |
| **Manager card** | **squad-wide** | **yes** | run-long, single slot | shop (rarity-tiered), swap between matches |

Strategy flows **top-down** (Manager → Tactical, both squad-wide) and players **express it bottom-up**
(local verbs). That is how an emergent-archetype system gets a steerable direction without a mode
switch: Press High + a Guardiola gaffer *declare* possession-pressing; your wingers and pivots *are*
it.

## 4. Document map

1. `ARCHETYPES_V1.md` — the verb palette, the 11 emergent identities, the counter-web. **Read for the
   primitive.**
2. `CARDS_V1.md` — the player-card model: power scalar, positions, rarity = trait depth, the
   `TraitRecord`, chemistry, the 500-card authoring solution.
3. `MATCH_ENGINE_V1.md` — the increment loop, zonal field contest, xG→Poisson resolution, the
   dispatcher and order-of-operations.
4. `ECONOMY_V1.md` — the three card layers (authoritative), revenue, shop, packs, Academy, run
   structure.

## 5. Cross-doc reconciliations (apply these)

* `MATCH_ENGINE_V1 §6` **("Action & manager hand") is superseded** by `ECONOMY_V1 §0/§6/§7`. The
  in-match hand is **Tactical cards** (capped drafted deck → opening hand + draw 1/round → deploy into
  3 expandable slots, persist for the match; deploy gating one-per-round-vs-energy is OPEN). The
  **Manager** is a *separate single* run-long card, swapped only in the shop — not part of the hand.
* **Naming**: the three layers are **Player cards / Tactical cards / Manager card**. The old in-match
  "Tactical" pack *subtype* collides with the layer name and should be renamed (e.g. Plays / Moments /
  Mind Games). Wherever older drafts say "action cards", read "Tactical cards".
* **Strategy lean** (the "amplify a verb family" effect in `ARCHETYPES_V1 §0`) lives specifically on
  **Manager + Tactical** cards (squad-wide), never on a generic player card.
* **xG**: resolution is xG-accumulate → Poisson draw (multiple goals possible), mirrored both
  directions. Any earlier "probability backbone unchanged" phrasing is void.

## 6. System synthesis (one line each)

* **Loop**: 5 increments (15/30/60/75/90'). Each: draw 1 Tactical → blind reconfigure + reveal configs
  simultaneously → reactive Tactical deploys (revealed simultaneously) → resolve.
* **Field**: 3×3 zones bucketed from formation slot x/y; finite XI power allocated across them;
  strengthening one zone starves another.
* **Resolution**: per-lane mirror contest `(A/D)^1.3` → xG per side → Poisson goals. Probability
  backbone (drama multiplier, seeded rolls) survives; inputs become field-derived.
* **Archetypes**: emergent labels over verb clusters; counters fall out of distinct verbs (no
  hardcoded triangle); compounding = synergies × leader multipliers × convex contest.
* **Cards**: power (scalar, = level, scales emission + trait strength) + position-set + archetype +
  rarity-deep trait loadout; chemistry pairwise, run-accumulated, paid as a zonal connection bonus.
* **Opponent**: deterministic per archetype (plays to its composition's strengths, opportunistically
  counters); legible via archetype familiarity + scouting + in-match inference.
* **Economy**: cash from stadium gate + small performance bonus + entertainment modifier; Balatro
  shop; merge-duplicates upgrade ladder (keeps chemistry); permadeath gauntlet.

## 7. Consolidated open-tuning decisions

* **Match feel**: convexity `k` (start 1.3); xG/Poisson variance shaping (permadeath makes a bad draw
  run-ending — but variance is now a *drafted* dial via Mavericks↔Catenaccio, partly self-balancing);
  `fitnessFactor` curve + base-vs-involvement drain weights.
* **Cards/chemistry**: chemistry curve (co-appearances → bonus) + the pair's connection rule;
  out-of-position penalty magnitude; novelty-buff magnitudes + farming cap; `personalityTheme`'s role;
  which traits form trait-link chemistry; per-synergy connection-rule assignment.
* **Tactical/Manager**: deploy gating (one-per-round vs energy); tactical deck cap; slot-unlock cost
  curve; manager rarity power curve.
* **Economy**: interest rate/cap; roster cap size; scouting cost/ROI; stadium/academy cost curves.
* **Validation**: the counter-web (`ARCHETYPES §3`) is a hypothesis — prove it in playtest, tune verb
  magnitudes so no identity dominates; watch the Mavericks↔Catenaccio variance war first.

## 8. Build order

1. **Verb dispatcher +** `TraitRecord` **runtime** — the spine; makes every identity expressible. (§9)
2. **Zonal field contest + chemistry** — the resolution: build fields, mirror lane-contest, xG→Poisson;
   chemistry connection bonus.
3. **Tactical deck + Manager + energy/slots** — the in-match hand and the run-lean.
4. **Opponent archetypes** — the deterministic policies (the read-and-counter core; needs the rest to
   playtest against).
5. **Economy/run loop** — activate the existing `economy.ts`/`packs.ts`/`run.ts` scaffolding against
   the new model.

## 9. First task (scoped)

**Goal**: a match resolves through the verb dispatcher, with migrated roles + a couple of new
transforms firing as `TraitRecord`s, producing the existing `AttackDefenceSplit` shape — deterministic
under seed.

* Define the ~10 palette verbs as functions over field accumulators / state, each tagged with phase
  (`relocate | scale | debuff-opponent` for field verbs) or as a `StateEffect`.
* Define `TraitRecord { name, verb, params, scope, target, condition }`.
* Build the dispatcher: collect effects from both XIs (stable iteration), resolve through phases with
  the snapshot-read + delta-pool commutativity rule and the `priority` escape hatch (`MATCH_ENGINE §7`).
* Migrate `applyRoleAbilities` (scoring.ts) into a `ROLE_TRANSFORMS` table — the first `TraitRecord`s
  (Regista/Volante/Anchor) — plus inside-forward and False-9 as new records.
* Wire into `evaluateSplit`; keep `resolveIncrement`'s chance→goal math (xG/Poisson) downstream.
* **Acceptance**: same seed → same result; the migrated roles + inside-forward + False-9 visibly
  shape the field; no archetype/identity object exists in code (all data).

Grounding symbols: `evaluateSplit`, `resolveIncrement`, `AttackDefenceSplit`, `CascadeLine` (match-v5.ts);
`Card`, `applyRoleAbilities` (scoring.ts); slot x/y (formations.ts).
