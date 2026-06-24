# Kickoff Clash — Match Engine v1 (canonical spec)

Supersedes `FIELD_MODEL_V1.md` and `DISPATCHER_V1.md` (folded in below). Tunable constants are
**starting points** for playtest, not final. Grounded against the real codebase (`match-v5.ts`,
`scoring.ts`, `formations.ts`, `hand.ts`, `actions.ts`, `jokers.ts`).

## 0. Design pillars

* **Board is Football Manager, hand is Snap.** Players are a fixed squad set pre-kickoff and pushed
  around tactically; actions/managers are drawn and played from a hand.
* **The opponent is a solvable puzzle.** Deterministic reconfiguration per archetype; the skill is
  reading them, the luck is your draws + xG.
* **Allocation is the game.** A finite XI distributes power over a zonal field; strengthening one
  zone starves another; you out-allocate a knowable opponent.
* **One primitive.** Every card behaviour — roles, traits, signature abilities, played actions — is a
  `FieldTransform`/`StateEffect` fired by one side-agnostic dispatcher.

## 1. The increment loop

A match is **5 increments** at minutes **15, 30, 60, 75, 90** (`INCREMENT_MINUTES`, note the 45 gap).
Each increment:

1. **Draw** 1 action card into hand.
2. **Reconfiguration window** (blind): both managers pick a formation template, re-assign / reposition
   cards (free), optionally spend a sub. Lock → **both configs reveal simultaneously**.
3. **Reactive action window** (blind, informed): both see the revealed configs, choose actions to play
   (energy-limited). Lock → **both action sets reveal simultaneously**.
4. **Resolve**: build both fields → apply transforms (roles/traits + played actions) → mirror lane
   contest → xG per side → Poisson draw → goals.
5. **Post**: deplete fitness, record novelty zones, emit ticker events, advance.

Two blind-commit beats (place, then act). Both are deterministic on the opponent's side, so mastery
collapses them into prediction; the blind commit only protects a player still learning the archetype.

## 2. Squad & placement

* **Fixed XI + bench**, locked pre-kickoff. No in-match player draws.
* **Placement = formation templates.** Pick a shape (4-3-3, 4-4-2, 3-5-2, …); cards fill its fixed
  slots. Slot x/y in `formations.ts` is canonical — no free-grid placement, no legality checks.
* **Reshape is free**: re-assign cards to slots and switch formation every window at no cost. The only
  limit is reading the opponent.
* **Subs**: fixed **3 per match** (v1). A sub swaps a bench card into a slot (fresh fitness). Spent in
  the reconfiguration window. Scarce — repositioning is free, a sub buys a fitness reset or a trait
  that repositioning can't conjure.

## 3. Card power emission

```
emit(card) = base × fitnessFactor × roleMod × traitMod
  base          = card.power               // power == level (transform.ts: power = char.level)
  fitnessFactor = f(fitness 1–6)           // §3.1
  roleMod/traitMod = scale (+ possible relocation via FieldTransform, §5)
```

Emitted magnitude is split into attack / defence / creation / finishing by the **existing**
`getChanceProfile` + dual-role logic — unchanged; the field model only changes magnitude and
location. A card emits into its slot's zone cell unless a transform relocates it.

### 3.1 Fitness (1–6) & durability

* **fitness** = dynamic condition, depletes across increments. Drain = **base + involvement**
  (attacking / contested lanes drain faster), with **durability** scaling the base rate.
* **durability** (existing 6-tier ladder `glass…phoenix`) governs depletion rate + injury/shatter.
* Declan Rice trait = high durability ⇒ negligible drain ⇒ 90 minutes, ~0 injury. Injured glass card
  ⇒ fitness ≈ 1 ⇒ one round left.
* `fitnessFactor` start: linear, 6 → 1.0 down to 1 → ~0.5.
* Interaction: rest a tired star by repositioning it into a cold (low-involvement) zone — but that
  predictably weakens a lane a deterministic opponent can punish.

## 4. Zonal field & contest

3 lanes × 3 bands = **9 cells**, bucketed from slot x/y:

```
lane = x<37?'L':x>63?'R':'C'   band = y<33?'ATT':y>66?'DEF':'MID'   zone = `${band}_${lane}`
```

