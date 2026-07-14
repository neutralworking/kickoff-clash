/**
 * KC six-contest engine (NW-140) — manager / tactics / adherence acceptance.
 *
 * Asserts the P2 acceptance:
 *   • manager reweight is additive + committed-gated: a matched build+manager
 *     clears a balanced squad by ~2×; the same build swings best↔worst across
 *     the roster; NO reweight payoff without contest commitment (the law check)
 *   • tactical cards = timed posture windows that apply between batches and
 *     revert (consuming the P1 posture scaffolding); posture read as a gate
 *   • formation adherence throttles tilt contribution (native/adjacent/foreign),
 *     the formation-level generalisation of off-position soft-tilt
 *   • Gambler (amplify-variance) and Heavy Metal (PRESS) each have a rewardable
 *     build; Fortress is strong but not a runaway
 *   • the manager offer is a deterministic seeded choice-of-three
 *
 * Reweight magnitudes are the deferred sim-pass lever; the asserts are on the
 * qualitative shape with generous tolerance.
 */

import { describe, it, expect } from 'vitest';
import {
  simulateMatch,
  type Squad,
  RngStream,
  buildXI,
  type Strategy,
  type Contest,
  // managers
  MANAGERS,
  MANAGERS_BY_ID,
  managerTraits,
  managerOffer,
  managerContestDial,
  COMMIT_MIN,
  type Manager,
  // gates / traits
  contestDials,
  dialDeltas,
  type GateSnapshot,
  // adherence
  adherenceBand,
  throttleDials,
  ADHERENCE_MULT,
  // tactics
  TACTICS_BY_ID,
} from '../index';

// ---- fixtures --------------------------------------------------------------

const builder = new RngStream(20260709);
let seed = 1;

const balancedSquad = (): Squad => ({ cards: buildXI(builder, 'random'), posture: 'balanced' });
const matchedSquad = (m: Manager): Squad => ({
  cards: buildXI(builder, `mono:${m.favoured}` as Strategy),
  manager: m,
  formation: m.formation,
  hasTaker: m.favoured === 'STOP',
  hasCarrier: m.favoured === 'STOP',
});
const uncommittedSquad = (m: Manager): Squad => ({
  cards: buildXI(builder, 'random'),
  manager: m,
  formation: m.formation,
});

function ptsPerGame(mkA: () => Squad, mkB: () => Squad, M = 250): number {
  let w = 0;
  let d = 0;
  for (let i = 0; i < M; i++) {
    const r = simulateMatch(mkA(), mkB(), { seed: seed++ });
    if (r.score[0] > r.score[1]) w++;
    else if (r.score[0] === r.score[1]) d++;
  }
  return (3 * w + d) / M;
}

const snap = (dials: Record<Contest, number>): GateSnapshot => ({
  posture: 'balanced',
  scoreline: 'level',
  clock: 'mid',
  fitness: 10,
  dials,
  posCounts: {},
  states: new Set(),
});

// ---------------------------------------------------------------------------

describe('roster shape', () => {
  it('has 11 managers including Heavy Metal (the PRESS/Gegenpress manager)', () => {
    expect(MANAGERS).toHaveLength(11);
    expect(MANAGERS_BY_ID['heavy-metal']).toBeDefined();
    expect(MANAGERS_BY_ID['heavy-metal'].favoured).toBe('PRESS');
    // every manager reweights its own favoured contest (its identity)
    for (const m of MANAGERS) expect(managerContestDial(m, m.favoured)).toBeGreaterThan(0);
  });
});

describe('reweight is additive + committed-gated (no-unconditional law on managers)', () => {
  const m = MANAGERS_BY_ID['chaser']; // favoured FINISH, threshold COMMIT_MIN.FINISH

  it('a committed squad opens the gate; an uncommitted one gets nothing', () => {
    const committed = { KEEP: 0, PRESS: 0, CREATE: 0, BREAK: 0, FINISH: COMMIT_MIN.FINISH, STOP: 0 };
    const under = { KEEP: 0, PRESS: 0, CREATE: 0, BREAK: 0, FINISH: COMMIT_MIN.FINISH - 1, STOP: 0 };
    const openDelta = dialDeltas(managerTraits(m), snap(committed));
    const closedDelta = dialDeltas(managerTraits(m), snap(under));
    expect(openDelta.own.FINISH).toBeGreaterThan(0);
    expect(closedDelta.own.FINISH).toBe(0); // no commitment → flat-additive pays nothing
  });
});

