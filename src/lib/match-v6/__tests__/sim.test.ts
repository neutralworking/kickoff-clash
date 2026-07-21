/**
 * V6 commit 5 — the sim gate. Asserts SANE bands + the scoring-skill gradient +
 * determinism, NOT the exact D2 target (the handoff: "Do not assert exact
 * balance metrics in the first commit"). Balance tuning is ongoing — see
 * docs/kc_v6_sim_report.md and the "Known balance concerns" section.
 */
import { describe, it, expect } from 'vitest';
import { simulateMatch, V6_DECKS } from '../index';

const SEEDS = 15; // 15 × 16 pairings = 240 matches — fast

interface Agg {
  matches: number;
  totalGoals: number;
  draws: number;
  breaks: number;
  changed: number;
  windows: number;
  diverged: number;
  goalsFor: Record<string, { g: number; n: number }>;
}

function runSim(): Agg {
  const a: Agg = { matches: 0, totalGoals: 0, draws: 0, breaks: 0, changed: 0, windows: 0, diverged: 0, goalsFor: {} };
  for (const d of V6_DECKS) a.goalsFor[d.id] = { g: 0, n: 0 };
  let seed = 1;
  for (const p of V6_DECKS) {
    for (const o of V6_DECKS) {
      for (let i = 0; i < SEEDS; i++) {
        const r = simulateMatch({ playerDeckId: p.id, opponentDeckId: o.id, seed: seed++ });
        a.matches += 1;
        a.totalGoals += r.playerScore + r.opponentScore;
        if (r.winner === 'draw') a.draws += 1;
        for (const b of r.breaks) {
          a.breaks += 1;
          if (b.thresholdChanged) a.changed += 1;
          a.windows += 2;
          if (b.playerPlanSize > 0) a.diverged += 1;
          if (b.opponentPlanSize > 0) a.diverged += 1;
        }
        a.goalsFor[p.id].g += r.playerScore;
        a.goalsFor[p.id].n += 1;
        a.goalsFor[o.id].g += r.opponentScore;
        a.goalsFor[o.id].n += 1;
      }
    }
  }
  return a;
}

describe('V6 simulation — sane bands', () => {
  const a = runSim();

  it('produces finite, non-runaway goal totals', () => {
    const avg = a.totalGoals / a.matches;
    expect(Number.isFinite(avg)).toBe(true);
    expect(avg).toBeGreaterThan(1); // matches are not goalless
    expect(avg).toBeLessThan(15); // no runaway
  });

  it('draws happen but do not dominate', () => {
    const drawRate = a.draws / a.matches;
    expect(drawRate).toBeGreaterThan(0.02);
    expect(drawRate).toBeLessThan(0.6);
  });

  it('substitution decisions matter (thresholds change, plans diverge)', () => {
    expect(a.changed / a.breaks).toBeGreaterThan(0.5);
    expect(a.diverged / a.windows).toBeGreaterThan(0.5);
  });

  it('shows a scoring-skill gradient — the combo build out-scores the wall', () => {
    const combo = a.goalsFor['combo'].g / a.goalsFor['combo'].n;
    const wall = a.goalsFor['defensive'].g / a.goalsFor['defensive'].n;
    expect(combo).toBeGreaterThan(wall); // dice/face stacking beats a low-ATT wall
  });

  it('is deterministic — a fixed match reproduces exactly', () => {
    const x = simulateMatch({ playerDeckId: 'aggressive', opponentDeckId: 'combo', seed: 12345 });
    const y = simulateMatch({ playerDeckId: 'aggressive', opponentDeckId: 'combo', seed: 12345 });
    expect(x.playerScore).toBe(y.playerScore);
    expect(x.opponentScore).toBe(y.opponentScore);
    expect(x.log.length).toBe(y.log.length);
  });
});
