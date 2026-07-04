/**
 * NW-139 acceptance — determinism (preserves NW-138's guarantee).
 * Same seed + same decisions = same event log, always.
 */

import { describe, it, expect } from 'vitest';
import { createMatch, advance, runHeadless, COMMIT_ALL } from '../match';
import type { MatchConfig, AdvanceResult } from '../match';
import { STUB_FIXTURE } from '../data/stub';

const config = (seed: number): MatchConfig => ({ ...STUB_FIXTURE, seed });

describe('determinism', () => {
  it('same seed → byte-identical event log', () => {
    const a = runHeadless(config(42), COMMIT_ALL);
    const b = runHeadless(config(42), COMMIT_ALL);
    expect(JSON.stringify(a.log)).toEqual(JSON.stringify(b.log));
  });

  it('different seeds → different matches (sanity)', () => {
    const logs = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) {
      logs.add(JSON.stringify(runHeadless(config(seed), COMMIT_ALL).log));
    }
    expect(logs.size).toBeGreaterThan(1);
  });

  it('advance() is pure — replaying a kept mid-match state gives an identical continuation', () => {
    // Drive to the first window decision, keep that state, then continue twice.
    let res: AdvanceResult = createMatch(config(7));
    while (res.awaiting && res.awaiting.kind !== 'window') {
      res = advance(res.state, { type: 'none' });
    }
    expect(res.awaiting?.kind).toBe('window');
    const kept = res.state;

    const finishFrom = (start: typeof kept): string => {
      let r: AdvanceResult = advance(start, { type: 'commit' });
      while (r.awaiting) {
        r = advance(r.state, r.awaiting.kind === 'batch-start' ? { type: 'none' } : { type: 'commit' });
      }
      return JSON.stringify(r.state.log);
    };

    expect(finishFrom(kept)).toEqual(finishFrom(kept));
  });

  it('decisions change the trajectory (pass ≠ commit)', () => {
    const passAll = runHeadless(config(7), {
      onBatch: () => ({ type: 'none' }),
      onWindow: () => ({ type: 'pass' }),
    });
    const commitAll = runHeadless(config(7), COMMIT_ALL);
    expect(JSON.stringify(passAll.log)).not.toEqual(JSON.stringify(commitAll.log));
  });
});