describe('reweight validated — matched ~2×, all rewardable, no uncommitted payoff', () => {
  const base = ptsPerGame(balancedSquad, balancedSquad, 400);
  const matched = new Map<string, number>();
  const uncommitted = new Map<string, number>();
  for (const m of MANAGERS) {
    matched.set(m.id, ptsPerGame(() => matchedSquad(m), balancedSquad));
    uncommitted.set(m.id, ptsPerGame(() => uncommittedSquad(m), balancedSquad));
  }

  it('a matched build+manager clears a balanced squad by ~2× (at least one manager)', () => {
    const best = Math.max(...matched.values());
    expect(best).toBeGreaterThan(1.85 * (base / 1.4)); // ~2× the ~1.4 baseline
    expect(best / base).toBeGreaterThan(1.3);
  });

  it('every manager has a rewardable matched build (clears baseline)', () => {
    for (const m of MANAGERS) expect(matched.get(m.id)!).toBeGreaterThan(base * 1.02);
  });

  it('the reweight rewards COMMITMENT: matched clearly beats the same manager on an uncommitted squad', () => {
    // the exact no-payoff-below-threshold law is unit-tested above (closedDelta
    // === 0); here we show, at the balance level, that commitment is what pays —
    // an uncommitted (random) squad gets ~nothing from the manager.
    let totalGap = 0;
    for (const m of MANAGERS) {
      const gap = matched.get(m.id)! - uncommitted.get(m.id)!;
      expect(gap).toBeGreaterThan(0); // committed always beats uncommitted under the manager
      totalGap += gap;
    }
    expect(totalGap / MANAGERS.length).toBeGreaterThan(0.12); // and the gap is substantial
  });

  it('Gambler and Heavy Metal each have a rewardable build; no runaway', () => {
    expect(matched.get('gambler')!).toBeGreaterThan(base * 1.15);
    expect(matched.get('heavy-metal')!).toBeGreaterThan(base * 1.05);
    // Fortress is strong but bounded — survives without dominating (§4.2)
    expect(matched.get('fortress')! / base).toBeLessThan(2.2);
  });
});

describe('build swing across managers (the manager choice matters)', () => {
  it('a CREATE build swings best↔worst across the roster', () => {
    const build: Contest = 'CREATE';
    const vals = MANAGERS.map((m) =>
      ptsPerGame(
        () => ({ cards: buildXI(builder, `mono:${build}` as Strategy), manager: m, formation: m.formation }),
        balancedSquad
      )
    );
    const best = Math.max(...vals);
    const worst = Math.min(...vals);
    expect(best - worst).toBeGreaterThan(0.25); // a real swing
    // the CREATE-favouring manager (Tinkerman) should be at/near the top
    const tinker = ptsPerGame(
      () => ({ cards: buildXI(builder, 'mono:CREATE'), manager: MANAGERS_BY_ID['tinkerman'], formation: '4-3-3' }),
      balancedSquad
    );
    expect(tinker).toBeGreaterThan(worst + 0.2);
  });
});

describe('formation adherence throttles tilt contribution', () => {
  it('bands classify native / adjacent / foreign', () => {
    expect(adherenceBand('4-3-3', '4-3-3')).toBe('native');
    expect(adherenceBand('4-2-3-1', '4-3-3')).toBe('adjacent');
    expect(adherenceBand('5-3-2', '4-3-3')).toBe('foreign');
  });

  it('a foreign formation scales dials down (the same lever as off-position soft-tilt)', () => {
    const dials = contestDials(buildXI(new RngStream(3), 'mono:STOP'));
    const foreign = throttleDials(dials, 'foreign');
    expect(foreign.STOP).toBeCloseTo(dials.STOP * ADHERENCE_MULT.foreign, 5);
    expect(ADHERENCE_MULT.native).toBeGreaterThan(ADHERENCE_MULT.adjacent);
    expect(ADHERENCE_MULT.adjacent).toBeGreaterThan(ADHERENCE_MULT.foreign);
  });

  it('a manager played in a foreign formation loses commitment (and its reweight)', () => {
    const m = MANAGERS_BY_ID['fortress']; // preferred 5-3-2, favoured STOP
    const native = ptsPerGame(
      () => ({ cards: buildXI(builder, 'mono:STOP'), manager: m, formation: m.formation }),
      balancedSquad
    );
    const foreign = ptsPerGame(
      () => ({ cards: buildXI(builder, 'mono:STOP'), manager: m, formation: '4-3-3' }), // foreign vs 5-3-2
      balancedSquad
    );
    expect(native).toBeGreaterThan(foreign);
  });
});

