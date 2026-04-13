# Kickoff Clash — Day 1 Baseline

**Date:** 2026-04-13
**Owner:** kickoff-clash PO
**Purpose:** Honest snapshot of repo state before any execution work. This is the grounding document for the first ROADMAP.

The baseline was produced via: `npm install`, `npm run build`, `npm run lint`, `npm run dev` (boot test), and a Node harness (`scripts/match-harness.ts`) that drives `match-v5` end-to-end against real character data.

---

## Works

| Area | Evidence |
|---|---|
| **Production build** | `npm run build` succeeds in ~12s (Next.js 16 + Turbopack). Zero TypeScript errors. One route (`/`). |
| **Dev server** | `npm run dev` boots in 2.9s on :3001. HTTP 200 on `/`, 20KB HTML returned. |
| **Character data pipeline** | `public/data/kc_characters.json` → 500 characters → `transformAllCharacters()` → 500 `Card[]` without error. IDs 1–500, `card.power = char.level`. |
| **Match Engine V5** | End-to-end 5-increment match resolves deterministically under a seed. `initMatch` → `commitAttackers` → `evaluateSplit` → `getOpponentBaselines` → `resolveIncrement` → `advanceIncrement` → `getMatchResult` all function. Harness output captured. |
| **Personality resonance** | Tier 3 + Tier 4 (Perfect Dressing Room) fire correctly at match start. Harness saw `Silk (3× Maestro) + Siege Mentality (3× Captain) + Perfect Dressing Room` with 1.72/1.80 multipliers. |
| **Synergy system** | Attack, defence, and cross synergies all fire per increment in the harness (1–2 each per increment). |
| **Commentary generator** | Produces varied flavor text (`generateGoalText`, `generateChanceText`) seeded deterministically. Real output in harness. |
| **Fatigue model (§9.1)** | Glass/Phoenix attackers fatigue. Harness saw 3 injuries across 5 increments on top-power attackers. |
| **Run state serialization** | `GameShell.tsx` serializes/deserializes `RunState` to localStorage via `kickoff-clash-v4-run` key. Stripping non-serializable compute functions (jokers, tactics) and rehydrating on load. |

---

## Stubbed / partial

| Area | State |
|---|---|
| **Lint** | ESLint 9 migration not done. `npm run lint` errors out: *"ESLint couldn't find an eslint.config.(js\|mjs\|cjs) file."* The repo uses the old flat-config expectation. No CI linting is happening. |
| **Design docs outside MATCH_ENGINE_V5.md** | `design/README.md` and `design/ROADMAP.md` describe the pre-rename fbal era (Python, Flask, Godot port, `local-dev` branch). `design/PRD.md`, `Football_PRD_v2.md`, `QUICK_REF.md`, `GETTING_STARTED.md`, `OPPONENT_AI_PATCH.txt` unreviewed — may be partially valid, partially stale. |
| **Package scope** | `package.json` name is still `@chief-scout/kickoff-clash`. Cosmetic, but semantically misleading post-rename. Flagged to PM. |
| **Port convention** | Dev runs on :3001 to avoid chief-scout at :3000. Convention only — no enforcement. |
| **Remaining deck** | Harness passed `remainingDeck: []` — the draw-from-deck path during discards exists in `match-v5` but wasn't exercised in baseline. |

---

## Broken / zombie

| Area | What's wrong |
|---|---|
| **v2 match engine in `scoring.ts`** | `createMatchState`, `advanceMatchState`, `resolveRound`, `calculateXIStrength` (lines 555, 809, 922, 959, 1029+) are the old v2 engine. All live callers are commented out (`/* ... */` blocks in `run.ts` at 761–813 and 815+). `run.ts:12` still imports these as live symbols, so they get bundled but are unreachable. **Dead weight, not broken.** Cleanup candidate, not blocker. |
| **Deprecated hand-evaluation layer** | The `@deprecated` comments in `run.ts` reference *"evaluateHand + resolveMatch from hand.ts"* as the replacement for v2 — but v5 then replaced that. `hand.ts` may still host an intermediate engine layer that's also dead. Needs a grep-and-audit pass. |
| **Lint config** | See stubbed row above — this is genuinely broken, not just stale. `eslint.config.js` is missing. |

---

## Balance findings from the harness

These are numbers I pulled from a single deterministic run (seed 12345, top-11-by-power XI, 4-3-3, tiki-taka, vs round-1 opponent Balanced). They confirm the §11.2 warning in `MATCH_ENGINE_V5.md` and add a few new observations.

### Power range compression is real

- **Power spread:** 71–95 across all 500 cards (as flagged in §11.2).
- **Top-11 XI total base power:** ~1030.
- **Typical attack score per increment:** 900–1200 (after personality, synergy, style mods).
- **Round-1 opponent defence baseline:** 450.
- **Attack ratio:** 2.0–2.7x opponent defence, **every single increment**.
- **Resulting goal chance:** pinned to the 0.45 ceiling in 4 of 5 increments. The only variation came from the 90' drama multiplier and personality mods, not from card choice.

