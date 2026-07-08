/**
 * KC six-contest engine (engine-v2) balance instrument — the TS counterpart to
 * scripts/kc_sim.py, run against the REAL engine (xG FINISH model). Mirrors
 * kc_sim sections A (mid-vs-mid calibration) and C (committed round-robin).
 *
 *   npx tsx scripts/kc_v2_sim.ts
 *
 * Targets (CARD_SYSTEM_V2_CHANGES §7): round-robin AVG spread ≈0.55, no runaway
 * matchup, ~1.2 goals/side mid-vs-mid. This is the tuning loop; the vitest
 * harness (src/engine-v2/__tests__) locks the asserts.
 */

import {
  buildXI,
  buildStopbus,
  simulateMatch,
  RngStream,
  MANAGERS,
  MANAGERS_BY_ID,
  type Manager,
  type Contest,
  type Strategy,
  type Squad,
  type Card,
} from '../src/engine-v2/index';

const builder = new RngStream(20260708);
let matchSeed = 1;

const STRATS: (Strategy | 'stopbus')[] = [
  'random',
  'mono:CREATE',
  'mono:FINISH',
  'mono:KEEP',
  'mono:PRESS',
  'mono:BREAK',
  'mono:STOP',
  'stopbus',
];

function mk(strat: Strategy | 'stopbus', q = 0): Squad {
  let cards: Card[];
  let hasTaker = false;
  let hasCarrier = false;
  if (strat === 'stopbus') {
    cards = buildStopbus(builder, q);
    hasTaker = true;
    hasCarrier = true;
  } else {
    cards = buildXI(builder, strat, q);
  }
  return { cards, posture: 'balanced', hasTaker, hasCarrier };
}

// ---- A. mid-vs-mid calibration ----
{
  const N = 6000;
  let gh = 0;
  let ga = 0;
  let draws = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch(mk('random'), mk('random'), { seed: matchSeed++ });
    gh += r.score[0];
    ga += r.score[1];
    if (r.score[0] === r.score[1]) draws++;
  }
  console.log('=== A. mid-vs-mid (both random) ===');
  console.log(`avg goals home ${(gh / N).toFixed(2)}  away ${(ga / N).toFixed(2)}  draw% ${((100 * draws) / N).toFixed(0)}`);
}

// ---- C. committed round-robin, pts/g ----
{
  const M = 1000;
  const rows: { s: string; avg: number; row: number[] }[] = [];
  for (const s of STRATS) {
    const row: number[] = [];
    for (const o of STRATS) {
      let w = 0;
      let d = 0;
      for (let i = 0; i < M; i++) {
        const r = simulateMatch(mk(s), mk(o), { seed: matchSeed++ });
        if (r.score[0] > r.score[1]) w++;
        else if (r.score[0] === r.score[1]) d++;
      }
      row.push((3 * w + d) / M);
    }
    rows.push({ s, avg: row.reduce((a, b) => a + b, 0) / row.length, row });
  }
  console.log('\n=== C. committed round-robin, pts/g ===');
  const head = STRATS.map((s) => s.split(':').pop()!.slice(0, 4).padStart(6)).join('');
  console.log(''.padEnd(11) + head + '   AVG');
  for (const { s, avg, row } of rows) {
    console.log(s.padEnd(11) + row.map((v) => v.toFixed(2).padStart(6)).join('') + '   ' + avg.toFixed(2));
  }
  const avgs = rows.map((r) => r.avg);
  const spread = Math.max(...avgs) - Math.min(...avgs);
  const maxCell = Math.max(...rows.flatMap((r) => r.row));
  console.log(`\nAVG spread ${spread.toFixed(2)}  (target ≈0.55)   max cell ${maxCell.toFixed(2)}   maxAVG/minAVG ${(Math.max(...avgs) / Math.min(...avgs)).toFixed(2)}`);
}

// ---- E. manager reweight (NW-140) ----
{
  const M = 1500;
  const balanced = (): Squad => ({ cards: buildXI(builder, 'random'), posture: 'balanced' });
  const matched = (m: Manager): Squad => ({
    cards: buildXI(builder, `mono:${m.favoured}` as Strategy),
    manager: m,
    formation: m.formation,
    hasTaker: m.favoured === 'STOP',
    hasCarrier: m.favoured === 'STOP',
  });
  const uncommitted = (m: Manager): Squad => ({
    cards: buildXI(builder, 'random'),
    manager: m,
    formation: m.formation,
  });

  const ptsG = (mkA: () => Squad, mkB: () => Squad, M2 = M) => {
    let w = 0, d = 0;
    for (let i = 0; i < M2; i++) {
      const r = simulateMatch(mkA(), mkB(), { seed: matchSeed++ });
      if (r.score[0] > r.score[1]) w++;
      else if (r.score[0] === r.score[1]) d++;
    }
    return (3 * w + d) / M2;
  };

  const base = ptsG(balanced, balanced);
  console.log('\n=== E. manager reweight (matched build+manager vs balanced) ===');
  console.log(`baseline balanced-vs-balanced pts/g ${base.toFixed(2)}`);
  console.log(`${'manager'.padEnd(15)}${'favoured'.padStart(9)}${'matched'.padStart(9)}${'uncommit'.padStart(9)}${'×base'.padStart(7)}`);
  for (const m of MANAGERS) {
    const mt = ptsG(() => matched(m), balanced);
    const un = ptsG(() => uncommitted(m), balanced);
    console.log(`${m.name.padEnd(15)}${m.favoured.padStart(9)}${mt.toFixed(2).padStart(9)}${un.toFixed(2).padStart(9)}${(mt / base).toFixed(2).padStart(7)}`);
  }

  // swing: a fixed mono build under each manager vs a balanced field
  console.log('\n=== E2. build swing across managers (mono:CREATE, vs balanced) ===');
  const build: Contest = 'CREATE';
  const rowVals: { name: string; v: number }[] = [];
  for (const m of MANAGERS) {
    const v = ptsG(
      () => ({ cards: buildXI(builder, `mono:${build}` as Strategy), manager: m, formation: m.formation }),
      balanced
    );
    rowVals.push({ name: m.name, v });
  }
  rowVals.sort((a, b) => b.v - a.v);
  for (const { name, v } of rowVals) console.log(`  ${name.padEnd(15)} ${v.toFixed(2)}`);
  console.log(`  swing best↔worst: ${rowVals[0].v.toFixed(2)} (${rowVals[0].name}) ↔ ${rowVals.at(-1)!.v.toFixed(2)} (${rowVals.at(-1)!.name})`);
}
