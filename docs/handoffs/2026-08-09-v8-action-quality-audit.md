# V8 Action quality audit — 2026-08-09

## Scope

This pass starts **after** the package-level Chance calibration was frozen. It does not reopen global Energy, the +7 scoring band, Penalty +5 / Cost 1, Cross / Through Ball / Set Piece Tactical values, or the accepted compact reference XIs.

The question is now card quality rather than archetype win rate:

> Is this Action a recognisable thing that happens on a football pitch, recognisably associated with the player, and does its game consequence make football sense while remaining useful in an ordinary mixed XI?

A good Action should ideally work as a card on its own. Synergy can increase its ceiling, but another specific specialist should not be required merely to make the printed text function.

## Audit criteria

Each Action was checked against four dimensions:

1. **Football readability** — does the name/text describe an on-pitch action rather than trivia, records or biography?
2. **Player identity** — does it feel meaningfully associated with the source player rather than being interchangeable flavour?
3. **Mechanical legibility** — can a player understand why the football action caused the stated ATT / DEF / Tactical consequence?
4. **Dependency health** — is the Action useful independently, with synergy as upside rather than a mandatory multi-card prerequisite?

## Accepted Garrincha repair

### Previous text

`JOY OF THE PEOPLE — On Reveal: Give the highest-DEF opposing defender here −2 DEF. If they were already reduced, gain +4 ATT this period.`

The name and core dribble interaction were good, but telemetry showed the payoff clause was effectively dead in ordinary compact shells. Garrincha successfully found and reduced defenders, yet the `already reduced` condition triggered essentially zero times because another reducer had to act on the same defender in the same period before Garrincha revealed.

### Accepted text

> **JOY OF THE PEOPLE — On Reveal: Give the highest-DEF opposing defender here −2 DEF. If you reduce them, gain +2 ATT this period. If they were already reduced, gain +4 instead.**

This keeps the existing 1v1 football interaction and preserves the old combo ceiling, but a successful fresh dribble now has an immediate self-contained payoff.

### Evidence

Compact Dribbling shells, 96 observations each:

| Shell | Before | After | GD before | GD after |
| --- | ---: | ---: | ---: | ---: |
| Garrincha | 48% | **49%** | +0.083 | **+0.146** |
| Garrincha + Neymar | 53% | **53%** | +0.583 | **+0.656** |
| Garrincha + Neymar + Panenka | 53% | **54%** | +0.948 | **+1.031** |
| Duff + Garrincha + Neymar + Panenka | 28% | **29%** | −0.896 | **−0.833** |

The six-reference-XI matrix remained unchanged:

- Cross 48% W / 14% D / +0.181 GD
- Through Ball 42% / 15% / +0.013
- Dribbling / Penalty 49% / 15% / +0.447
- Control / Defence 35% / 18% / −0.294
- Long Shot / Set Piece 33% / 17% / −0.572
- Balanced / Midrange 46% / 17% / +0.225

The 54-deck Dribbling family also stayed at **32% median / 16–47% range / 3 of 9 competitive / 0 of 9 at 50%+**. The repair therefore improves Garrincha himself without reopening the package-level balance or creating a new splash ceiling.

## 30-card Action audit

### A — strong, preserve

These already meet the Action-quality target and should not be rewritten merely for novelty.

| Player | Action | Why it works |
| --- | --- | --- |
| Abby Wambach | DIVING HEADER | Iconic box action; directly converts Cross value. |
| Ángel Di María | RABONA | Distinctive player action; bends Cross creation/value in a readable way. |
| Cafu | PENDOLINO | Going repeatedly up the flank is both player-specific and a natural movement→Cross consequence. |
| David Beckham | BEND IT | Immediate association; creates an enhanced Cross. |
| Dragan Džajić | LEFT-FOOT WHIP | On-pitch delivery action with clear Cross generation. |
| Carlos Valderrama | PAUSE AND SLIP | Recognisable playmaking beat; feeds Through Ball play. |
| Bobby Charlton | THUNDERBALL | Recognisable shooting identity and direct Long Shot creation. |
| Carli Lloyd | HALFWAY HIT | Famous shooting identity; amplifies Long Shots cleanly. |
| Damien Duff | KNOCK AND RUN | Excellent model Action: beats a defender and gives Duff an immediate attacking reward. |
| Garrincha | JOY OF THE PEOPLE | Accepted repair now makes the dribble self-contained while retaining combo upside. |
| Neymar | RAINBOW FLICK | Neymar takes on a defender and can win a Penalty; creator role is clear. |
| Antonín Panenka | CHIPPED PENALTY | Near-perfect identity/payoff link; improves Penalties and makes them uncancellable. |
| Andrés Iniesta | LA CROQUETA | Signature evasion maps naturally to ignoring the first opposing Action. |
| Billy Bremner | CRUNCHING TACKLE | Readable aggressive defensive action with direct ATT/DEF suppression. |
| Clarence Seedorf | RIDE THE TACKLE | Strong physical identity and clean protection from reductions. |
| Claudio Gentile | MAN MARKER | Player-specific defensive identity; suppresses the most dangerous opponent. |
| Franco Baresi | STEP UP | Defensive-line action naturally maps to Offside Trap and defensive reward. |
| Park Ji-sung | THREE LUNGS | Strong player identity; high-energy pressing creates Trigger Press. |
| Peter Schmeichel | STARFISH | Signature keeping action with a direct chance-cancellation consequence. |
| Christine Sinclair | ARRIVE UNMARKED | Recognisable striker movement; first-arrival ATT bonus with readable decay. |
| Franz Beckenbauer | DER KAISER | Carries the ball out from defence; movement with temporary two-way power is coherent. |

