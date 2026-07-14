# Design Handoff — Comparison-Engine Reframe

> For design sessions outside the repo (Claude.ai etc.). Self-contained: everything needed to design against the July 2026 reframe without codebase access. Source of truth for strategy: `ROADMAP.md` (rewritten 2026-07-13). Branch with all referenced work: `claude/inspiring-hopper-c283pz`.

## 1. The product in one sentence

**Chief Scout is a comparison engine between players past and present.** We identify a player's characteristics, then show who they resemble — among today's players and among the retired greats — and every other feature builds outward from that. The one question the product answers: *"who does he remind you of?"*

Explicit product calls already made (don't re-litigate in design):
- **No first-class compare screen.** `/compare` survives only as an internal modelling workbench ("Comparison Lab"). The consumer surface for comparison is the player profile itself and (future) the home page.
- **Games (Gaffer, Kickoff Clash, On The Plane) are consumers of comparison data, not drivers.** World Cup features are parked — the window closed.
- Comparison **scores are never comparable across lenses** (different math, pools, weights). Never design a UI that ranks a mixed list of match/echo/market results by score.

## 2. The four lenses (the core vocabulary)

Every comparison the engine produces comes through one of four lenses. This is the product's central taxonomy and should become visual language:

| Lens | Question it answers | Candidate pool | Notable payload |
|---|---|---|---|
| **Match** | Who plays like him today? | Current players (opt-in: Hall of Fame) | 11 factors, confidence, top-3 reasons |
| **Replacement** | Who could replace him, like-for-like? | Current players, optional realistic level window | Same 11 factors, different weighting |
| **Echo** | Which player of the past does he echo? | ~9,000 retired players via curated *career phases* ("Peak Robben, Bayern, 2009–2014") | 7 factors + **signed BRS level delta** |
| **Market** | What did comparable players cost? | Real transfer events (last 4 years) | Fee, clubs, window, weighted-median fee |

Key nuance for design: **echo results are career *phases*, not players.** A phase has a label, club context, and year span ("Peak Robben · Bayern · 2009–2014"). One legend can appear as multiple phases. The **level delta** is deliberately separate from the match score — "a Championship Robben" is a *desirable* output: high stylistic match, big negative delta. The UI must let both facts coexist without one undermining the other.

Confidence is a three-band label per result: `strong / partial / indicative`. Products suppress indicative results in headline placements (the identity line already does); workbench surfaces show everything.

## 3. What's already built (design against these, don't reinvent)

- **Unified API**: `/api/players/[id]/comparisons?lens=match|replacement|echo|market`. Every result carries: candidate (name, era `current|historical`, context line, image where known), score 0–1, confidence band, populated-factor count (e.g. 9/11), per-factor breakdown (score, weight, has-data flag), top-3 human-readable reasons, and lens-specific extras (BRS delta, fees, weighted median).
- **`ComparisonIdentityLine`** — new, minimal v1: a one-line card at the top of the scouting profile reading "**PLAYS LIKE** Pedri 87% · **ECHOES** Peak Iniesta · Barcelona · 2008–2012". Currently deliberately plain — this is the single highest-value design target (see §5).
- **`SimilarPlayers`** ("Closest Match") — live players only, compact list rows, sits low on the profile.
- **`PeakComparisons`** — the echo module on the profile; renders phases + self-phases ("career peaks" strip for the player's own history).
- **Transfer comps / valuation panel** — market lens consumer.
- **Comparison Lab** on `/compare` — internal workbench: player search → lens tabs → expandable per-factor bars. Functional, not designed; fine to leave ugly.
- **Featured pairs API** exists (`/api/compare/featured-pairs`) — currently only used by the compare empty state. Available for a home-page hook.

## 4. Current player profile v2 structure (the page being redesigned)

Shipping today, top to bottom: Hero (identity, club, role, level) → single scout-tier paywall gate wraps everything below → **ComparisonIdentityLine** → §3 Context (archetype, scout notes, personality) → §4 Four-pillar strip (Technical/Tactical/Mental/Physical) → §5 Role & position fit (radar) → §6 Key attributes → §7–8 Career/News/Stats tabs → §9 Transfer volatility → *supplementary basement:* PeakComparisons, Valuation + SimilarPlayers grid, grade editor.

**The design problem:** the reframe says comparison is the player's identity, but the two comparison modules live in the basement below nine sections. C1 calls for "player page inversion."

## 5. Design asks, in priority order

1. **The identity line, made first-class.** If comparison is the thesis, "Plays like X · Echoes Y" deserves real visual treatment — today it's a text row. Questions to explore: does it merge into the hero? Player imagery for the comp targets? How do confidence and (for echoes) era/phase context read at a glance? What's the tap/click affordance into the fuller modules? Mobile-first — this is the most-viewed element on the most-viewed page.
2. **Player page inversion.** Bring Peak Comps + Closest Match up from the basement without wrecking v2's (deliberate, recent) 9-section flow. Options range from conservative (move modules to position 2) to radical (a comparison-centric header where pillars/attributes become the supporting evidence *below* the comps). Note: v2 shipped ~3 weeks ago and hasn't been user-validated — there is license to change it.
3. **One comparison result-card pattern across all four lenses.** The unified envelope was built so any lens renders interchangeably. Design the canonical comp card: score, confidence band, era marker, context line, reasons — with lens-specific slots (BRS delta chip for echo, fee for market). This becomes the reusable atom everywhere comparisons appear.
4. **Past-vs-present visual language.** Echoes are the differentiator (nobody else does "past players" credibly). How does *historical* read visually — treatment of era, phase spans, absence of modern imagery for older players? Should echo results feel materially different from match results (sepia/archival vs live), or is that kitsch? Explore.
5. **Comparison-first home hook.** A daily "X echoes Y" pairing on the dashboard (API exists). Small, shareable-feeling, links to both players.

Explicitly **not** asks: compare screen redesign (workbench is fine ugly), game surfaces, WC portal.

## 6. Design system constraints

- **Dark UI.** Tokens in `apps/web/src/app/globals.css`. Text: `--text-primary/secondary/muted`. Surfaces: `card` class + `rounded-xl`, `--bg-elevated`, `--border-subtle`.
- **Accent tokens** (use `--color-accent-*` prefix): technical = gold, tactical = purple `#a855f7`, mental = green, physical = blue `#60a5fa`, personality = yellow. Sentiment: positive `#34d399` / negative `#ef4444`. The tactical purple is the de-facto comparison accent so far (identity line "Echoes" label, lab factor bars).
- **Established idioms**: section headers are 10px bold uppercase tracked muted; numbers are `font-mono`; small confidence/status chips are bordered pills; position badges use `POSITION_COLORS`. Components are shadcn-selective, mostly hand-rolled.
- **Mobile**: bottom nav (5 tabs), profile page is the core mobile surface. Design mobile-first.
- **Tiers**: free → **scout** (whole scouting profile sits behind one `TierGatedSection required="scout"`) → **pro** (scout chat etc.). The identity line is currently *inside* the scout gate. Whether a teaser version shows to free users is an open monetisation question — flag it in designs but the call is the founder's.
- **Positions enum**: GK, WD, CD, DM, CM, WM, AM, WF, CF. Level/peak are 0–100-ish ratings; BRS = best-role score, the single quality number.

## 7. Data honesty constraints (design must accommodate)

- Any factor can be missing ("no data") — confidence and the n/11 populated count exist because coverage is uneven. Don't design layouts that break when reasons are empty, images are missing (most historical players), or only one of the two identity slots resolves.
- Market comps can be *unlinked* (no player page to navigate to) — the name renders as plain text.
- Some players have **zero** comparisons in a lens (missing grades/phases for their position). Empty states matter and should say why, not just "no results."
- News-driven "comparison freshness" ("his pressing now echoes prime Kanté") is Phase C3 — the extraction pipeline behind it is currently stalled. Design may anticipate it (e.g. a "changed recently" affordance) but nothing ships against it yet.

## 8. Roadmap snapshot (for orientation)

- **C0 — data correctness & refocus**: done/in progress (GK archetypes fixed, WC parked, security triage filed).
- **C1 — comparison as the front door**: engine unification ✅, identity line v1 ✅, Comparison Lab ✅. **Open: page inversion, home hook, instrumentation — this handoff.**
- **C2 — characteristics depth**: fingerprint/trait coverage to full Tier-1, era-normalized percentiles, confidence surfaced in UI.
- **C3 — news as comparison signal**: restart extraction pipeline; news shifts traits → comps refresh.
- **C4 — products on top**: replacement finder (pro), Scout AI comparison queries, shortlists from comp sets, monetisation gates (top-3 free / full lenses pro — pending founder approval).

North-star metric: % of Tier-1 profiles (19,059) with a high-confidence comparison set (≥5 comps across both eras, ≥7/10 factors populated) — plus comparison interactions once instrumented (the design work in §5 directly feeds this).
