import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V8_CALIBRATION_MATRIX_SEEDS,
  V8_CALIBRATION_SQUAD_KEYS,
  simulateV8CalibrationMatch,
  type V8CalibrationSimulatedMatch,
  type V8CalibrationSquadKey,
} from '../index';

type ScoringPolicyKey = 'repeat_5' | 'repeat_6' | 'repeat_7' | 'repeat_8' | 'repeat_5_cap3' | 'new_thresholds_5';

type ReScoredMatch = {
  homeGoals: number;
  awayGoals: number;
};

type ScoringPolicySummary = {
  policy: ScoringPolicyKey;
  matches: number;
  averageTotalGoals: number;
  medianTotalGoals: number;
  p90TotalGoals: number;
  shareAtLeast18: number;
  shareAtLeast20: number;
  drawRate: number;
  averageMargin: number;
  squads: Record<V8CalibrationSquadKey, {
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
    drawRate: number;
    goalsFor: number;
    goalsAgainst: number;
  }>;
};

function emptySquadRow() {
  return { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, samples: 0 };
}

function scoreMargin(margin: number, policy: ScoringPolicyKey): number {
  if (margin <= 0) return 0;
  if (policy === 'new_thresholds_5') {
    if (margin < 5) return 0;
    if (margin < 12) return 1;
    if (margin < 20) return 2;
    return 3 + Math.floor((margin - 20) / 7);
  }

  const repeat = Number(policy.match(/repeat_(\d+)/)?.[1] ?? 7);
  const raw = Math.floor(margin / repeat);
  if (policy === 'repeat_5_cap3') return Math.min(3, raw);
  return raw;
}

function rescore(match: V8CalibrationSimulatedMatch, policy: ScoringPolicyKey): ReScoredMatch {
  let homeGoals = 0;
  let awayGoals = 0;
  for (const period of match.telemetry.periods) {
    homeGoals += scoreMargin(period.home.attackingMargin, policy);
    awayGoals += scoreMargin(period.away.attackingMargin, policy);
  }
  return { homeGoals, awayGoals };
}

function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function summarize(policy: ScoringPolicyKey, matches: readonly V8CalibrationSimulatedMatch[]): ScoringPolicySummary {
  const totals: number[] = [];
  let draws = 0;
  let margins = 0;
  const squads = Object.fromEntries(V8_CALIBRATION_SQUAD_KEYS.map((key) => [key, emptySquadRow()])) as Record<V8CalibrationSquadKey, ReturnType<typeof emptySquadRow>>;

  for (const match of matches) {
    const scored = rescore(match, policy);
    const total = scored.homeGoals + scored.awayGoals;
    totals.push(total);
    margins += Math.abs(scored.homeGoals - scored.awayGoals);
    if (scored.homeGoals === scored.awayGoals) draws += 1;

    const homeRow = squads[match.homeSquad];
    const awayRow = squads[match.awaySquad];
    homeRow.samples += 1;
    awayRow.samples += 1;
    homeRow.goalsFor += scored.homeGoals;
    homeRow.goalsAgainst += scored.awayGoals;
    awayRow.goalsFor += scored.awayGoals;
    awayRow.goalsAgainst += scored.homeGoals;
    if (scored.homeGoals > scored.awayGoals) {
      homeRow.wins += 1;
      awayRow.losses += 1;
    } else if (scored.awayGoals > scored.homeGoals) {
      awayRow.wins += 1;
      homeRow.losses += 1;
    } else {
      homeRow.draws += 1;
      awayRow.draws += 1;
    }
  }

  const sorted = [...totals].sort((a, b) => a - b);
  const squadReport = Object.fromEntries(V8_CALIBRATION_SQUAD_KEYS.map((key) => {
    const row = squads[key];
    return [key, {
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      winRate: round(row.wins / row.samples),
      drawRate: round(row.draws / row.samples),
      goalsFor: round(row.goalsFor / row.samples),
      goalsAgainst: round(row.goalsAgainst / row.samples),
    }];
  })) as ScoringPolicySummary['squads'];

  return {
    policy,
    matches: matches.length,
    averageTotalGoals: round(totals.reduce((sum, value) => sum + value, 0) / totals.length),
    medianTotalGoals: percentile(sorted, 0.5),
    p90TotalGoals: percentile(sorted, 0.9),
    shareAtLeast18: round(totals.filter((value) => value >= 18).length / totals.length),
    shareAtLeast20: round(totals.filter((value) => value >= 20).length / totals.length),
    drawRate: round(draws / matches.length),
    averageMargin: round(margins / matches.length),
    squads: squadReport,
  };
}

function formatReport(report: readonly ScoringPolicySummary[]): string {
  const lines = report.map((item) => `${item.policy} | avg ${item.averageTotalGoals} | median ${item.medianTotalGoals} | p90 ${item.p90TotalGoals} | >=18 ${Math.round(item.shareAtLeast18 * 100)}% | >=20 ${Math.round(item.shareAtLeast20 * 100)}% | draw ${Math.round(item.drawRate * 100)}% | avg margin ${item.averageMargin}`);
  const squadLines = report.flatMap((item) => [
    '',
    item.policy,
    ...V8_CALIBRATION_SQUAD_KEYS.map((key) => {
      const row = item.squads[key];
      return `  ${key}: W ${Math.round(row.winRate * 100)}% · ${row.goalsFor}-${row.goalsAgainst}`;
    }),
  ]);

  return [
    'V8 scoring sensitivity · identical resolved boards / reveal order',
    'Non-mirror matchups only. This is a re-score experiment, not a gameplay-rule change.',
    '',
    ...lines,
    ...squadLines,
  ].join('\n');
}

describe('V8 scoring sensitivity', () => {
  it('re-scores the fixed-seed archetype boards without changing gameplay state', () => {
    const matches: V8CalibrationSimulatedMatch[] = [];
    for (const homeSquad of V8_CALIBRATION_SQUAD_KEYS) {
      for (const awaySquad of V8_CALIBRATION_SQUAD_KEYS) {
        if (homeSquad === awaySquad) continue;
        for (const seed of V8_CALIBRATION_MATRIX_SEEDS) {
          matches.push(simulateV8CalibrationMatch({ homeSquad, awaySquad, seed }));
        }
      }
    }

    expect(matches).toHaveLength(960);

    const policies: ScoringPolicyKey[] = [
      'repeat_5',
      'repeat_6',
      'repeat_7',
      'repeat_8',
      'repeat_5_cap3',
      'new_thresholds_5',
    ];
    const report = policies.map((policy) => summarize(policy, matches));

    expect(report[0]?.averageTotalGoals).toBeGreaterThan(report[3]?.averageTotalGoals ?? 0);
    expect(report.find((item) => item.policy === 'new_thresholds_5')?.averageTotalGoals).toBeLessThan(report[0]?.averageTotalGoals ?? 0);

    const text = formatReport(report);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-calibration-scoring-sensitivity.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-calibration-scoring-sensitivity.txt', `${text}\n`);
    console.log(`\n${text}\n`);
  }, 20_000);
});