### B — mechanically sound; polish only when there is a better source-specific idea

These function correctly and are football-readable. They are less uniquely tied to the player than the best cards, but there is no reason to disturb them during balance work.

| Player | Action | Audit note |
| --- | --- | --- |
| Ada Hegerberg | FRONT-POST DART | Good striker movement and Cross payoff; somewhat generic naming. |
| Alex Morgan | CURVED RUN | Clear run-in-behind interaction; mechanically sound, moderately generic. |
| Andriy Shevchenko | RUNS IN BEHIND | Strong football logic and Through Ball payoff; name is generic rather than iconic. |
| Jari Litmanen | KILLER PASS | Functional creator Action and clear Through Ball consequence; identity could eventually be more distinctive. |
| Christian Eriksen | WHIPPED DELIVERY | Strong set-piece football logic; source association is good rather than exceptional. |
| Sergio Ramos | 93RD MINUTE | Recognisable Ramos late-box identity and excellent Corner payoff, despite being named as a moment rather than a literal technique. |

### C — genuine card-quality work remaining

#### Jay-Jay Okocha — STEPOVER

Current behaviour:

> Give the lowest-DEF opposing defender here −2 DEF. If they were already reduced, add a Penalty.

The first clause is good. The second has the same dependency problem Garrincha previously had and now also overlaps Neymar's accepted job as the self-contained Penalty creator. Earlier tests showed that simply making STEPOVER generate a Penalty more easily did not improve healthy deck construction.

**Direction:** keep STEPOVER as a 1v1 dribble Action, remove the Penalty-generator role, and give Okocha a direct self-contained reward for beating his defender.

#### Ronaldo Nazário — FLIP FLAP

Current behaviour:

> If the highest-DEF opposing defender here is at least −3 DEF below base, add a Penalty and give it +2 ATT.

This is too dependent on prior reductions for a card that should feel explosive on its own. A previous sensitivity test lowering the threshold from −3 to −2 was rejected, so the answer is not easier Penalty generation.

**Direction:** FLIP FLAP should create a direct 1v1 attacking swing by Ronaldo himself, with optional synergy if a defender is already destabilised. Do not make him another Penalty creator.

#### Claude Makélélé — WATER-CARRIER

Current mechanic:

> Other players here have +2 DEF.

The mechanic is strong, simple and football-coherent; it should probably remain. The issue is identity: `WATER-CARRIER` is a broad role label rather than a particularly vivid Makélélé on-pitch action, and it is weaker than the best card names in the set.

**Direction:** naming/identity pass only unless later mixed-deck evidence shows a balance issue. Preserve the local defensive aura.

## Cards deliberately not reopened

The audit does **not** treat generic wording alone as a reason to rework a functioning card. In particular, do not disturb STARFISH, PENDOLINO, BEND IT, RABONA, KNOCK AND RUN, CHIPPED PENALTY, LA CROQUETA, RIDE THE TACKLE, ARRIVE UNMARKED or the newly accepted RAINBOW FLICK / JOY OF THE PEOPLE while working through the remaining queue.

## Next order

1. **Okocha / STEPOVER** — replace the dead Penalty dependency with a direct dribble payoff.
2. **Ronaldo / FLIP FLAP** — remove the −3 DEF prerequisite and Penalty-generator overlap; keep a high-upside 1v1 identity.
3. **Makélélé / WATER-CARRIER** — naming/identity pass while preserving the mechanic.
4. Re-run mixed-XI / broad-deck validation after each accepted card rather than waiting for all three.
5. Once the 30-card pool is clean, expand Action-quality validation to the next 30–50 source-of-truth players before implementing the full roster.

## Freeze

Do not use this Action-quality pass as a reason to reopen:

- Energy 2 / 4 / 6 / 8
- +7 repeat scoring
- Penalty Cost 1 / +5 ATT
- Cross / Through Ball / Long Shot / Corner base values
- Wambach / Di María calibration Cost exceptions
- accepted compact reference XIs

The goal from here is **better individual cards**, not another archetype-balance loop.