describe('tactical deck — timed posture windows apply between batches and revert', () => {
  it('a played tactic emits tactic-played + posture-shift and reverts later', () => {
    const home: Squad = {
      cards: buildXI(new RngStream(4), 'random'),
      posture: 'balanced',
      tacticalPlays: [{ atBatch: 2, tactic: TACTICS_BY_ID['park-the-bus'] }], // defend, 2 batches
    };
    const away: Squad = { cards: buildXI(new RngStream(5), 'random'), posture: 'balanced' };
    const res = simulateMatch(home, away, { seed: 77 });
    const played = res.events.find((e) => e.type === 'tactic-played');
    expect(played).toBeDefined();
    if (played && played.type === 'tactic-played') {
      expect(played.batch).toBe(2);
      expect(played.posture).toBe('defend');
      expect(played.energyLeft).toBe(3); // 5 − 2
    }
    const tacticShift = res.events.find((e) => e.type === 'posture-shift' && e.reason === 'tactic');
    const revert = res.events.find((e) => e.type === 'posture-shift' && e.reason === 'revert');
    expect(tacticShift).toBeDefined();
    expect(revert).toBeDefined(); // window (2 batches, opened at 2) reverts at batch 4
    if (revert && revert.type === 'posture-shift') expect(revert.batch).toBe(4);
  });

  it('a tactic is not played when energy is short', () => {
    const home: Squad = {
      cards: buildXI(new RngStream(6), 'random'),
      posture: 'balanced',
      energy: 1,
      tacticalPlays: [{ atBatch: 1, tactic: TACTICS_BY_ID['all-out-attack'] }], // cost 3 > 1
    };
    const res = simulateMatch(home, balancedSquad(), { seed: 78 });
    expect(res.events.some((e) => e.type === 'tactic-played')).toBe(false);
  });
});

describe('substitutions (rotation depth)', () => {
  it('a scheduled substitution emits a substitution event at that batch', () => {
    const home: Squad = {
      cards: buildXI(new RngStream(7), 'mono:CREATE'),
      manager: MANAGERS_BY_ID['tinkerman'],
      formation: '4-3-3',
      subsAtBatch: [3],
    };
    const res = simulateMatch(home, balancedSquad(), { seed: 79 });
    const sub = res.events.find((e) => e.type === 'substitution');
    expect(sub).toBeDefined();
    if (sub && sub.type === 'substitution') expect(sub.batch).toBe(3);
  });
});

describe('the run-start manager offer is a deterministic seeded choice-of-three', () => {
  it('returns 3 distinct managers, stable per seed, varying across seeds', () => {
    const a = managerOffer(123);
    const b = managerOffer(123);
    const c = managerOffer(999);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((m) => m.id)).size).toBe(3);
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
    expect(a.map((m) => m.id)).not.toEqual(c.map((m) => m.id));
  });
});

describe('determinism holds with managers + tactics', () => {
  it('same seed + same squads → identical event log', () => {
    const rng = new RngStream(11);
    const home: Squad = {
      cards: buildXI(rng, 'mono:FINISH'),
      manager: MANAGERS_BY_ID['gambler'],
      formation: '4-3-3',
      tacticalPlays: [{ atBatch: 2, tactic: TACTICS_BY_ID['all-out-attack'] }],
    };
    const away: Squad = { cards: buildXI(rng, 'mono:STOP'), manager: MANAGERS_BY_ID['fortress'], formation: '5-3-2' };
    const a = simulateMatch(home, away, { seed: 5 });
    const b = simulateMatch(home, away, { seed: 5 });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });
});

