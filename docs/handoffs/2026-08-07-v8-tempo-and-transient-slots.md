# Kickoff Clash V8 — 30-player Action calibration

Date: 2026-08-07
Branch: `agent/v8-three-zone-prototype`
PR: #105

## Current match baseline

- Four periods: 0–22, 22–HT, HT–66, 66–FT.
- Preferred Energy curve: **3 / 5 / 7 / 9**.
- Starting XI is the 11-player deck.
- Opening three players plus Manager; draw two players at the start of each period.
- DEF / MID / ATT are depth zones, not left/centre/right lanes.
- Four **player** slots per side per zone.
- Players persist after reveal.
- No normal substitution phase.
- Reveal priority: score → current ATT → ATT+DEF board strength → seeded deterministic tiebreak.
- Priority side reveals its commitments in play order, then the other side reveals in play order.
- On Reveal resolves immediately; Ongoing activates while deployed/enabled; End of Period runs after the period state/outcome is known.

## Physical slot rule

Player slots and Tactical placement are now deliberately separate concepts.

- Player card: reserves one of four player slots and remains there.
- Manager card: reserves one player slot while committed/revealing, resolves, disappears and releases it.
- Tactical / Chance card: is played to a zone, costs Energy, resolves at its reveal point, disappears and **never consumes a player slot**.

This supersedes the earlier prototype rule where Chance cards temporarily reserved slots.

## Opposing `here`

Friendly effects use the player's literal depth zone.

For opposing targeting/cancellation, the confronting football depth is used:

- friendly ATT ↔ opponent DEF
- friendly MID ↔ opponent MID
- friendly DEF ↔ opponent ATT

This makes dribbler-v-defender interactions and defensive Chance cancellation coherent without introducing hidden left/centre/right sectors.

## Seven reusable Tactical definitions

| Tactical | Cost | Eligible zone(s) | Baseline |
| --- | ---: | --- | --- |
| Cross | 1 | MID / ATT | +2 ATT this period |
| Through Ball | 1 | MID / ATT | +2 ATT this period |
| Long Shot | 1 | DEF / MID / ATT | +1 ATT this period |
| Corner | 1 | ATT | +3 ATT this period |
| Penalty | 1 | ATT | +5 ATT this period |
| Offside Trap | 1 | DEF | Cancel the next opposing Through Ball here this period |
| Trigger Press | 1 | ATT | Friendly DEF here also counts toward ATT this period |

Cross, Through Ball, Long Shot, Corner and Penalty are Chance types. Offside Trap and Trigger Press are Tactical utility cards, not Chances.

## Generated Tactical instances

Generated cards retain their base type while carrying per-instance state:

- cost modifier;
- ATT modifier;
- cancellation eligibility/immunity;
- source player;
- generated-card metadata/riders.

Examples now supported:

- Beckham Cross = normal Cross +2 generated ATT;
- Charlton Long Shot = normal Long Shot with +2 if actually played in MID;
- Ronaldo Penalty = normal Penalty +2 generated ATT;
- Park Trigger Press = 0 cost only in the generation period, then returns to cost 1;
- Baresi Offside Trap retains the Baresi source so a successful cancellation can award +2 DEF in his current zone.

Specialist effects are snapped when the Tactical is played. Later movement does not alter an already resolved Chance.

## Shared player state

The calibration runtime has reusable state for:

- printed/base ATT and DEF;
- current ATT and DEF through explicit modifiers;
- temporary period modifiers;
- permanent match modifiers;
- current zone;
- Action enabled/suppressed state;
- once-per-period counters;
- once-per-match counters;
- per-period Tactical ATT;
- per-period zone DEF bonuses;
- movement usage;
- Tactical resolutions and cancellation results;
- observable event/action log.

`reduced DEF` is derived as `current DEF < printed DEF`; there is no separate combo flag.

## The 30 calibration cards

Only the requested 30 are in this implementation batch:

### Cross

- Abby Wambach — DIVING HEADER
- Ada Hegerberg — FRONT-POST DART
- Ángel Di María — RABONA
- Cafu — PENDOLINO
- David Beckham — BEND IT
- Dragan Džajić — LEFT-FOOT WHIP

### Through Ball

- Alex Morgan — CURVED RUN
- Andriy Shevchenko — RUNS IN BEHIND
- Carlos Valderrama — PAUSE AND SLIP
- Jari Litmanen — KILLER PASS

### Long Shot

- Bobby Charlton — THUNDERBALL
- Carli Lloyd — HALFWAY HIT

### Corner

