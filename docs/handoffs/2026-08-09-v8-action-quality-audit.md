# V8 Action quality audit — 2026-08-09

## Scope

This pass starts **after** package-level Chance calibration was frozen. It does not reopen global Energy, the +7 scoring band, Penalty +5 / Cost 1, Cross / Through Ball / Set Piece Tactical values, Wambach / Di María calibration Costs, or the accepted compact reference XIs.

The question is card quality rather than archetype win rate:

> Is this Action a recognisable thing that happens on a football pitch, recognisably associated with the player, and does its game consequence make football sense while remaining useful in an ordinary mixed XI?

A good Action should ideally work as a card on its own. Synergy can increase its ceiling, but another specific specialist should not be required merely to make the printed text function.

## Audit criteria

Each Action was checked against four dimensions:

1. **Football readability** — on-pitch behaviour rather than trivia, records or biography.
2. **Player identity** — meaningfully associated with the source player rather than interchangeable flavour.
3. **Mechanical legibility** — the football action and ATT / DEF / Tactical consequence make sense together.
4. **Dependency health** — useful independently, with synergy as upside rather than a mandatory prerequisite.

## Accepted card-quality repairs

### Garrincha — JOY OF THE PEOPLE

Previous text:

`On Reveal: Give the highest-DEF opposing defender here −2 DEF. If they were already reduced, gain +4 ATT this period.`

The name/core dribble were good, but the payoff was effectively dead: telemetry showed Garrincha could reduce defenders while the `already reduced` condition almost never existed at his reveal moment.

Accepted:

> **JOY OF THE PEOPLE — On Reveal: Give the highest-DEF opposing defender here −2 DEF. If you reduce them, gain +2 ATT this period. If they were already reduced, gain +4 instead.**

This preserves the old combo ceiling while making a successful fresh dribble valuable by itself.

Compact-shell evidence (96 observations each):

| Shell | Before | After |
| --- | ---: | ---: |
| Garrincha | 48% | **49%** |
| Garrincha + Neymar | 53% | **53%** |
| Garrincha + Neymar + Panenka | 53% | **54%** |
| Duff + Garrincha + Neymar + Panenka | 28% | **29%** |

No broad-family ceiling appeared.

### Jay-Jay Okocha — STEPOVER

Previous text:

`On Reveal: Give the lowest-DEF opposing defender here −2 DEF. If they were already reduced, add a Penalty to your hand.`

The first clause was a good 1v1 idea, but the card required prior setup to receive any personal payoff and the Penalty reward overlapped Neymar's newly accepted creator role.

A sensitivity variant that removed Penalty entirely and paid +3 only when the defender finished on 5 DEF or less was rejected as too binary and too dependent on the target's printed stat.

Accepted:

> **STEPOVER — On Reveal: Give the lowest-DEF opposing defender here −2 DEF and gain +2 ATT this period. If they were already reduced, add a Penalty to your hand.**

Identity:
- Okocha hunts the **weakest defender** and gets an immediate dribble reward.
- The rare pre-reduced Penalty remains optional combo upside.
- Neymar remains the reliable Penalty creator.

Broad validation stayed healthy: Dribbling / Penalty remained **32% median, 16–47% range, 3/9 competitive, 0/9 at 50%+**. Balanced improved modestly but did not produce a new ceiling.

### Ronaldo Nazário — FLIP FLAP

Previous text:

`On Reveal: If an opposing defender here is at least 3 DEF below base, add a Penalty to your hand. Give it +2 ATT.`

This was effectively dead as a standalone Ronaldo card, required several points of prior DEF reduction and duplicated the Penalty-creator role. An earlier −3→−2 prerequisite sensitivity had already been rejected, so loosening the dependency was not the answer.

Accepted:

> **FLIP FLAP — On Reveal: Give the highest-DEF opposing defender here −3 DEF this period.**

