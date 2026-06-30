# Game Feel — the Juicer's deep notes

The craft of making a moment *satisfying*. Game feel is largely invisible when it
works and glaring when it's missing: the same mechanic can feel limp or delicious
depending entirely on feedback, timing, and escalation.

## The core loop of a satisfying action: anticipation → impact → release

Every action worth feeling has three beats. Strip any one and it goes flat.

- **Anticipation** — a wind-up that tells the player something is coming and builds
  tension. A pack that wobbles before it rips. A shot that charges. A scoreline that
  holds a beat before ticking. Anticipation is what makes the payoff land.
- **Impact** — the hit. Multiple senses fire at once: a scale punch, a flash, a freeze
  (1–3 frames of hitstop), a sound, a number popping. The denser the simultaneous
  feedback at the moment of impact, the more it "connects."
- **Release / follow-through** — the settle. The net ripples and stills, the number
  eases back to rest, particles fade. Without follow-through the moment feels cut off.

KC already has the vocabulary for this in `globals.css` (`goalErupt`, `goalFlash`,
`netShake`, `scoreTick`, `packRip`, `heroPop`). The Juicer's job is to make sure each
*meaningful* event uses all three beats, and trivial events don't steal the spotlight.

## Juice — the dictionary

"Juice" = maximal output feedback for minimal input. The classic ingredients (use
deliberately; over-juicing trivial events is as bad as under-juicing big ones):

- **Scale/squash-stretch** — pop on spawn, punch on impact.
- **Hitstop / freeze-frame** — a few frames of frozen time on a big hit reads as weight.
- **Flash/bloom** — a brief brightness spike at the moment of impact.
- **Shake** — screen or element shake; tiny for small hits, never nauseating.
- **Number-pops** — the Balatro tell: every gain spawns a rising, fading number.
  Escalating sequences (chain pops) are dopamine. KC's per-increment scoring and the
  new per-player ratings are prime number-pop territory.
- **Particles** — sparingly; a confetti burst on a trophy, net spray on a goal.
- **Sound** — even one well-timed cue per event class multiplies perceived impact.
  (KC has none yet — flag it; a goal "thwack" and a pull "shimmer" are cheap wins.)
- **Easing** — snappy in (`cubic-bezier(0.22,1,0.36,1)`), bouncy for hero pops
  (`0.34,1.56,0.64,1`). Linear motion feels robotic; the engine already eases.

## Cause → effect must be legible

The deadliest feel-bug is the player not seeing *why* something happened. A goal that
just increments a number teaches nothing and feels random. The fix is attribution:
flash the scorer's chip, name the scorer and assister, show the move that led to it.
The 0.3 match-info work (scorers, assists, per-player ratings, wrong-position) is as
much a *feel* feature as an information one — it turns an opaque sim into a legible,
re-watchable story.

## Reward cadence & escalation

The brain habituates. A reward that feels identical every time stops registering.

- **Escalate by stakes.** A round-1 win and a cup-final trophy must not share a beat.
  Bigger event → longer anticipation, denser impact, more follow-through.
- **Vary the cadence.** Predictable rewards flatten; a surprise pull or an unexpected
  MOTM keeps the loop alive. (`balance-lab` owns the *rate*; the Juicer owns the *feel*
  of each hit.)
- **Punctuate, don't drone.** Between-increment stat screens are the rhythm rests; the
  goal is the downbeat. Don't let a rest become dead air — give it a small motion.

## Dead air is the enemy

Any moment where the player is waiting with no feedback is lost feel. Audit the loop
for gaps: a resolve that pauses with nothing moving, a transition with no motion, a
confirm with no acknowledgement. Fill them with the smallest motion that reads as
"alive" — a pulse, a drift, a tick — never a spinner.

## Restraint — the other half of the craft

Juice is a spotlight; if everything glows, nothing does. Reserve the biggest feedback
for the rarest, highest-stakes events (Legendary pull, cup trophy, the winning goal).
Trivial confirmations get a whisper. The contrast *is* the feel.

## Reduced motion

Respect `prefers-reduced-motion`: keep the *information* (the number changed, the goal
happened) legible without the motion. Juice is an amplifier, never the only channel.
