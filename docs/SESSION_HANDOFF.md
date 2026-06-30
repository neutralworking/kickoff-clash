# Session handoff — Kickoff Clash

> **Read `CLAUDE.md` first, then this.** This file is operational state for resuming work
> in a fresh session; `docs/KICKOFF_CLASH_DESIGN.md` has design precedence.

## ▶ Resume hook (do this first)

You are continuing **Kickoff Clash** (Next.js/React/TS football roguelike). Dev branch is
**`claude/shop-redesign-designer-hpryu4`**, currently **in sync with `main`** (last merge:
PR #26, squash `7a46b4e`). The user has just been handed the **match-screen pass** to
**playtest**.

1. **If the user brings playtest feedback** → triage it, fix on the dev branch, verify
   (gate below), and when they say "merge it" use the **squash-merge recipe** below.
2. **If not** → the next planned work, in priority order, is **3B.4 cup-prize economy
   (#46)**, **3B.6 scout-the-final + polish (#48)**, then the **3C arc levers (#42)** —
   notably the user-requested **5-point intent** (Very Def / Def / Bal / Att / Very Att),
   expanding the 3-point intent toggle just shipped.

---

## Where things stand

- **Branch:** `claude/shop-redesign-designer-hpryu4` — content identical to `main`
  (`git diff main..HEAD` is empty). Develop here; never push `main` directly.
- **Two arcs shipped this session:**
  - **PR #25** — V3.1 Chief Scout **data port** + engine re-grounding.
  - **PR #26** — **match-screen pass** (balance + team-talk UI + intent).

### What shipped — data port (PR #25)
- `public/data/kc_cards.json` — 540 fictional cards from the real Chief Scout
  distributions (no PII). **BRS is power directly** (52–95, avg 69); `levelToPower`
  bypassed. `transform.transformCards()` bridges it; `run.ALL_CARDS` reads it.
- Archetype skew fixed (Dribbler 1.4%→8.1%, Creator 16.8%→12%).
- `role-transforms.ROLE_ALIASES` → 100% dispatcher role coverage on the authentic
  `best_role` names.
- Curves re-grounded for the (weaker) pool: `opponent.ROUND_POWER = [62,68,73,78,82]`,
  `CUP_FINAL_POWER = [48,53,58,63,67]`, `OPENER_DROP = 18`. cup-sweep: **STRONG rotate
  ~37% champions**, rotate > best-xi. Personality `attackMod` peaks 1.29 (cap 1.30).

### What shipped — match-screen pass (PR #26)
- **Scrappy starter** (`packs.RIP_RARES = 6`): Common-heavy + 6 Rare anchors, no
  Epic/Legendary. Opening XI ~70 (was ~74), clears cup 1 ~82% but stalls ~cup 2.7
  unaided → the shop is the upgrade path. Tuned on `scripts/starter-probe.ts`.
- **Subs work anytime** (`match-v5.makeSub` no longer first-half-gated) +
  `match-v5.subBlockReason()` → UI toast instead of silent no-op.
- **Auto-select**: `team-select.autoFillXI()` (fitness-aware best XI). UI **AUTO XI**
  button gated to the **pre-kickoff** break only (no free mid-match subs).
- **Cumulative stats**: `match-v5.cumulativeStats()` → match-to-date totals beside the
  per-period figures.
- **Assistant**: `assistant.coachNotes()` → weakness / fitness / tactics / momentum reads.
- **In-break UI** (`MatchPhase.tsx` + `match/PitchMatchView.tsx`): coach panel, toast,
  cumulative stat pairs, prominent SHAPE/TACTICS row, and an **ATT/BAL/DEF intent toggle**
  (engine reads `state.intent` fresh each increment, so it bites next period).

> **"Team talk" = the in-match break** (kickoff / half-time / between periods). The user
> confirmed this. The *separate between-ties* Team Talk phase (3B.5, #47) is **NOT built** —
> `GameShell` routes straight back to `match` between cup ties (see comment ~`GameShell.tsx`
> "the Team Talk lives here (Phase 3B.5)").

---

## Pending work (prioritized)

| Pri | Task | Notes |
|---|---|---|
| 1 | **Playtest feedback** | The user is testing PR #26; expect tuning requests. |
| 2 | **3B.4 cup-prize economy** (#46) | 40% match purse + 1.5× trophy on cup win. `economy.ts` / `run.ts`. |
| 3 | **3B.6 scout-the-final + polish** (#48) | Let the player scout the cup final from cup start. |
| 4 | **3C arc levers** (#42) | **5-point intent** (Very Def…Very Att) is the headline; also out-of-position penalty, convexity, thin-cell exploit, opponent counter. |
| — | Formation Collection cards (#35, deferred) | Cosmetic, free. |
| — | Between-ties Team Talk phase (3B.5, #47) | Bigger build; only if the user wants a between-matches screen. |

---

## ⚠ Workflow gotchas (read before committing/merging)

- **Commit trailers (required):**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018ZSk3Zibg3MAxfuzc6f6Pu
  ```
  Set `git config user.email noreply@anthropic.com && git config user.name Claude` or the
  stop-hook flags commits "Unverified". (Update the Claude-Session URL to the new session.)
- **Squash-merge recipe** — this repo squash-merges the long-running dev branch, which makes
  it diverge from `main` on SHA (the branch is always the **content superset**). On "merge it":
  1. `git fetch origin main`
  2. (optional dry-run merge — conflicts are always "main = older squash, branch = newer")
  3. `git merge origin/main -X ours --no-edit` **on the branch** (favors the branch on
     conflicts; pulls in any main-only non-conflicting changes)
  4. verify gate, then `git push -u origin <branch>`
  5. `mcp__github__create_pull_request` (base `main`) → `mcp__github__merge_pull_request`
     with `merge_method: squash`
  6. sync local `main`, confirm `git diff main..HEAD` is empty.
- **Don't create PRs** unless the user says "merge it" (the repo's merge mechanism = PR).
- **`AskUserQuestion` and `Workflow` tools FAIL** in this env ("permission stream closed").
  Don't rely on them — state sensible defaults in plain text and proceed, or ask inline.
- **Model identity:** `claude-opus-4-8`, undercover mode — never put the model id in commits,
  PRs, or code.
- **GitHub:** no `gh` CLI — use `mcp__github__*` tools. Repo scope: `neutralworking/kickoff-clash`.

## Verify gate (run before every commit)

```bash
npx tsc --noEmit        # type check
npm run lint            # eslint
npm run build           # next build (also type-checks)
npx tsx scripts/verb-dispatcher-harness.ts   # engine acceptance (ALL CHECKS PASSED)
npx tsx scripts/match-harness.ts             # match smoke (harness OK)
```

**Balance instruments** (use these, not byte-determinism, when tuning meta):
`scripts/balance-sweep.ts` (Foundation single-match), `scripts/cup-sweep.ts` (full 20-match
cup runs, best-xi vs rotate), `scripts/power-probe.ts` (opponent-power → win-rate curve),
`scripts/starter-probe.ts` (starter-rip strength).

## Key calibration facts (don't re-derive)

- Pool: power **52–95, avg 69**. Personality uplift capped **1.30** (peaks ~1.29).
- cup-sweep STRONG **rotate ~37%** champions; rotation clearly beats best-XI.
- Starter XI **~70 avg** (was ~74); clears cup 1 ~82%, stalls ~cup 2.7 with no shop.
- Intent is engine-wired (verb-dispatcher harness §13): attacking lifts attack, defensive
  lifts defence. A mid-match change bites from the next increment.

## Helpers added this session (signatures)

- `team-select.autoFillXI(pool, formation, fitnessAware=true) → { xi, bench }`
- `team-select.effectiveStrength(card) → number` (power × fitness, injured ×0.2)
- `match-v5.subBlockReason(state, xiId, benchId) → string | null`
- `match-v5.cumulativeStats(scores) → CumulativeStats`
- `assistant.coachNotes(state, { weaknessLabel?, tacticSlots?, hasUndeployedTactic? }) → CoachNote[]`
