/**
 * V6 commit 1 — determinism of the seeded RNG + the token roller.
 * Same seed → identical sequence; injected rolls → exact outcomes.
 */
import { describe, it, expect } from 'vitest';
import { makeRng, scriptRng, rollD6, nextFloat, weightedPick, type RngState } from '../random';
import { makeTokens, rollChanceToGoal, resetTokenIds } from '../resolver';
import type { Die } from '../types';

const face = (f: Die): number => (f - 0.5) / 6;

function rollN(rng: RngState, n: number): Die[] {
  const out: Die[] = [];
  let s = rng;
  for (let i = 0; i < n; i++) {
    const [d, next] = rollD6(s);
    s = next;
    out.push(d);
  }
  return out;
}

describe('seeded RNG determinism', () => {
  it('same seed produces an identical d6 sequence', () => {
    const a = rollN(makeRng(12345), 30);
    const b = rollN(makeRng(12345), 30);
    expect(a).toEqual(b);
  });

  it('different seeds diverge', () => {
    const a = rollN(makeRng(1), 30);
    const b = rollN(makeRng(2), 30);
    expect(a).not.toEqual(b);
  });

  it('nextFloat is pure — same state yields the same value', () => {
    const s = makeRng(7);
    expect(nextFloat(s)[0]).toBe(nextFloat(s)[0]);
  });

  it('produces floats in [0, 1)', () => {
    let s = makeRng(999);
    for (let i = 0; i < 200; i++) {
      const [f, next] = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      s = next;
    }
  });
});

describe('injected rolls produce exact outcomes', () => {
  it('scripted floats map to the intended faces', () => {
    expect(rollN(scriptRng([face(6), face(1), face(4)]), 3)).toEqual([6, 1, 4]);
  });

  it('weightedPick is deterministic and respects weights', () => {
    // Cursor 0 → float 0 → first bucket; a mid float lands in the heavy bucket.
    const items = ['a', 'b', 'c'];
    expect(weightedPick(items, [1, 0, 0], scriptRng([0]))[0]).toBe('a');
    expect(weightedPick(items, [0, 1, 0], scriptRng([0]))[0]).toBe('b');
    expect(weightedPick(items, [1, 1, 1], scriptRng([0.5]))[0]).toBe('b');
  });
});

describe('token roller determinism', () => {
  it('same seed rolls an identical batch of chances', () => {
    resetTokenIds();
    const tokensA = makeTokens('player', 'centre', 4, { faces: [5, 6], rerolls: 1 });
    const rollBatch = (seed: number) => {
      let rng: RngState = makeRng(seed);
      return tokensA.map((t) => {
        const [roll, next] = rollChanceToGoal(t, rng);
        rng = next;
        return roll.scored;
      });
    };
    expect(rollBatch(42)).toEqual(rollBatch(42));
  });
});
