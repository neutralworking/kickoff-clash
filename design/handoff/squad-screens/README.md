# Handoff: Kickoff Clash — Team Selection & In-Match Screens

## Overview
This bundle specifies the **squad-management surface** of Kickoff Clash: the team-selection ("NAME YOUR SQUAD") screen and the in-match screen. The design lives in `Team Selection.dc.html`. It supersedes the old screens whose problems were: vanity AVG/CHEM stats, no visible link between squad choices and match strength, dead space in the scout/manager/tactic chrome, and a cramped mobile pitch. **The whole thesis: the player must see how each decision moves the score.**

Team selection is explored as **three directions** (side-by-side, id badges `1a`/`1b`/`1c`); the chosen direction is **1a (Dual Bars)**. The **Match** screen (green `MATCH` badge) is the reconciled in-match view built from the same parts. Build from **1a + Match**; `1b`/`1c` are kept only as alternative contest visualisations.

## About the Design Files
These are **HTML design references**, not production code. The target app is **Next.js 16 + React 19 + Tailwind v4** (`GameShell.tsx` orchestrates phases `setup → reveal → match → …`). Recreate these screens with the codebase's own components/tokens. The `.dc.html` runs on a bespoke prototyping runtime (`support.js`) — **do not port that runtime**; port the *design*, and the plain-JS logic (contest maths, competence model, seeded sprite) is the part worth lifting closely.

## Fidelity
**High-fidelity** for layout, tokens, the token/gem anatomy, the contest model, and interactions. Copy is placeholder where noted (player names, log lines, tactic names).

## Screens

### A. Team Selection — "NAME YOUR SQUAD" (build 1a)
Top-to-bottom, mobile portrait (single column, screen width 432 in the mock):
1. **Header** — "NAME YOUR SQUAD" + "XI 11/11 · BENCH n/7" (left), **KICK OFF** primary button (right, amber gradient). **No AVG. No CHEM** — both cut.
2. **Projected Contest bar (the hero)** — replaces the vanity stats. Two horizontal meters, **ATK** (amber) and **DEF** (blue), each: your value, `v {oppValue}`, and a signed delta (green positive / red negative). A **NET** readout with a **Δ-vs-balanced** badge (▲/▼). Bars animate (width transition, expo-out ~450ms) whenever the squad or intent changes — this is the "impact" feedback.
3. **Control strip** — **SHAPE** pill (4-3-3) + **INTENT** segmented control (DEF / BAL / ATT). Intent is not cosmetic: it **re-splits ATK/DEF** live (ATT ×1.15 ATK / ×0.88 DEF; DEF the inverse; BAL ×1). Toggling visibly moves the bars and NET.
4. **Scout + Manager** — collapsed to just **names** ("SCOUT: FC WARM-UP · MGR FALK") with a `▾ report` affordance to expand. This reclaims the old dead space.
5. **MISFIT chip** — e.g. "⚠ 2 MISFIT", **tap-to-reveal**: toggles an amber outline on the offending tokens on the pitch.
6. **Pitch** — mown-stripe CSS turf with the XI as **tokens** (see Token anatomy). Formation-positioned by %.
7. **Bench** — **one combined row**; the **BENCH ▸ EDIT** label opens the **sub-picker drawer** (overlay sliding up from the bottom) listing available players with competence colouring and a `+` to name each to the bench. AUTO / FILL / CLEAR quick actions.

Alternative contest treatments (same data, for reference): **1b Tug-of-war** (two-sided meters pushing a centre line) and **1c Scoreboard + Top-Contributors ledger** (ranks the XI by contribution).

### B. In-Match Screen (build: Match)
Reconciled to reuse the exact team-selection parts:
1. **Match top bar** — KICK OFF / clock `00:00` (left), score `0 – 0` between "YOUR XI" and opponent (centre). **PWR removed** (was redundant with the contest bar).
2. **Contest** — same ATK/DEF meters, but **no title**, condensed, and **NET moved to the right end** of the module (a bordered column beside the per-line +/− deltas).
3. **Match log** — 3 condensed lines: a time/marker glyph (amber for events, red ⚠ for penalties) + text. Wired to the same effects shown on the pitch (e.g. OKAFOR Rally, QUINTERO misfit −2), so the log explains the contest numbers.
4. **TACTICS** — the play row (was "Call a Play" — relabelled; "Call a Play" read too American). Each play is a compact chip: name + charge pips, left-accented in its category colour (specialist purple, defensive blue, attacking red, etc.). `DETAILS ▸`.
5. **Shape + Intent** — same controls.
6. **Pitch** — same tokens, on a **larger pitch** (taller than team-selection; the old match pitch was too small/cramped on mobile).
7. **Bench drawer** — you **cannot edit the bench after kick-off**. The edit affordance is replaced by a **handle indicator** ("≡ BENCH · 7 SUBS ▸") that opens a **view-only drawer** of subs. Opening the drawer **does not overlay the pitch**: it **hides the TACTICS section and pushes the pitch up**, then shows the drawer inline above the action row.
8. **Actions** — VIEW OPP (ghost) + **KICK OFF →** (primary).