ATT_C = the box; DEF_C = keeper/central defence.

**Mirror contest, both directions, per lane:**

```
A_lane = w_att·ATT_lane.attack + w_mid·MID_lane.attack          (your push)
D_lane = w_def·oppDEF_lane.defence + w_mid·oppMID_lane.defence   (their cover)
laneThreat = (A_lane / D_lane) ^ k          k = 1.3
```

Run identically the other way (their attack vs your defence). Each side's 3 lane threats aggregate
into an **xG** value; a **Poisson draw** on each xG yields goals (multiple possible per side per
increment). Lanes resolve **independently**. GK is just defensive field power in DEF_C — no save step.

This replaces scalar `attackScore`/`defenceScore` and the binary goal roll in `resolveIncrement`; the
chance/quality derivation and 90th-minute drama multiplier survive, the final roll becomes xG→Poisson.

## 5. Field transforms (the ability primitive)

```ts
type CardEffect = FieldTransform | StateEffect;
interface FieldTransform {
  sourceCardId: number;
  phase: 'relocate' | 'scale' | 'debuff-opponent';
  priority?: number;        // default 0; escape hatch for order-dependent effects only
  commentary?: string;      // ticker line when it materially moves the split
  apply(ctx: FieldCtx): void;
}
interface StateEffect { sourceCardId: number; trigger: Trigger; priority?: number; apply(ctx: StateCtx): void; }
```

Roles, traits, signature abilities, and played actions are all transforms. Inside forward (relocate
wide→centre), False 9 (relocate box→mid + box debuff), sweeper keeper (project GK out), Onfield Coach
(StateEffect: +energy) — same machinery, side-agnostic over both XIs.

### Novelty ("Milner") buff

A **card trait** (magnitude/duration card-defined). Fires the first time a carrying card occupies a
**zone cell** not yet used this match (zone-granular: CM_L→CM_R triggers; two central-mid slots
don't). State: `visitedZones: Record<cardId, Zone[]>`.

## 6. Action & manager hand

* **Draw 1 per increment** into hand (≈5 seen per match — high leverage, concentrates draw-luck).
* **Energy/tempo**: fixed pool per increment (refreshes, no carry), **modified by traits** (Onfield
  Coach +energy). Action ceiling is a squad-building choice; a subbed/gassed coach lowers it.
* **Played reactively, simultaneously**: after configs reveal, both choose actions seeing both boards,
  lock, reveal together. Played actions = transforms entering the resolve pipeline (§7) between field
  build and contest. Timing conditions in `actions.ts` ("only at 75'") gate playability.

## 7. Dispatcher

| Trigger | Engine hook | Kind | Fires |
| -- | -- | -- | -- |
| `kickoff` | `initMatch` | StateEffect | match setup, energy-trait init |
| `onReconfig` | `commitAttackers`/`makeSub` | StateEffect | novelty detection, energy recompute |
| `onReveal/reactive` | `evaluateSplit` (post-reveal) | FieldTransform | played actions enter the field |
| `attacking/ongoing` | `evaluateSplit` | FieldTransform | role/trait field transforms |
| `onGoal/onConceded` | `resolveIncrement` | StateEffect | events, ticker commentary |
| `onIncrementEnd` | `advanceIncrement` | StateEffect | fitness drain, record visitedZones |
| `fulltime` | `getMatchResult` | StateEffect | end |

**Resolve pipeline (inside** `evaluateSplit`**):** base emit (snapshot per card) → relocate phase →
scale phase → reactive played-action transforms → debuff-opponent (cross-side) → mirror lane contest
→ aggregate to xG.

**Order of operations:** phase order fixed; within a phase commutative — transforms read their source
card's base-emit snapshot and write to delta pools applied atomically (so a False 9 and an inside
forward both hitting ATT_C/MID_C commute). `priority` only for genuinely order-dependent effects.
Determinism: stable iteration, RNG seeded from `(seed, increment, cardId)`.

`applyRoleAbilities` (scoring.ts) is **superseded** — its roles migrate into `ROLE_TRANSFORMS` (§9).

