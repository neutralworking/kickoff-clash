# Player Journey — the Showrunner's deep notes

Where the Juicer owns the second, the Showrunner owns the *session* and the *run*: the
arc from "what is this?" to "one more run." A juicy moment inside an illegible or
aimless structure is wasted.

## The first-run experience (FTUE) is make-or-break

A new player meets Kickoff Clash with no manual. Within the first minute they must
absorb four non-obvious truths, or they bounce:

1. **Your players are cards; your XI is your hand.** The core metaphor.
2. **Chemistry between cards is your bonus** (the "poker hand" you're building).
3. **Tactics/manager set strategy on top.**
4. **It's permadeath** — one loss can end the run; stakes are real.

Teach by *doing*, not by text walls. The draft already teaches "pick a team"; the
first match must visibly show chemistry firing and why you won. The Showrunner's test:
hand the build to someone who's never seen it and watch where they hesitate or guess.
Every hesitation is a legibility bug.

## Legibility: "why did I win/lose, and what do I change?"

A roguelike lives or dies on whether loss is *instructive*. A loss the player can't
explain feels unfair and kills the restart urge. After every match the player should
be able to answer:

- **What beat me?** (a stronger opponent zone, a tired star, a wrong-position misfit,
  a missing counter to their identity.)
- **What would I do differently?** (rotate the fatigued striker, change formation,
  draft bench depth, buy a counter.)

This is why the 0.3 match-info surface (per-player rating, scorers/assists,
wrong-position flag, fitness) is a *journey* feature: it converts an opaque result
into a lesson. PostMatch and EndScreen should state the takeaway, not just the score.

## Decision clarity: the casual/optimiser split

Every decision screen serves two players at once:

- **The casual** wants to hit one button and play. Give a smart default (the
  fit-aware auto-fill XI, the recommended formation) so "Confirm" is always safe.
- **The optimiser** wants the full surface — swap any slot, change shape, read fitness
  and chemistry. Give depth *behind* the default, not instead of it.

Get this wrong in either direction and you lose a player: forced complexity bounces the
casual; a shallow screen bores the optimiser. The default must be *good*, not just
present — a bad auto-fill trains distrust.

## Information hierarchy

On any screen, the player's eye should land on the one thing that matters first.
Rank ruthlessly: the decision > the data that informs it > flavour. Fitness and
wrong-position warnings should pre-attentively pop (colour/glow) so a problem is seen
before it's read. Don't make the player hunt for the signal in a uniform grid.

## The run as a dramatic arc

A 20-match cup run (5 cups: 2,3,4,5,6 matches, each ending in a boss final) is a
season of television. Pace it like one:

- **Rising tension toward each final.** "Routine ties, then a wall." The openers should
  breathe (high survival) so the finals *mean* something. A flat difficulty line has no
  drama.
- **Release and reset between cups.** The shop + fitness reset is the act break — a beat
  of relief, planning, and shopping before the next escalation.
- **Escalating stakes and rewards.** Later cups must feel heavier — bigger boss read,
  bigger trophy payoff, more on the line. (`balance-lab` owns the numbers; the
  Showrunner owns the *felt* escalation and how it's framed.)

## Motivation: why keep playing (SDT + collection)

Sustained engagement rides three motivators — design for all three:

- **Competence/mastery** — the player must feel themselves getting better at *reading*
  opponents and *rotating* squads, run over run. Legible loss feeds this.
- **Autonomy** — meaningful, expressive choices (build identity, formation, tactics),
  not a single dominant line. (`balance-lab` guards against the solved meta.)
- **Collection/progression** — seeing the squad grow, chasing the gold card, building
  chemistry over a run. The Squad Gallery is a collection-motivator surface, not just a
  utility screen — let the player feel ownership and pride in the squad.

## Friction audit

Friction is any step between intent and action that doesn't add a decision. Extra taps,
unclear buttons, modal mazes, re-entering choices the game already knows. Hunt and
remove it — *except* where friction is the point (the weight of a permadeath confirm, a
deliberate pause before a final). Good friction is rare and intentional; most is rot.

## The restart pull

The single most important roguelike metric is "did they start another run?" That
impulse comes from: a loss that stings but teaches (not feels cheated), a glimpsed
build they didn't get to try, and a low-friction path back into a fresh run. End
screens should close the emotional loop *and* open the next one.
