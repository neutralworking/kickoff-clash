**Status: design-settled (owner-directed session, July 2026).** The design record for the
card system and match model — the card lifecycle (unpack → match → upgrade) reconciled with
the contest-based scoring model. The action catalogue is authored against this document
(§3 role map, §7 set pieces).

> **Repo note (NW-139 Phase 0):** committed as authored in Linear. This base doc is designed
> to be read *with* `CARD_SYSTEM_V2_CHANGES.md` applied on top — the base carries the
> apply-directive below plus inline supersession annotations. The `_CHANGES` patch was not
> destructively hand-merged into this prose; both docs are committed and `_CHANGES` wins on
> conflict.

> **Apply** `CARD_SYSTEM_V2_CHANGES.md` **on top of this doc.** The July 2026 session patch
> rescopes resolution to the six-contest model (Fork A), adds the positional layer + retain
> sub-roll, and folds in sim-confirmed constants. Where this base doc and `_CHANGES` differ,
> `_CHANGES` wins. Notably: §3.1 supply line here is superseded by `_CHANGES` §6
> (CREATE 9 · KEEP 8 · BREAK 8 · STOP 7 · FINISH 7 · PRESS 6); the goal formula here (§2,
> `d100 ≤ BASE + 3×(ATT−STOP)`) coexists with the xG conversion form in `_CHANGES` §4 —
> see the open comment on NW-139 before implementing FINISH.

**Role is the single identity axis** — there are no archetypes. **BRS is removed from the
project** — cards print ATT/DEF directly.

---

## 1. The card in one paragraph

A player card is three legible layers. **Printed ATT/DEF** (integers) — the card's raw
value. A **role** — the card's tactical identity, which tilts exactly one of six match
contests (§2, §3). A single **action** — the card's individual ability, which scales with
the card's rarity tier and is upgraded by collecting duplicates (§5, §6). On top of these
sit two physical-object systems: **fitness** (per-match stamina) and **condition**
(long-term wear), which make rotation the master mechanic (§4). The player's core tension
is trading raw ATT/DEF against role-fit: a high-stat card whose role tilts a contest your
build doesn't want is the beautiful-but-wrong card.

---

## 2. The six contests

A match doesn't resolve as one number vs one number. It resolves through six
sub-contests, in three mirror-pairs — one attacking lever against one defending lever at
each phase of an attack:

| Phase | Attacking lever | Defending lever | Resolution term it owns |
| -- | -- | -- | -- |
| Possession | **KEEP** | **PRESS** | the possession split (6 possessions, clamp 2–4/side) |
| Chances | **CREATE** | **BREAK** | the outcome-table slide (`CREATE − BREAK`) |
| Goals | **FINISH** | **STOP** | the shot formula (`d100 ≤ BASE + 3×(ATT − STOP)`) |

When you attack, you are on the attacking side of all three (KEEP/CREATE/FINISH); when
they attack, you are on the defending side (PRESS/BREAK/STOP). STOP is the **mean of the
back line**, so line-wide DEF moves it far more than one big centre-back.

This is the synergy system, with no context-tags. The **manager/playstyle** decides which
contests win the match; the **role** decides which contest a card leans into; **synergy is
the overlap**. There is no seventh contest — set pieces (§7) are a mechanic that reads
existing stats, not a contest.

---

## 3. Roles

**Role = position × contest.** Each role sits at a position and tilts exactly one contest.
Roles are drawn from the Chief Scout taxonomy; three are new to this project (Interceptor,
Mediano, Water-Carrier) and one is a rename (WM Wide Playmaker → **Wide Cover**).

* **Natural (N)** — the position sits where the contest is fought; full tilt.
* **Stretch (S)** — coherent but off-role (a ball-playing defender, a pressing striker);
  **soft tilt** (half). This is where "worth less" lives — value is expressed through
  tilt strength, **not** through rarity (rarity is the action tier, a separate lever).
* Incoherent position×contest cells (a finishing GK) simply have no role — a real
  taxonomy contains no incoherent roles, so there is nothing to cut.

The role-passive is **fixed per role** — it does not scale with rarity. Only the action
scales. The role-passive is a **flat tilt** (§4), not a points buff: it steers where the
card's stats count, it does not add to them.