## Player Token (pitch) — anatomy
No player picture on the pitch (dropped deliberately — the kit is uniform, so faces don't differentiate at this size). ~68px wide, rarity-framed, four zones:
- **Top row**: **class gem** (left, circular, class-coloured ring + glyph) and **position** (right) shown inside a **competence indicator** — the pill's **background colour encodes competence in the assigned slot**: **green = primary** position, **yellow = secondary**, **red = incompetent** (a "misfit"). This is the single most important new mechanic on the token.
- **Power row**: a split bar — **left half ATT** (orange), **right half DEF** (blue), each with its value. This pair is collectively called **Power**. **Buffs/debuffs from other cards show as a small signed number** over the affected half: **green for a positive change, red for negative** (e.g. an adjacent Rally = green +1 ATK; a misfit = red −2 DEF).
- **Fitness bar**: thin, **no label**, coloured green ≥85 / amber ≥55 / red below.
- **Name**: one row at the bottom.

The full detailed **player card** (portrait, action text, season record) is a separate spec — see the player-card handoff. On the pitch, the token is the compact form.

## Competence model
Each player has a `competence` for the slot they occupy: `primary | secondary | incompetent`. Colours: primary `#2f8f4e` (text `#eafaef`), secondary `#d99a2b` (text `#1a1206`), incompetent `#b23b2f` (text `#ffe8e6`). **Incompetent count = the MISFIT count** shown in the header chip.

## Contest maths (port this)
Per-player contribution is `atk × wA[pos]` (attacking weight) and `def × wD[pos]` (defensive weight), summed across the XI, **plus any card buffs**. Weights (position → weight):
- `wA`: CF 1.0, WF .82, AM .72, CM/WM .52, WD .36, DM .32, CD .16, GK .05
- `wD`: GK 1.0, CD .95, WD/DM ~.8, CM/WM .5, AM .3, WF .26, CF .15

Intent multiplier on the team totals: `ATT {atk×1.15, def×0.88}`, `BAL {1,1}`, `DEF {atk×0.88, def×1.15}`. Opponent has fixed `oppAtk`/`oppDef`. **ATK line** = teamATK vs `oppDef`, delta = teamATK − oppDef. **DEF line** = teamDEF vs `oppAtk`. **NET** = dATK + dDEF. The **Δ badge** = NET − NET-at-balanced. Bar fill % = `you / (you + oppValue)`.

## Design Tokens
- **Fonts**: **Silkscreen** (all display/labels/numbers — names, stats, chips), **DM Sans** (body/log/notes), **Playfair Display** italic (flavour, unused here). Note: this pixel display face is a deliberate deviation from the system's Archivo Black for the retro card treatment.
- **Surfaces**: screen felt `linear-gradient(#0d1e12, #0a1710)`; panels `linear-gradient(#14231a, #0e1a13)`; leather chips `linear-gradient(#1c1610, #120d07)`; ink border `#0b0703`; hairline `rgba(154,139,115,0.15)`.
- **Text**: cream `#f2ead6`, cream-soft `#c9bb95`, dust `#9a8b6a`.
- **Accents**: primary CTA amber `linear-gradient(135deg,#f5a623,#e8621a)`; ATK orange `#e8621a`/`#ff8f6a`; DEF blue `#3d7bd6`/`#8fb6ff`; positive `#3ba55d`, negative `#e0605a`.
- **Class colours**: Creator `#a855f7`, Finisher `#f2c14e`, Destroyer `#e23b35`, Controller `#4a9eff`, Engine `#e8621a`, Wall `#4a8f6b`.
- **Position colours** (for reference elsewhere): GK amber, CD/WD blue, DM/CM/WM green, AM purple, WF yellow, CF red.
- **Pitch**: `repeating-linear-gradient(180deg, #3f9a58, #398f51)` mow bands + white lines at `rgba(255,255,255,0.12–0.18)`.
- **Radii**: screen 22, panel/card 12–13, chip 6–8, gem 50%. **Motion**: expo-out `cubic-bezier(0.22,1,0.36,1)`, 150–450ms; never bouncy.

## Interactions
- **Intent toggle** → recomputes + animates the contest bars and NET (both screens share the model).
- **MISFIT chip** (team selection) → toggles amber outlines on incompetent tokens.
- **BENCH** → team selection opens a **sub-picker overlay** (editable, `+` to assign); match opens a **view-only inline drawer** that hides TACTICS and pushes the pitch up (no edits after kick-off).
- All handlers are demonstrative in the prototype; wire to real squad state in production.

## Files
- `Team Selection.dc.html` — the prototype. Build from **1a** (team selection) and the **Match** section; `1b`/`1c` are alternative contest visualisations. Logic (contest maths, competence map, class map, seeded sprite, pools) is in the `<script data-dc-script>` class near the bottom.
- `support.js` — prototyping runtime only; **do not port**.

## Open items / next
- Bench-drawer *open* state on the match screen (pitch-up + tactics-hidden + subs list) is wired but wants a final visual confirmation.
- Scout/manager expanded "report" panel is stubbed (names + affordance only) — needs its own spec.
