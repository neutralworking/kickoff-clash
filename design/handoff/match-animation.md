# Owner directive — match animation & period gameplay (2026-07-15)

> Animate ONLY the player's intervention and its most important consequence.
> Do not animate the whole engine. **The design rule: show the effect of the
> player's decision first, the football consequence second, and the engine
> detail only at the decisive moment.**

## The three beats of a period

1. **Show what the choice changed.** On tactic/intent/sub/shape selection the
   affected contest rows animate (only those rows) and the two-three cards
   receiving the modifier briefly highlight with a source tag (`+2 COUNTER
   TRAP`). Grounded in the receipts (`split.cardMods`) — already real.
2. **Summarise the spell of play.** One period-level phrase (YOU TAKE CONTROL /
   A SCRAPPY SPELL / THEY PIN YOU BACK / YOU WIN IT HIGH / YOUR BUILD-UP BREAKS
   DOWN), the active contest row glowing, flowing KEEP → CREATE. ~1s. Selection
   mapping must be honest (possession split, turnover pattern, chance mix from
   the round outcome). Phrase pool = Commentator (content) work.
3. **Animate only the decisive event.** Routine periods: one fast sentence.
   Slow down only for: big chance, goal, important save, red card, signature
   (trait) firing. The shooter duel is the real receipt: name, FINISH v STOP,
   `roll ≤ need`, GOAL.

## Three tiers

- **Routine** (~2s): contest-row movement + one sentence.
- **Important**: source-card highlight, action label, short causal chain.
- **Major** (~6s): shooter duel, result roll, score impact, brief celebration.

## Settled decisions (2026-07-15)

- **Causal breadcrumbs are honest-only**, built from three sources:
  1. **Receipts** — named flat mods per card (already real).
  2. **Counterfactual attribution** — the engine is deterministic, so the
     round can be re-evaluated WITHOUT the intervention and diffed; claims like
     "without Counter Trap this period is 2–4 and the threshold is 49 not 55"
     are computed, never narrated. Pre-dice quantities (split, needs, odds)
     are rock-solid; use those.
  3. **THE COUNTER (engine mechanic, landed)** — turnovers can now spring real,
     event-linked counter-attacks: BREAK creates more turnovers (the outcome
     slide), the winner's PRESS decides whether a turnover becomes a chance
     (`counterChance()` in contests.ts, cap 2/side/round; beats carry
     `counter: true`). `PRESS EDGE → TURNOVER → CHANCE` is now mechanically
     true — this is what makes a Gegenpress build work. Do NOT manufacture any
     link the beats/receipts/counterfactuals can't support.
- **Tiered playback is the default surface**; the full beat-by-beat ledger
  stays available behind the Contest Breakdown's FORECAST ▸ OUTCOME toggle.
- **SKIP is always available**, including mid-major-moment.
- **No sound in v1** — audio is its own later pass; leave a hook.
- **Don't re-explain every period**: unchanged contests stay still, improved
  pulse up, weakened dip; the player's latest decision stays labelled until its
  consequence resolves.

## Engine support (already landed)

- `RoundBeat.counter` — chance/shot beats sprung from a turnover.
- `counterChance(press)` exported (the no-drift rule; the PRESS row's secondary
  line can show live counter odds).
- Shot receipts (`roll`, `need`, shooter, quality), trait firings, stop beats,
  possession counts: all on the round outcome.
- The harness's counter law: every counter beat follows an opposition turnover.

## Timing sketch (a major period)

0.0s tactic selected → 0.4s affected rows move → 1.1s spell phrase → 1.8s
breadcrumb → 2.4s shooter card rises (BIG CHANCE) → 3.0s `roll ≤ need` → 3.6s
goal impact → 4.8s one-line takeaway. A routine period: ~2s total.
