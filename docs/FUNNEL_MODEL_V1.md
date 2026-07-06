# FUNNEL_MODEL_V1 — the six-lane match model

**Status: authoritative for the live game (`src/lib/`).** This supersedes the blended
four-zone emission model and the abandoned `src/engine/` rebuild direction. Where older
docs (MATCH_ENGINE_V5, CARDS_V1, ARCHETYPES_V1) describe cards contributing to several
match quantities at once, this document wins.

## The law

> Possession yields chances, chances yield goals. Pressing kills possession;
> destruction kills chances; defence prevents goals. A card is **two Snap-scale
> numbers plus its actions**: ATK (−1..20) and DEF (−1..20). Tech cards boost the
> whole team with leadership; antagonists debuff opposing cards directly.

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

## The two-stat (Snap-scale) card model

Every card carries **ATK and DEF, integers −1..20** (`deriveStats` in
`src/lib/funnel.ts` — computed deterministically from BRS × a skillset split,
shaded ±1 by the technical/physical pillars, so legacy saves and generated
opponents get stats for free). A soft card with a bad physical pillar can defend
at **−1** — a real liability that subtracts from the team while it's on the pitch.

Where the two numbers land:

- **ATK lands by skillset** — what you are decides how you attack:
  Striker/Target → finishing · Creator/Dribbler/Sprinter → creation · everyone
  else (Passer/Controller/Engine and all the defensive skillsets, GK included) →
  possession (winning it back and recycling IS their attacking contribution).
- **DEF lands by the band the card stands in** — where you play decides how you
  defend: ATT band → pressing · MID band → destruction · DEF band + GK → defence.

So a high-DEF striker is a pressing forward, a Destroyer parked at centre-back
feeds defence instead of destruction, and every card stacks on both sides of the
funnel. Specialists convert their budget into one big number (a 95-BRS striker is
~20/3); generalists split it (a 95-BRS Engine is ~10/13).

## Card interactions (the Snap layer)

Actions read TEAMMATES' stats — the dispatcher targets by stat threshold
(`stat-below` / `stat-atLeast`) and buffs are FLAT integers on the Snap scale:

- **Marshal** — teammates with DEF below 5 defend at +2 while he plays. Its value
  DECAYS as your squad's DEF scales: upgrading your defenders obsoletes the buff.
- **Mentor** — teammates with ATK below 5 attack at +2 (same decay logic).
- **Star Service** — teammates with ATK 12+ get +2: the inverse build-around,
  worth more the more stars you field.

A flat +2 DEF lands exactly where the stat itself would (the target's band
counter-lane); +2 ATK in the target's skillset lane. Buffs are not fitness-scaled.

## The two sanctioned exceptions

1. **Leadership (tech cards).** Commander cards do not play a lane. Both their stats
   spread across all six team stats at `LEAD_SPREAD` weight each — a flat team lift —
   and their trait records keep the existing global-amplify pattern. Scarce by design
   (8 cards).
2. **Antagonists.** A defining trait (`Antagonist`, forwards' trait pools, seeded per
   card like every other defining trait) that runs the existing `deny` verb against the
   opposing **defence** lane: while the card is on the pitch the opposing back line's
   defence stat is reduced. This is the only sanctioned way a card touches the
   opponent's numbers directly.

## Position still matters

ATK contributes at full value in its lane's home band and less out of band
(`LANE_BAND`): possession 0.5/1.0/0.85 · creation 1.0/1.0/0.25 · finishing
1.0/0.5/0.1 across ATT/MID/DEF. DEF needs no fit table — the band IS the
assignment. Formation choice = how many slots each band offers. Creation and
destruction are additionally placed on the **pitch lane** (L/C/R) of the card's
cell, so wide creators load the wing they stand on — stage 2 stays a spatial
contest.

## Tactics by cards (no countering system)

Tactic cards are **equipped before kick-off — up to 3** — and their records run
every increment through the squad source. Situational conditions on the records
(trailing, leading, late-game, archetype counts) gate them during the match.
There is no per-spell calling, no charges, no opponent telegraph and no
answered/countered grading.

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
three stages or a plan factor.
