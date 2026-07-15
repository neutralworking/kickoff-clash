# MANAGER_ROSTER_V2 — 14 managers, famous-style mapping

> Mirrored from the Linear doc on NW-140 (2026-07-15). Owner-authored; this
> copy is the repo reference. Real-manager references are design shorthand
> only and NEVER ship (likeness); fictional names are placeholders.

**Status:** supersedes the `SYNERGY_MODEL_V1` §4 roster (10) and the
`src/engine-v2/managers.ts` data (11). All tilt/buff values **indicative**
pending a magnitude sim pass. Resolution model decided (§3).

## 1. Roster

| # | Archetype | Meta | Fictional (placeholder) | Posture · Formation | Buff (indicative) | Gate / mechanic |
| -- | -- | -- | -- | -- | -- | -- |
| 1 | POMO | STOP · Direct | Dean Prowse (ENG) | defend · 4-4-2 | All players +1 DEF; your chances gain quality (fewer, better) | STOP commitment |
| 2 | Anti-Football | STOP · Wall | Vittorio Scudieri (ITA) | defend · 5-3-2 | All players +1 STOP +1 DEF | STOP commitment |
| 3 | Tiki-Taka | KEEP | Oriol Casals (ESP) | balanced · 4-3-3 | All players +2 KEEP | KEEP commitment |
| 4 | Gegenpress | PRESS · Attack | Falko Rehberg (GER) | attack · 4-3-3 | Forwards +1 PRESS +1 CREATE +1 FINISH | PRESS commitment |
| 5 | Box Office | FINISH · Showman | Duarte Vilaça (POR) | balanced · 4-2-3-1 | All players +1 FINISH; bigger win payouts; "lowers pressure" flavour TBD | FINISH commitment; economy-adjusted acceptance |
| 6 | Tinkerman | CREATE · Rotation | Aurelio Benti (ITA) | balanced · 4-4-2 | Incoming substitute gains natural tilt +2 for the match | CREATE commitment; substitution events |
| 7 | Cholismo | BREAK · Grind | Emiliano Roldán (ARG) | defend · 4-4-2 | Defenders +1 STOP; all players +1 BREAK | BREAK commitment |
| 8 | Murderball | PRESS · Attrition | Aníbal Cornejo (ARG) | attack · 3-4-3 | All players +1 PRESS +1 CREATE; **squad fitness cost every match (own-drain)** | PRESS commitment |
| 9 | Fergie Time | FINISH · Late | Alistair Craddock (SCO) | balanced · 4-4-2 | All players +1 FINISH, **doubled in the final third of the match** | FINISH commitment; clock-band gate |
| 10 | The Entertainers | FINISH · Chaos | Ronnie Fairweather (ENG) | attack · 4-2-4 (or 4-3-3 if 4-2-4 not in set) | Attackers +2 FINISH; defenders −1 STOP | FINISH commitment; downside is structural, not a verb |
| 11 | Total Football | KEEP · Fluid | Maarten Roos (NED) | balanced · 3-4-3 | All players +1 KEEP +1 CREATE; off-position and stretch-tilt penalties waived squad-wide | KEEP commitment |
| 12 | Set Pieces FC | STOP · Aerial | Gordon Blackwood (SCO) | defend · 5-4-1 | Aerial-keyword cards +1 CREATE; set-piece chance quality up (SP_base bump) | **buildCount(aerial) ≥ N** — payoff gated on the aerial build, not stopbus |
| 13 | Wheeler-Dealer | Economy | Les Hornby (ENG) | balanced · **no preferred formation — all formations count native (perk)** | Cash bonus on results; discounted shop refreshes; **no contest reweight** | Results-gated; economy-adjusted acceptance |
| 14 | Joga Bonito | CREATE · Flair | Otávio Bragança (BRA) | attack · 4-3-3 | MID+ATT +1 CREATE; first converted chance from a **stretch-tilt** card → +1 CREATE to all players for the rest of the match; no defensive compensation anywhere | CREATE commitment; stretch-conversion trigger |

Contest coverage: KEEP ×2 (3, 11) · PRESS ×2 (4, 8) · CREATE ×2 (6, 14) · BREAK ×1 (7) · FINISH ×3 (5, 9, 10) · STOP ×3 (1, 2, 12) · Economy ×1 (13).

**Formation × scope interlock:** line-scoped buffs are worth headcount ×
magnitude, so each manager's preferred formation maximises his own buff scope.
Playing his formation pays twice — full headcount and native adherence; a
foreign formation loses both.

## 2. Design rules

* **No-unconditional law holds.** Every buff pays only behind its gate —
  contest commitment for most, buildCount for Set Pieces FC, results for
  Wheeler-Dealer.
* **Scope is the differentiation lever.** Buffs target squad / line / role /
  keyword / event. Two managers on the same contest must differ in scope or
  gate, never only in magnitude.
* **Gate kinds required (4):** clock-band multiplier (9), buildCount(keyword)
  (12), first-stretch-conversion trigger (14), substitution event (6). All are
  event/state reads on the existing engine — zero new resolution terms.
  buildCount and clock-band are reusable by Legendaries and challenge rules.
* **DECIDED — adherence throttles manager buffs**, measured against the
  manager's preferred formation. Wheeler-Dealer's all-native perk is the
  designed exception. Tweak-later: soften band values, not the rule.
* **Retired:** amplify/dampen variance verbs; Fortress accrual; Chaser
  scoreline gate.

## 3. DECIDED — resolution model: translate at lineup time, exceptions per state

Per-player buffs sum into team contest totals whenever the lineup is set **and
on any lineup change** (substitutions alter headcounts). The engine stays
additive-flat; scope only changes the sum. True per-state handling only for:
clock bands (9 — a timed multiplier on the flat term), the stretch-conversion
trigger (14 — one boolean adding a flat CREATE term), fitness drain (8 —
writes to card condition, outside contest resolution). No structural engine
change; magnitudes → sim.

## 4. Old roster mapping (v2 11-roster)

counter-attack → Cholismo · set-piece → Set Pieces FC · fortress → retired ·
tinkerman → Tinkerman · metronome → Tiki-Taka · chaser → retired (→ Fergie
Time) · gambler → retired (→ The Entertainers) · pragmatist → retired ·
taskmaster → Murderball (**own**-drain — the v2 code drains the opponent; port
error) · financier → Wheeler-Dealer · heavy-metal → Gegenpress.

## 5. Cleanup (from the ticket)

* Archive `scripts/managers_ref.json` and `src/engine/data/managers.ts` —
  NOTE (repo check): the parked `src/engine/` test suite imports these, so
  "delete" breaks `npm test`; archive or leave until the parked tree's fate
  is decided.
* Mark `SYNERGY_MODEL_V1.md` §4 roster table superseded by this document.
* Re-sim: old per-manager calibration numbers are void against this roster.
