import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V8_CALIBRATION_MATRIX_SEEDS,
  V8_CALIBRATION_SQUAD_KEYS,
  simulateV8CalibrationMatch,
  type V8CalibrationSquadKey,
} from '../index';

type PeriodAggregate = {
  period: number;
  samples: number;
  goalsFor: number;
  goalsAgainst: number;
  attack: number;
  defence: number;
  attackingMargin: number;
  unusedEnergy: number;
  playersDeployed: number;
  tacticalsPlayed: number;
  tacticalAttack: number;
  actionAttackDelta: number;
  actionDefenceDelta: number;
  windowTacticalsPlayed: number;
  windowEnergySpent: number;
  windowTacticalAtt: number;
  windowCancellations: number;
};

function blank(period: number): PeriodAggregate {
  return {
    period,
    samples: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    attack: 0,
    defence: 0,
    attackingMargin: 0,
    unusedEnergy: 0,
    playersDeployed: 0,
    tacticalsPlayed: 0,
    tacticalAttack: 0,
    actionAttackDelta: 0,
    actionDefenceDelta: 0,
    windowTacticalsPlayed: 0,
    windowEnergySpent: 0,
    windowTacticalAtt: 0,
    windowCancellations: 0,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

describe('V8 calibration period diagnostics', () => {
  it('shows how each archetype develops across the persistent four-period board', () => {
    const totals = new Map<V8CalibrationSquadKey, PeriodAggregate[]>();
    for (const squad of V8_CALIBRATION_SQUAD_KEYS) totals.set(squad, [1, 2, 3, 4].map(blank));

    for (const homeSquad of V8_CALIBRATION_SQUAD_KEYS) {
      for (const awaySquad of V8_CALIBRATION_SQUAD_KEYS) {
        if (homeSquad === awaySquad) continue;
        for (const seed of V8_CALIBRATION_MATRIX_SEEDS) {
          const match = simulateV8CalibrationMatch({ homeSquad, awaySquad, seed });
          for (const side of ['home', 'away'] as const) {
            const squad = side === 'home' ? homeSquad : awaySquad;
            const opponent = side === 'home' ? 'away' : 'home';
            for (const period of match.telemetry.periods) {
              const target = totals.get(squad)![period.period - 1]!;
              const own = period[side];
              target.samples += 1;
              target.goalsFor += own.goals;
              target.goalsAgainst += period[opponent].goals;
              target.attack += own.attack;
              target.defence += own.defence;
              target.attackingMargin += own.attackingMargin;
              target.unusedEnergy += own.unusedEnergy;
              target.playersDeployed += own.playersDeployed;
              target.tacticalsPlayed += own.tacticalsPlayed;
              target.tacticalAttack += own.tacticalAttack;
              target.actionAttackDelta += own.actionAttackDelta;
              target.actionDefenceDelta += own.actionDefenceDelta;
              target.windowTacticalsPlayed += own.windowTacticalsPlayed;
              target.windowEnergySpent += own.windowEnergySpent;
              target.windowTacticalAtt += own.windowTacticalAtt;
              target.windowCancellations += own.windowCancellations;
            }
          }
        }
      }
    }

    const report = Object.fromEntries(V8_CALIBRATION_SQUAD_KEYS.map((squad) => [
      squad,
      totals.get(squad)!.map((period) => {
        expect(period.samples).toBe(320);
        const divisor = period.samples;
        return {
          period: period.period,
          samples: period.samples,
          goalsFor: round(period.goalsFor / divisor),
          goalsAgainst: round(period.goalsAgainst / divisor),
          attack: round(period.attack / divisor),
          defence: round(period.defence / divisor),
          attackingMargin: round(period.attackingMargin / divisor),
          unusedEnergy: round(period.unusedEnergy / divisor),
          playersDeployed: round(period.playersDeployed / divisor),
          tacticalsPlayed: round(period.tacticalsPlayed / divisor),
          tacticalAttack: round(period.tacticalAttack / divisor),
          actionAttackDelta: round(period.actionAttackDelta / divisor),
          actionDefenceDelta: round(period.actionDefenceDelta / divisor),
          windowTacticalsPlayed: round(period.windowTacticalsPlayed / divisor),
          windowEnergySpent: round(period.windowEnergySpent / divisor),
          windowTacticalAtt: round(period.windowTacticalAtt / divisor),
          windowCancellations: round(period.windowCancellations / divisor),
        };
      }),
    ]));

    const lines = V8_CALIBRATION_SQUAD_KEYS.flatMap((squad) => [
      squad,
      ...report[squad].map((period) => `  P${period.period}: ${period.goalsFor} GF / ${period.goalsAgainst} GA · ${period.attack} ATT / ${period.defence} DEF · margin ${period.attackingMargin} · ${period.playersDeployed} deployed · ${period.unusedEnergy} E unused · ${period.tacticalsPlayed} Tacticals (${period.tacticalAttack} ATT) · window ${period.windowTacticalsPlayed} plays / ${period.windowEnergySpent} E / ${period.windowTacticalAtt} ATT · Action Δ ${period.actionAttackDelta}/${period.actionDefenceDelta}`),
    ]);

    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/v8-calibration-periods.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('test-results/v8-calibration-periods.txt', `${lines.join('\n')}\n`);
  }, 20_000);
});
