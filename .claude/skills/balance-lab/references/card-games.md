# The Card Shark — card-game economy, synergy & meta design

Distilled lessons from three games that solved different parts of the problem.
For each: what the economy *is*, what makes it *work*, and the transferable law.

## Balatro — escalating threat vs compounding engine

- **The loop:** beat an escalating score (antes/blinds rise ~exponentially) with a
  poker hand whose payout is `chips × mult`. Jokers modify chips/mult; planets level
  hand types; tarots/spectrals reshape the deck. Money earns **interest** (≈ $1 per
  $5 held, capped) so hoarding is rewarded — but the blinds rise, so you *must* spend
  to scale or you fall behind.
- **Why it's fun:** the win comes from **multiplicative** scaling. `+chips` is
  additive and flat; `×mult` (and `×mult`-on-`×mult`) is the dopamine — the run
  "pops off" when your engine compounds. Build-around jokers (reward flushes, or
  played-card count, or a single retriggered card) give each run an *identity* and
  reshape your draft. Variance is **input** (shop offers) — you adapt to what you're
  dealt, which feels like skill, not luck.
- **The tension that makes it work:** an *exponential threat* (blinds) demands an
  *exponential answer* (your engine). Pure good-stuff can't keep up past a point, so
  the game forces engine-building. The economy sub-game (spend-vs-hoard, reroll,
  skip-for-tag) adds a second decision layer on top of the hands.
- **Transferable laws:**
  - **Multiplicative scaling = the highlight reel, and the runaway risk.** Gate it
    behind setup/cost/conditions; keep a ceiling or a soft cap.
  - **Make difficulty escalate** so raw power isn't enough — players must *build*.
  - **Input randomness adapts well**; pair it with rerolls so players have agency.
  - **Build-arounds create replayability**; good-stuff is the floor, not the ceiling.

## Marvel Snap — curation, archetypes & a meta-game on top

- **The loop:** 12-card decks, 6 turns, energy rises 1→6 (a hard curve), 3 random
  locations with effects. Cards are on-reveal or ongoing. You win 2 of 3 locations.
  On top sits the **cube economy**: "snap" to raise the stakes; "retreat" to cut
  losses. Your real currency is cubes, won by *reading the opponent*, not just the board.
- **Why it's fun:** a **12-card deck** makes every slot a hard choice — curation
  tension is the whole deckbuilding game. Clear **archetypes** (Destroy, Discard,
  Move, On-Reveal value, Ongoing/Patriot, Bounce) each have a distinct line and
  obvious **counters** (tech cards: Cosmo shuts off on-reveal, Enchantress wipes
  ongoing, Shang-Chi kills big bodies). Locations are a *shared* variance layer that
  reshuffles the meta weekly. The snap/retreat bluff is a poker game stapled on top.
- **Transferable laws:**
  - **Small collections force meaning.** Few slots → every card must earn its place;
    avoid filler. (KC's 3 tactic slots + 11 XI are exactly this.)
  - **Name your archetypes and give each a counter.** A healthy meta is a web of
    accessible answers, not a single best deck.
  - **Tech cards / answers** keep degenerate strategies honest. If a dominant build
    has no reachable counter, the meta *solves* and dies.
  - **A meta-economy** (when to commit/bet) adds depth without more cards — KC's
    permadeath "do I risk this fixture or play safe?" is its snap.
  - **Shared variance (locations)** is fun *because* both players face it; one-sided
    variance feels unfair.

## Magic: the Gathering — resources, the color pie & the archetype wheel

- **The loop:** develop a **mana** resource (lands) and spend it on threats and
  answers. The two master axes are **tempo** (board/time advantage) and **card
  advantage** (resource attrition). The **color pie** gives each color strengths *and
  weaknesses* — a constraint system so no single strategy does everything.
- **The archetype wheel (a rock-paper-scissors meta):**
  - **Aggro** — curve out, race, win on tempo before answers come online.
  - **Control** — trade 1-for-1, answer everything, win late with inevitability.
  - **Combo** — ignore the board, assemble a specific win.
  - **Midrange** — flexible good-stuff; beats aggro on raw card quality, loses to
    control's inevitability and combo's speed.
  - Roughly: aggro < control < combo < aggro, with midrange preying on the
    unfocused. The meta *rotates* as players adapt — that's health.
- **Why it's fun & fair:** **interaction**. Removal, counters, and disruption mean
  almost everything has an answer; games are decided by sequencing and resource
  management, not just who drew better. **Synergy vs goodstuff** is a real axis — synergy
  decks are higher-ceiling/lower-floor; goodstuff is consistent.
- **Transferable laws:**
  - **A resource curve creates pacing** — power should cost something that develops
    over the run, so early ≠ late.
  - **Constraints (the color pie)** prevent omni-strategies. Every identity should be
    *good at* some things and *bad at* others; that asymmetry *is* the counter-web.
  - **Threats need answers.** Design counters alongside power, or the strongest thing
    becomes mandatory.
  - **Card advantage vs tempo** is a clean lens for "is this worth it?"

## Cross-cutting design laws (the Card Shark's checklist)

Run any KC mechanic through these:

1. **Scaling shape.** Additive (+x), multiplicative (×x), or exponential? Multiplicative
   is exciting but the usual source of broken combos — gate, cap, or condition it.
2. **Build-around vs good-stuff.** Does it reward committing to a theme (identity,
   replayability) or just add raw value (consistency)? You want both to exist; you
   don't want good-stuff to dominate build-arounds (kills variety) or vice-versa.
3. **The counter-web.** Every strong line needs a *reachable* answer. Map: what beats
   this, and can a player realistically draft/deploy it? No answer ⇒ the meta solves.
4. **Variance type.** *Input* (what you're offered — shop, packs, draws) rewards
   adaptation and feels skillful. *Output* (did the dice land — xG, shatter rolls)
   can feel unfair if it decides games; keep its swing bounded and never the *whole*
   story. KC mixes both: packs/shop (input, good) + xG-Poisson + shatter (output —
   watch the swing).
5. **Decision density & feel.** Are there meaningful choices each turn, or auto-pilot?
   Silent failures, uncounterable lines, and snowballs-with-no-comeback are feel-bads.
6. **Power budget & cost.** Strong things should cost — money, a slot, a contradiction,
   a durability risk, an opportunity. Free power warps everything around it.
7. **Floors and ceilings.** High-ceiling/low-floor (combo) and low-ceiling/high-floor
   (goodstuff) should coexist. Beware anything that is *both* high-floor and
   high-ceiling — that's the dominant strategy.
8. **Does the meta rotate or solve?** The single best test of health. If one build is
   always correct, you have a power or counter problem.
