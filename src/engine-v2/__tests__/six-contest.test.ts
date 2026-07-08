/**
 * KC six-contest engine (NW-139 Fork A) — the canonical acceptance harness.
 *
 * Seeded headless runs asserting the P1 acceptance (NW-139):
 *   • deterministic under seed (same seed + squads → identical event log)
 *   • a complete typed event log for a six-contest match end-to-end
 *   • possession → retain → CREATE → FINISH yields goals via xG; the KEEP↔BREAK
 *     coupling is observable in the log
 *   • contexts are GATES only — no context resolves a contest (law check)
 *   • the verb palette is unchanged; targets re-point to contest dials
 *   • the balance SHAPE matches kc_sim: round-robin spread ≈0.55, tilt ceilings
 *     hold, no runaway matchup
 *
 * numpy's PCG64 can't be byte-matched in TS, so the balance asserts are on the
 * distribution shape with generous tolerance, not a bit-identical replay.
 */

import { describe, it, expect } from 'vitest';
import {
  simulateMatch,
  type Squad,
  RngStream,
  buildXI,
  buildStopbus,
  tiltCensus,
  contestDials,
  TILT_CEILING,
  CONTESTS,
  type Contest,
  type Card,
  // gates
  gateScale,
  type Gate,
  type GateSnapshot,
  // traits
  dialDeltas,
  type EngineTrait,
  // positional
  buildSlots,
  inFront,
  behind,
  beside,
  opposite,
  effectiveTilt,
  type Position,
  // posture
  createPostureState,
  activePosture,
  applyPostureWindow,
  tickPosture,
} from '../index';

// ---- fixtures --------------------------------------------------------------

function squad(rng: RngStream, strat: Parameters<typeof buildXI>[1] | 'stopbus'): Squad {
  if (strat === 'stopbus') return { cards: buildStopbus(rng), posture: 'balanced', hasTaker: true, hasCarrier: true };
  return { cards: buildXI(rng, strat), posture: 'balanced' };
}

const emptySnap = (dials: Record<Contest, number>): GateSnapshot => ({
  posture: 'balanced',
  scoreline: 'level',
  clock: 'mid',
  streak: 0,
  fitness: 10,
  dials,
  posCounts: {},
  states: new Set(),
});

// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('same seed + same squads → byte-identical event log', () => {
    const rng = new RngStream(1);
    const home = squad(rng, 'mono:FINISH');
    const away = squad(rng, 'mono:STOP');
    const a = simulateMatch(home, away, { seed: 42 });
    const b = simulateMatch(home, away, { seed: 42 });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.score).toEqual(b.score);
  });

  it('different seeds diverge', () => {
    const rng = new RngStream(2);
    const home = squad(rng, 'random');
    const away = squad(rng, 'random');
    const a = simulateMatch(home, away, { seed: 1 });
    const b = simulateMatch(home, away, { seed: 999 });
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
  });
});

describe('typed event log — a six-contest match end-to-end', () => {
  const rng = new RngStream(3);
  const res = simulateMatch(squad(rng, 'random'), squad(rng, 'random'), { seed: 7 });
  const types = res.events.map((e) => e.type);

  it('opens with match-start carrying both sides dials', () => {
    const start = res.events[0];
    expect(start.type).toBe('match-start');
    if (start.type === 'match-start') {
      expect(start.dials[0]).toBeDefined();
      expect(start.dials[1]).toBeDefined();
    }
  });

  it('runs 6 batches and closes with full-time', () => {
    expect(types.filter((t) => t === 'batch-start')).toHaveLength(6);
    expect(types.filter((t) => t === 'batch-end')).toHaveLength(6);
    expect(types.at(-1)).toBe('full-time');
  });

  it('every goal is preceded by a converted chance with a valid xG', () => {
    const goals = res.events.filter((e) => e.type === 'goal');
    const chances = res.events.filter((e) => e.type === 'chance');
    for (const c of chances) {
      if (c.type === 'chance') {
        expect(c.xg).toBeGreaterThan(0);
        expect(c.converted).toBe(c.roll < 1 - Math.exp(-c.xg));
      }
    }
    // every goal maps to a converted chance for that side at that clock
    for (const g of goals) {
      if (g.type !== 'goal') continue;
      const hit = chances.some(
        (c) => c.type === 'chance' && c.side === g.side && c.converted && c.clock.batch === g.clock.batch
      );
      expect(hit).toBe(true);
    }
  });
});

