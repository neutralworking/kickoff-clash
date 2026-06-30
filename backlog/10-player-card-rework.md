# 10 — Player card rework

**Source:** 0.3 owner feedback ("the player card needs a full rework"). Deferred from the 0.1→0.3 push (the 0.3 push elevated the card *visuals* and added on-card position/fitness + in-match ratings; this task reworks the card *model* and full detail).

## Outcome

A player card that exposes its full identity and depth — pillars, personality, role, strengths/weaknesses, quirks — legibly, and (decision pending) lets that depth actually drive the engine instead of a single `power` scalar.

## Why

The `Card` type (`src/lib/scoring.ts`) is rich — 23 fields including `pillars` (technical / tactical / mental / physical, each 0–100), `personalityType`, `personalityTheme`, `tacticalRole`, `tags`, `quirk`, `strengths`, `weaknesses`, `bio`, `nickname` — but most of it is **unsurfaced and unused**. The engine reads essentially `power` (BRS) + `archetype` + `position` + `fitness`; the four pillars are loaded and never read. So the card looks deep but plays flat, and the player can't see or use most of what defines a card.

## Acceptance criteria

- [ ] Full-card detail (`CardModal`) surfaces the **pillars** (e.g. a 4-axis radar or bars), personality (type + theme), role, strengths (green) / weaknesses (red), character tags, quirk, and bio — in the glassy/pixel 0.3 system.
- [ ] A **decision (with `balance-lab`)** on whether pillars feed the engine — e.g. power derived from a pillar mix, or pillars gating role/verb effectiveness — vs. staying flavour. Document the call.
- [ ] If pillars become mechanical, the change is sweep-validated for monotonicity and no new degenerate build.
- [ ] Coheres with player upgrades (`08`) if upgrades invest in pillars.

## Boundaries

- 0.3 already elevated the card frame/sprites and added on-card position + fitness and in-match ratings/scorers/assists — **do not redo those**; this is the model + full-detail rework.
- Keep `cardTokens.ts` exports back-compatible (many call sites) — additive only.

## Non-goals

- Shop (`07`), upgrades (`08`), manager traits (`09`) — separate, though `08`/`10` likely share the pillars surface.

## References

- `src/lib/scoring.ts` (`Card`, `pillars`), `src/lib/transform.ts` (pillar/personality mapping), `src/components/cards/{GameCard,CardModal,cardTokens}.tsx/ts`, `src/lib/match-v5.ts` (`evaluateSplit` — what the engine actually reads), `scripts/balance-sweep.ts`.

## Done when

The card surfaces its full identity legibly and the pillars-feed-the-engine decision is documented (and validated if taken).