### 3.1 The role map (45 roles)

*(supply line below superseded by* `_CHANGES` *§6 — see header note)*

| Role | Pos | Contest | Tilt |
| -- | -- | -- | -- |
| Marshal | GK | STOP | N |
| Sweeper Keeper | GK | STOP | N |
| Shotstopper | GK | STOP | N |
| Distributor | GK | KEEP | S |
| Centrale | CD | STOP | N |
| Colossus | CD | STOP | N |
| Progressor | CD | KEEP | S |
| Sweeper | CD | BREAK | N |
| Stopper | CD | PRESS | S |
| Fullback | WD | STOP | S |
| Auxiliary Centre-Back | WD | STOP | N |
| Wing-back | WD | PRESS | S |
| Invertido | WD | KEEP | S |
| Regista | DM | CREATE | N |
| Pivote | DM | KEEP | N |
| Anchor | DM | BREAK | N |
| Interceptor | DM | BREAK | N |
| Water-Carrier | DM | BREAK | S |
| Volante | DM | BREAK | N |
| Segundo Volante | DM | CREATE | S |
| Playmaker | CM | CREATE | N |
| Metodista | CM | KEEP | N |
| Mediano | CM | BREAK | N |
| Mezzala | CM | FINISH | S |
| Tuttocampista | CM | PRESS | N |
| Ball Winner | CM | BREAK | N |
| Carrilero | CM | PRESS | N |
| Touchline Winger | WM | CREATE | N |
| Tornante | WM | PRESS | N |
| False Winger | WM | KEEP | S |
| Wide Cover | WM | BREAK | N |
| Trequartista | AM | CREATE | N |
| Enganche | AM | CREATE | N |
| Incursore | AM | FINISH | N |
| Mediapunta | AM | KEEP | N |
| Shadow Striker | AM | FINISH | N |
| Inverted Winger | WF | FINISH | N |
| Advanced Winger | WF | CREATE | N |
| Wide Playmaker | WF | CREATE | N |
| Wide Target Forward | WF | FINISH | N |
| Prima Punta | CF | FINISH | N |
| Falso Nove | CF | CREATE | S |
| Spearhead | CF | PRESS | S |
| Target Forward | CF | KEEP | S |
| Seconda Punta | CF | CREATE | S |

Contest supply (deliberately leaning, not flat): KEEP 8 · STOP 8 · BREAK 8 · CREATE 8 ·
FINISH 7 · PRESS 6. *(→ replaced by* `_CHANGES` *§6: Seconda Punta CREATE→FINISH, giving
CREATE 9 · KEEP 8 · BREAK 8 · STOP 7 · FINISH 7 · PRESS 6.)*

New roles to author into the Chief Scout dataset: **Interceptor** (DM, BREAK),
**Mediano** (CM, BREAK), **Water-Carrier** (DM, BREAK), plus the **Wide Cover** rename.

---

## 4. Tilt mechanics

A tilt is a **flat, contest-native weight**. It never touches printed ATT/DEF — it pushes
the contest's own dial (the resolution term in §2).

* **Flat, not stat-scaled.** A natural role contributes a fixed weight to its contest; a
  brilliant card and a mediocre card of the same role tilt **identically**. Brilliance
  shows up in ATT/DEF and the action, not the tilt. This keeps role and stat as
  independent axes — the core tension survives.
* **Natural = +2 to its contest term; stretch = +1.** (Starting values for sim — §10.)
* **Stacking is linear and uncapped.** Five CREATE tilts = +10. Committing hard to one
  contest is rewarded proportionally (Balatro "go tall").
* **Opposed across mirror-pairs.** Each contest resolves as **your total tilt − the
  opponent's mirror tilt**, fed into that contest's formula. Your CREATE vs their BREAK;
  your FINISH vs their STOP; your KEEP vs their PRESS. Reading the opponent's squad is the
  strategic read of a fixture.

**Scale intuition (why +2/+1).** Anchored to the modifier budget — a good XI totals
~90–130 ATT and the whole modifier stack (manager + tactics + actions + tilts) is worth
~+20–35 team points. On the sharpest contest, FINISH/STOP, one natural tilt (+2) is +6pp on
the shot roll — meaningful, not decisive. A full 8-tilt mono-stack (+16 on one term) sits
just inside the whole-stack budget, so an all-in build spends most of its swing on one dial
and leaves room for the manager/action layers on top. That is the intended tradeoff.

