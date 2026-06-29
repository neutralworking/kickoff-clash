# Translation map — card-game + football principles → Kickoff Clash

Where the theory meets *this* codebase. Every Lab recommendation should land on one
of these levers, with a number and a way to test it.

> Anchor docs: `docs/KICKOFF_CLASH_DESIGN.md` (index, precedence) → `ARCHETYPES_V1`
> (verbs + 11 identities + counter-web), `CARDS_V1` (player model, chemistry,
> TraitRecord), `MATCH_ENGINE_V1` (loop, zonal field, xG→Poisson), `ECONOMY_V1`
> (card layers, revenue, run loop), and `MATCH_ENGINE_V5.md` (the live engine).

## The systems, mapped

| Theory (🃏 / ⚽) | KC system | File(s) | Levers |
|---|---|---|---|
| Difficulty escalation (Balatro blinds) | Opponent power curve | `src/lib/opponent.ts` | `ROUND_POWER = [76,81,86,91,96]`, ±6 jitter, `STYLE_FORMATION`, `OPP_REACTIVITY` |
| Output variance bound | Goal model (xG→Poisson) | `src/lib/possession.ts` | `XG_BASE`, `XG_CONVEX`, `XG_MIN/MAX`, `SHOT_BASE`, `POSS_POOL`, `drama` |
| Constraint system (color pie) | Coupled zonal contest | `src/lib/field.ts` | `FIELD_CONST.k≈1.1` (convexity), `oppReact`, `coverPool` |
| Opponent fudge factor | Skipped-cascade comp | `src/lib/match-v5.ts` | `OPP_COHESION = 1.3` |
| Power budget / curve shape | Card power scale | data + `src/lib/transform.ts` | levels 71–95 (compressed; §11.2 → 50–99) |
| Multiplicative synergy | Chemistry (4 tiers) | `src/lib/chemistry.ts`, `chem.ts` | tier multipliers; personality-theme stack |
| Archetype counter-web | Verbs + identities | `src/lib/verbs.ts`, `role-transforms.ts`, `docs/ARCHETYPES_V1.md` | emission verbs, role transforms |
| Deck curation / draft | Packs + shop | `src/lib/packs.ts`, `economy.ts`, `run.ts` | `RIP_COUNTS`, pack weights, shop costs |
| Tech cards / answers | Tactics | `src/lib/tactics.ts` | 12 cards, `contradicts` pairs, per-tactic `compute`, 3 slots, 5→9/run draw |
| The "snap" / risk economy | Permadeath + rewards | `src/lib/run.ts`, `src/components/GameShell.tsx` | one loss ends run, `DRAW_REWARD_FACTOR=0.5`, match gate |
| Attrition / cost-of-power | Durability | `src/lib/scoring.ts`, `run.ts` | `SHATTER_CHANCE` (glass .20 / phoenix .30), `INJURY_CHANCE`, fitness |
| Joker/build-around | Managers | `src/lib/jokers.ts` | passive modifiers, max 3 |

## Where the two lenses naturally meet in KC

- **Archetype counter-web ⇄ style RPS.** ARCHETYPES_V1's counter-web *is* the
  football style rock-paper-scissors (Gaffer) *is* the MTG color-pie / Snap-archetype
  web (Card Shark). The same health test applies: does the meta rotate or solve?
- **Chemistry tiers ⇄ multiplicative synergy.** The personality-theme stack (~72–80%
  uplift) is a textbook *multiplicative runaway* (🃏) that also has to feel like a
  real dressing-room edge, not the whole story (⚽). Both lenses → cap/curve it.
- **Permadeath ⇄ the snap.** One-loss runs are KC's cube economy: every fixture is a
  bet. `DRAW_REWARD_FACTOR` is the risk/reward dial — a safe draw survives but earns
  less (🃏 economy + ⚽ "take the point" both endorse the tension; tune the number).
- **Opponent curve ⇄ escalating blinds.** `ROUND_POWER` is Balatro's ante. On one
  life it must be tight-but-fair; the player's deck/chemistry/training must *scale*
  to meet it (Balatro's "build or fall behind").

## Known issues / standing backlog (with the lens read)

1. **Personality stacking (~72–80%).** 🃏 multiplicative runaway → cap or diminish.
   ⚽ a great dressing room is real but shouldn't outweigh XI quality. *Lever:*
   `chemistry.ts` tier multipliers + a stacking cap. *Test:* sweep deck strength with
   stack on/off.
2. **Power compression (71–95).** Flattens deck differences; top deck pins the
   goal-chance ceiling, so drafting barely matters (🃏 "no power budget spread").
   *Lever:* widen to 50–99 (`transform.ts` mapping). *Test:* re-run the harness; the
   spread between a strong and weak XI should re-open.
3. **Archetype skew (Creator 16.8% / Dribbler 1.4%).** Warps the counter-web and the
   meta before any dial — fix the *data* first (🃏 + ⚽ agree). *Lever:*
   `public/data/kc_characters.json` distribution. *Test:* recount; aim for a spread
   that supports every archetype's build-around.
4. **Opponent curve vs one life.** Is round 5 a wall or a lap of honour? *Lever:*
   `ROUND_POWER`, `OPP_COHESION`. *Test:* seed sweep win-rate by round for a median deck.
5. **Reward pacing.** Does survive-on-draws keep up with shop costs? *Lever:*
   `DRAW_REWARD_FACTOR`, gate revenue, shop prices. *Test:* simulate a draw-heavy line's
   cash vs a win-heavy line's across 5 rounds.
6. **Tactics meta.** Dominant contradiction pair? Dead card? Missing counter? *Lever:*
   per-tactic `compute` in `tactics.ts`. *Test:* compare each tactic's bonus on a
   representative XI; look for one that's always-correct or never-worth-it.

## Validation — how the Lab proves a change

Kickoff Clash is **deterministic** from the run seed — use it.

- **The harness:** `npx tsx scripts/match-harness.ts` (note: `tsx`, not `ts-node`).
  Imports the engine directly; reproducible per seed. The first place to confirm a
  match-math change didn't move outcomes you didn't intend.
- **Seed sweeps:** the repo has used a **160-seed sweep** to read average outcomes
  (e.g. the intent-wiring calibration: Attacking ~3.7 / Balanced ~3.0 / Defensive
  ~2.3 goals). For a balance change, sweep the metric that matters (win-rate by
  round, goal distribution, draw frequency) before vs after.
- **Determinism guardrail:** when a change is meant to be *display/economy only*,
  prove the match scoreline is byte-identical to HEAD across the sweep (stash-vs-tree
  diff). When it's meant to move the meta, *measure how much* and check it's the
  intended direction and magnitude — not a cliff.
- **One dial at a time.** Sensitivity-test each lever in isolation so you know what
  did what; only then combine.

## House rules for the Lab

- **Propose, don't apply.** Balance is the design owner's call — end with a decision
  table, not a committed change, unless asked to implement.
- **Name the number.** "Feels strong" is not a finding; `OPP_COHESION 1.3 → 1.2,
  because…` is.
- **Both voices, every time.** If only one lens has spoken, the analysis isn't done.
- **Respect the data.** A distribution/scale problem in `kc_characters.json` can't be
  dial-tuned away — fix the data first, then balance on top of it.