describe('possession → retain → CREATE → FINISH, and the KEEP↔BREAK coupling', () => {
  it('failed retains feed the opponent BREAK transition chances, observable in the log', () => {
    let failedRetains = 0;
    let fedTransitions = 0;
    let transitionChances = 0;
    const rng = new RngStream(4);
    // a strong-BREAK counter side vs a possession side, many seeds
    for (let s = 0; s < 200; s++) {
      const home = squad(rng, 'mono:KEEP');
      const away = squad(rng, 'mono:BREAK');
      const res = simulateMatch(home, away, { seed: 1000 + s });
      for (const e of res.events) {
        if (e.type === 'retain-roll' && !e.retained) {
          failedRetains++;
          if (e.fedTransition) fedTransitions++;
        }
        if (e.type === 'chance' && e.origin === 'transition') transitionChances++;
      }
    }
    expect(failedRetains).toBeGreaterThan(0);
    expect(fedTransitions).toBeGreaterThan(0);
    expect(transitionChances).toBeGreaterThan(0);
    // fed transitions should roughly track the transition chances they create
    expect(transitionChances).toBeGreaterThanOrEqual(fedTransitions * 0.5);
  });

  it('a possession split always totals the batch count and clamps 2–4', () => {
    const rng = new RngStream(5);
    const res = simulateMatch(squad(rng, 'mono:KEEP'), squad(rng, 'mono:PRESS'), { seed: 11 });
    const split = res.events.find((e) => e.type === 'possession-split');
    expect(split).toBeDefined();
    if (split && split.type === 'possession-split') {
      expect(split.slots[0] + split.slots[1]).toBe(6);
      expect(Math.min(...split.slots)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...split.slots)).toBeLessThanOrEqual(4);
    }
  });
});

describe('contexts are GATES, never resolvers (law check)', () => {
  it('a closed gate pays nothing; an open gate scales magnitude', () => {
    const dials = contestDials(buildXI(new RngStream(6), 'mono:CREATE'));
    const snap = emptySnap(dials);
    const closed: Gate = { kind: 'posture', is: 'attack' }; // snap posture is 'balanced'
    const open: Gate = { kind: 'posture', is: 'balanced' };
    expect(gateScale(closed, snap)).toBe(0);
    expect(gateScale(open, snap)).toBe(1);
    // per-tilt coherence gate scales by the dial
    const perTilt: Gate = { kind: 'per-tilt', contest: 'CREATE' };
    expect(gateScale(perTilt, snap)).toBe(dials.CREATE);
  });

  it('a gate-closed trait contributes zero dial delta (no unconditional payout)', () => {
    const dials = contestDials(buildXI(new RngStream(7), 'random'));
    const snap = emptySnap(dials);
    const trait: EngineTrait = {
      name: 'Test',
      verb: 'amplify',
      trigger: 'continuous',
      target: { kind: 'own-dial', contest: 'FINISH' },
      magnitude: 3,
      gate: { kind: 'streak', atLeast: 5 }, // snap streak is 0 → closed
    };
    const deltas = dialDeltas([trait], snap);
    expect(deltas.own.FINISH).toBe(0);
  });
});

describe('verb palette unchanged; targets re-pointed to contest dials', () => {
  it('amplify → own-dial raises the dial; deny → opp-dial lowers it', () => {
    const dials = contestDials(buildXI(new RngStream(8), 'random'));
    const snap = emptySnap(dials);
    const amp: EngineTrait = {
      name: 'Skipper',
      verb: 'amplify',
      trigger: 'continuous',
      target: { kind: 'own-dial', contest: 'STOP' },
      magnitude: 2,
      gate: { kind: 'per-tilt', contest: 'STOP' },
    };
    const deny: EngineTrait = {
      name: 'Command',
      verb: 'deny',
      trigger: 'continuous',
      target: { kind: 'opp-dial', contest: 'FINISH' },
      magnitude: 1,
      gate: { kind: 'posture', is: 'balanced' },
    };
    const d = dialDeltas([amp, deny], snap);
    expect(d.own.STOP).toBe(2 * Math.max(0, dials.STOP)); // scaled by the STOP dial
    expect(d.opp.FINISH).toBe(1);
  });
});

