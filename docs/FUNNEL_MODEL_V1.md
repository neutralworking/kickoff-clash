# FUNNEL_MODEL_V1 — the six-lane match model

**Status: authoritative for the live game (`src/lib/`).** This supersedes the blended
four-zone emission model and the abandoned `src/engine/` rebuild direction. Where older
docs (MATCH_ENGINE_V5, CARDS_V1, ARCHETYPES_V1) describe cards contributing to several
match quantities at once, this document wins.

## The law

> Possession yields chances, chances yield goals. Pressing kills possession;
> destruction kills chances; defence prevents goals. Cards affect **one** of these,
> unless they are a tech card that boosts the whole team with leadership, or an
> antagonist that debuffs opposing cards directly.

Three attacking stages, each with exactly one defensive counter:

| Stage | Attack lane | Counter lane | Engine quantity | Where it acts (`possession.ts`) |
|---|---|---|---|---|
| 1 | **Possession** | **Pressing** | `control` vs opponent `pressing` | splits the 20 possessions per period |
| 2 | **Creation** | **Destruction** | `lanePush` vs `laneCover` (per pitch lane L/C/R) | P(shot) per possession |
| 3 | **Finishing** | **Defence** | `shotQuality` vs `defenceScore` | xG per shot |

`ZoneName` (the verb dispatcher's targeting surface) is these six lanes:
`possession | creation | finishing | pressing | destruction | defence`.
The old `attack` zone is gone; nothing blends across lanes any more
(`CONTROL_FIN`, the 0.55/0.45 `chanceQuality` mix, and creation-in-control are removed).

## One card, one lane: the skillset → lane table

A card's **lane** is fixed by its skillset. Its power feeds that lane's team stat and
nothing else. All 540 cards and the generated opponent XIs resolve through the same table.

| Skillset (pool of 540) | Lane | Football read |
|---|---|---|
| Passer (21) | Possession | keeps the ball |
| Controller (4) | Possession | dictates tempo |
| Engine (51) | Possession | box-to-box, recycles the move |
| Creator (65) | Creation | the key pass |
| Dribbler (44) | Creation | beats a man to open the chance |
| Striker (44) | Finishing | the poacher |
| Target (24) | Finishing | the reference point in the box |
| Sprinter (65) | Pressing | the press is running — closes down from the front |
| Destroyer (54) | Destruction | tackles and interceptions |
| Powerhouse (61) | Destruction | wins the physical duel, blocks the shot |
| Cover (55) | Defence | the last line, sweeps up |
| Shotstopper (44) | Defence | the goalkeeper |
| Commander (8) | — tech exception (Leadership) | lifts the whole team |

Lane pool sizes: Possession 76 · Creation 109 · Finishing 68 · Pressing 65 ·
Destruction 115 · Defence 99 · Leadership 8. Every lane is draftable; leadership is scarce.

## The two sanctioned exceptions

1. **Leadership (tech cards).** Commander cards do not play a lane. Their power is
   spread across all six team stats at `LEAD_SPREAD` weight each — a flat team lift —
   and their trait records keep the existing global-amplify pattern. Scarce by design
   (8 cards).
2. **Antagonists.** A defining trait (`Antagonist`, forwards' trait pools, seeded per
   card like every other defining trait) that runs the existing `deny` verb against the
   opposing **defence** lane: while the card is on the pitch the opposing back line's
   defence stat is reduced. This is the only sanctioned way a card touches the
   opponent's numbers directly.

## Position still matters: lane × band fit

A card contributes 100% of its (fitness-scaled) power in its lane's home band and less
out of band (`LANE_BAND` in `src/lib/funnel.ts` — balance-lab owns the numbers):

| Lane | ATT | MID | DEF |
|---|---|---|---|
| possession | 0.5 | 1.0 | 0.7 |
| creation | 1.0 | 1.0 | 0.25 |
| finishing | 1.0 | 0.5 | 0.1 |
| pressing | 1.0 | 0.85 | 0.3 |
| destruction | 0.3 | 1.0 | 0.9 |
| defence | 0.1 | 0.6 | 1.0 |

Formation choice = how many slots each band offers = how much of each lane you can
field. Creation and destruction are additionally placed on the **pitch lane** (L/C/R)
of the card's cell, so wide creators load the wing they stand on and destroyers cover
the channel they patrol — stage 2 stays a spatial contest.

## The cascade under the funnel

Synergy/style/weakness/play-pattern/personality bonuses no longer add to a blended
attack score. The attack-side cascade total becomes a uniform multiplier over the three
attacking stats; the defence-side total over the three counter stats. A chemistry combo
lifts your whole attacking funnel; it never smuggles creation into possession.
(Per-lane synergies are a future pass.)

## What "why did I win?" now means

The verdict's three quality keys map 1:1 onto the stages: `control` = stage 1
(possession vs their pressing), `chances` = stage 2 (creation vs their destruction),
`conversion` = stage 3 (finishing vs their defence). Every match answer is one of the
three stages, a plan factor, or a calls factor.
