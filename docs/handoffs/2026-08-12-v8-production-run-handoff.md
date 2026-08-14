# V8 production run handoff — 2026-08-12

## Decision

The established `GameShell` now enters the V8 four-period match after team selection. V8 is no longer limited to `/lab/match-v8` for the primary fresh-run path.

The existing run shell continues to own manager/player packs, XI selection, persistence, rewards, post-match, shop, cup progression and terminal run states. The match boundary still returns the legacy `MatchResultPayload`, so those systems do not need a parallel V8 run implementation.

## Production fixture bridge

- The eleven selected starter cards cross into V8 through their authored `v8PlayerId` identities.
- The other seven starter cards remain pre-match alternatives and do not enter the fixture.
- The existing deterministic opponent XI is translated into an eleven-card V8 deck for the same cup, tie and run seed.
- A later transfer-market card without a V8 identity receives a visible `V8 ADAPTER` fallback: its converted ATT/DEF/Cost contribute, but it has no authored V8 Action. This keeps later fixtures playable without pretending legacy rules resolved.
- V8 still scores at team level. The post-match handoff therefore leaves scorer and player-of-the-match attribution empty until V8 emits real scorer receipts.

## End-to-end path now exercised

`New Season → manager pack → player pack → Build XI → Kick Off → four V8 periods → Continue → Post Match`

The same bridge also resumes a saved `match` run directly into V8. A loss continues to use the existing permadeath end state; a win or draw continues into the existing post-match and shop flow.

## Validation

- TypeScript: clean.
- Focused lint: no errors; five existing raw-image warnings remain in `V8CalibrationLab`.
- V8 browser suite: 18/18 passing.
- Fresh end-to-end browser run reaches the existing post-match screen at 390 × 844.
- Saved-run production match completes at 375 × 667 without horizontal overflow.
- Unit suite: 656 passing, four todo, with one inherited unrelated V7 isolation failure from `PlayerDossier.tsx` importing `@/game-v7`.
- Production build: passes with a temporary local font fallback; the unmodified build remains unable to fetch Google Fonts in the restricted environment.

## Deliberate next gaps

- Replace `V8 ADAPTER` transfer cards with authored V8 identities as the production pool expands.
- Bind the selected manager's authored V8 Action instead of the current `CONTROL` prototype card.
- Add scorer/player-of-the-match receipts inside V8 before restoring player attribution.
- Run balance telemetry on production starter-pack versus generated-opponent fixtures; no balance numbers changed here.