### 4.1 Why no cap is safe — the natural drag

Mono-stacking is balanced not by a ceiling but by **opportunity cost baked into the
cards**. Because **stats are role-correlated at generation** (a Playmaker prints low DEF,
a Colossus prints low ATT — the old `primary_model` field is the profile signal), the
cards that tilt a contest are innately weak at the contests they ignore:

* **CREATE stack** → low DEF (weak STOP) + riskier play lowers possession (weak KEEP).
* **FINISH stack** → high ATT / no midfield; concedes the whole midphase, gets overrun.
* **KEEP stack** → possession-piled cards are low-FINISH by stat correlation, so the squad
  holds the ball but rarely shoots. Possession *can* score — it just seldom does without a
  finisher. Possession without penetration.
* **PRESS/BREAK stack** → strips and cools brilliantly, no FINISH threat.
* **STOP stack** → a wall that can't score in open play (see §7 for its escape hatch).

**This makes role-correlated stat generation a hard requirement**, not a nicety. If a
high-DEF Creator can exist, the drag vanishes and mono-stacking breaks.

### 4.2 Win-condition guardrail

The no-cap model rests on **role-correlated stats (§4.1) doing almost all the work**, plus
**one** explicit guardrail:

* **A draw passes the round but pays less.** Draw = advance the run, reduced money reward.
  This is a **soft economic drag** on the STOP grinder: it survives fixtures but can't
  compound its economy, so it stalls rather than dominates — self-correcting without a
  lethal punish.

Note there is deliberately **no rule against possession scoring**. A KEEP stack is limited
by stat correlation (low FINISH), not by a prohibition — the same natural drag as every
other contest. One mechanism balances all six.

---

## 5. Condition and fitness — the card as a physical object

Two separate bars that touch at one point.

* **Fitness (0–100)** — per-match stamina. Full on the bench. Drains as a card plays.
  **+2 restored at the final whistle** if the card played. Tired = flat penalties to both
  stats. A benched card recovers fully.
* **Condition (0–100)** — long-term wear. **Only drops when a card plays at 0 fitness**,
  per 15' it stays on the pitch. Injuries fold fully into condition (a knock is condition
  damage, not a separate flag).
* **The link:** condition **caps starting fitness**. A MINT card starts at full fitness; a
  worn card cannot start as fresh.

**The loop this creates:** ride a card to 0 fitness and keep playing it → condition drops
→ it starts the next match lower → hits 0 sooner → condition drops faster. A death spiral
escaped only by rotation. Condition punishes overuse across matches; fitness punishes it
within a match; **rotation is the single answer to both**, and is therefore the master
mechanic.

### 5.1 Condition bands

**MINT · USED · WORN · DAMAGED · DESTROYED.** Each band caps starting fitness lower as it
descends (MINT = full; DESTROYED = removed from the deck permanently). Exact caps are
tuning. The card face shows the wear.

### 5.2 Fail state

**No fieldable XI → forfeit → run death.** A run can end by attrition. There is no
gravestone/retired-shirts gallery — a destroyed card is gone.

---

## 6. Rarity, actions, and the economies

* **Rarity tier (1–4: Common/Rare/Epic/Legendary) sets how GOOD the card's one action is**,
  not how many traits it has. Same action name at every tier; only the numbers grow.
  **Legendary adds a rider** (a second clause — e.g. `sure-strike`). Budget ≤1
  rider-bearing action per role.
* **Rarity is upgraded by DUPLICATES, not cash.** 1 dupe C→R · 2 dupes R→E · 3 dupes E→L
  (six copies to take a Common to Legendary). A dedicated **dupe screen** manages this on
  mobile. A duplicate can also be **swapped in** for a worn squad card (fresh condition) —
  so dupes are insurance against wear as well as fuel for tiering.
* **Two clean economies, no overlap:**
  * **Dupes → card quality** (the action tier). Earned by collecting.
  * **Cash → ATT/DEF nudge** (via the store and **Training cards**), **condition repair**,
    and buying **specific worn cards** from the store. Cash never buys quality.
  * **Cash upgrade is limited to ATT/DEF only** — a small stat nudge — never card quality.
