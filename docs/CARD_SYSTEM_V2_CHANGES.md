# CARD_SYSTEM_V2 — changes to apply (July 2026 session)

Apply-ready patch. Each item names the target section in `CARD_SYSTEM_V2.md`. Ordered by
blast radius — §1 is a model-level rescope; the rest are contained edits. Companion:
`CARD_ACTIONS_V1.md` (the full catalogue authored against these).

---

## 1. FORK A — six contests supersede the SYNERGY_MODEL window resolution  *(top of stack)*

**Decision:** the engine is rebuilt entirely to the six-contest model. `src/engine/`
(SYNERGY_MODEL_V1) today resolves **two windows** (`transition`/`set-piece`) by
`charge + roll ≥ threshold`; V2's six contests, mirror-pairs, role tilts, possession split,
and shot formula are **not** in it. A makes V2 the resolution model.

**Consequences to reconcile (not code changes here — flags for the rebuild):**

* NW-139 (P0–P1 synergy spine: contexts/postures/windows/streaks) is rewritten: resolution
  moves from two-window charge to six-contest mirror resolution. The context taxonomy
  (posture/scoreline/clock/streak/fitness) **survives as gates**, not as resolvers.
* `scripts/balance_sim.py` (mirrors the window engine bit-for-bit) is re-pointed at this
  session's sim (`kc_sim.py` — six-contest, tuned constants in §7 below).
* `docs/MIGRATION_NOTES.md` "ADAPT" verdicts revisited: the legacy `src/lib` contest
  structure (create/finish/lanes/xG) is now *closer* to the target than the window engine —
  some ADAPT→KEEP.
* The **verb palette stays** (`src/lib/verbs.ts`, law 3); only verb *targets* change
  (window-kind → contest dial). See `CARD_ACTIONS_V1.md` §7 for the new primitives.

---

## 2. Positional layer — reverses "no zones"  *(new §, place after §3)*

The formation is a **graph**: each slot has a **line** (depth: GK 0 · CD/WD 1 · DM 2 ·
CM/WM 3 · AM 4 · WF/CF 5) and a **lane** (wide L/R for WD/WM/WF, else C). Five references an
action may use: **in-front · behind · beside · same-lane · opposite** (opposite = the enemy
slot in your lane one line up — the marking matchup).

* **Depth = reference-frame only.** Contests still resolve as **global team totals**; the
  graph only routes which slot an action targets. (This preserves the parity tune + manager
  sim.) Lane-resolved contests are a possible future step, not v1.
* **Discipline rule (loose coupling):** a positional action targets the *occupant* of a
  related slot and applies a **fixed effect**; it may **not read that occupant's role/traits**.
  Structure-reference, never card-reference.
* Engine note: `who: 'lane-ahead'` (in-front) and `who: 'band-behind'` (behind) already exist
  in `src/lib/defining-traits.ts`; add `beside`, `same-lane`, and cross-team `opposite`.

---

## 3. Possession gains a retain sub-roll  *(revise §2 Possession row + §4)*

The split is unchanged (6 slots, 2–4/side, set by KEEP−PRESS). **Each held slot now resolves
one retain roll.** Retained → the slot becomes an attacking phase feeding CREATE→shot→FINISH.
Turned over → the slot is lost, and **a fraction of turnovers become the opponent's BREAK
transition chances** (KEEP↔BREAK coupled — Possession vs Counter is now a real duel). One
Bernoulli per slot; cheap. This gives KEEP actions literal hooks (Pivote protects a retain,
Distributor gains a slot on a survived phase, Link/Hold-Up convert a retained slot).

---

## 4. Chance-quality tier — confirm present  *(reference in §2)*

Already in the engine: chances are `quality: 'half' | 'big'` with an xG value; goal =
`1 − e^(−xG)`; `shotQuality = contest.finish`. **CREATE = shot volume; quality-tier + FINISH
= conversion.** Playmaker upgrades half→big; Mezzala lifts low-xG efforts.

---

## 5. Aerial keyword  *(new line in §7)*

**Aerial** is a **keyword on the DEF axis**, not a stat (card schema stays ATT/DEF). Marks who
attacks/defends dead-balls; the duel reads DEF. Carriers: Colossus (defence), Wide Target
Forward / Incursore / a designated CF (attack). "Promote aerial to a stat" is a parked lever
if the Set-Piece manager wants a deeper build.

---

## 6. Smaller corrections

* **§3.1 supply line is stale** — replace with the enumerated count:
  **CREATE 9 · KEEP 8 · BREAK 8 · STOP 7 · FINISH 7 · PRESS 6** (Seconda Punta moved
  CREATE→FINISH this session).
* **§7.1 carrier is a CREATE investment, not KEEP.** Outlet/Deliverer are CREATE-pool actions
  gated per CREATE-tilt; the possession-pull is baked into the gate (the wall must buy CREATE).
* **Off-position soft-tilt + Versatile** (add to §3): any card fills any slot, tilt softens
  one step off-position (N→S); Versatile waives it.
* **relocate redefined** (add to §4): no zones → "add this card's tilt to the squad's
  most-committed contest." Also the mechanism behind Versatile.
* **No-unconditional law stays pure** — no exception list. Regista's guaranteed chance is
  **gated on ¬Attack posture**, so it is conditional, not unconditional.

---

## 7. Sim-confirmed constants  *(fold into §4.1 + §10)*

First quantitative pass (this session, `kc_sim.py`, six-contest model, tuned to parity):

```
BASE 36 · backline_coef 0.6 · tilt +2 natural / +1 stretch at 3pp per point
SP_base 0.10 (set pieces = draw-breaker) · STOP profile DEF μ68 · BREAK μ63
stopbus (costed wall) = gives up 2 back-line slots to carrier + taker
```

Under these: round-robin spread 0.55, no runaway matchup, +2/+1 holds. **Restate the §4.1
"8-tilt mono +16" intuition** against real ceilings (tilt points): KEEP 12 · CREATE 10 ·
BREAK 10 · PRESS/STOP 9 · **FINISH 8** — the sharpest dial is the *least* stackable.

**Manager reweight (validated):** a matched build+manager beats a balanced squad ~2×; the
same build swings from best to worst across managers (e.g. mono:CREATE 3.76 under Tinkerman,
0.71 under Chaser). Commitment payoff is a **manager-layer property** — without a manager
reweight a committed mono is a stat-hole liability. The win-con bonus is **gated on
committing to the manager's contest** (no-unconditional law, applied to managers). Roster
gaps: **Gambler** needs an amplify-variance build to reward (Shadow Striker/Ghost);
**PRESS/Gegenpress has no dedicated manager** — add a high-line manager or fold into Chaser.

---

## 8. Deferred to sim (post-A-rebuild)

Link/Hold-Up kept small (KEEP↛CREATE substitution); turnover→chance conversion cap
(Ball-Winner + Interceptor + Volante stack); full parity re-check (retain roll + positional
layer shifted throughput); FINISH floor now on Mezzala + Prima Punta rider (confirm
sufficient); Gambler + PRESS manager gaps above.