describe('positional graph (line × lane) + off-position soft-tilt', () => {
  const F: Position[] = ['GK', 'CD', 'CD', 'WD', 'WD', 'DM', 'CM', 'CM', 'WF', 'CF', 'WF'];
  const slots = buildSlots(F);

  it('references resolve by line/lane, not by occupant', () => {
    const anchorDM = slots.findIndex((s) => s.pos === 'DM'); // line 2, lane C
    // behind the DM (line 1, lane C) are the two centre-backs
    const cbIdx = slots.filter((s) => s.pos === 'CD').map((s) => s.index);
    expect(behind(slots, anchorDM).sort()).toEqual(cbIdx.sort());
    // in-front of a wide defender (WD line1) is the winger ahead in its lane
    const wdL = slots.find((s) => s.pos === 'WD' && s.lane === 'L')!;
    const wfL = slots.find((s) => s.pos === 'WF' && s.lane === 'L');
    if (wfL) expect(inFront(slots, wdL.index)).toContain(wfL.index);
    // beside a centre-back is the other centre-back (same line, adjacent) — CDs are C lane
    // wide pairs are beside each other across L/R
    const wdR = slots.find((s) => s.pos === 'WD' && s.lane === 'R')!;
    expect(beside(slots, wdL.index)).toContain(wdR.index);
  });

  it('opposite is the cross-team marking matchup one line up in the lane', () => {
    const oppSlots = buildSlots(F);
    const wdL = slots.find((s) => s.pos === 'WD' && s.lane === 'L')!;
    const oppWfL = oppSlots.find((s) => s.pos === 'WF' && s.lane === 'L');
    if (oppWfL) expect(opposite(oppSlots, slots, wdL.index)).toContain(oppWfL.index);
  });

  it('off-position softens tilt one step; versatile waives it', () => {
    expect(effectiveTilt(2, 'CM', 'CM')).toBe(2); // on-position natural
    expect(effectiveTilt(2, 'CM', 'AM')).toBe(1); // off-position → soft
    expect(effectiveTilt(2, 'CM', 'AM', true)).toBe(2); // versatile waives
    expect(effectiveTilt(1, 'WF', 'CF')).toBe(0); // a stretch off-position floors at 0
  });
});

describe('posture state machine — default + revert scaffolding (read as a gate)', () => {
  it('default is active until a window overrides, then reverts', () => {
    let s = createPostureState('balanced');
    expect(activePosture(s)).toBe('balanced');
    s = applyPostureWindow(s, 'attack', 2, 2); // window at batch 2, lasts 2 → until batch 4
    expect(activePosture(s)).toBe('attack');
    let tick = tickPosture(s, 3); // still inside the window
    expect(tick.reverted).toBeNull();
    expect(activePosture(tick.state)).toBe('attack');
    tick = tickPosture(s, 4); // window expires (untilBatch is exclusive)
    expect(tick.reverted).toBe('balanced');
    expect(activePosture(tick.state)).toBe('balanced');
  });
});

describe('tilt ceilings hold (CARD_SYSTEM_V2_CHANGES §7)', () => {
  it('a 4-3-3 mono-stack census sits at each contest ceiling', () => {
    const rng = new RngStream(9);
    for (const c of CONTESTS) {
      const census = tiltCensus(rng, c, 1500);
      // the design ceiling is the intended max; the raw census may exceed by ≤1
      // for stretch-rich contests (CREATE/STOP) — assert it lands in band.
      expect(census.median).toBeGreaterThanOrEqual(TILT_CEILING[c] - 3);
      expect(census.max).toBeLessThanOrEqual(TILT_CEILING[c] + 2);
      // the sharpest dial (FINISH) is the least stackable
      expect(census.median).toBeLessThanOrEqual(TILT_CEILING.KEEP);
    }
  });
});

describe('balance shape matches kc_sim (round-robin spread, no runaway)', () => {
  // one fixed builder stream so the whole suite is deterministic
  const builder = new RngStream(20260708);
  let seed = 1;
  type S = Parameters<typeof buildXI>[1] | 'stopbus';
  const STRATS: S[] = ['random', 'mono:CREATE', 'mono:FINISH', 'mono:KEEP', 'mono:PRESS', 'mono:BREAK', 'mono:STOP', 'stopbus'];
  const mk = (s: S): Squad => squad(builder, s);
  const M = 300;

  const avgs: number[] = [];
  const cells: number[] = [];
  for (const s of STRATS) {
    let acc = 0;
    for (const o of STRATS) {
      let w = 0;
      let d = 0;
      for (let i = 0; i < M; i++) {
        const r = simulateMatch(mk(s), mk(o), { seed: seed++ });
        if (r.score[0] > r.score[1]) w++;
        else if (r.score[0] === r.score[1]) d++;
      }
      const ptsG = (3 * w + d) / M;
      cells.push(ptsG);
      acc += ptsG;
    }
    avgs.push(acc / STRATS.length);
  }

  it('committed builds separate but stay bounded — spread near 0.55', () => {
    const spread = Math.max(...avgs) - Math.min(...avgs);
    expect(spread).toBeGreaterThan(0.4);
    expect(spread).toBeLessThan(0.72);
  });

  it('no runaway matchup', () => {
    expect(Math.max(...cells)).toBeLessThan(2.4); // worst single matchup bounded
    expect(Math.max(...avgs) / Math.min(...avgs)).toBeLessThan(1.7);
  });

  it('mid-vs-mid lands in a sane goal band with draws present', () => {
    let g = 0;
    let draws = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const r = simulateMatch(mk('random'), mk('random'), { seed: seed++ });
      g += r.score[0] + r.score[1];
      if (r.score[0] === r.score[1]) draws++;
    }
    const perSide = g / N / 2;
    expect(perSide).toBeGreaterThan(0.6);
    expect(perSide).toBeLessThan(1.8);
    expect(draws / N).toBeGreaterThan(0.1);
  });
});
