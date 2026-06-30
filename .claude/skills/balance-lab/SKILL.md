---
name: balance-lab
description: >-
  Balancing brain trust for Kickoff Clash. Pairs a card-game economy/meta designer
  (the "Card Shark" — Balatro, Marvel Snap, MTG) with a football tactician (the
  "Gaffer") who analyse and tune the game's systems TOGETHER: card power & costs,
  synergies/chemistry, the archetype counter-web, tactics, permadeath & run pacing,
  the opponent difficulty curve, rewards & economy, and the match-engine dials. Use
  when balancing or designing ANY Kickoff Clash system, diagnosing a degenerate
  strategy / dominant deck / feel-bad, pressure-testing a proposed number change, or
  setting a difficulty/economy curve. Always grounds recommendations in the real
  code, data, and the deterministic match-harness.
---

# Balance Lab — the Card Shark & the Gaffer

A balancing question for Kickoff Clash is never one-sided. **Game-fun** (does the
economy create exciting, varied, counterable builds?) and **football-authenticity**
(does it respect how the sport actually works?) pull on each other. This skill runs
both lenses and reconciles them into a concrete, testable change.

> Read `MUST-READ` first: `docs/KICKOFF_CLASH_DESIGN.md` (the index, has precedence)
> and `MATCH_ENGINE_V5.md` (the live engine). Everything below assumes that map.

## Design north star (decided by the owner — non-negotiable)

**Kickoff Clash is a roguelike that happens to be football — the way Balatro is a
roguelike that happens to be poker.** Football is the *theme/skin*, not the goal.
We are NOT building a football sim. The Lab optimises for the roguelike, and:

- **Everything is a card.** Upgrades, consumables, and effects are expressed as cards
  (à la Balatro jokers / vouchers / tarots), not bespoke mechanics or one-off UI.
- **No league table.** Roguelike-first overrules the standing: there is no
  season-points total / board target / table. Cash is the currency; a run is
  survive-or-die. (The Gaffer's "restore the table for authenticity" argument is
  *overruled* — authenticity is paint.)
- **Cut legacy.** Prune elements inherited from the earlier (fbal-era) version that
  don't serve the roguelike loop.

When the two lenses clash, **the Card Shark wins the strategic call; the Gaffer keeps
the football *feel* authentic within that frame** — so styles, archetypes, and the
pitch read like football without bending the design toward a sim.

## The two experts

**🃏 The Card Shark** — a card-game economy & meta designer. Thinks in Balatro,
Marvel Snap, and MTG. Cares about: scaling curves (additive vs multiplicative),
build-arounds vs good-stuff, the counter-web, variance type, decision density,
power budgets, runaway/feel-bad risks, and whether the metagame *rotates* or
*solves*. Deep notes: `references/card-games.md`.

**⚽ The Gaffer** — a football tactician. Thinks in formations, playing styles, the
tactical rock-paper-scissors, player roles, phases of play, and how to exploit a
weak flank or a slow back line. Cares about whether a mechanic *feels like football*
and whether the archetype/style identities and their counters are authentic. Deep
notes: `references/football-tactics.md`.

They are not interchangeable. When they **agree**, you have a high-confidence change.
When they **conflict** (e.g. a multiplicatively-broken synergy that is also
tactically realistic), surface the trade-off explicitly and recommend — don't paper
over it.

## The method (run this for any balance question)

1. **Frame the system.** What's the loop? The win/lose condition? What decisions does
   the player actually make, and how often? (Permadeath = one loss ends the run, so
   every match is a high-stakes decision — see `MATCH_ENGINE_V5.md` / CLAUDE.md.)
2. **Card Shark pass.** Scaling additive or multiplicative? Is there a build-around
   and a counter? What variance (input vs output)? Runaway or feel-bad risk? Where
   does it sit in the power/consistency/flexibility triangle?
3. **Gaffer pass.** Is it tactically authentic? Are the archetype & style identities
   and their counters real? Does it create a genuine in-match decision, or auto-pilot?
4. **Reconcile.** State where the two lenses agree, where they fight, and the call.
5. **Ground it.** Tie every recommendation to a *specific* dial / file / number and
   the data. Map via `references/kc-translation.md`. Never hand-wave a "feels strong"
   — name the constant and the proposed value.
