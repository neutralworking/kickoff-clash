# SCORING V2 — One currency, three contests, two dice

**Status: LOCKED for v1 (owner-approved).** This supersedes the six-lane emission/cascade
accounting in `FUNNEL_MODEL_V1.md` wherever the two disagree. The funnel *shape* survives
(possession yields chances, chances yield goals; pressing kills possession, destruction
kills chances, defence prevents goals) — but it is now scored in **one currency: card
points**, with dice only at the very end of the chain.

## The law

**Every effect in the game is a flat ±N in card points.** No percentages, no multipliers,
no hidden scales. A card is ATK + DEF (integers −1..20, `deriveStats`). Managers, tactics,
chemistry, personality, fitness, traits, positional penalties — all of them add or subtract
whole points from a card's ATK/DEF, all of them land in the per-card delta ledger, and all
of them are visible on the pitch (green = buffed, red = drained) with a tap/hover receipt.
Because nothing multiplies, nothing compounds — the anti-compounding cube-root machinery
is retired along with the multipliers it policed.

BRS survives ONLY as the shop/rating scale (pack odds, price). It never touches match math.

## The round (15' increment)

Each round runs **three contests**, in order. Contests 1 is deterministic; dice appear only
in contests 2 and 3.

### Contest 1 — THE BALL (deterministic)

Who has it. Identity-based, per the owner's spec ("possession is determined largely by
controllers v pressers/engines"):

- **KEEP** = Σ effective ATK of your **Controllers, Passers, Engines**.
- **PRESS** = Σ effective DEF of the opponent's **ATT-band cards + their Engines**.
  (Pressing is the forwards' defensive work; Engines run both ways and appear on BOTH
  sides of this contest — that is what makes the skillset special.)

Your ball score = `max(1, KEEP(you) − PRESS(them))`, theirs mirrored. The round has
**6 possessions**, split proportionally between the two ball scores, **clamped 2–4** per
side — the underdog always gets something.

### Contest 2 — THE POSSESSION OUTCOME (die #1)

Each possession rolls (seeded d100) on a five-entry outcome table:

| Outcome    | Base weight |
|------------|------------:|
| Turnover   | 48 |
| Half-chance| 20 |
| Big chance | 8  |
| Corner     | 12 |
| Foul       | 12 |

The table slides with the craft margin `m = clamp(round((CREATE − BREAK) / 4), −10, +10)`
(the cap was tuned down from ±15 in the first sweep — blowout ceiling):

- **CREATE** = Σ effective ATK of your Creators/Dribblers/Sprinters + your ATT-band cards (deduped).
- **BREAK** = Σ effective DEF of their MID-band cards (destroyers doing destroyer things).

Per point of m: Half-chance +0.8, Big chance +0.4, Turnover −1.2 (weights floor at 2).
Corners are capped at 3 per side per round.

### Contest 3 — THE SHOT (die #2, the d100)

A chance names a **shooter** — drawn seeded, weighted by finishing ATK (corners weight
aerial identities: Target/Powerhouse). The die speaks the card scale: **every point of
margin is worth 3 on the d100.**

> **GOAL if d100 ≤ BASE + 3 × (shooter ATK − their STOP), clamped 5..80.**
> BASE: half-chance **20**, big chance **40**, corner header **15**.
> (The 80 ceiling means a 1-in-5 always survives — a cracked build wins big, not 13–0 big.)

**STOP** = round(mean effective DEF of their DEF-band + keeper). A wall of bodies raises
the mean only if the bodies are good — parking a bus of DEF 3s does not.

Misses that stay alive can rebound as corners (small fixed weight); saves credit the
keeper by name.

## Fouls, bookings, suspensions

A Foul outcome names a **fouler** (seeded draw weighted by DEF among their MID+DEF bands —
destroyers most likely, aggressive personalities +weight). Booking check: d100 ≤ 30.
A second yellow to the same card is a **red**; reds are capped at 1 per side per match.

A red card's points **leave all three contests immediately** (the forecast header visibly
drops) and the card is **suspended for the next fixture**: `RunState.suspendedIds`, greyed
out in squad selection for one match, then returns.

## Position and lanes

Lanes survive as **pitch geometry, not a scoring ledger**:

1. **Side preference.** Wide cards (WD/WM/WF) carry a preferred flank (derived
   deterministically from card id so legacy saves and all 540 cards get it free).
   Played on the wrong flank: flat **−2 ATK / −2 DEF**, red on the pitch, "out of
   position" in the receipt.
2. **Adjacency abilities.** Abilities may target pitch neighbours: **Overlap** (fullback)
   = +2 ATK to the winger ahead in the same lane; **Screen** (DM) = +2 DEF to the centre
   backs behind. Flat points, ledgered, visible.

L/C/R in the playout is flavour text ("down the right…"), not a contest.

## Traits, managers, tactics — the verb map

The dispatcher's verbs now mean exactly one of two things:

- **Stat verbs** → flat ±N ATK/DEF on cards (ledgered). Marshal/Mentor/Star Service,
  managers, tactics (situational: while leading / trailing / late), chemistry links,
  personality, Antagonist (−N DEF to the opposing back line), leadership spreads.
- **Beat verbs** → inject or cancel a possession beat. `generate` = a bonus chance beat
  with a named creator (Postman's cross, Deadeye's free kick, Sniper's long shot).
  `deny` = downgrade/cancel an opposing chance beat with a named stopper (Stopper's
  tackle, Offside Trap's flag, the keeper traits' saves).

Role %-baselines are **dead**: a card's identity in play is its stats, its position, and
its action traits — nothing invisible.

## Fitness

The fitness multiplier is replaced by visible flat bands, applied to both stats
(negative stats stay negative):

| Fitness | Points |
|---------|-------:|
| ≥ 85%   | 0  |
| 70–84%  | −1 |
| 55–69%  | −2 |
| < 55%   | −3 |

## The forecast header

The match header is the sums, nothing else:

```
YOUR ATTACK 84  v  THEIR DEFENCE 58   +26
THEIR ATTACK 41 v  YOUR DEFENCE 63    +22
NET +48 ▲ YOU
```

ATTACK = Σ effective ATK of the XI; DEFENCE = Σ effective DEF. Tap either number for the
receipt: every card's contribution plus every flat modifier. This is the best single
indication of who wins, and it is honest because the whole engine is these sums.

## The playout (KICK OFF / CONTINUE)

1. Ball beat: "6 possessions — 4 v 2".
2. Each possession is ONE beat: turnover / key pass → **named shooter** → save/goal/
   corner; corner → header beat; foul → booking beat. Trait beats (Postman's cross,
   Stopper's tackle) interleave via the existing TraitEvent animation layer.
3. No pass-by-pass animation. Goals erupt with the scorer's name; saves credit the keeper.

## Expected numbers (tuning anchors, balance-sweep validates)

- 6 possessions × 5 rounds = 30 possession beats a match; ~15 a side at even strength.
- Even strength ≈ **1.4 goals a side** (Half 20%×20% + Big 8%×40% + Corner 12%×15%).
- Strong-v-weak swings possessions (4v2), the outcome table (m up to ±15) and the shot
  margin (±3/point) — win rate must stay monotonic in deck strength (balance-sweep).
