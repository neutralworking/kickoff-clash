/**
 * KC six-contest engine (NW-139 Fork A) — public API.
 *
 * The headless six-contest spine: build squads, simulate a match, read the
 * typed event log. P1 exposes the PRIMITIVES (contest dials, retain roll +
 * KEEP↔BREAK coupling, CREATE→xG→FINISH, contexts-as-gates, positional graph);
 * the 45-card catalogue and the UI wiring land downstream (NW-140+).
 */

export * from './contests';
export * from './gates';
export * from './posture';
export * from './positional';
export * from './adherence';
export * from './traits';
export * from './managers';
export * from './tactics';
export * from './events';
export * from './data/roles';
export * from './data/actions';
export * from './data/challenges';
export * from './cards';
export * from './draft';
export * from './run';
export { RngStream } from './rng';
export { simulateMatch } from './match';
export type { Squad, MatchOptions, MatchResult } from './match';
export * from './squad';