* **Packs → random fresh cards.** The store → specific (often worn, cheaper) cards.

---

## 7. Set pieces — a scoring path, not a contest

Set pieces let a squad score without a FINISH lane. They are a **mechanic that reuses
existing machinery**, not a seventh contest and not a role tilt.

* **Trigger:** a per-round **probability roll of winning a dead-ball**, in the chance-beat
  grammar. The probability **scales with possession** (like open-play chances) and is
  **raised further by a carrier action** (a dribbler action specialising in getting up the
  pitch and drawing free-kicks).
* **Delivery:** a **set-piece taker action** turns a won dead-ball into a chance. No taker
  in the XI → won dead-balls are wasted.
* **Conversion:** the set-piece chance is attacked by the squad's **aerial DEF** cards —
  the shot formula, but keyed off **DEF instead of ATT**. This is how a high-DEF wall
  scores without printing attack.
* **Defending:** the opponent's set-piece chance is resisted by *your* aerial DEF in the
  box. So DEF is good at set pieces **both ways**.

### 7.1 The STOP-meta interaction (the reason set pieces exist)

A park-the-bus wall grinds draws (survives, earns little — §4.2) and has no open-play route
to goal. Set pieces are its escape hatch: it is **innately strong at set-piece defence**
(a wall of aerial defenders) and unlocks set-piece **attack** by spending two squad slots
on a **carrier + a taker**.

The tension, sharpened by possession-scaling: a pure bus **concedes possession by design**,
which **throttles its own set-piece probability**. So to make set pieces a real win-con it
must run a carrier who *wins possession high up*, pulling the squad a notch off pure
defence toward a mid-block that can occasionally hold the ball. Every step toward scoring
set pieces costs a step of pure defensive commitment. That is the intended build puzzle.

### 7.2 Two new actions to author

Both live in the action catalogue (not the role list) and fit the existing chance-beat
grammar; likely no new engine primitive beyond "this chance scores off DEF, not ATT":

* **Foul-winner / carrier** — a dribbler action that raises the dead-ball-won probability.
* **Set-piece taker** — the delivery; converts a won dead-ball into a chance.

---

## 8. The opponent

The opponent is **modelled**, not faceless: real roles + actions + stats, and it tilts its
contests (the mirror-pair opposition in §4 depends on this). Recommended boundary:
opponents are **generated per fixture and do not persist** — no condition, no dupes, no
wear on their side. This keeps the lift bounded while making the pre-match squad read
meaningful.

---

## 9. Lifecycle summary (unpack → match → upgrade)

1. **Unpack.** Packs drop random fresh cards; the store sells specific (often worn) cards.
   Duplicates are not dead — they fuel tiering (§6) or serve as fresh-condition swaps.
2. **Squad.** Draft to a manager's favoured contests; role tilts + role-correlated stats
   decide fit. Pre-built demo squads teach each meta (an XI all leaning one contest under a
   manager who rewards it).
3. **Match.** Six contests resolve as your tilts − their tilts (§4). Set pieces roll each
   round off possession (§7). Fitness drains; condition chews only at 0 fitness (§5).
4. **Between matches.** Rotate to recover fitness and spare condition. Repair condition or
   buy Training/stat nudges with cash. Fuse duplicates to raise action tier.
5. **Attrition.** Cards wear toward DESTROYED; a squad that can't field an XI forfeits and
   the run ends (§5.2).

---

## 10. Open items (tuning / downstream, not structural)

* Set-piece **base rate at zero possession** and the possession→probability curve — sim.
* **Tilt magnitudes** seeded at natural +2 / soft +1 (§4); confirm/tune against the ATT/DEF
  stack in sim — this is the first quantitative pass and gates any playable meta.
* Condition **band caps** on starting fitness, and the per-15'-at-0 wear rate — sim.
* Dupe-upgrade **cost curve** vs repair cost vs pack cost — balance-lab.
* Whether the **stat nudge on cash upgrade** and Training cards share one currency sink.
* Author the **action catalogue** against the 45-role map (§3), including the **foul-winner**
  and **set-piece taker** actions (§7.2). Every contest fed; one build-around per role pool;
  riders at Legendary only.
