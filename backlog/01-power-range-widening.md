# 01 — Power range widening

**Source:** `BASELINE.md` "Power range compression is real" + `MATCH_ENGINE_V5.md §11.2`.

## Outcome

Character power distribution widens from **71–95** to **50–99**. The goal-chance ceiling stops being permanently pinned in normal play, and card-quality choices produce observable differences in goal chance per increment.

## Why

Today's harness run shows attack scores of 1100+ vs opponent defence baselines of 450 → attack ratios of 2.5–3.0x → `clamp(0.08 + (ratio - 1.0) * 0.20, 0.03, 0.45)` pins to 0.45 almost every increment. The formula has no headroom to express card-choice impact. This is a gameplay bug disguised as a content stat.

## Acceptance criteria

- [ ] `public/data/kc_characters.json` rewritten with `level` spanning 50–99 using a flatter distribution than the current 71–95 range.
- [ ] Approximate target distribution per §11.2:
  - Common: 50–65
  - Uncommon: 60–80
  - Rare: 75–95
  - Legendary: a small slice 90–99
- [ ] `scripts/match-harness.ts` rerun with same seed (`12345`) produces:
  - Top-11-by-power XI total base power notably lower than today's ~1030
  - At least 2 of 5 increments with goal chance **below** 0.45 (i.e. not pinned to ceiling)
  - Match still resolves end-to-end without error
- [ ] Before/after numbers recorded in **`design/balance-notes/power-range.md`** (create the directory). Include:
  - Old vs new power distribution histogram (text table is fine)
  - Old vs new attack scores per increment (same seed)
  - Old vs new goal chances per increment
  - A one-paragraph read on whether the widening is sufficient or needs a second pass

## Boundaries

- Only touch `public/data/kc_characters.json` and produce the balance note.
- Do NOT modify `match-v5.ts`, `scoring.ts`, `transform.ts`, or any formulas.
- Do NOT regenerate names, bios, nations, quirks — only `level` values. If a full regen is easier than editing in place, preserve the existing identities and only rewrite the `level` field.

## Non-goals

- Archetype distribution fix (that's task 04 — do not mix).
- Personality multiplier audit (that's task 02).
- Formation balance, joker balance, tactic balance — out of scope.

## Risks / watchouts

- **Conflicts with task 04** — both edit `kc_characters.json`. Serialize: 01 then 04, or 04 then 01. Do not run in parallel.
- Widening may expose new balance issues at the lower end — the harness currently only tests top-11-by-power. Run a second harness scenario with a mid-power XI (cards 200–210) to sanity-check that low-tier matches still resolve meaningfully. Document the finding; don't try to fix it in this task.

## Done when

Balance note exists with before/after numbers and a clear recommendation; harness runs cleanly; goal chances are no longer uniformly pinned.
