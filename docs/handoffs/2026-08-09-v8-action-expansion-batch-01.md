# V8 Action expansion — Batch 01 — 2026-08-09

## Purpose

The first 30-card V8 calibration pool is frozen after the Action-quality pass. This batch deliberately expands beyond those cards using the live **Kickoff Clash — Card Design Tracker**, `Players!A5:R200`, as the source of truth for names, positions, existing Action concepts and existing effect text.

This is an **Action-design audit before implementation**. It does not write back to the Tracker and does not reopen package balance, Energy, +7 scoring or Tactical base values.

## Migration rule

A large part of the Tracker was authored for the V7 typed-chance / sector engine. V8 has a different grammar:

- three persistent zones: DEF / MID / ATT
- player ATT/DEF contributes directly to zone scoring
- generated Cross / Through Ball / Long Shot / Corner / Penalty cards contribute Tactical ATT
- no left / centre / right sector layer
- no generic `roll 5+` conversion layer
- no default reroll economy
- no reason to recreate “missed Box chance” event chains merely to preserve V7 text

Therefore:

> **Preserve the football idea, not the obsolete engine sentence.**

`needs a 5`, reroll, missed-chance and lateral-sector mechanics are classified as **TRANSLATE**, not automatically as bad Actions. They should receive a V8-native consequence rather than importing V7 machinery.

## Batch shape

40 additional real players:

- 5 goalkeepers
- 10 defenders / full-backs
- 13 midfield / utility / creator cards
- 12 forwards / attacking creators

Status key:

- **KEEP** — football identity and mechanic are already compatible with V8 or need only wording cleanup.
- **TRANSLATE** — Action identity is good, but the consequence is expressed in obsolete V7 chance/sector language.
- **REPAIR** — the mechanic itself is not doing a convincing job of expressing the football action in V8.
- **RENAME** — mechanic is useful, but the Action name fails the on-pitch/player-identity test.

## Goalkeepers

| Player | Tracker Action | Status | V8 direction |
| --- | --- | --- | --- |
| Gianluigi Buffon | ETERNAL | **RENAME** | Accruing defender DEF is coherent leadership/organisation, but `ETERNAL` is biography rather than an action. Preserve the accruing team-defence idea; rename around organising/commanding the back line. |
| Gordon Banks | IMPOSSIBLE SAVE | **KEEP / DESIGN** | Excellent identity and on-pitch Action name. Tracker has no effect yet. Best fit is a one-shot or first-per-match cancellation of an otherwise scoring Chance rather than a passive aura. |
| Iker Casillas | SAN IKER | **RENAME / DESIGN** | Strong nickname but not an on-pitch action. No effect exists. Prefer a reflex/one-on-one action with immediate Chance prevention. |
| Lev Yashin | BLACK SPIDER | **TRANSLATE** | Strong descriptive identity can work like STARFISH. Replace `first central chance requires a 7` with a V8-native first-Chance suppression/cancellation rule in DEF. |
| Manuel Neuer | SWEEPER-KEEPER | **REPAIR** | Name/identity are excellent. `+3 DEF to defenders; −4 DEF to himself` does not express sweeping. Rebuild around movement out of DEF, interception, or cancelling a Through Ball after stepping forward. |

## Defenders / full-backs

| Player | Tracker Action | Status | V8 direction |
| --- | --- | --- | --- |
| Alessandro Nesta | TIMED SLIDE | **TRANSLATE** | Excellent Action. Preserve “first Through Ball stopped” identity using V8 Through Ball cancellation rather than V7 sector chance handling. |
| Ashley Cole | SHOW HIM OUTSIDE | **KEEP** | Strong football action and direct consequence: suppress the strongest opposing wide attacker. Translate `sector` to same-zone targeting if required; do not redesign. |
| Bobby Moore | READ THE RUN | **KEEP** | Reactive DEF mirroring when a central attacker gains ATT is clean and very readable. Needs a generic opponent-buff event listener, not a new bespoke subsystem. |
| Carles Puyol | BODY ON THE LINE | **KEEP** | Near-model defensive Action: cancel one Chance in his zone per match, then lose 3 DEF. Strong identity, obvious trade-off. |
| Fabio Cannavaro | READS IT EARLY | **KEEP** | `+4 DEF while their zone out-attacks yours` is simple reactive defending and already speaks V8's zone language. |
| Jaap Stam | INTIMIDATOR | **RENAME** | The bound −4 ATT debuff is useful, but the noun is generic flavour. Prefer an on-pitch confrontation/action name while preserving the weakest-attacker suppression mechanic. |
| John Terry | CAPTAIN'S BODY | **RENAME / CLEANUP** | The one-shot chance prevention + −3 DEF consequence is good. Name is awkward; move toward BODY ON THE LINE / THROW HIMSELF IN territory without duplicating Puyol exactly. |
| Lucy Bronze | OVERLAP | **TRANSLATE** | Excellent full-back action. Replace same-wide-sector partner logic with a V8 same-zone or forward-movement payoff. Do not create lateral sectors. |
| Dani Alves | OVERLAP | **REPAIR** | `ATT counts in the centre instead of his own sector` has no V8 meaning. Keep OVERLAP, rebuild around moving DEF→MID/ATT and creating/enhancing a Cross. |
| Andy Robertson | RECOVERY RUN | **KEEP** | Very good reactive full-back identity: mirror an opposing wide attacker’s ATT gain as temporary DEF. Needs classification/event support only. |