describe('the KEEP levers — Keep Ball class buff + the chase drain (owner direction, 2026-07)', () => {
  const batchOf = (e: { [k: string]: unknown }): number => {
    if ('clock' in e && e.clock) return (e.clock as { batch: number }).batch;
    if ('batch' in e && typeof e.batch === 'number') return e.batch;
    return 0;
  };
  const firstKeepRollP = (events: ReturnType<typeof simulateMatch>['events'], lastBatch: number): number | null => {
    for (const e of events) {
      if (e.type === 'retain-roll' && e.side === 0 && e.clock.batch <= lastBatch) return e.p;
    }
    return null;
  };

  it('Keep Ball raises a KEEP-committed side\'s retain roll during its window', () => {
    const mk = (plays: boolean): Squad => ({
      cards: buildXI(new RngStream(21), 'mono:KEEP'),
      posture: 'balanced',
      tacticalPlays: plays ? [{ atBatch: 1, tactic: TACTICS_BY_ID['keep-ball'] }] : [],
    });
    // a pressing opponent keeps the retain roll under the RETAIN_HI cap, where
    // the buff is visible (vs a soft side the roll is already at the ceiling)
    const away = (): Squad => ({ cards: buildXI(new RngStream(22), 'mono:PRESS'), posture: 'balanced' });
    const withCard = simulateMatch(mk(true), away(), { seed: 301 });
    const without = simulateMatch(mk(false), away(), { seed: 301 });
    const pWith = firstKeepRollP(withCard.events, 2);
    const pWithout = firstKeepRollP(without.events, 2);
    expect(pWith).not.toBeNull();
    expect(pWithout).not.toBeNull();
    expect(pWith!).toBeGreaterThan(pWithout!);
  });

  it('an uncommitted side playing Keep Ball gets the posture window, NOT the buff (the law)', () => {
    const mk = (plays: boolean): Squad => ({
      cards: buildXI(new RngStream(23), 'random'),
      posture: 'balanced',
      tacticalPlays: plays ? [{ atBatch: 1, tactic: TACTICS_BY_ID['keep-ball'] }] : [],
    });
    const away = (): Squad => ({ cards: buildXI(new RngStream(24), 'random'), posture: 'balanced' });
    const withCard = simulateMatch(mk(true), away(), { seed: 302 });
    const without = simulateMatch(mk(false), away(), { seed: 302 });
    expect(withCard.events.some((e) => e.type === 'tactic-played')).toBe(true);
    const pWith = firstKeepRollP(withCard.events, 2);
    const pWithout = firstKeepRollP(without.events, 2);
    expect(pWith).not.toBeNull();
    expect(pWith).toBe(pWithout);
  });

  it('a KEEP-committed holder drains the chasing side\'s legs; uncommitted sides tire nobody', () => {
    const keeper: Squad = { cards: buildXI(new RngStream(25), 'mono:KEEP'), posture: 'balanced' };
    const chaser: Squad = { cards: buildXI(new RngStream(26), 'random'), posture: 'balanced' };
    const res = simulateMatch(keeper, chaser, { seed: 303 });
    const drains = res.events.filter((e) => e.type === 'fitness-drained');
    expect(drains.length).toBeGreaterThan(0);
    for (const d of drains) if (d.type === 'fitness-drained') expect(d.side).toBe(1); // only the chaser tires
    // and two uncommitted randoms never chase-drain (no Taskmaster in play either)
    const a: Squad = { cards: buildXI(new RngStream(27), 'random'), posture: 'balanced' };
    const b: Squad = { cards: buildXI(new RngStream(28), 'random'), posture: 'balanced' };
    const none = simulateMatch(a, b, { seed: 304 });
    expect(none.events.some((e) => e.type === 'fitness-drained')).toBe(false);
  });

  it('amending the play schedule preserves the already-played prefix (the UI re-resolve contract)', () => {
    const mk = (plays: boolean): Squad => ({
      cards: buildXI(new RngStream(29), 'mono:KEEP'),
      posture: 'balanced',
      tacticalPlays: plays ? [{ atBatch: 4, tactic: TACTICS_BY_ID['keep-ball'] }] : [],
    });
    const away = (): Squad => ({ cards: buildXI(new RngStream(30), 'random'), posture: 'balanced' });
    const a = simulateMatch(mk(false), away(), { seed: 305 });
    const b = simulateMatch(mk(true), away(), { seed: 305 });
    const prefix = (events: typeof a.events) =>
      JSON.stringify(events.filter((e) => e.type !== 'full-time' && batchOf(e) < 4));
    expect(prefix(a.events)).toBe(prefix(b.events));
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events)); // the future re-rolled
  });
});
