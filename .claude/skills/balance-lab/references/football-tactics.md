# The Gaffer — football tactics for a card game

The job: keep Kickoff Clash *feeling like football*. The fun of the card economy must
sit on top of mechanics a fan recognises — real formations, real styles, real
counters, real ways to exploit a weakness. If a "balanced" change makes the football
nonsense, it's not balanced.

## Formations — shape is the first trade-off

Shape distributes a finite XI across the pitch; strengthening one area starves
another (KC models this literally as the 3×3 zonal field, `src/lib/field.ts`).

- **4-4-2** — solid, two banks of four, a strike partnership. Defensively tidy,
  width on the flanks; can be over-run in central midfield (only two CMs).
- **4-3-3** — midfield triangle + a front three; press-friendly and wide. Strong
  central control and high pressing; the full-backs get exposed if the wingers don't track.
- **3-5-2 / 5-3-2** — wing-backs provide width, three at the back, a packed midfield.
  Overloads the middle and matches two-striker teams; vulnerable in the wide channels
  if the wing-backs are pinned.
- **4-2-3-1** — a double pivot shields the defence, a 10 links to a lone striker.
  Balanced and flexible; can lack a second striker's penalty-box presence.
- General law: **more attackers = more threat but thinner cover**, and vice-versa.
  Width vs compactness, numbers forward vs numbers back — every shape is a bet.

## Playing styles — the tactical rock-paper-scissors

This is the Gaffer's counter-web. KC names several (Tiki-Taka, Gegenpressing, etc.,
`src/lib/scoring.ts`); the real-world logic of who-beats-whom:

- **Possession / Tiki-Taka** — dominate the ball, patient build-up, positional play.
  Beats a passive **low block** by sheer territory and tempo... *if* it can break the
  line. **Countered by** an organised high press (suffocates the build-up) and by a
  **direct/counter** team that concedes the ball then hits the space behind a high line.
- **Gegenpressing / High Press** — win the ball back high, suffocate build-up.
  **Beats** slow possession sides. **Countered by** direct long-ball over the press,
  and by quick combination play / pace that beats the first wave and runs at the
  exposed back line.
- **Counter-attack / Direct** — sit, absorb, spring fast transitions into space.
  **Beats** high-line possession/press teams (acres behind them). **Countered by** a
  patient low block (no space to counter into) and by a side that simply keeps the ball.
- **Low block / Park the bus** — deep, compact, deny space, frustrate.
  **Beats** counter-attacking sides (nothing to counter). **Countered by** patient
  possession with width/overloads to stretch it, and by set-piece / aerial threat.
- **Wing play / width** — stretch the pitch, cross to a target. **Beats** narrow
  sides. **Countered by** a packed, narrow defence and by dominating the centre.

The point: **no style is best.** Each is strong into some and weak into others. That
asymmetry is exactly the MTG color-pie / Snap-archetype counter-web, dressed as
football. When balancing, protect the *loop* — if one style beats everything, the
football is broken too.

## Player roles & archetypes — how identities combine

KC's archetypes are a verb palette (Creator, Destroyer, Engine, Sprinter, Controller,
Target, Dribbler, Cover, Passer, Striker, GK… see `docs/ARCHETYPES_V1.md`). Real
tactical combinations a fan expects to work:

- **Creator + Target** — a 10 who threads + a striker who finishes/holds. The classic.
- **Destroyer + Controller** — a ball-winner who screens + a metronome who dictates.
  The spine of a good midfield.
- **Sprinter/Dribbler + a high line opponent** — pace in behind punishes depth.
- **Width (wingers) + Target** — crosses to a back-post threat; dead into a narrow
  block, lethal against one.
- **Cover/Destroyer-heavy back line + Low Block** — the wall; frustrates, concedes
  territory, lives on transitions/set-pieces.
- Anti-synergies are equally real: all-Creator (no one wins the ball or finishes),
  all-Destroyer (no creativity), no width vs a deep block (no way through).

A healthy archetype economy mirrors a real squad: you need a **spine** (GK, CB,
CM, CF), **width**, **a creator**, **a destroyer**, and **pace** — and you can't have
everything, so drafting is a series of authentic trade-offs.

## Phases of play — where a match is won

A match isn't one number. Tactics shift across phases (KC runs 5 increments / a
ticking clock): **build-up → progression → final third → transition → defending.**
A side can dominate territory (possession, zones-won) yet lose on **transition**
(one counter, one set piece). Good balance lets a weaker-on-paper side win via a
phase it's built for — that's the upset that makes a run memorable.

## Reading a matchup (the Gaffer's pre-match checklist)

1. **Where's their weakness?** A thin flank, a slow back line, a lone pivot, no
   aerial threat. (KC surfaces this as the scouted SOFT SPOT.)
2. **What's my edge?** Pace into depth, width into a narrow side, an overload in the
   zone they're light. Pick the style/shape/tactic that *attacks the weakness*.
3. **What's the risk?** Going for it (high line, push numbers up) opens you to the
   counter. On one life (permadeath), the safe draw can be the right play — but it
   pays less (`DRAW_REWARD_FACTOR`). That risk/reward *is* the snap decision.

## The Gaffer's checklist for any change

- Does this map to a real tactical idea, or is it a number with no footballing sense?
- Does it preserve the **style counter-web** (no omni-style)?
- Does it keep authentic archetype **trade-offs** (you can't field a perfect XI)?
- Does it create a real **in-match / pre-match decision**, or auto-pilot?
- Does it let a phase-specialist spring an upset (no foregone conclusions)?
