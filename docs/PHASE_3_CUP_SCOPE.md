# Kickoff Clash — Phase 3B/C Scope: the Cup run structure + Team Talk

Owner-approved redesign of the run model, scoped by the balance-lab brain trust
(Card Shark + Gaffer). Replaces the flat 5-single-match run with **five knockout
cups**. Decisions below are **locked** unless the owner reopens them.

> North star: roguelike that happens to be football. Knockout = permadeath, so the
> cup names the structure honestly. No league table. Cash is the only currency.

## Why this works (and is cheap)

The fitness engine already exists and varies sharply by player (`fitnessFactor =
0.52 + 0.08×fitness`; a glass attacker ends a match at ×0.66 power, a titanium
defender at ×0.99) — it just **resets to fresh every match** (`fitnessOf` → 6 at
`initMatch`). The cup's core change is to *stop resetting it* and put a prize at the
end worth rotating for. Everything downstream already reads `card.fitness`.

## The locked model

- **5 cups; cup k has k+1 matches** → 2, 3, 4, 5, 6 = **20 matches total**. Each cup is a
  knockout escalating to a **final vs the hardest team** (a visible step-change, not a
  smooth ramp).
- **Hard permadeath on every match, including the final.** Lose any match → run over.
  Survive all 5 cup finals → run won.
- **A draw advances you, but extra time drains everyone's fitness** (the draw outcome
  ties straight into the rotation system). Draws still pay reduced reward.
- **Fitness persists across a cup's matches**; **resets to fitness 6 between cups** (each
  cup a self-contained puzzle). A **benched** player recovers **+2.5** per match rested
  (cap 6); a sub-on recovers **+1.0**; a player who started carries their drained fitness
  forward (the cost). Injury risk below 2.5 stays — over-playing a fragile star risks
  losing him for the final.
- **Shop only between cups; the free Team Talk between ties.** You draft a cup squad,
  then live with it — only lineup/rotation/sub/tactic calls until the next shop. (If you
  could shop mid-cup you'd buy out of fitness debt and the sub-game dies.)
- **Bench depth is now a draftable resource** — you need ~16 viable players (a coherent
  A-XI + a capable B-XI sharing a spine). Deepens the early-game coherence puzzle
  (deepen vs peak).
- **Scout reveals the cup's FINAL from the cup's start**, so the rotation plan bends
  toward it ("the final is weak to Strikers → rest my Striker in the quarter").
- **Rotation is offered, never forced** — a fit-adjusted auto-fill default means a casual
  player hits confirm; the optimiser gets the full surface.

### The conflict + ruling
Legibility vs sim fidelity → **Card Shark wins the structure** (rest is binary, shop is
cup-locked). **Gaffer keeps the fitness-curve numbers** (drain by durability/band).

## Numbers

| Lever | Value |
|---|---|
| Cup sizes (matches incl. final) | `[2, 3, 4, 5, 6]` |
| Fitness carry-over | start each tie at the fitness you finished the last at |
| Rest recovery (benched) | **+2.5** toward 6 |
| Sub-on recovery | +1.0 |
| Between-cups reset | everyone → 6 |
| Extra-time drain (drawn tie) | extra fitness hit to all who played |
| Injury threshold | keep < 2.5 risk roll |
| Within-cup opp ramp | openers soft → final +4–5 above openers (the boss) |
| Per-match win purse | 40% of `BASE_WIN_CASH[cup]` |
| Cup trophy (win the final) | **1.5× `BASE_WIN_CASH[cup]`** (× stadium mult) |
| Draw | ×0.5 of the match purse |

The rotation inversion (cup-3 final, opp 86): a *tired* 90-power star at ×0.71 ≈ **64**
effective, vs a *fresh* 82-power bench striker at ×1.0 = **82** — the bench player is
better *right now*. That inversion is the whole sub-game, and it only exists because
power is decompressed (Foundation) and the tired penalty is steep.

> 20 sudden-death matches is long, so early/mid cup *openers must be soft* (high
> survival) with difficulty concentrated in the 5 finals — "routine ties then a wall."
> Calibrate the within-cup ramp on the seed-sweep so cumulative run-completion for a
> well-built, well-rotated squad is a sane roguelike clear rate.

## Build order (each chunk shippable + verified)

1. **Cup run-model backbone.** RunState gains cup/match-in-cup; GameShell loops ties
   within a cup, inserts the Team Talk phase between ties, shop only after a cup win,
   permadeath on any loss, run-complete after cup 5's final. (Opponent/economy still
   per-cup-base initially.)
2. **Fitness persistence + rest recovery + extra-time drain.** Stop resetting; persist
   onto deck cards; +2.5 benched / +1.0 sub-on; cup reset to 6. Sweep-validate the
   rotation trade-off.
3. **Within-cup opponent ramp.** Opponent power/style by (cup, match-in-cup); final =
   boss. Sweep-calibrate the survival curve.
4. **Cup-prize economy.** 40% match purse + 1.5× trophy, × stadium mult.
5. **Team Talk UI (designer).** The rotation/lineup surface — fitness front-and-centre,
   chemistry/shape read, formation/style/intent, fit-adjusted auto-fill default.
6. **Scout-the-final + polish.**
