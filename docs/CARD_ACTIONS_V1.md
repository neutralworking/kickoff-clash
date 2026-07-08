**Status: design-settled (owner-directed session, July 2026).** Authored against
`CARD_SYSTEM_V2` §3.1 (the 45-role map), §7 (set pieces), and the model decisions logged
in `CARD_SYSTEM_V2_CHANGES.md` this session. Supersedes `CARD_ACTIONS_HANDOFF_V1` in full.
One action per role; tier-scaled; riders Legendary-only; every action synergy-gated.

> **Engine target = Fork A (six-contest mirror resolution).** This catalogue targets the
> six contests (KEEP/PRESS · CREATE/BREAK · FINISH/STOP), not the two-window model in
> `src/engine/` today. The rebuild's resolution layer moves to six contests before this
> ships — see `CARD_SYSTEM_V2_CHANGES.md` §1. Verb names are the shared palette
> (`src/lib/verbs.ts`, law 3); only their *targets* are new.

---

## 1. The action grammar

Every action instantiates one closed shape:

> `[trigger] → one verb → [target]`**, gated by** `[synergy condition]`**.**

* **Trigger** — a match-engine hook (kickoff · per-period · on-turnover · on-retain ·
  on-goal/conceded · full-time · continuous).
* **Verb** — one from the closed palette (§2). Exactly one per action.
* **Target** — a contest dial · a shot input (ATT / back-line DEF) · a chance object
  (volume / quality-tier / xG) · a set-piece hook · §5 fitness/condition/energy · economy ·
  a **positional slot** (§3).
* **Gate** — the synergy condition. **No action pays out flat** (the no-unconditional law).
  Magnitude scales with a coherence signal: a tilt count, a role/position count, a posture,
  a manager win-con, a condition band, or a match state (turnover-occurred, retain-survived).

Tier (Common→Rare→Epic→Legendary) grows numbers only. **Legendary adds one rider**, budget
**one per pool** (on the build-around). The no-unconditional law has **no exceptions** —
Regista's "chance from nothing" is gated on ¬Attack posture, not ungated (§5, CREATE).

---

## 2. The verb palette (shared, re-pointed at six contests)

`amplify` · `amplify-inverse-power` · `deny` · `generate` · `drain-fitness` ·
`drain-energy` · `restore-energy` · `dampen-variance` · `amplify-variance` · `relocate`.