## Midfield / utility / creators

| Player | Tracker Action | Status | V8 direction |
| --- | --- | --- | --- |
| Aitana Bonmatí | ESCAPE THE PRESS | **KEEP** | Excellent identity/mechanic: next-period first MID player costs 1 less. Requires a delayed one-use cost modifier primitive. |
| Abedi Pelé | JINKING RUN | **KEEP** | Moveable once; MID→ATT gives +4 ATT. Clean, visible and already V8-native. |
| Alfredo Di Stéfano | END-TO-END RUN | **KEEP** | Dynamic score-state ATT/DEF swing is legible and strongly expresses all-action play. |
| Anatoliy Tymoshchuk | STEP IN | **KEEP** | Conditional strongest-opposing-midfielder suppression is simple, positional and football-readable. |
| Andrea Pirlo | DIAGONAL SWITCH | **REPAIR** | Name is strong, but `central chance → stronger wide sector` belongs to the removed lateral-sector model. Rebuild as a generated Cross / relocation between MID and ATT, not left/right sectors. |
| Brian Laudrup | GLIDING RUN | **KEEP** | Once-per-period adjacent-zone move plus protection for the first Chance in the destination is coherent. |
| Chris Waddle | DROP THE SHOULDER | **REPAIR** | Great Action name. Wide↔central movement does not exist in V8. Rebuild around MID↔ATT movement plus creating/enhancing a Cross after the move. |
| Clint Dempsey | CHEEKY CHIP | **KEEP** | On Reveal burst while losing the zone is clean, memorable and self-contained. |
| Edgar Davids | PITBULL | **KEEP** | Descriptor rather than literal technique, but it describes exactly what happens in play: follows a moving midfielder and reduces ATT. Acceptable under the Captain Marvel / Bobo Bomber standard. |
| Johan Cruyff | TOTAL FOOTBALL | **KEEP** | Rules-layer OOP-penalty override is unusually broad but uniquely Cruyff and immediately legible. Keep as a high-cost identity card. |
| N’Golo Kanté | EVERYWHERE | **KEEP** | `Counts as present in all three zones` is a perfect rules-layer expression of the player identity. Must be costed carefully, not redesigned. |
| Mesut Özil | INVISIBLE | **KEEP** | Conditional +5/−3 based on whether his zone is already winning is legible: devastating when finding space, poor when the game cannot be brought to him. |
| Alexia Putellas | THROUGH THE GAP | **TRANSLATE** | Good creator action, but Box→Through Ball in a lateral sector is obsolete. V8 form should generate or upgrade a Through Ball from MID/ATT. |

## Forwards / attacking creators