This is intentionally simple. Ronaldo already brings elite printed ATT; FLIP FLAP is the explosive 1v1 move that breaks the strongest defender for the entire attacking lane rather than generating another Tactical.

Final broad evidence after Garrincha + Okocha + Ronaldo:

| Family | Median W | Range | Competitive | 50%+ | Median GD |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cross | 47% | 22–59% | 7/9 | 4/9 | +0.271 |
| Through Ball | 41% | 26–48% | 5/9 | 0/9 | — |
| Dribbling / Penalty | **32%** | **16–47%** | **3/9** | **0/9** | −0.896 |
| Control / Defence | 31% | 5–40% | — | — | — |
| Long Shot / Set Piece | 31% | 21–66% | — | — | — |
| Balanced / Midrange | **53%** | **40–70%** | **8/9** | **5/9** | +0.490 |

Balanced's strongest variant is **70%**, below the earlier 71–72% range. Ronaldo's direct −3 therefore improves card identity without creating a splash/deck ceiling.

### Claude Makélélé — THE MAKÉLÉLÉ ROLE

Previous name:

`WATER-CARRIER`

The mechanic was already excellent and was not changed:

> **Ongoing: Your other players here have +2 DEF.**

Only the name changes:

> **THE MAKÉLÉLÉ ROLE**

This is a deliberate exception to the preference for literal technique names. It is uniquely associated with Makélélé, is an immediately recognisable football concept, and precisely describes his in-game function: he sits in front of the defence and improves the players around him. No ATT, DEF, Cost, timing or aura behaviour changed.

A regression explicitly verifies both the new Action name and the unchanged +2 DEF local aura.

## Final current six-XI matrix

After the accepted Garrincha, Okocha and Ronaldo individual-card repairs:

| Squad | Win | Draw | GF | GA | GD |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cross | **48%** | 14% | 5.969 | 5.797 | +0.172 |
| Through Ball | 42% | 16% | 6.300 | 6.291 | +0.009 |
| Dribbling / Penalty | **48%** | 14% | 6.422 | 6.003 | +0.419 |
| Control / Defence | 35% | 17% | 2.609 | 2.934 | −0.325 |
| Long Shot / Set Piece | 33% | 16% | 3.800 | 4.381 | −0.581 |
| Balanced / Midrange | **49%** | 15% | 6.041 | 5.734 | +0.306 |

The Action-quality work did not reopen package balance. Repeat-7 scoring sensitivity remains in the intended high-scoring V8 band and should stay frozen.

## Final 30-card Action audit

### A — strong / preserve

These meet the Action-quality target and should not be rewritten merely for novelty.

| Player | Action | Audit note |
| --- | --- | --- |
| Abby Wambach | DIVING HEADER | Iconic box action; directly converts Cross value. |
| Ángel Di María | RABONA | Distinctive player action; bends Cross creation/value cleanly. |
| Cafu | PENDOLINO | Player-specific up-and-down flank movement naturally creates Crosses. |
| David Beckham | BEND IT | Immediate association; creates an enhanced Cross. |
| Dragan Džajić | LEFT-FOOT WHIP | On-pitch delivery action with clear Cross generation. |
| Carlos Valderrama | PAUSE AND SLIP | Recognisable playmaking beat; feeds Through Ball play. |
| Bobby Charlton | THUNDERBALL | Recognisable shooting identity and direct Long Shot creation. |
| Carli Lloyd | HALFWAY HIT | Famous shooting identity; amplifies Long Shots cleanly. |
| Damien Duff | KNOCK AND RUN | Model Action: beats a defender and gives Duff an immediate reward. |
| Garrincha | JOY OF THE PEOPLE | Self-contained dribble with higher combo ceiling. |
| Jay-Jay Okocha | STEPOVER | Targets the weak defender, reduces DEF and rewards the successful 1v1. |
| Neymar | RAINBOW FLICK | Takes on a defender and wins a Penalty; creator role is clear. |
| Ronaldo Nazário | FLIP FLAP | Explosive signature 1v1 directly breaks the strongest defender. |
| Antonín Panenka | CHIPPED PENALTY | Near-perfect identity/payoff link. |
| Andrés Iniesta | LA CROQUETA | Signature evasion maps naturally to ignoring an opposing Action. |
| Billy Bremner | CRUNCHING TACKLE | Aggressive defensive action with direct ATT suppression. |
| Clarence Seedorf | RIDE THE TACKLE | Strong physical identity and clean reduction protection. |
| Claude Makélélé | THE MAKÉLÉLÉ ROLE | Uniquely associated football concept with an exact local defensive-aura payoff. |
| Claudio Gentile | MAN MARKER | Player-specific defensive identity; suppresses the biggest threat. |
| Franco Baresi | STEP UP | Defensive-line action naturally maps to Offside Trap. |
| Park Ji-sung | THREE LUNGS | High-energy pressing identity creates Trigger Press. |
| Peter Schmeichel | STARFISH | Signature keeping action with direct Chance cancellation. |
| Christine Sinclair | ARRIVE UNMARKED | Recognisable striker movement; first-arrival ATT bonus. |
| Franz Beckenbauer | DER KAISER | Carries out from defence; movement with temporary two-way power is coherent. |

