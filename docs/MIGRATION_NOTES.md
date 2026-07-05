# MIGRATION_NOTES — legacy `src/lib` vs `SYNERGY_MODEL_V1`

**Phase 0 audit (KC_REBUILD_PLAN_V1 §P0.4).** Verdict per module: **KEEP** (survives into the
rebuild as-is or near-as-is), **ADAPT** (the concept survives; the implementation moves/changes),
**DELETE** (violates an SM design law or is superseded outright). The audit is against the five
SM §1 laws; the NW-138 verb dispatcher + `TraitRecord` runtime is the agreed keep-baseline.

The live game keeps running on `src/lib` until Phase 5 flips the UI to `src/engine/`. Nothing
here is deleted *now* — this is the plan of record for what happens as each phase lands.

---

## `verbs.ts` (+ `role-transforms.ts`, `field.ts`) — KEEP (baseline)

The closed 10-verb palette, `TraitRecord` shape, snapshot-read + delta-pool dispatcher, and
seeded `traitRng(seed, increment, cardId)` are exactly what SM builds on. `src/engine/` imports
`VerbName` from here — the palette stays defined once (law 3).

- **KEEP:** `VerbName`, phase ordering, deterministic sub-seeded RNG discipline, the
  record-over-palette architecture, `ROLE_ALIASES` coverage approach.
- **ADAPT (Phase 1, done):** the *evaluation context*. The legacy dispatcher evaluates records
  against zonal field accumulators (attack/defence/creation/finishing cells); the rebuild
  evaluates (verb, **context**, magnitude) against declared postures, generated windows, and
  per-increment states (SM §2). The engine's `EngineTrait` is that adaptation — same verbs, new
  context taxonomy, window/streak/point accumulators instead of zone cells.
- **NOTE:** `dampen/amplify-variance` were inert in the live engine (possession.ts never read
  the accumulator — known tech debt). In the rebuild they are load-bearing from day one: they
  mutate the resolution die (SM §6). The rebuild fixes the debt rather than inheriting it.

## `match-v5.ts` — ADAPT (superseded loop, surviving surfaces)

The 5×15-minute increment loop, possession-share → shot → xG → goal cascade, and
attack/defence split are superseded by SM §6's step-resolved 6 batches × 3 increments with
window resolution (`charge + d(die) ≥ threshold`) and goals+points scoring.

- **ADAPT:** the trigger-hook vocabulary survives conceptually — kickoff→`createMatch`,
  goal/concede hooks→`goal-event` context (SM §2 explicitly maps these). The Called Plays
  break-cadence (decide between spells) is the direct ancestor of Phase 2's
  play-tactics-between-batches; `callPlay`/charges anticipate the tactical deck.
- **ADAPT:** `computeMatchVerdict` (why won/lost) re-derives from the typed event log in the
  rebuild — the event log makes it a pure aggregation (SM §9 dashboard), not bespoke plumbing.
- **DELETE (Phase 5):** possession-share math, xG convexity dials, the zonal lane contest as
  the goal model, cascade-line bonus stacking (flat multiplier stacking violates law 1 where
  unconditional). The honest-scoreline idea survives; the mechanism does not.

## `scoring.ts` — ADAPT (card model), DELETE (styles)

- **KEEP:** `seededRandom` (referenced everywhere), `Durability` + its price/injury/shatter/fan
  tables (an economy/risk layer orthogonal to SM; used by shop/run), `Card` as the UI-facing
  shape until Phase 3 regenerates the dataset.
- **ADAPT (Phase 3):** the card model gains SM §5 anatomy — deliberately-mediocre base
  contribution + 1–2 conditional TraitRecords (verb, context, magnitude tier) + cluster tag.
  `abilityName`/`abilityText` finally get used as the surfaced trait copy. Rarity scales
  *conditionality*, not numbers.
- **DELETE (Phase 3/5):** `PLAYING_STYLES` (unconditional whole-squad multipliers — law 1
  violation), `evaluateLineup`'s flat-bonus cascade, archetype-keyed bonuses (law 2: couplings
  must go through contexts, not archetype names).

## `jokers.ts` — DELETE as code, REBUILD as data (Phase 2)