**Implication:** with a good deck against a round-1 opponent, the goal-chance formula has no headroom to express card-quality differences. The player's decisions don't meaningfully move the needle because the cap is always hit. This is the mechanical consequence of §11.2, now observed concretely. **Widening to 50–99 is not cosmetic — it's unblocking.**

### Personality bonuses stack aggressively

- Top-11 by power accidentally built **three simultaneous resonances** plus Perfect Dressing Room. 1.72× attack, 1.80× defence.
- `MATCH_ENGINE_V5.md §5.4` reduced Perfect Dressing Room from 2.0× to 1.5× specifically to stop it dominating — but when three tier-3 themes stack *on top of* the tier-4 multiplier, the combined effect is ~72–80% uplift.
- **Implication:** a diverse top-tier deck is both the best-scoring and the best-personality deck. The trade-off the design doc implies (raw power vs. diversity) may not exist in practice because the top of the power curve contains enough archetype diversity to trigger everything.
- **Needs:** numbers-first check at varied power bands. Is this a top-end anomaly or a design bug?

### Archetype distribution is uneven

From the 500-character generation:

| Archetype | Count | % |
|---|---|---|
| Creator | 84 | 16.8 |
| Engine | 83 | 16.6 |
| Striker | 47 | 9.4 |
| Cover | 45 | 9.0 |
| Destroyer | 44 | 8.8 |
| GK | 34 | 6.8 |
| Commander | 32 | 6.4 |
| Powerhouse | 32 | 6.4 |
| Controller | 28 | 5.6 |
| Target | 27 | 5.4 |
| Passer | 19 | 3.8 |
| Sprinter | 18 | 3.6 |
| **Dribbler** | **7** | **1.4** |

**Dribbler is effectively a rumor archetype.** At 7 across 500, the Skill Show synergy (2× Dribbler attacking) is basically impossible to draw. Same pressure on Passer (19) and Sprinter (18) for Passing Carousel and Lightning Strike, though those are more draftable.

Meanwhile Creator (84) means Creative Spark (2× Creator attacking) is almost guaranteed in any reasonable hand — it fired in the first increment of the baseline run.

**Implication:** content-side imbalance that punishes the underweight archetypes and trivializes the overweight ones. This is a content-generation issue, not an engine issue, but it surfaces through the engine. Worth re-running `kc_characters.json` generation with archetype floor targets.

---

## Package.json oddities

- Name: `@chief-scout/kickoff-clash` (scope inherited from pre-rename, not necessarily wrong but semantically drifting).
- `next: 16.1.6`, `react: 19.2.3` — leading-edge.
- `tailwindcss: ^4` — v4, very new.
- Scripts: `dev`, `build`, `start`, `lint` — no `test`, no `typecheck`, no `check`. Nothing runs in CI.
- 3 vulnerabilities flagged on install (1 moderate, 2 high). Not investigated.

---

## Priority ordering for the first ROADMAP

Based on this baseline, the `Now` section of `ROADMAP.md` should be:

1. **Power range widening (§11.2).** Not cosmetic. Unblocks meaningful card-choice impact on goal chances.
2. **Personality multiplier audit.** Reduce or gate tier-3 themes so a max-diversity XI doesn't accidentally unlock everything simultaneously. Numbers first, decision after.
3. **Dead code removal.** Delete v2 engine from `scoring.ts`, delete dead imports from `run.ts`. Audit `hand.ts` for the intermediate "hand evaluation" layer mentioned in the deprecation comments.
4. **Archetype distribution rebalance** in `kc_characters.json`. Target floors: Dribbler ≥ 20, Passer ≥ 25, Sprinter ≥ 25. Could be a one-time regen with seed control.
5. **ESLint 9 migration.** `eslint.config.js` from scratch, Next.js preset. Unblocks `npm run lint` and any future CI gating.
6. **Stale design doc archive.** Move fbal-era docs to `design/archive/` so grep/search isn't polluted.

Everything else moves to `Next` or `Later`.

---

## What the baseline did NOT verify

- UI interaction flow end-to-end (title → setup → pack → match → post → shop → next match). I drove the engine directly, not the UI, so phase transitions, shop logic, pack opening animations, and save/resume round-tripping are still unverified.
- `remainingDeck` draw path (discards fishing for cards).
- Joker activation paths (no jokers passed to the harness).
- Supabase persistence beyond localStorage (the Supabase client is wired in `src/lib/supabase.ts` but call sites weren't walked).
- Mobile / responsive layout.
- Production build output actually running (`npm run start`).

These should be knocked off in Week 1 Day 2 before the ROADMAP burn-down starts.

---

## One-line summary

**Kickoff Clash has a working v5 match engine and a clean build. The biggest risks are balance compression and content distribution — both numeric and both fixable. The next-biggest risk is documentation drift, which a single archive commit will resolve. Neither blocks playability. The project is in considerably better shape than the backlog suggested.**
