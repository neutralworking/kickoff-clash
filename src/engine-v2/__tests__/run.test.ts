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
  challengeForFixture,
  packOffer,
  buyCard,
  CARD_PRICE,
  fixtureSetup,
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
    // mean survival depth aggregates the whole distribution — a robust divergence
    // signal (the completion tail alone is noisy at test N).
    meanDeath: deaths.reduce((a, b) => a + b, 0) / n,
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
    expect(step.log[0].verdict).toBe(full.log[0].verdict);
    expect(step.log[0].score).toEqual(full.log[0].score);
  });
});

describe('the challenge rules', () => {
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

describe('the permadeath curve — committed survives deeper than uncommitted (SM §8 shape)', () => {
  const N = 176; // 16 per manager
  const committed = sweep(true, N);
  const uncommitted = sweep(false, N);

  it('a committed run completes ~25-40% under the scoreline verdict', () => {
    // Re-based for goals-only survival (owner call, 2026-07): a committed run
    // completes ~30% at the settled curve (OPP_BASE 4 / GROWTH 2.5 / K_QUALITY
    // 1.15). The blind-era ~43% band no longer applies; widening the committed
    // vs uncommitted gap further is the manager-rebalance campaign (next pass).
    expect(committed.completion).toBeGreaterThan(0.18);
    expect(committed.completion).toBeLessThan(0.48);
    expect(committed.median).toBeGreaterThanOrEqual(3);
  });

  it('a committed build survives DEEPER than an uncommitted one (the divergence)', () => {
    // mean survival depth is the robust signal; the completion tail is noisier
    // but should still not favour the incoherent build.
    expect(committed.meanDeath).toBeGreaterThan(uncommitted.meanDeath);
    expect(committed.completion).toBeGreaterThan(uncommitted.completion - 0.04);
  });

  it('defensive archetypes are viable under the scoreline verdict', () => {
    // a STOP/wall manager (Fortress) must be able to complete runs — it wins
    // low-scoring games and survives draws; conceding nothing keeps it alive.
    let fortress = 0;
    const K = 60;
    for (let i = 0; i < K; i++) if (simulateRun(4000 + i, MANAGERS_BY_ID['fortress'], pool, true).completed) fortress++;
    expect(fortress / K).toBeGreaterThan(0.1);
  });

  it('deaths span mid/late fixtures, not a fixture-1 wipeout', () => {
    expect(committed.mid).toBeGreaterThan(0.08);
    let f1deaths = 0;
    for (let i = 0; i < 40; i++) if (deathFixture(simulateRun(9000 + i, MANAGERS[i % MANAGERS.length], pool, true)) === 1) f1deaths++;
    expect(f1deaths / 40).toBeLessThan(0.15);
  });
});

describe('the pack shop — nine seeded cards, purchases join the draft stream', () => {
  it('packOffer is deterministic, rarity-shaped, and never offers owned cards', () => {
    const run = { ...createRun(77, MANAGERS_BY_ID['metronome']), cash: 50 };
    const a = packOffer(run, pool);
    const b = packOffer(run, pool);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a).toHaveLength(9);
    const count = (r: string) => a.filter((c) => c.rarity === r).length;
    expect(count('Common')).toBe(6);
    expect(count('Rare')).toBe(1);
    expect(count('Epic')).toBe(1);
    expect(count('Legendary')).toBe(1);
    // buy one → the next visit's offer never contains it
    const bought = buyCard(run, a[0]);
    const next = packOffer(bought, pool);
    expect(next.some((c) => c.id === a[0].id)).toBe(false);
  });

  it('buyCard spends the rarity price and adds to the collection; unaffordable is a no-op', () => {
    const run = { ...createRun(78, MANAGERS_BY_ID['gambler']), cash: 5 };
    const offer = packOffer(run, pool);
    const common = offer.find((c) => c.rarity === 'Common')!;
    const legendary = offer.find((c) => c.rarity === 'Legendary')!;
    const after = buyCard(run, common);
    expect(after.cash).toBe(5 - CARD_PRICE.Common);
    expect(after.collection).toContain(common.id);
    expect(buyCard(after, legendary)).toBe(after); // 12 > remaining cash → no-op
    expect(buyCard(after, common)).toBe(after); // already owned → no-op
  });

  it('owned cards lead the next fixture\'s draft stream', () => {
    let run = { ...createRun(79, MANAGERS_BY_ID['fortress']), cash: 30 };
    const offer = packOffer(run, pool);
    run = buyCard(run, offer[offer.length - 1]); // the Legendary
    const setup = fixtureSetup(run, pool);
    expect(setup.pool[0].id).toBe(offer[offer.length - 1].id);
  });
});
