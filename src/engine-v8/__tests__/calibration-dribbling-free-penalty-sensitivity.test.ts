import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calibrationEnergyForPeriod } from '../calibration-balance';
import {
  planV8CalibrationSide,
  planV8CalibrationWindow,
  V8_CALIBRATION_MATRIX_SEEDS,
  type V8CalibrationMatrixPlay,
} from '../calibration-matchup-matrix';
import { getV8CalibrationSquad, V8_CALIBRATION_SQUAD_KEYS, type V8CalibrationSquadKey } from '../calibration-squads';
import {
  calibrationHandTacticals,
  calibrationPlayersInZone,
  calibrationTeamTotals,
  createV8CalibrationMatch,
  endV8CalibrationPeriod,
  resolveCommittedCalibrationTactical,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  type V8CalibrationSide,
  type V8CalibrationState,
} from '../calibration-runtime';
import { goalsFromAttackDefence, type V8Zone } from '../core';

interface SensitivityResult {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  drawRate: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  averageGoalDifference: number;
  freeGeneratedPenalties: number;
  penaltyResolutions: number;
  windowPenaltyResolutions: number;
  enhancedPenaltyResolutions: number;
  pairings: Array<{
    opponent: V8CalibrationSquadKey;
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
    averageGoalsFor: number;
    averageGoalsAgainst: number;
  }>;
}

interface ResolvedSequence {
  state: V8CalibrationState;
  freeGeneratedPenalties: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rounded(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function withCalibrationEnergy(state: V8CalibrationState): V8CalibrationState {
  const energy = calibrationEnergyForPeriod(state.period);
  return {
    ...state,
    teams: {
      home: { ...state.teams.home, energy },
      away: { ...state.teams.away, energy },
    },
  };
}

function applyManager(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): V8CalibrationState {
  const next = clone(state);
  const count = calibrationPlayersInZone(next, side, zone).length;
  if (zone === 'ATT') next.tacticalAttack[side].ATT += count * 2;
  if (zone === 'DEF') next.zoneDefenceBonus[side].DEF += count * 2;
  if (zone === 'MID') {
    next.tacticalAttack[side].MID += count;
    next.zoneDefenceBonus[side].MID += count;
  }
  next.events.push({
    type: 'action_triggered',
    period: next.period,
    text: `${side.toUpperCase()} reveals CONTROL → ${zone}: resolves on ${count} players, then leaves the slot.`,
  });
  return next;
}

function revealWithFreeGeneratedPenalty(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  cardId: string,
  zone: V8Zone,
): ResolvedSequence {
  const next = revealCalibrationPlayer(state, side, cardId, zone);
  if (cardId !== 'neymar') return { state: next, freeGeneratedPenalties: 0 };

  let freeGeneratedPenalties = 0;
  for (const card of calibrationHandTacticals(next, side)) {
    if (card.type !== 'penalty' || card.generatedBy !== 'neymar') continue;
    if (card.metadata.enteredHandPeriod !== next.period) continue;
    if (card.metadata.freeThroughPeriod === next.period) continue;
    card.metadata.freeThroughPeriod = next.period;
    freeGeneratedPenalties += 1;
  }
  return { state: next, freeGeneratedPenalties };
}

function resolveSequence(state: V8CalibrationState, plays: readonly V8CalibrationMatrixPlay[]): ResolvedSequence {
  let next = state;
  let freeGeneratedPenalties = 0;
  for (const play of plays) {
    if (play.kind === 'player') {
      const revealed = revealWithFreeGeneratedPenalty(next, play.side, play.cardId, play.zone);
      next = revealed.state;
      freeGeneratedPenalties += revealed.freeGeneratedPenalties;
    } else if (play.kind === 'tactical') {
      next = resolveCommittedCalibrationTactical(next, play.side, play.card, play.zone, play.cost);
    } else {
      next = applyManager(next, play.side, play.zone);
    }
  }
  return { state: next, freeGeneratedPenalties };
}

function priority(
  state: V8CalibrationState,
  homeScore: number,
  awayScore: number,
  seed: number,
): V8CalibrationSide {
  if (homeScore !== awayScore) return homeScore > awayScore ? 'home' : 'away';
  const home = calibrationTeamTotals(state, 'home');
  const away = calibrationTeamTotals(state, 'away');
  if (home.attack !== away.attack) return home.attack > away.attack ? 'home' : 'away';
  const homeStrength = home.attack + home.defence;
  const awayStrength = away.attack + away.defence;
  if (homeStrength !== awayStrength) return homeStrength > awayStrength ? 'home' : 'away';
  const mixed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return mixed % 2 === 0 ? 'home' : 'away';
}

function simulate(homeSquad: V8CalibrationSquadKey, awaySquad: V8CalibrationSquadKey, seed: number) {
  let state = withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(getV8CalibrationSquad(homeSquad).playerIds, seed),
    seededShuffle(getV8CalibrationSquad(awaySquad).playerIds, seed + 1),
  ));
  let homeScore = 0;
  let awayScore = 0;
  let homeManagerAvailable = true;
  let awayManagerAvailable = true;
  let freeGeneratedPenalties = 0;
  let penaltyResolutions = 0;
  let windowPenaltyResolutions = 0;
  let enhancedPenaltyResolutions = 0;