### B — mechanically sound; polish only when a genuinely better source-specific idea appears

| Player | Action | Audit note |
| --- | --- | --- |
| Ada Hegerberg | FRONT-POST DART | Good striker movement and Cross payoff; somewhat generic name. |
| Alex Morgan | CURVED RUN | Clear run-in-behind interaction; mechanically sound. |
| Andriy Shevchenko | RUNS IN BEHIND | Excellent Through Ball logic; name is generic rather than iconic. |
| Jari Litmanen | KILLER PASS | Functional creator Action; identity could eventually be more distinctive. |
| Christian Eriksen | WHIPPED DELIVERY | Strong set-piece football logic; source association is good rather than exceptional. |
| Sergio Ramos | 93RD MINUTE | Highly recognisable Ramos late-box identity and excellent Corner payoff. |

There is **no remaining Tier C card in the 30-card V8 calibration pool**.

## Cards deliberately not reopened

Generic wording alone is not a reason to rework a functioning card. In particular preserve STARFISH, PENDOLINO, BEND IT, RABONA, KNOCK AND RUN, CHIPPED PENALTY, LA CROQUETA, RIDE THE TACKLE, ARRIVE UNMARKED, RAINBOW FLICK, JOY OF THE PEOPLE, STEPOVER and FLIP FLAP while validating the next roster slice.

## Test-infrastructure cleanup

Two evidence tests were already taking slightly more than Vitest's default five-second timeout on CI. They now have explicit 20-second test timeouts without changing simulations or assertions:

- `calibration-matchup-periods.test.ts`
- `calibration-scoring-sensitivity.test.ts`

Both complete in roughly four seconds in the current CI environment.

## Next development slice

The 30-card pool is clean enough to stop iterating on itself.

Next:

1. Pull **30–50 additional real players** from the Card Design Tracker/source-of-truth roster.
2. Audit their Action names/text against the same four criteria before implementing them in V8.
3. Prefer a diverse mechanics sample: keepers, defenders, DMs, creators, wide players and forwards rather than another archetype-only batch.
4. Identify repeated mechanic patterns and missing primitives before scaling to the full ~250-card roster.
5. Implement accepted cards in small batches and validate them in mixed XIs; do not create a bespoke archetype deck for every Action.

## Freeze

Do not use the next roster expansion as a reason to reopen:

- Energy 2 / 4 / 6 / 8
- +7 repeat scoring
- Penalty Cost 1 / +5 ATT
- Cross / Through Ball / Long Shot / Corner base values
- Wambach / Di María calibration Cost exceptions
- accepted compact reference XIs

The goal is now **roster breadth and individual card quality**, not another archetype-balance loop.
