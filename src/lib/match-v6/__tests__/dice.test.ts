/**
 * V6 commit 1 — dice conversion (A2: d6 is the only converter; skill = faces +
 * rerolls, never a guaranteed goal). Covers the handoff §7 "Dice" cases.
 */
import { describe, it, expect } from 'vitest';
import { makeTokens, rollChanceToGoal } from '../resolver';
import { scriptRng, cursor, type RngState } from '../random';
import type { Die } from '../types';

/** Scripted float that lands a d6 on face `f` (midpoint, boundary-safe). */
const face = (f: Die): number => (f - 0.5) / 6;

const oneToken = (faces: Die[], rerolls = 0) =>
  makeTokens('player', 'centre', 1, { faces, rerolls })[0];

describe('dice conversion', () => {
  it('only a 6 scores by default', () => {
    const tok = oneToken([6]);
    const [six] = rollChanceToGoal(tok, scriptRng([face(6)]));
    expect(six.scored).toBe(true);
    const [five] = rollChanceToGoal(tok, scriptRng([face(5)]));
    expect(five.scored).toBe(false);
  });

  it('a modified die can score on 5 or 6', () => {
    const tok = oneToken([5, 6]);
    expect(rollChanceToGoal(tok, scriptRng([face(5)]))[0].scored).toBe(true);
    expect(rollChanceToGoal(tok, scriptRng([face(6)]))[0].scored).toBe(true);
    expect(rollChanceToGoal(tok, scriptRng([face(4)]))[0].scored).toBe(false);
  });

  it('a reroll consumes exactly one additional RNG value', () => {
    // No reroll, first-roll miss → 1 draw consumed.
    const noReroll = oneToken([6], 0);
    const [, s0] = rollChanceToGoal(noReroll, scriptRng([face(3)]));
    expect(cursor(s0)).toBe(1);

    // One reroll, first miss then hit → exactly 2 draws consumed.
    const reroll = oneToken([6], 1);
    const [res, s1] = rollChanceToGoal(reroll, scriptRng([face(3), face(6)]));
    expect(res.scored).toBe(true);
    expect(res.rolls).toEqual([3, 6]);
    expect(cursor(s1)).toBe(2);

    // A reroll is NOT consumed once the first roll already scores → 1 draw.
    const [hit, s2] = rollChanceToGoal(reroll, scriptRng([face(6), face(6)]));
    expect(hit.scored).toBe(true);
    expect(cursor(s2)).toBe(1);
  });

  it('two sixes create two goals', () => {
    const tokens = makeTokens('player', 'centre', 2, { faces: [6] });
    let rng: RngState = scriptRng([face(6), face(6)]);
    let goals = 0;
    for (const t of tokens) {
      const [roll, next] = rollChanceToGoal(t, rng);
      rng = next;
      if (roll.scored) goals += 1;
    }
    expect(goals).toBe(2);
  });
});
