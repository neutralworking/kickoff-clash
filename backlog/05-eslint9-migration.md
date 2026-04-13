# 05 — ESLint 9 migration

**Source:** `BASELINE.md` "Stubbed / partial" table.

## Outcome

`npm run lint` runs successfully with an ESLint 9 flat config aligned to Next.js 16 recommendations. Lint is actually exercising the codebase, not just silently erroring.

## Why

Currently:

```
$ npm run lint
ESLint: 9.39.4
Oops! Something went wrong! :(
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

The repo has `eslint-config-next` in devDeps but no flat config. This means:
- `npm run lint` errors out rather than lints
- CI can't gate on lint quality
- Contributors see a broken script and disable it mentally

## Acceptance criteria

- [x] `eslint.config.js` (or `.mjs`) exists at repo root.
- [x] Uses the official Next.js 16 ESLint 9 flat config pattern — follow the current Next.js docs, do not invent a custom config.
- [x] `npm run lint` exits cleanly (exit code 0 allowed to have warnings; exit code 1 only on errors).
- [x] Confirm lint is actually running by introducing a deliberate violation in a throwaway file (e.g. `const unused = 1;`), running `npm run lint`, seeing the warning, then deleting the throwaway. **Do not commit the violation.**
- [x] Any existing violations discovered are reported in the task close-out — **do NOT fix them** in this task. That's a separate cleanup.

## Close-out — existing violations (3 errors, NOT fixed)

1. `src/components/GameShell.tsx:155` — `react-hooks/set-state-in-effect`: `setHasExistingRun()` called synchronously inside `useEffect` body.
2. `src/components/MatchPhase.tsx:56-70` — `react-hooks/refs`: `seedRef.current` accessed inside `useState` initialiser (render phase).
3. `src/components/PhaseTransition.tsx:15` — `react-hooks/set-state-in-effect`: `setVisible(false)` called synchronously inside `useEffect` body.

These should be addressed in a dedicated cleanup task — do not bundle into unrelated tasks.

## Boundaries

- Adopt the Next.js recommended config. No custom rules, no plugin sprees.
- Do not touch any `src/` files to silence violations.
- Do not add a pre-commit hook.

## Non-goals

- Don't fix existing lint warnings.
- Don't add Prettier integration.
- Don't wire lint into CI (no CI pipeline exists yet).

## Risks / watchouts

- Next.js 16 is very recent; its flat config story may still be in flux. If the official doc path doesn't work cleanly, fall back to the minimal `@eslint/js` + `eslint-plugin-react` + `@next/eslint-plugin-next` combination rather than inventing something.
- If ESLint 9 surfaces hundreds of violations, **stop**, record the count, and escalate — it's a signal that a larger code-quality sweep is needed and shouldn't be bundled into this task.

## Done when

`npm run lint` runs to completion, confirmed actually executing (via throwaway test), violation count reported in the task close-out note.
