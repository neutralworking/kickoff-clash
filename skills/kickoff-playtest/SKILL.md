---
name: kickoff-playtest
description: Use when you need to actually playtest Kickoff Clash in a browser instead of only reading code. Runs the local Playwright harness, clears saved run state, walks a real match and shop loop, and captures concrete UX findings from the live interaction.
---

# Kickoff Playtest

Use this workflow for real interaction checks against the local app.

## Quick start

1. Run `npm run playtest`.
2. Read the Playwright result first.
3. If it fails, inspect the trace before changing code.

## What the harness does

- clears saved run state in `localStorage`
- starts a new season
- opens a pack and skips through the reveal
- enters a match
- commits attackers, reorders them by drag-and-drop, and kicks off
- pushes through the match flow into post-match and shop
- verifies that key shop sections load

## Files

- Harness config: `playwright.config.ts`
- Main scripted flow: `tests/playtest.spec.ts`

## When extending it

- Keep one happy-path test that finishes quickly.
- Add narrow regression tests for bugs like duplicate selection, injured-card handling, or touch reordering.
- Prefer checking visible game language over implementation details.
- If a bug only happens after several increments, add a helper rather than duplicating click sequences.

## Notes

- This is a repo-local skill/workflow artifact, not a globally installed Codex skill.
- If browser automation starts failing intermittently, read the trace before changing selectors or app timing.