  for (let periodIndex = 0; periodIndex < 4; periodIndex += 1) {
    const home = planV8CalibrationSide(state, 'home', homeManagerAvailable, homeSquad);
    const away = planV8CalibrationSide(home.state, 'away', awayManagerAvailable, awaySquad);
    homeManagerAvailable = home.managerAvailable;
    awayManagerAvailable = away.managerAvailable;
    const plays = [...home.pending, ...away.pending];
    const first = priority(away.state, homeScore, awayScore, seed + away.state.period * 101);

    const firstResolved = resolveSequence(away.state, plays.filter((play) => play.side === first));
    const secondResolved = resolveSequence(firstResolved.state, plays.filter((play) => play.side !== first));
    freeGeneratedPenalties += firstResolved.freeGeneratedPenalties + secondResolved.freeGeneratedPenalties;
    let resolved = secondResolved.state;

    const window = resolveGeneratedTacticalWindow(resolved, [
      ...planV8CalibrationWindow(resolved, 'home', homeSquad),
      ...planV8CalibrationWindow(resolved, 'away', awaySquad),
    ]);
    resolved = window.state;

    const dribblingSide: V8CalibrationSide | undefined = homeSquad === 'dribbling_penalty'
      ? 'home'
      : awaySquad === 'dribbling_penalty' ? 'away' : undefined;
    if (dribblingSide) {
      for (const resolution of resolved.tacticalResolutions) {
        if (resolution.side !== dribblingSide || resolution.type !== 'penalty' || resolution.cancelled) continue;
        penaltyResolutions += 1;
        if (resolution.window) windowPenaltyResolutions += 1;
        if (resolution.attack >= 8) enhancedPenaltyResolutions += 1;
      }
    }

    const homeTotals = calibrationTeamTotals(resolved, 'home');
    const awayTotals = calibrationTeamTotals(resolved, 'away');
    homeScore += goalsFromAttackDefence(homeTotals.attack, awayTotals.defence);
    awayScore += goalsFromAttackDefence(awayTotals.attack, homeTotals.defence);

    const wasFinal = resolved.period === 4;
    state = endV8CalibrationPeriod(resolved);
    if (!wasFinal) state = withCalibrationEnergy(state);
  }

  return {
    homeScore,
    awayScore,
    freeGeneratedPenalties,
    penaltyResolutions,
    windowPenaltyResolutions,
    enhancedPenaltyResolutions,
  };
}

