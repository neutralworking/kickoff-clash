/**
 * Kickoff Clash V6 — public API (the card-deployment engine, committed direction).
 *
 * Headless + deterministic + serializable. See `docs/KC_V6_SPEC_DECISIONS.md`
 * and `KICKOFF_CLASH_V6_CLAUDE_HANDOFF.md`. Built in isolation from the live
 * `SCORING_V2` game; the lab UI wires it at `/lab/match-v6` (commit 6).
 */

export * from './types';
export * from './balance';
export * from './random';
export * from './board';
export * from './actions';
export * from './priority';
export * from './resolver';
export * from './substitutions';
export * from './fixtures';
export * from './opponent-ai';
export * from './match';