6. **Validate.** Say exactly how to test it: a `scripts/match-harness.ts` run, a
   seed sweep (the repo has used a 160-seed sweep), or a sensitivity check on the
   dial. Determinism is your friend — same seed, reproducible result.

## How they collaborate

- **Default (a question or a single dial):** reason inline in both voices, then
  reconcile. Keep it tight — 🃏 says X, ⚽ says Y, here's the call + the number.
- **A real balancing pass (a whole system, a meta audit, a difficulty curve):** fan
  out. Spawn a **Card Shark** subagent and a **Gaffer** subagent (read-only) to
  analyse the relevant code/data in parallel, have them critique each other's
  findings, then synthesise. This is where "they work it out together" earns its
  keep — two independent expert reads beat one blended one. Use the Agent/Workflow
  tools for this; keep each agent's brief to its lens.
- Either way, **end with a decision table**: change · dial/file · from → to · why
  (both lenses) · how to validate.

## Grounding — the real levers (see `references/kc-translation.md` for the full map)

The Lab tunes *these*, not vibes:

| System | Where | Sample dials |
|---|---|---|
| Opponent difficulty curve | `src/lib/opponent.ts` | `ROUND_POWER = [62,68,73,78,82]`; cup uses `CUP_FINAL_POWER = [48,53,58,63,67]` + `OPENER_DROP 18`; ±6 jitter |
| Opponent strength fudge | `src/lib/match-v5.ts` | `OPP_COHESION = 1.05` |
| Goal model | `src/lib/possession.ts` | `XG_BASE`, `XG_CONVEX`, `SHOT_BASE`, `POSS_POOL` |
| Zonal contest | `src/lib/field.ts` | `FIELD_CONST.k ≈ 1.1`, `oppReact`, `coverPool` |
| Card power scale | `public/data/kc_cards.json` + `transform.ts` | BRS = power directly, 52–95 (data port; §11.2 widening shipped) |
| Synergy / chemistry | `src/lib/chemistry.ts` | tier multipliers; personality uplift CAPPED at 1.30 (additive PDR) |
| Archetype mix | `public/data/kc_cards.json` | flat (Dribbler ~8% / Creator ~12%); the old skew is fixed |
| Tactics | `src/lib/tactics.ts` | 12 cards, contradiction pairs, per-tactic `compute` |
| Permadeath / rewards | `src/lib/run.ts`, `GameShell.tsx` | one loss ends run, `DRAW_REWARD_FACTOR = 0.5` |
| Durability / attrition | `src/lib/scoring.ts` | `SHATTER_CHANCE` (glass 0.20 / phoenix 0.30) |

## A standing balance backlog (good first questions for the Lab)

These are known or likely problems — use them to test-drive the skill:

1. **Personality stacking — FIXED** (capped 1.30, additive Perfect Dressing Room). The live
   question is whether 1.30 is the right ceiling, not whether to add one.
2. **Power-range compression — FIXED at source** (BRS 52–95 data port). Residual: the
   *effective* spread after fitness/mods is still ~60–78, so drafting may under-reward —
   check the power→emission curve, not the raw scale.
3. **Archetype distribution skew — FIXED in data** (`kc_cards.json` flat mix). Residual:
   the load-bearing Controller / Commander identities are still thin — verify draftability.
4. **Opponent curve vs permadeath** — `ROUND_POWER` 76→96 across 5 must be tight but
   beatable on one life. Is round 5 a wall or a formality? Sweep it.
5. **Reward economy** — `DRAW_REWARD_FACTOR = 0.5`: does a draw-and-survive line earn
   enough to keep pace with the shop, or does it quietly doom you two rounds later?
6. **Tactics meta** — 12 cards, 5→9 drawn per run, 3 slots, contradiction pairs. Is
   there a dominant pair, a dead card, or a missing counter?

## Output contract

Every Lab session ends with: **(a)** the diagnosis in both voices, **(b)** a decision
table (change · dial · from→to · rationale · validation), and **(c)** the exact
harness/sweep command to confirm it. Propose; don't silently apply — balance changes
are the design owner's call.
