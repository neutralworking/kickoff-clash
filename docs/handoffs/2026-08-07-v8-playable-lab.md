# V8 playable lab — test questions

Date: 2026-08-07
Route: `/lab/match-v8`
PR: #105

This route is an unlinked, disposable interaction prototype. It exists to answer core-game questions before V8 is integrated into the live run. Visual design is intentionally provisional.

## What the lab currently lets us test

- Four persistent periods: `0–22`, `22–HT`, `HT–66`, `66–FT`.
- Three zones with four slots each: DEF / MID / ATT.
- Hidden commitments: the human queues plays; CPU period plays are not shown until End Period.
- 3-player opening hand plus the Manager, then 2 player cards drawn at the start of each period. That gives five visible player cards in Period 1 and exposes all XI by Period 4.
- Player Energy costs and two provisional curves:
  - controlled: `4 / 6 / 7 / 9`
  - explosive: `4 / 6 / 8 / 10`
- Natural / adjacent / far OOP placement with `0 / -2 / -5` applied to both ATT and DEF.
- DEF contributes DEF, MID contributes ATT + DEF, ATT contributes ATT.
- Full +5 ATT-over-DEF goal bands are banked at the end of every period.
- Goal calculation occurs independently in both directions.
- GK is a normal hand card and natural in DEF.
- Manager is a separate one-shot Energy play into any zone.
- On Reveal creator examples add Cross / Through Ball cards to the next period's hand.
- Chance cards spend Energy, resolve as temporary ATT, disappear and do not occupy zone slots.
- Cross has one example receiver interaction.
- Slippery Pitch can be toggled on/off; the current test condition gives one deployed player a temporary -5 ATT or DEF in each period.
- Match log exposes the exact ATT-v-DEF calculation that produced each period's goals.

## Questions to answer by playing, in priority order

### 1. Does full-board period banking feel exciting or repetitive?

The known mathematical consequence is that an unanswered +5 advantage can score in more than one period. Do not judge this by realism. Judge whether it creates useful pressure to respond.

Good signal:
- conceding in Period 1 makes the next placement decision more urgent;
- a defended lead feels earned;
- final-period swings are memorable rather than arbitrary.

Bad signal:
- the same board visibly scores the same goal again with no new story;
- Period 4 routinely makes Periods 1–3 feel irrelevant;
- scorelines become difficult to parse rather than exciting.

Only if the bad signal wins should we compare an alternative banking rule. Keep `+5 = one goal` fixed in that comparison.

### 2. Is five player cards available in Period 1 the right opening density?

The literal rule `3 to start + draw 2 each turn` means the first playable period begins with five player cards plus the Manager.

Check whether that produces:
- enough real choice immediately;
- too much hand scanning on mobile;
- too much certainty about the XI too early.

Do not change draw count merely to imitate Snap. The football XI should still be guaranteed to appear by the final period unless we intentionally add draw-denial mechanics later.

### 3. Do DEF / MID / ATT create three distinct decisions?

MID should be efficient, not automatic.

Look for real decisions such as:
- protect a lead in DEF;
- put a balanced player in MID for two-way value;
- commit a specialist to ATT to cross a goal band;
- accept -2 or -5 OOP because the current score makes it worthwhile.

If MID is still the default answer in actual play, tune card economy before weakening the rule that MID contributes both stats.

### 4. Which Energy curve creates the better four-period arc?

`4 / 6 / 7 / 9` is the controlled baseline.

`4 / 6 / 8 / 10` intentionally creates more final-period deployment and scoring.

The question is not which has fewer goals. The question is which produces more meaningful choices without leaving lots of appealing cards permanently unplayable.

### 5. Do Chance cards feel like Chances rather than stat spells?

The first test values are intentionally plain:
- Cross: cost 1, +3 ATT this period.
- Through Ball: cost 1, +4 ATT this period.
- example Cross receiver: +2 extra ATT when the Cross is used with that player in ATT.

The important test is sequencing:
- creator appears;
- Chance enters hand next period;
- player decides whether to spend Energy now or hold it;
- receiver / defender state changes its value.

If the only thought is “+3 is good, play it”, Chance design needs stronger typed interactions before values are tuned.

### 6. Does the Manager feel like a tactical intervention?

The lab Manager uses a deliberately generic calibration action rather than a real production manager:
- DEF: +2 DEF per player already there;
- MID: +1 ATT and +1 DEF per player;
- ATT: +2 ATT per player;
- cost 3; once per match.

This exists to test the interaction shape: choose a period and zone, pay normal Energy, resolve, disappear.

Do not retain this generic action as the manager system. Production managers should each bend the rules in recognisable ways.

### 7. Does hidden commitment help?

The CPU does not get to react to the human's current-period queued placements. Both sides effectively commit before the reveal.

If that creates satisfying uncertainty, the next rule to design is Reveal priority for On Reveal interactions. If it adds nothing, we can simplify before building a full priority system.

## Things deliberately not solved by this lab

- final Reveal-priority rule;
- production player values/costs;
- production Manager Actions;
- formation mechanics;
- complete typed Chance taxonomy;
- Moveable interaction UI;
- final Match Condition pool;
- card art / final pitch presentation;
- PvP networking;
- V8 integration into deck building, progression or the live root route.

## Current recommendation

Do not integrate V8 into the live game yet. First play several matches on both Energy curves and make a qualitative call on period banking, opening-hand density and Chance-card sequencing. Those three answers determine whether the new engine deserves the full pivot.