function runSensitivity(): SensitivityResult {
  const opponents = V8_CALIBRATION_SQUAD_KEYS.filter((key) => key !== 'dribbling_penalty');
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let freeGeneratedPenalties = 0;
  let penaltyResolutions = 0;
  let windowPenaltyResolutions = 0;
  let enhancedPenaltyResolutions = 0;
  const pairings: SensitivityResult['pairings'] = [];

  for (const opponent of opponents) {
    let pairingWins = 0;
    let pairingDraws = 0;
    let pairingLosses = 0;
    let pairingGoalsFor = 0;
    let pairingGoalsAgainst = 0;

    for (const seed of V8_CALIBRATION_MATRIX_SEEDS) {
      for (const dribblingHome of [true, false]) {
        const homeSquad = dribblingHome ? 'dribbling_penalty' : opponent;
        const awaySquad = dribblingHome ? opponent : 'dribbling_penalty';
        const match = simulate(homeSquad, awaySquad, seed);
        const scoreFor = dribblingHome ? match.homeScore : match.awayScore;
        const scoreAgainst = dribblingHome ? match.awayScore : match.homeScore;
        goalsFor += scoreFor;
        goalsAgainst += scoreAgainst;
        pairingGoalsFor += scoreFor;
        pairingGoalsAgainst += scoreAgainst;
        freeGeneratedPenalties += match.freeGeneratedPenalties;
        penaltyResolutions += match.penaltyResolutions;
        windowPenaltyResolutions += match.windowPenaltyResolutions;
        enhancedPenaltyResolutions += match.enhancedPenaltyResolutions;

        if (scoreFor === scoreAgainst) {
          draws += 1;
          pairingDraws += 1;
        } else if (scoreFor > scoreAgainst) {
          wins += 1;
          pairingWins += 1;
        } else {
          losses += 1;
          pairingLosses += 1;
        }
      }
    }

    const pairingMatches = pairingWins + pairingDraws + pairingLosses;
    pairings.push({
      opponent,
      wins: pairingWins,
      draws: pairingDraws,
      losses: pairingLosses,
      winRate: rounded(pairingWins / pairingMatches),
      averageGoalsFor: rounded(pairingGoalsFor / pairingMatches),
      averageGoalsAgainst: rounded(pairingGoalsAgainst / pairingMatches),
    });
  }

  const matches = wins + draws + losses;
  return {
    matches,
    wins,
    draws,
    losses,
    winRate: rounded(wins / matches),
    drawRate: rounded(draws / matches),
    averageGoalsFor: rounded(goalsFor / matches),
    averageGoalsAgainst: rounded(goalsAgainst / matches),
    averageGoalDifference: rounded((goalsFor - goalsAgainst) / matches),
    freeGeneratedPenalties,
    penaltyResolutions,
    windowPenaltyResolutions,
    enhancedPenaltyResolutions,
    pairings,
  };
}

function format(result: SensitivityResult): string {
  return [
    'V8 Dribbling / Penalty · immediate generated-Penalty sensitivity',
    'Candidate only: a Penalty generated by RAINBOW FLICK costs 0 in that same Generated-Tactical Window, then reverts to printed Cost 1 if held.',
    'Original XI and prerequisites. No Penalty ATT, Energy, player Cost/stat, FLIP FLAP or accepted runtime change.',
    '',
    `Overall: ${result.matches} matches | W ${Math.round(result.winRate * 100)}% | D ${Math.round(result.drawRate * 100)}% | GF ${result.averageGoalsFor} | GA ${result.averageGoalsAgainst} | GD ${result.averageGoalDifference >= 0 ? '+' : ''}${result.averageGoalDifference}`,
    `RAINBOW FLICK Penalties marked free this period: ${result.freeGeneratedPenalties} | Penalty resolutions: ${result.penaltyResolutions} | window Penalties: ${result.windowPenaltyResolutions} | enhanced (>=8 ATT): ${result.enhancedPenaltyResolutions}`,
    '',
    'PAIRINGS',
    ...result.pairings.map((pair) => `${pair.opponent}: W ${Math.round(pair.winRate * 100)}% | ${pair.wins}-${pair.draws}-${pair.losses} | goals ${pair.averageGoalsFor}-${pair.averageGoalsAgainst}`),
  ].join('\n');
}

describe('V8 immediate generated-Penalty sensitivity', () => {
  it('measures free same-window RAINBOW FLICK resolution without changing accepted gameplay', () => {
    const result = runSensitivity();
    const outputDir = join(process.cwd(), 'test-results');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'v8-calibration-dribbling-free-penalty-sensitivity.json'), `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(join(outputDir, 'v8-calibration-dribbling-free-penalty-sensitivity.txt'), `${format(result)}\n`);
    console.log(`\n${format(result)}\n`);

    expect(result.matches).toBe(320);
    expect(result.freeGeneratedPenalties).toBeGreaterThan(0);
  }, 15_000);
});
