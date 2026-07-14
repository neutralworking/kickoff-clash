/**
 * KC six-contest engine (NW-142) — the challenge-rule catalogue (starter set).
 *
 * A challenge rule is a per-fixture modifier applied from fixture 2–3 on
 * (SYNERGY_MODEL_V1 §8, re-pointed at the six-contest run). Rules are DATA (law
 * 4): each names a target multiplier and/or a match-option tweak. The full
 * reviewed catalogue is a separate design ticket (NW-147) — this is a starter
 * set of 8 with a merge hook (`CHALLENGE_RULES` = starter ∪ authored).
 *
 * Kept mechanism-first: with the match judged on the scoreline (owner call,
 * 2026-07 — no points bar), every rule expresses difficulty as opponent quality
 * and/or a themed restriction, so the run-distribution harness can exercise the
 * lever without waiting on the authored copy.
 */

export interface ChallengeRule {
  id: string;
  name: string;
  blurb: string;
  /** Flat boost to the opponent's squad quality this fixture. */
  oppQuality?: number;
  /** Halve the player's set-piece output (a themed restriction). */
  noSetPieces?: boolean;
}

/** The reviewed starter set (NW-147 merges the full catalogue over this). */
export const STARTER_CHALLENGES: ChallengeRule[] = [
  { id: 'high-bar', name: 'High Bar', blurb: 'A side in form — beat them at their best.', oppQuality: 3 },
  { id: 'title-race', name: 'Title Race', blurb: 'A stronger opponent stands in the way.', oppQuality: 6 },
  { id: 'open-game', name: 'Open Game', blurb: 'They come to play — end-to-end stuff.', oppQuality: 2 },
  { id: 'dead-rubber', name: 'Dead Rubber', blurb: 'Dead balls are ruled out — win it in open play.', noSetPieces: true },
  { id: 'giant-killers', name: 'Giant-Killers', blurb: 'The minnows are fired up.', oppQuality: 4 },
  { id: 'must-win', name: 'Must-Win', blurb: 'Nerves bite — no room for a slip.', oppQuality: 5 },
  { id: 'derby-day', name: 'Derby Day', blurb: 'A committed, hostile opponent.', oppQuality: 5 },
  { id: 'grind', name: 'The Grind', blurb: 'A war of attrition.', oppQuality: 3 },
];

/** Authored-catalogue merge hook (NW-147). Empty until that lands. */
export const AUTHORED_CHALLENGES: ChallengeRule[] = [];

export const CHALLENGE_RULES: ChallengeRule[] = [...STARTER_CHALLENGES, ...AUTHORED_CHALLENGES];

/** Deterministic seeded pick of a challenge for a fixture (or null pre-fixture-2). */
export function challengeForFixture(seed: number, fixture: number): ChallengeRule | null {
  if (fixture < 2 || CHALLENGE_RULES.length === 0) return null;
  // xorshift over (seed, fixture) — replay-safe, no shared RNG
  let s = (seed ^ (fixture * 0x9e3779b1)) | 0;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return CHALLENGE_RULES[Math.abs(s) % CHALLENGE_RULES.length];
}
