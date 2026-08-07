import { describe, expect, it } from 'vitest';
import {
  calibrationHandTacticals,
  calibrationTeamTotals,
  createV8CalibrationState,
  playCalibrationTactical,
  revealCalibrationPlayer,
} from '../calibration-runtime';
import {
  buildV8CalibrationMatchTelemetry,
  captureV8CalibrationPeriodTelemetry,
  type V8CalibrationTelemetryPlay,
} from '../calibration-telemetry';

describe('V8 calibration telemetry', () => {
  it('attributes resolved Tactical ATT and a major Action chain from the existing resolution data', () => {
    let state = createV8CalibrationState({ homeEnergy: 10, awayEnergy: 10 });
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'wambach', 'ATT');

    const cross = calibrationHandTacticals(state, 'home').find((card) => card.type === 'cross');
    expect(cross).toBeDefined();
    state = playCalibrationTactical(state, 'home', cross!.id, 'ATT');

    const home = calibrationTeamTotals(state, 'home');
    const away = calibrationTeamTotals(state, 'away');
    const plays: V8CalibrationTelemetryPlay[] = [
      { kind: 'player', side: 'home', cardId: 'beckham' },
      { kind: 'player', side: 'home', cardId: 'wambach' },
      { kind: 'tactical', side: 'home', card: cross! },
    ];

    const period = captureV8CalibrationPeriodTelemetry({
      state,
      homeGoals: 5,
      awayGoals: 0,
      homeAttack: home.attack,
      homeDefence: home.defence,
      awayAttack: away.attack,
      awayDefence: away.defence,
      plays,
    });

    expect(period.home.tacticalAttack).toBe(8);
    expect(period.home.tacticalAttackGenerated).toBe(8);
    expect(period.home.playersDeployed).toBe(2);
    expect(period.home.tacticalsPlayed).toBe(1);
    expect(period.home.cancelledChances).toBe(0);
    expect(period.home.majorChains).toContain('BEND IT → Cross → DIVING HEADER +4 = +8 ATT');
  });

  it('aggregates final deployment, unused Energy and Tactical totals without changing scoring', () => {
    let state = createV8CalibrationState({ homeEnergy: 10, awayEnergy: 10 });
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    const cross = calibrationHandTacticals(state, 'home').find((card) => card.type === 'cross')!;
    state = playCalibrationTactical(state, 'home', cross.id, 'ATT');
    const home = calibrationTeamTotals(state, 'home');
    const away = calibrationTeamTotals(state, 'away');
    const period = captureV8CalibrationPeriodTelemetry({
      state,
      homeGoals: 5,
      awayGoals: 0,
      homeAttack: home.attack,
      homeDefence: home.defence,
      awayAttack: away.attack,
      awayDefence: away.defence,
      plays: [
        { kind: 'player', side: 'home', cardId: 'beckham' },
        { kind: 'player', side: 'home', cardId: 'wambach' },
        { kind: 'tactical', side: 'home', card: cross },
      ],
    });

    const match = buildV8CalibrationMatchTelemetry({
      state,
      homeSquad: 'cross',
      awaySquad: 'balanced_midrange',
      homeScore: 5,
      awayScore: 0,
      periods: [period],
    });

    expect(match.finalScore).toBe('5–0');
    expect(match.winner).toBe('home');
    expect(match.totalGoals).toBe(5);
    expect(match.home.playersDeployed).toBe(2);
    expect(match.home.playersUndeployed).toBe(9);
    expect(match.home.tacticalsPlayed).toBe(1);
    expect(match.home.tacticalAttackGenerated).toBe(8);
    expect(match.home.totalUnusedEnergy).toBe(state.teams.home.energy);
  });
});