## 8. Opponent & run

* **Archetype = a deterministic reconfiguration policy** (formation + assignment + reactive actions)
  as a function of visible state + style. `opponentStyle` (Passive/Attacking/Counter/Adaptive) is the
  proto-version; archetypes are the richer, named successors.
* **Objective hierarchy (primary → secondary):** the opponent's first goal is to **scale its own
  points** — play to its composition's strengths (lean into its strongest lanes/archetypes and build
  across the increments). Only *then*, and only if it can, does it **counter**: a bounded,
  opportunistic adjustment to your committed shape (push at your thinnest cover lane, shift its own
  cover onto your loaded lane). A per-opponent `reactivity` weights how hard it counters — low by
  default (most sides just play their own game), raised only for reactive styles / AI managers
  (counter-attacking, adaptive). Counters stay emergent: push/cover redistribution read off your
  shape, never a hardcoded matchup.
* **Legibility (layered info economy):** archetype familiarity (across runs) + scouting (spend to
  reveal pre-match) + in-match inference (read their first moves). Not shown free → information is a
  resource axis. Computed blind (without seeing your locked config).
* **Run = permadeath gauntlet (v1):** ~5 escalating matches (`OPPONENT_BASELINES` becomes a power
  budget for opponent-XI generation); lose once → run ends. Between matches, **pack pulls** build
  roster + action deck — the run's luck.

## 9. ROLE_TRANSFORMS — first draft (starting numbers)

`M` = migrated from `applyRoleAbilities`; `N` = new. Fractions are of the source card's base emission.

| Role / trait | Name | Phase | Effect | Start | Src |
| -- | -- | -- | -- | -- | -- |
| Inside forward @ ATT_L/R | Cut Inside | relocate | move attack ATT_L/R → ATT_C | 0.40 | N |
| False 9 @ ATT_C | Drop Deep | relocate | move ATT_C → MID_C (0.50) + flat ATT_C debuff (0.20) | 0.50 / 0.20 | N |
| Sweeper keeper @ DEF_C | Sweeper | relocate | project DEF_C defence → DEF_L/DEF_R/MID_C | 0.30 split | N |
| Inverted FB @ DEF_L/R | Underlap | relocate | move DEF_L/R → MID_C | 0.25 | N |
| Regista @ MID | Metronome | scale | +5% creation to all your cells | +0.05 | M |
| Volante @ MID | Tackle & Go | debuff-opponent | −5% opponent attack in own lane | −0.05 | M |
| Anchor @ DEF | The Shield | scale | +30% defence to lowest-power card's cell | +0.30 | M |
| Target man @ ATT_C | Hold Up | scale | +15% finishing in ATT_C if ≥2 attackers | +0.15 | N |
| Onfield coach (any) | Touchline Voice | StateEffect@kickoff/reconfig | +1 energy | +1 | N |

## 10. Open tuning knobs (deferred)

* xG variance shaping — permadeath makes a bad Poisson run-ending; consider damping so the xG
  favourite usually wins. (k, Poisson scale.)
* `fitnessFactor` curve; base vs involvement drain weights; durability→drain mapping.
* Energy base value; action card costs; hand cap.
* Novelty buff magnitudes (per card); whether free reshape needs a novelty-farming cap.
* Sub count (3 vs 5); scouting cost/economy.
* Connection-rule assignment per synergy (global / lane / band / cell / neighbour).

## 11. Integration map

| Symbol | Change |
| -- | -- |
| `formations.ts` | canonical zone source — consumed, unchanged |
| `evaluateSplit` | build fields, run resolve pipeline (§7), mirror contest, aggregate to xG |
| `resolveIncrement` | xG → Poisson goals (was binary); chance/quality + drama survive |
| `getOpponentBaselines` | → opponent-XI generator from the round budget |
| `MatchV5State` | add `opponentXI`, opponent config, `visitedZones`, energy, action hand/deck; `Card` gains `fitness` |
| `applyRoleAbilities` | superseded by `ROLE_TRANSFORMS` |
| `actions.ts`/`jokers.ts` | actions/managers become hand cards firing transforms on play |
| trigger dispatcher (new) | the §7 runtime |
