/**
 * KC six-contest engine (NW-142) — the run-distribution harness (the rebuild's
 * "the game works" exit criterion).
 *
 * Asserts the P4 acceptance, re-based to the engine-v2 scale (the SM §8 curve's
 * shape survives; its exact numbers came from the SM two-window sim):
 *   • a full 9-fixture run resolves end-to-end, deterministic under seed
 *   • the permadeath curve holds: a COMMITTED build completes ~40-50% and
 *     survives deep; an UNCOMMITTED build completes less and dies earlier
 *     (the manager reweight + build synergy compounds through the economy)
 *   • deaths concentrate mid/late; challenge rules bite from fixture 2
 *   • RunState round-trips through serialize/deserialize (autosave/resume)
 *
 * Reweight magnitudes / per-manager balance are the deferred sim-pass lever;
 * the asserts are on the aggregate shape with generous tolerance.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  loadCards,
  simulateRun,
  createRun,
  playFixture,
  deathFixture,
  serializeRun,
  deserializeRun,
  fixtureTarget,
  challengeForFixture,
  RUN_FIXTURES,
  MANAGERS,
  MANAGERS_BY_ID,
  type KCCard,
  type KCCardJSON,
  type RunState,
} from '../index';

const pool: KCCard[] = loadCards(
  JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'public', 'data', 'kc_v2_cards.json'), 'utf8')) as KCCardJSON[]
);

function sweep(committed: boolean, n: number) {
  const deaths: number[] = [];
  let completed = 0;
  for (let i = 0; i < n; i++) {
    const m = MANAGERS[i % MANAGERS.length];
    const run = simulateRun(3000 + i, m, pool, committed);
    if (run.completed) completed++;
    deaths.push(deathFixture(run));
  }
  deaths.sort((a, b) => a - b);
  return {
    median: Math.min(deaths[Math.floor(deaths.length / 2)], RUN_FIXTURES),
    completion: completed / n,
    mid: deaths.filter((d) => d >= 5 && d <= 7).length / n,
  };
}

// ---------------------------------------------------------------------------

describe('a run resolves end-to-end and is deterministic', () => {
  it('plays 9 fixtures to a terminal state', () => {
    const run = simulateRun(42, MANAGERS_BY_ID['chaser'], pool, true);
    expect(run.completed || !run.alive).toBe(true);
    expect(run.log.length).toBeGreaterThan(0);
    expect(run.log.length).toBeLessThanOrEqual(RUN_FIXTURES);
    if (run.completed) expect(run.log).toHaveLength(RUN_FIXTURES);
  });

  it('same seed + manager → identical run', () => {
    const a = simulateRun(7, MANAGERS_BY_ID['fortress'], pool, true);
    const b = simulateRun(7, MANAGERS_BY_ID['fortress'], pool, true);
    expect(serializeRun(a)).toBe(serializeRun(b));
  });

  it('playFixture advances one fixture and matches simulateRun', () => {
    const m = MANAGERS_BY_ID['tinkerman'];
    let step: RunState = createRun(99, m);
    step = playFixture(step, pool);
    expect(step.log).toHaveLength(1);
    const full = simulateRun(99, m, pool, true);
    // first fixture is identical whether stepped or run in one shot
    expect(step.log[0].beaten).toBe(full.log[0].beaten);
    expect(step.log[0].score).toEqual(full.log[0].score);
  });
});

describe('the target curve and challenge rules', () => {
  it('the points target grows across the run (1.42^f)', () => {
    for (let f = 2; f <= RUN_FIXTURES; f++) expect(fixtureTarget(f)).toBeGreaterThan(fixtureTarget(f - 1));
  });

  it('challenge rules bite from fixture 2 (not fixture 1)', () => {
    expect(challengeForFixture(123, 1)).toBeNull();
    let seen = 0;
    for (let s = 0; s < 20; s++) if (challengeForFixture(s, 3)) seen++;
    expect(seen).toBeGreaterThan(0);
    // and a run's log records the challenge id from fixture 2 on
    const run = simulateRun(5, MANAGERS_BY_ID['fortress'], pool, true);
    const f2 = run.log.find((r) => r.fixture === 2);
    if (f2) expect(f2.challenge).not.toBeNull();
  });
});

describe('persistence — autosave / resume round-trip', () => {
  it('a run serializes and deserializes intact', () => {
    const run = simulateRun(11, MANAGERS_BY_ID['gambler'], pool, true);
    const restored = deserializeRun(serializeRun(run));
    expect(restored).toEqual(run);
    expect(restored.managerId).toBe('gambler');
  });

  it('a resumed mid-run continues to the same terminal state', () => {
    const m = MANAGERS_BY_ID['pragmatist'];
    let stepped: RunState = createRun(21, m);
    stepped = playFixture(stepped, pool); // play one, then "save"
    const resumed = deserializeRun(serializeRun(stepped));
    let cont: RunState = resumed;
    while (cont.alive && !cont.completed) cont = playFixture(cont, pool);
    const oneShot = simulateRun(21, m, pool, true);
    expect(cont.completed).toBe(oneShot.completed);
    expect(deathFixture(cont)).toBe(deathFixture(oneShot));
  });
});

describe('the permadeath curve — committed survives, uncommitted dies (SM §8 shape)', () => {
  const N = 132; // 12 per manager
  const committed = sweep(true, N);
  const uncommitted = sweep(false, N);

  it('a committed run completes ~40-50% and survives deep', () => {
    expect(committed.completion).toBeGreaterThan(0.28);
    expect(committed.completion).toBeLessThan(0.62);
    expect(committed.median).toBeGreaterThanOrEqual(7);
  });

  it('an uncommitted run completes less and dies earlier (the divergence)', () => {
    expect(uncommitted.completion).toBeLessThan(committed.completion);
    expect(uncommitted.median).toBeLessThanOrEqual(committed.median);
  });

  it('deaths concentrate mid/late, not at fixture 1', () => {
    expect(committed.mid + uncommitted.mid).toBeGreaterThan(0.1);
    // fixture 1 is not a wipeout — the run has an on-ramp
    let f1deaths = 0;
    for (let i = 0; i < 40; i++) if (deathFixture(simulateRun(9000 + i, MANAGERS[i % MANAGERS.length], pool, true)) === 1) f1deaths++;
    expect(f1deaths / 40).toBeLessThan(0.15);
  });
});