- Christian Eriksen — WHIPPED DELIVERY
- Sergio Ramos — 93RD MINUTE

### Penalty / dribbling

- Damien Duff — KNOCK AND RUN
- Garrincha — JOY OF THE PEOPLE
- Jay-Jay Okocha — STEPOVER
- Neymar — RAINBOW FLICK
- Ronaldo Nazário — FLIP FLAP
- Antonín Panenka — CHIPPED PENALTY

### Defensive / control

- Andrés Iniesta — LA CROQUETA
- Billy Bremner — CRUNCHING TACKLE
- Clarence Seedorf — RIDE THE TACKLE
- Claude Makélélé — WATER-CARRIER
- Claudio Gentile — MAN MARKER
- Franco Baresi — STEP UP
- Park Ji-sung — THREE LUNGS
- Peter Schmeichel — STARFISH

### Placement / movement

- Christine Sinclair — ARRIVE UNMARKED
- Franz Beckenbauer — DER KAISER

The six explicitly excluded experimental rows remain outside this batch: Abedi Pelé, Aitana Bonmatí, Bryan Robson, Clint Dempsey, Fabian Barthez and Ronaldinho.

## Action mechanics covered

The runtime now supports the calibration requirements including:

- same-type generated-card modification and hand inspection;
- multi-card generation;
- typed local Chance specialist bonuses;
- first-per-period and first-per-match state;
- cancellation immunity;
- generic first-Chance cancellation;
- Offside Trap cancellation and Baresi rider;
- reduced-DEF threshold checks;
- required pre-effect sequencing for Garrincha/Okocha;
- temporary and permanent player stat modifiers;
- Iniesta first-target protection;
- Seedorf reduction immunity;
- Makélélé dynamic local aura;
- Gentile dynamic highest-ATT Action suppression and restoration without replaying On Reveal;
- Cafu forward-only movement generation;
- Beckenbauer any-direction movement burst;
- movement once per period;
- Trigger Press dual DEF/ATT contribution;
- period reset and match-persistent state.

## Data sourcing

The Card Design Tracker remains authoritative for:

- player identity;
- match/full card names;
- position;
- Action name and text;
- any populated Cost.

The 30 tracker rows currently have blank ATT/DEF cells. Existing established values from `kc_player_roster_reconciliation_view` are therefore used for 28 players. Where the tracker Cost is blank, the reconciled KC Cost is also used.

Makélélé and Gentile could not be reconciled to stored KC values and remain explicitly marked `calibration_fallback` for ATT/DEF/Cost. No tracker or Supabase values are written by this batch.

This is not a balance pass.

## Automated calibration coverage

The focused V8 gate covers the handoff's high-priority integration scenarios:

A. Beckham + Wambach = +8 Cross.
B. Beckham + Wambach + Ada = +12 uncancellable first Cross.
C. Valderrama + Shevchenko = +8 first Through Ball.
D. Duff → Neymar → Panenka = +8 uncancellable Penalty.
E. Duff → Okocha verifies the pre-existing-reduction requirement.
F. Ronaldo verifies the exact -3 DEF threshold.
G. Baresi trap cancels Through Ball and awards +2 DEF.
H. Park's generated Trigger Press costs 0 in-period and adds ATT from DEF without removing DEF.
I. Gentile dynamically retargets suppression and restores the previous Action.
J. Period reset clears period state while retaining once-match/permanent state.

Additional tests cover RABONA, PENDOLINO, two-card Džajić generation, Charlton/Lloyd, Eriksen/Ramos, Garrincha sequencing, Iniesta/Seedorf, Makélélé, Litmanen, Sinclair and Beckenbauer.

Existing V7 focused gates remain in CI for regression visibility.

## Playable lab

`/lab/match-v8` now mounts the real-card calibration harness rather than the fake XI prototype.

It includes:

- real calibration player names and tracker Action text;
- actual Tactical cards in hand;
- generated-card ATT/cost/rider feedback;
- current Energy;
- temporary current stats on deployed players;
- `NO ACTION` feedback for suppressed cards;
- Moveable / move-used state;
- cancellation and Action feedback through the event log;
- hidden commitments and reveal priority;
- Manager transient slot lifecycle;
- slotless Tactical commitments;
- three manual deck presets so every one of the 30 cards appears in a user-controlled XI across the harness:
  - CREATORS
  - DRIBBLERS
  - CONTROL / SET PIECES

The UI remains deliberately functional. Card-face redesign, global balance, the rest of the roster and final drag-and-drop presentation remain out of scope.