The clearest law violations in the codebase, and the reason law 4 exists:

- `compute: (xi) => xi.filter(c => c.archetype === 'Target' …).length * 30` — an unconditional
  bonus (law 1), name/archetype-coupled (law 2), expressed as code not records (law 4).
- **DELETE:** every `compute()` function, `applyJoker`, the non-serialisable-function
  rehydration dance (`rehydrateJokers` exists only because managers are functions; data-only
  managers serialise cleanly).
- **REBUILD (Phase 2):** the 10-manager roster (SM §4) as TraitRecord bundle data files under
  `src/engine/data/managers/` — default posture + preferred formation + context reweights. The
  *fiction* (names, philosophies, nations, trait tags — Roy Tanner, Émile Roux…) is good
  content: carry the personas over onto the new data records.
- `squad-transforms.ts managerTraits` is the half-way house (managers as records over the
  legacy zonal context) — it proves the shape and is superseded by the same Phase 2 data files.

## `tactics.ts` — ADAPT (closest survivor)

The Called Plays rework already moved tactics most of the way to SM §3: per-spell calls with
charges, effects as TraitRecords (`squad-transforms.ts tacticTraits`), no persistent slots.

- **ADAPT (Phase 2):** a call becomes a **timed posture window** — `playClass`
  (attacking/defensive/control) maps onto posture overrides (possession/deep-block v1), and
  gains `duration` (batches, rarity-scalable) + an energy cost; play-between-batches only.
  Charges → the per-match energy budget (v1: 5).
- **KEEP:** the card fiction (names/flavour), the grading idea (answered/countered) as UI
  read-side, id stability for save-compat.
- **DELETE:** effects authored against zonal lanes/cells (re-authored against the context
  taxonomy in Phase 2).

## `hand.ts` — mostly DELETE (already gutted)

The legacy hand-scoring path (`evaluateIncrement`, cascade types) was already removed in the
Called Plays pass. What remains:

- **KEEP until Phase 5:** `rollXI` / `handFromSelection` — squad-selection conveniences used by
  the live UI.
- **DELETE (Phase 5):** the module dissolves; squad selection consumes `src/engine/` selectors
  (regime pre-evaluation needs engine context, SM §9).

## `formations.ts` — KEEP geometry, ADAPT meaning (Phase 2)

- **KEEP:** the 8 formations, 11-slot definitions, pitch x/y geometry (pure presentation +
  squad-legality data the UI needs regardless of engine), `positionFitsSlot` eligibility.
- **ADAPT (Phase 2):** formation's *mechanical* meaning changes entirely — from max-attacker
  caps/slot bonuses to the **adherence throttle** (SM §7): three bands (native/adjacent/foreign
  ≈ 100/70/40%) throttling default-posture event-generation weights, with a per-formation
  adjacency table as data (`src/engine/data/adherence.ts`, contents TBD — SM §12 open question).
- **BANNED:** formation as a trait context (SM §2 cut — it would double-count the throttle).

## Cross-cutting

- **`chemistry.ts`** (not in the audit list but adjacent): archetype-pair and personality-theme
  multipliers violate laws 1–2 as written; SM §5 reserves *cluster tags* for a later-phase
  chemistry design. Park — no rebuild work until that design exists.
- **`defining-traits.ts` / `trait-copy.ts`:** the action-trait layer is the right *instinct*
  (conditional, verb-palette traits) and its display pipeline (single copy source read by cards
  AND match UI) is a pattern to keep; the trait *content* is superseded by Phase 3's ~25–30
  reviewed templates with dual-axis + coverage validation.
- **`opponent.ts` / `plays.ts`:** OPPONENT_PLAYS + telegraphs anticipate SM §3's
  posture-profile opponents with one-batch-ahead telegraphs; re-expressed as posture profiles +
  matchup matrix in Phase 2/4 (the matrix *is* the opponent system).
- **`run.ts` / `economy.ts` / `packs.ts`:** out of this audit's scope (Phase 4). Note SM
  extends `ECONOMY_V1` (manager pricing ≈ 2 shops, early-whistle surplus→cash, dual-axis
  stocking); the 5-match run becomes 9 fixtures with the `1.8 × 1.42^f` points target curve.
