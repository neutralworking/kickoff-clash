import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V8_CALIBRATION_MATRIX_SEEDS,
  V8_CALIBRATION_SQUAD_KEYS,
  simulateV8CalibrationMatch,
  type V8CalibrationSimulatedMatch,
  type V8CalibrationSquadKey,
} from '../index';

type ScoringPolicyKey =
  | 'repeat_5'
  | 'repeat_6'
  | 'repeat_7'
  | 'repeat_8'
  | 'repeat_5_cap3'
  | 'new_thresholds_5';

type Score = { home: number; away: number };

type SquadSensitivity = {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
};

type PolicySensitivity = {
  policy: ScoringPolicyKey;
  matches: number;
  averageTotalGoals: number;
  medianTotalGoals: number;
  p90TotalGoals: number;
  shareAtLeast18Goals: number;
  shareAtLeast20Goals: number;
  drawRate: number;
  averageWinningMargin: number;
  squads: Record<V8CalibrationSquadKey, SquadSensitivity>;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function repeatGoals(margin: number, step: number, cap = Number.POSITIVE_INFINITY): number {
  return Math.min(cap, Math.max(0, Math.floor(margin / step)));
}

function rescoreMatch(match: V8CalibrationSimulatedMatch, policy: ScoringPolicyKey): Score {
  let home = 0;
  let away = 0;
  let homeBankedThresholds = 0;
  let awayBankedThresholds = 0;

  for (const period of match.telemetry.periods) {
    const homeMargin = period.home.attack - period.away.defence;
    const awayMargin = period.away.attack - period.home.defence;

    if (policy === 'new_thresholds_5') {
      const homeThresholds = repeatGoals(homeMargin, 5);
      const awayThresholds = repeatGoals(awayMargin, 5);
      home += Math.max(0, homeThresholds - homeBankedThresholds);
      away += Math.max(0, awayThresholds - awayBankedThresholds);
      homeBankedThresholds = Math.max(homeBankedThresholds, homeThresholds);
      awayBankedThresholds = Math.max(awayBankedThresholds, awayThresholds);
      continue;
    }

    const step = policy === 'repeat_6' ? 6 : policy === 'repeat_7' ? 7 : policy === 'repeat_8' ? 8 : 5;
    const cap = policy === 'repeat_5_cap3' ? 3 : Number.POSITIVE_INFINITY;
    home += repeatGoals(homeMargin, step, cap);
    away += repeatGoals(awayMargin, step, cap);
  }

  return { home, away };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function summarize(policy: ScoringPolicyKey, matches: readonly V8CalibrationSimulatedMatch[]): PolicySensitivity {
  const totals: number[] = [];
  let draws = 0;
  let winningMargin = 0;
  let atLeast18 = 0;
  let atLeast20 = 0;
  const squadAcc = Object.fromEntries(V8_CALIBRATION_SQUAD_KEYS.map((squad) => [squad, {
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  }])) as Record<V8CalibrationSquadKey, {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  }>;

  for (const match of matches) {
    const score = rescoreMatch(match, policy);
    const total = score.home + score.away;
    totals.push(total);
    if (score.home === score.away) draws += 1;
    winningMargin += Math.abs(score.home - score.away);
    if (total >= 18) atLeast18 += 1;
    if (total >= 20) atLeast20 += 1;

    for (const side of ['home', 'away'] as const) {
      const squad = side === 'home' ? match.homeSquad : match.awaySquad;
      const goalsFor = side === 'home' ? score.home : score.away;
      const goalsAgainst = side === 'home' ? score.away : score.home;
      const acc = squadAcc[squad];
      acc.matches += 1;
      acc.goalsFor += goalsFor;
      acc.goalsAgainst += goalsAgainst;
      if (goalsFor === goalsAgainst) acc.draws += 1;
      else if (goalsFor > goalsAgainst) acc.wins += 1;
      else acc.losses += 1;
    }
  }

  totals.sort((a, b) => a - b);
  const count = matches.length;
  const squads = Object.fromEntries(V8_CALIBRATION_SQUAD_KEYS.map((squad) => {
    const acc = squadAcc[squad];
    return [squad, {
      matches: acc.matches,
      wins: acc.wins,
      draws: acc.draws,
      losses: acc.losses,
      winRate: round(acc.wins / acc.matches),
      averageGoalsFor: round(acc.goalsFor / acc.matches),
      averageGoalsAgainst: round(acc.goalsAgainst / acc.matches),
    } satisfies SquadSensitivity];
  })) as Record<V8CalibrationSquadKey, SquadSensitivity>;

  return {
    policy,
    matches: count,
    averageTotalGoals: round(totals.reduce((sum, value) => sum + value, 0) / count),
    medianTotalGoals: percentile(totals, 0.5),
    p90TotalGoals: percentile(totals, 0.9),
    shareAtLeast18Goals: round(atLeast18 / count),
    shareAtLeast20Goals: round(atLeast20 / count),
    drawRate: round(draws / count),
    averageWinningMargin: round(winningMargin / count),
    squads,
  };
}

function formatReport(report: readonly PolicySensitivity[]): string {
  const lines = report.map((item) => [
    item.policy,
    `avg ${item.averageTotalGoals}`,
    `median ${item.medianTotalGoals}`,
    `p90 ${item.p90TotalGoals}`,
    `>=18 ${Math.round(item.shareAtLeast18Goals * 100)}%`,
    `>=20 ${Math.round(item.shareAtLeast20Goals * 100)}%`,
    `draw ${Math.round(item.drawRate * 100)}%`,
    `avg margin ${item.averageWinningMargin}`,
  ].join(' | '));

  const squadLines = report.flatMap((item) => [
    '',
    item.policy,
    ...V8_CALIBRATION_SQUAD_KEYS.map((squad) => {
      const row = item.squads[squad];
      return `  ${squad}: W ${Math.round(row.winRate * 100)}% · ${row.averageGoalsFor}-${row.averageGoalsAgainst}`;
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
  });
});