**Dual-axis, split across each pool.** `amplify`/`deny` = the amplification axis (ceiling —
build-arounds). `dampen-variance` = the consistency axis (each pool's floor role). The two
converge only at a build-around's Legendary rider.

**relocate** (no zones): add this card's tilt to the squad's **most-committed contest** at
resolution. Always synergises. (Also the mechanism behind the **Versatile** keyword — §3.)

---

## 3. Baseline rules this catalogue relies on

* **Chance-quality tier** (already in engine): chances are `half` | `big` with an xG value;
  goal = `1 − e^(−xG)`. CREATE sets volume; quality-tier and FINISH set conversion.
* **Retain sub-roll** (new, §CARD_SYSTEM_V2_CHANGES): each held possession slot resolves one
  retain roll; failed retains feed the opponent's BREAK (KEEP↔BREAK coupling).
* **Positional layer** = the formation graph (line × lane). Five references an action may
  use — **in-front · behind · beside · same-lane · opposite** (cross-team). Discipline rule:
  a positional action targets the *occupant of a related slot* and applies a **fixed effect**;
  it may **not read that occupant's role/traits**. Engine already has `who: 'lane-ahead'`
  (in-front) and `who: 'band-behind'` (behind).
* **Off-position soft-tilt**: any card fills any slot, but off its native position its tilt
  softens one step (N→S). **Versatile** waives it.
* **Aerial** = a keyword on the DEF axis (not a stat). Marks who attacks/defends dead-balls;
  the duel reads DEF.

---

## 4. The six metas (build-arounds — one per pool)

| Contest | Meta | On role | verb → target | gate | Legendary rider |
| -- | -- | -- | -- | -- | -- |
| KEEP | **Possession** | Metodista (CM) | amplify → possession split | per KEEP-tilt | dampen-variance: lock the 4th slot |
| PRESS | **Gegenpress** | Tuttocampista (CM) | deny → opp retain (force turnover) | per PRESS-tilt | drain-fitness on opponent |
| CREATE | **Joga Bonito** | Trequartista (AM) | amplify → shot volume | per CREATE-tilt | payout per chance created (economy) |
| BREAK | **Counter** | Ball-Winner (CM) | deny → opp shot volume | per BREAK-tilt | amplify-inverse-power: biggest CREATE threat |
| FINISH | **Clinical** | Prima Punta (CF) | amplify → conversion | per FINISH-tilt | sure-strike: dampen-variance floor on the roll |
| STOP | **Catenaccio** | Centrale (CD) | amplify → back-line DEF term | per STOP-tilt | amplify-inverse-power vs best finisher |

These are the identities the **managers** reward (validated this session: a matched
build+manager beats a balanced squad ~2×; manager choice swings the same build from best to
worst). Commitment payoff is a manager-layer property — see `CARD_SYSTEM_V2_CHANGES.md` §manager.

---

## 5. The catalogue (all 45). ★ = build-around.

### KEEP — Possession (8) · sequence: acquire → retain → convert

| Role | Pos | Action | verb → target | gate |
| -- | -- | -- | -- | -- |
| **Metodista ★** | CM | Metronome | amplify → possession split (within clamp) | per KEEP-tilt |
| Pivote | DM | Resist Press | dampen-variance → retain roll (force 1 success) | per KEEP-tilt |
| Distributor | GK | Play Short | generate → +1 slot after surviving an opp phase (no goal/corner) | (event) |
| Progressor | CD | Bring Out | deny → opp PRESS term | per KEEP-tilt |
| Invertido | WD | Invert | amplify → retain roll (through middle) | per central-mid fielded |
| False Winger | WM | Drift | amplify → possession split (light) | per KEEP-tilt |
| Mediapunta | AM | Link | generate → chance from a retained slot | per KEEP-tilt |
| Target Forward | CF | Hold-Up | dampen-variance → the converted chance | per KEEP-tilt |

### PRESS — Gegenpress (6)

| Role | Pos | Action | verb → target | gate |
| -- | -- | -- | -- | -- |
| **Tuttocampista ★** | CM | All-Action | deny → opp retain (force turnover); on turnover, generate → chance (~50%) | per PRESS-tilt |
| Stopper | CD | Step-Out | amplify-inverse-power → opp biggest CREATE threat, if own DEF clears it | per PRESS-tilt |
| Wing-Back | WD | Pin | deny → **opposite** slot's CREATE/FINISH; if lane light, amplify → own CREATE | (positional) |
| Carrilero | CM | Shuttle | restore-energy → **in-front** slot occupant | per PRESS-tilt |
| Tornante | WM | Drop | amplify → **behind**-slot DEF, debited from **in-front**-slot ATT (same lane) | (positional) |
| Spearhead | CF | Lead Line | deny → remove one opp possession slot | per PRESS-tilt |

### CREATE — Joga Bonito (9)

| Role | Pos | Action | verb → target | gate |
| -- | -- | -- | -- | -- |
| **Trequartista ★** | AM | Joga Bonito | amplify → shot volume | per CREATE-tilt |
| Regista | DM | Quarterback | generate → 1 guaranteed chance/period | **while NOT under Attack posture** |
| Segundo Volante | DM | Drive | amplify → chance creation | under Attack posture |
| Playmaker | CM | Thread | amplify → chance quality (half→big) | per CREATE-tilt |
| Touchline Winger | WM | Whip-In | generate → chance | per finisher (FINISH-capable role) in the front line |
| Enganche | AM | Create Space | deny → opp central-mid (DM/CM) DEF contribution | per CREATE-tilt |
| Advanced Winger | WF | Outlet | generate → dead-ball probability | per CREATE-tilt |
| Wide Playmaker | WF | Deliverer | amplify → set-piece conversion (enable + tier-scale) | per CREATE-tilt |
| Falso Nove | CF | Drop Deep | amplify → **in-front** slots' ATT (WF-L/WF-R in 4-3-3) | (positional) |

### BREAK — Counter (8)

| Role | Pos | Action | verb → target | gate |
| -- | -- | -- | -- | -- |
| **Ball-Winner ★** | CM | Destroy | deny → opp shot volume; ~50% generate → chance on the kill | per BREAK-tilt |
| Sweeper | CD | Sweep | dampen-variance → back-line events | per BREAK-tilt |
| Anchor | DM | Shield | amplify → **behind**-slot DEF (the CD line) | (positional) |
| Interceptor | DM | Telegraph | deny → opp chance (~50% kill); on kill, generate → guaranteed counter chance | per BREAK-tilt |
| Water-Carrier | DM | Support | restore-energy → **in-front** slot (CM ahead) | per BREAK-tilt |
| Volante | DM | Surge | generate → chance | if a turnover occurred this period |
| Mediano | CM | Stifle | deny → opp CREATE | per BREAK-tilt |
| Wide Cover | WM | Track-Back | amplify → **behind** WD DEF, debited from **opposite** wide ATT | (positional) |

### FINISH — Clinical (7)

| Role | Pos | Action | verb → target | gate |
| -- | -- | -- | -- | -- |
| **Prima Punta ★** | CF | Assassin | amplify → conversion | per FINISH-tilt |
| Mezzala | CM | Snapshot | dampen-variance → conversion on half-chances (lift low-xG efforts) | per FINISH-tilt |
| Incursore | AM | Late Arrival | amplify → conversion; **aerial** shooter (converts SP delivery) | per CREATE-tilt |
| Shadow Striker | AM | Ghost | amplify-variance → conversion | per FINISH-tilt |
| Inverted Winger | WF | Cut In | amplify → conversion | per wide role fielded |
| Wide Target Forward | WF | Post Up | generate → **aerial** chance (asShooter, big-tier) off SP delivery | per FINISH-tilt |
| Seconda Punta | CF | Interplay | amplify → own ATT | if **beside** another front-line role |

### STOP — Catenaccio (7)

| Role | Pos | Action | verb → target | gate |
| -- | -- | -- | -- | -- |
| **Centrale ★** | CD | Skipper | amplify → back-line DEF term | per STOP-tilt |
| Marshal | GK | Command | deny → opp FINISH term | per STOP-tilt |
| Sweeper Keeper | GK | Rush Out | deny → opp CREATE term | per STOP-tilt |
| Shotstopper | GK | Safe Hands | stop → cancel one **big**-tier chance (p-armed) | per STOP-tilt |
| Colossus | CD | Titan | amplify → **aerial** (set-piece defence) | per STOP-tilt |
| Fullback | WD | Overlap | amplify → **in-front** slot (WM) ATT when it tucks in | (positional; STOP/attack tension — flagged) |
| Aux CB | WD | Tuck In | dampen-variance → back-line events | per STOP-tilt |

Contest supply (corrects §3.1): **CREATE 9 · KEEP 8 · BREAK 8 · STOP 7 · FINISH 7 · PRESS 6** (Seconda Punta moved CREATE→FINISH).

---

## 6. Set pieces = a CREATE-fed scoring path with an aerial pool (§7)

* **Outlet** (Advanced Winger) — `generate → dead-ball prob`, per CREATE-tilt. No CREATE, no volume — this *is* §7.1's cost (the wall must buy CREATE to get set pieces).
* **Deliverer** (Wide Playmaker) — enables + tier-scales conversion, per CREATE-tilt.
* **Aerial attackers** — Wide Target Forward, Incursore (both FINISH), and a designated aerial CF attack the delivered chance off the **aerial** keyword (DEF-keyed).
* **Aerial defence** — Colossus (STOP) contests the opponent's dead-balls.

This gives the **Set-Piece manager** a real build (Outlet + Deliverer + aerial shooters +
Colossus), which the manager sim couldn't test when `stopbus` was the only set-piece squad.

---

## 7. Implementation notes for the A rebuild

Actions map to existing primitives except where flagged — these are the new primitives the
six-contest resolution must expose (`CARD_SYSTEM_V2_CHANGES.md` §1):

* **contest-dial targets** (amplify/deny → KEEP/CREATE/BREAK/FINISH/STOP/possession) — the
  core new primitive; replaces "amplify @ window".
* **retain roll** (Pivote, Distributor, Tuttocampista, and the KEEP↔BREAK coupling) — the
  per-slot retain Bernoulli.
* **chance-quality manipulation** (Playmaker half→big; Mezzala low-xG lift) — already present
  in legacy (`quality: 'half'|'big'`, xG); port to the rebuild.
* **positional** `who` (in-front/behind/beside/same-lane/opposite) — `lane-ahead`/`band-behind`
  exist; add `beside`, `same-lane`, and cross-team `opposite`.
* **aerial keyword** on chance/buff traits (Colossus, Wide Target Forward, Incursore, CF).
* **posture read** (Regista ¬Attack; Segundo Volante Attack) — postures exist; the six-contest
  model keeps posture as a gate, not a resolver.

---

## 8. Deferred to sim (post-A-rebuild)

* Link / Hold-Up kept **small** — KEEP must not substitute for CREATE (Joga redundancy risk).
* **Turnover→chance conversion cap** — Ball-Winner + Interceptor + Volante stack on the same
  turnover events, and KEEP↔BREAK pours more in. Needs a ceiling.
* **Full parity re-check** — the retain roll and the positional layer shifted throughput; the
  BASE 36 / coef 0.6 / +2/+1 tune must be re-confirmed once the A engine exists.
* **FINISH floor** now sits on Mezzala (Snapshot) + Prima Punta's Legendary rider — confirm
  that's enough, or restore a base floor.
* **Gambler win-con** needs the amplify-variance build (Shadow Striker / Playmaker-boom).
* **PRESS has no dedicated manager** — add a high-line/"Heavy Metal" manager or fold into Chaser.
