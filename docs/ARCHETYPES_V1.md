# Kickoff Clash — Tactical Identities & Verb Palette v1

Companion to `MATCH_ENGINE_V1.md`. Defines the **verb palette** (the real primitive) and the
emergent tactical identities ("archetypes") that clusters of verbs read as.

## 0. Model

Archetypes are **emergent labels over verb-space**, not selectable objects — like Snap's
Bounce/Move/Destroy or a Balatro flush/retrigger build. There is no archetype entity in code; there
are only cards carrying verbs, and a name is what a cluster of mutually-reinforcing cards reads as.

* **Per-card contributions are linear.** No thresholds, no breakpoints.
* **Compounding is emergent**, from three layers stacking on the linear base, applied in order:
  combinatorial synergies → enabler/leader multipliers → the convex lane contest (k>1).
* **Counters are emergent**, from identities touching the field with *different verbs* — never a
  hardcoded triangle. Two identities that only "add power to the same zone" don't counter; one that
  *denies* and one that *displaces* do.
* The opponent AI never "knows" its identity — it plays to its composition's strengths and
  opportunistically counters (anticipatory at the blind config window, responsive at the reactive
  action window).

## 1. Verb palette (the primitive)

Every card behaviour is one or more verbs. Each verb = a `FieldTransform` or `StateEffect` with a
phase/target.

| Verb | Phase / step | Target | Effect |
| -- | -- | -- | -- |
| Relocate | relocate | zone→zone | move source card's emission between cells |
| Amplify | scale | zone / self | buff power in a cell |
| Amplify (inverse-power) | scale | teammates | buff scaled by (1 − power/100) — lifts weak cards |
| Deny | debuff-opponent | opp zone | reduce opponent power in a zone |
| Drain energy | StateEffect | opp resource | reduce opponent action energy |
| Restore energy | StateEffect | self | raise own energy |
| Drain fitness | StateEffect | a card | reduce target card's fitness |
| Generate | StateEffect | self resource | convert won-ball → energy/turnovers |
| Dampen variance | resolveIncrement xG step | opp xG | compress opponent Poisson dispersion |
| Amplify variance | resolveIncrement xG step | self xG | fatten own Poisson tails |

**Targeting taxonomy** (new `target` field on effects): `zone` | `self` | `criterion` (e.g. lowest
power) | `enemyCard` (a chosen opponent card — reducers, man-marking).

Variance verbs operate on the new xG→Poisson step, making the permadeath variance knob a *contested
mechanic* rather than a global constant — players draft their own risk exposure.

## 2. Tactical identities

LOCKED = pinned in design; SKETCH = derivable from the palette, not yet confirmed.

| Identity | Footprint | Verb(s) | Synergy affinity | Cost / weakness | Status |
| -- | -- | -- | -- | -- | -- |
| Tiki-taka | MID-heavy | Deny (possession suppresses their MID/attack) | neighbour / MID density | beaten if ball is taken or MID is bypassed | LOCKED |
| Gegenpress | high / forward | Deny MID + Displace forward + Generate energy | press / workrate | accelerated fitness drain; exposed DEF | LOCKED |
| Strong leader | any | Amplify (inverse-power) teammates | Captain leads (personality); targets low-power | collapses if the leader is removed/gassed | LOCKED |
| Tactically fluid | shifting | Relocate freely + novelty buffs + no weak lane | versatility | lower peak power in any one zone | LOCKED |
| Defensively solid | DEF | Amplify DEF (raise floor → lower their xG mean) | DEF synergies | little attack | LOCKED |
| Catenaccio | DEF extreme | Dampen opponent xG variance | libero / sweeper | sacrifices attack; loses to consistent high mean | LOCKED |
| Counter-attack | deep → fast | Relocate DEF→ATT (skip MID) + punish exposure + turnover→strike | transition / pace | toothless vs a deep block that never over-commits | LOCKED |
| Mavericks | star-loaded | Amplify own xG variance (individual spikes) | anti-synergy (few links) | boom-or-bust; dead vs variance dampers | LOCKED |
| Wing play | ATT_L/R | Relocate wide→box (crosses) + Amplify lane + distort their DEF wide (stretch) | lane (FB+winger) | thin centrally; beaten by matched width or a deep block | LOCKED |
| Set-piece | ATT_C | Generate xG (dead-ball actions) + earned by attacking pressure + Amplify aerial in box | aerial / physical | strong vs low blocks; weak vs aerial defence | LOCKED |
| Tempo / game-mgmt | MID / control | Drain opponent energy + Dampen variance, scaling with the lead (front-runner snowball) | control | does nothing level/behind; beaten by fast starters & comebacks | LOCKED |

## 3. Emergent counter-web (validate in playtest — NOT hardcoded)

Falls out of the verbs; tune verb magnitudes so nothing dominates.

* Gegenpress **>** Tiki-taka — wins the ball back, denying possession.
* Counter-attack **>** Gegenpress / Wing / any over-committer — lives off the exposed defence.
* Counter-attack **<** Catenaccio / low block — no exposure to punish.
* Catenaccio **>** Mavericks / high-variance — kills the boom.
* Catenaccio **<** consistent high-mean (Tiki-taka grind, Leader floor) — dampening doesn't help vs a reliable mean.
* Mavericks **>** Fluid / low-floor coverage — one spike overwhelms "competent everywhere".
* Fluid **>** readable specialists — always has an answer; **<** concentrated overload.
* Gegenpress also **<** outlasting — its fitness cost makes a deep/fresh squad win late.
* Wing play **>** narrow/central builds (stretches them) ; **<** matched width or a deep block that won't be pulled apart.
* Set-piece **>** low blocks — scores without breaking them down ; **<** strong aerial/physical defence.
* Tempo **>** nothing while level/behind, but snowballs any lead ; **<** fast starters and comeback/high-variance builds.

**Central dial:** Mavericks (amplify variance) ↔ Catenaccio (dampen variance) are direct opposites on
the xG-variance axis; that axis doubles as the run's risk dial.

## 4. Reducers (targeted card effects)

Both forms exist:

* **Passive reducer** — a trait that continuously drains a target enemy card's fitness (man-marking).
  Lower impact, no risk.
* **Action reducer** — played from hand, higher impact, carries **foul / card risk** (reuses the
  red-card-risk `conditions` already in actions.ts; a red card = lose the card for the match).

## 5. Implementation notes

* No archetype object. Only cards + verbs exist; names are UX/documentation tags.
* Each verb resolves through the dispatcher with a `target` field (§1). Field verbs use the existing
  relocate/scale/debuff phases; resource/generation verbs are StateEffects; variance verbs hook the
  new xG→Poisson step in `resolveIncrement`.
* Strong leader generalises `Anchor → The Shield` (scoring.ts, "lowest-power card +30%") from one
  card to a power-weighted curve over all teammates.
* Opponent AI = play-to-strengths over its composition's verbs + opportunistic counter at two info
  states (blind config / informed reactive). No authored per-archetype policy.

## 6. Open

* All eleven identities now LOCKED (verbs pinned); per-card authoring is the remaining content work.
* Variance-dial magnitudes (dampen vs amplify) — balance the Mavericks↔Catenaccio war.
* Leader inverse-power curve steepness.
* Reducer risk/reward numbers; red-card severity.
* Authoring pass: which existing cards / traits / personalityThemes seed each identity.
* Playtest the counter-web; tune verb magnitudes so no identity dominates.