| Player | Tracker Action | Status | V8 direction |
| --- | --- | --- | --- |
| Alan Shearer | LACES THROUGH IT | **TRANSLATE** | Excellent Action identity. Replace `needs only a 5 / cannot reroll` with a powerful first-Chance ATT boost carrying a clear downside, e.g. no specialist amplification or no cancellation protection. |
| Alessandro Del Piero | FAR-CORNER CURLER | **TRANSLATE** | Excellent identity. Do not add rerolls to V8; make the first Box-style/generic attacking Chance in ATT stronger or protected after an initial failure condition expressed via board state instead. |
| Alexandra Popp | CRASH THE BOX | **TRANSLATE** | Great movement identity. `after first missed Cross create Box chance` should become a Cross-follow-up: after your first Cross is cancelled/underperforms, add a small generic Chance or self ATT burst. |
| Ali Daei | POWER HEADER | **TRANSLATE** | Strong identity. Replace Cross `5+` threshold with first-Cross local amplification, ideally smaller than Wambach and without duplicating DIVING HEADER. |
| Beth Mead | BACK-POST RUN | **TRANSLATE** | Excellent off-ball action. Preserve “Cross from elsewhere finds her” as origin-aware Cross claiming/amplification, but express it through generated Cross cards / same-zone placement rather than lateral sectors. |
| Birgit Prinz | DRIVE THROUGH | **REPAIR** | Restoring a cancelled Box chance at a harder threshold is mechanical residue rather than a Prinz action. Keep the power-running identity, give her a direct self ATT/DEF-breaking consequence. |
| Christian Vieri | BOBO BOMBER | **TRANSLATE** | Name is accepted: it describes the in-game striker bombarding the box. Replace `missed Box chance → another on 6` with a first attacking-Chance follow-up or self ATT surge after a failed/cancelled Chance. |
| Dennis Bergkamp | FIRST TOUCH | **TRANSLATE** | Perfect name. Replace generic first-chance `5+` with first generated Chance enhancement/protection or an On Reveal hand interaction. |
| Diego Maradona | SLALOM RUN | **KEEP** | Once-per-match adjacent attacking-zone movement + protected Chance creation is highly legible and already close to V8 grammar. |
| Edinson Cavani | GET ACROSS HIM | **TRANSLATE** | Excellent striker movement. Preserve interception of an attempted Cross cancellation by letting Cavani protect/claim the first Cross in his zone. |
| Ellen White | FIRST-TIME LOB | **TRANSLATE** | Strong on-pitch action. Through Ball→Long Shot `5+` should become a one-shot Through Ball transformation with fixed Tactical ATT bonus. |
| Dimitar Berbatov | BERBA SPIN | **KEEP** | Excellent signature action: ignore the first defender Action that targets him, then move to an adjacent zone. Clear, unique and V8-native. |

## Findings

### 1. The main gap is translation, not bad ideas

Of the 40 cards:

- **18** are KEEP / essentially V8-ready
- **13** are TRANSLATE: identity good, V7 chance/sector sentence obsolete
- **6** need substantive mechanic REPAIR
- **5** contain a naming problem (some overlap with repair/design)

The pool is much healthier than a raw “rewrite all old cards” approach would imply.

### 2. Do not add these V7 primitives to V8

This batch is explicit evidence **against** introducing the following merely for backwards compatibility:

- left / centre / right sectors
- generic dice target numbers (`needs a 5` / `requires a 7`)
- a global reroll economy
- generic `missed Box chance` chains
- claimed-chance ownership as a universal subsystem unless a smaller Tactical-card mechanism can express the same idea

If a card requires one of those, translate the football idea first.

### 3. Reusable V8 primitives worth adding

The 40-card sample repeatedly asks for a much smaller set of genuinely useful primitives:

1. **Delayed one-use hand Cost modifier** — Aitana.
2. **Opponent stat-change event listener** — Bobby Moore / Robertson.
3. **Opponent movement event + follow movement** — Davids.
4. **Action-target interception followed by movement** — Berbatov.
5. **Rules-layer presence / OOP override** — Kanté / Cruyff.
6. **Once-per-match Chance cancellation with self-cost** — Puyol / Terry.
7. **Score-state dynamic modifier** — Di Stéfano / Özil / Dempsey.
8. **Move-triggered generated Tactical / local Tactical enhancement** — Dani Alves / Waddle / Lucy Bronze translations.
9. **First typed-Tactical cancellation/protection** — Nesta / Cavani / Yashin translations.
10. **Generated-Tactical transformation** — Putellas / Ellen White / Pirlo translations.

These are reusable mechanics. They should be implemented as engine primitives where possible rather than forty player-specific `if (id === ...)` branches.

## First implementation batch — ready

Implement the first **8 mixed-XI cards** before translating any V7 dice mechanic:

1. **Abedi Pelé — JINKING RUN**
2. **Aitana Bonmatí — ESCAPE THE PRESS**
3. **Alfredo Di Stéfano — END-TO-END RUN**
4. **Ashley Cole — SHOW HIM OUTSIDE**
5. **Carles Puyol — BODY ON THE LINE**
6. **Clint Dempsey — CHEEKY CHIP**
7. **N’Golo Kanté — EVERYWHERE**
8. **Dimitar Berbatov — BERBA SPIN**

Why these eight:

- positionally mixed
- all have strong existing football identity
- none require recreating V7 dice/reroll/sector mechanics
- together they exercise movement, delayed Cost, score-state modifiers, target suppression, Chance cancellation, multi-zone presence and Action interception
- they are useful mixed-XI cards rather than an artificial archetype package

## Freeze

Do not use Batch 01 to reopen:

- 2 / 4 / 6 / 8 Energy
- +7 repeat scoring
- Penalty Cost 1 / +5 ATT
- existing Cross / Through Ball / Long Shot / Corner base values
- accepted compact reference XIs
- the completed first 30-card Action-quality decisions

The next engineering work is **generic primitive support + the eight ready cards**, followed by a small mixed-XI validation panel.