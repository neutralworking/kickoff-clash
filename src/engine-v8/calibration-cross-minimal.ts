import { calibrationEnergyForPeriod, calibrationPlayCost } from './calibration-balance';
import { getV8CalibrationPlayer } from './calibration-cards';
import { endV8CalibrationPeriod, revealCalibrationPlayer } from './calibration-decay';
import {
  planV8CalibrationSide,
  planV8CalibrationWindow,
  type V8CalibrationMatrixPlay,
} from './calibration-matchup-matrix';
import {
  calibrationPlayersInZone,
  calibrationTeamTotals,
  createV8CalibrationMatch,
  resolveCommittedCalibrationTactical,
  resolveGeneratedTacticalWindow,
  type V8CalibrationSide,
  type V8CalibrationState,
} from './calibration-runtime';
import {
  V8_CALIBRATION_SQUAD_KEYS,
  getV8CalibrationSquad,
  type V8CalibrationSquadKey,
} from './calibration-squads';
import { goalsFromAttackDefence, type V8Zone } from './core';

export const V8_CROSS_MINIMAL_SEEDS = [
  8_082_026,
  8_291_484,
  8_500_942,
  8_710_400,
  8_919_858,
  9_129_316,
  9_338_774,
  9_548_232,
] as const;

const NEUTRAL_SUPPORT = [
  'schmeichel',
  'gentile',
  'seedorf',
  'iniesta',
  'beckenbauer',
  'makelele',
  'bremner',
  'sinclair',
  'okocha',
  'ronaldo',
  'duff',
  'baresi',
  'garrincha',
  'neymar',
] as const;

const CORE_CASES = [
  { id: 'beckham-wambach', core: ['beckham', 'wambach'] },
  { id: 'di-maria-wambach', core: ['di-maria', 'wambach'] },
  { id: 'dzajic-wambach', core: ['dzajic', 'wambach'] },
  { id: 'beckham-di-maria', core: ['beckham', 'di-maria'] },
  { id: 'beckham-di-maria-wambach', core: ['beckham', 'di-maria', 'wambach'] },
  { id: 'beckham-dzajic-wambach', core: ['beckham', 'dzajic', 'wambach'] },
  { id: 'di-maria-dzajic-wambach', core: ['di-maria', 'dzajic', 'wambach'] },
  { id: 'beckham-di-maria-dzajic', core: ['beckham', 'di-maria', 'dzajic'] },
] as const;

export interface V8CrossMinimalDeck {
  id: string;
  core: readonly string[];
  playerIds: readonly string[];
  effectiveCost: number;
}

export interface V8CrossMinimalSummary {
  id: string;
  core: readonly string[];
  effectiveCost: number;
  matches: number;
  winRate: number;
  drawRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface V8CrossMinimalReport {
  seeds: readonly number[];
  matches: number;
  decks: readonly V8CrossMinimalDeck[];
  summaries: readonly V8CrossMinimalSummary[];
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

function effectiveCost(playerIds: readonly string[]): number {
  return playerIds.reduce((sum, id) => sum + calibrationPlayCost(getV8CalibrationPlayer(id)), 0);
}

export function buildV8CrossMinimalDecks(): V8CrossMinimalDeck[] {
  return CORE_CASES.map(({ id, core }) => {
    const support = NEUTRAL_SUPPORT.filter((playerId) => !core.includes(playerId as never)).slice(0, 11 - core.length);
    const playerIds = [...core, ...support];
    if (playerIds.length !== 11 || new Set(playerIds).size !== 11) throw new Error(`Invalid Cross minimal deck ${id}`);
    return { id, core, playerIds, effectiveCost: effectiveCost(playerIds) };
  });
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
  return next;
}

function resolveSequence(state: V8CalibrationState, plays: readonly V8CalibrationMatrixPlay[]): V8CalibrationState {
  let next = state;
  for (const play of plays) {
    if (play.kind === 'player') next = revealCalibrationPlayer(next, play.side, play.cardId, play.zone);
    else if (play.kind === 'tactical') next = resolveCommittedCalibrationTactical(next, play.side, play.card, play.zone, play.cost);
    else next = applyManager(next, play.side, play.zone);
  }
  return next;
}

function priority(state: V8CalibrationState, homeScore: number, awayScore: number, seed: number): V8CalibrationSide {
  if (homeScore !== awayScore) return homeScore > awayScore ? 'home' : 'away';
  const home = calibrationTeamTotals(state, 'home');
  const away = calibrationTeamTotals(state, 'away');
  if (home.attack !== away.attack) return home.attack > away.attack ? 'home' : 'away';
  const homeStrength = home.attack + home.defence;
  const awayStrength = away.attack + away.defence;
  if (homeStrength !== awayStrength) return homeStrength > awayStrength ? 'home' : 'away';
  return ((Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0) % 2 === 0 ? 'home' : 'away';
}

function simulateMatch(args: {
  homeDeck: readonly string[];
  awayDeck: readonly string[];
  homeProfile: V8CalibrationSquadKey;
  awayProfile: V8CalibrationSquadKey;
  seed: number;
}): { homeScore: number; awayScore: number } {
  let state = withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(args.homeDeck, args.seed),
    seededShuffle(args.awayDeck, args.seed + 1),
  ));
  let homeScore = 0;
  let awayScore = 0;
  let homeManagerAvailable = true;
  let awayManagerAvailable = true;

  for (let periodIndex = 0; periodIndex < 4; periodIndex += 1) {
    const home = planV8CalibrationSide(state, 'home', homeManagerAvailable, args.homeProfile);
    const away = planV8CalibrationSide(home.state, 'away', awayManagerAvailable, args.awayProfile);
    homeManagerAvailable = home.managerAvailable;
    awayManagerAvailable = away.managerAvailable;
    const plays = [...home.pending, ...away.pending];
    const first = priority(away.state, homeScore, awayScore, args.seed + away.state.period * 101);
    let resolved = resolveSequence(away.state, plays.filter((play) => play.side === first));
    resolved = resolveSequence(resolved, plays.filter((play) => play.side !== first));
    resolved = resolveGeneratedTacticalWindow(resolved, [
      ...planV8CalibrationWindow(resolved, 'home', args.homeProfile),
      ...planV8CalibrationWindow(resolved, 'away', args.awayProfile),
    ]).state;

    const homeTotals = calibrationTeamTotals(resolved, 'home');
    const awayTotals = calibrationTeamTotals(resolved, 'away');
    homeScore += goalsFromAttackDefence(homeTotals.attack, awayTotals.defence);
    awayScore += goalsFromAttackDefence(awayTotals.attack, homeTotals.defence);

    const wasFinal = resolved.period === 4;
    state = endV8CalibrationPeriod(resolved);
    if (!wasFinal) state = withCalibrationEnergy(state);
  }

  return { homeScore, awayScore };
}

export function runV8CrossMinimalSensitivity(
  seeds: readonly number[] = V8_CROSS_MINIMAL_SEEDS,
): V8CrossMinimalReport {
  const decks = buildV8CrossMinimalDecks();
  const outcomes = new Map<string, Array<{ gf: number; ga: number }>>();
  for (const deck of decks) outcomes.set(deck.id, []);
  let matches = 0;

  for (const deck of decks) {
    for (const referenceFamily of V8_CALIBRATION_SQUAD_KEYS) {
      const reference = getV8CalibrationSquad(referenceFamily).playerIds;
      for (const seed of seeds) {
        const home = simulateMatch({
          homeDeck: deck.playerIds,
          awayDeck: reference,
          homeProfile: 'cross',
          awayProfile: referenceFamily,
          seed,
        });
        outcomes.get(deck.id)!.push({ gf: home.homeScore, ga: home.awayScore });
        matches += 1;

        const away = simulateMatch({
          homeDeck: reference,
          awayDeck: deck.playerIds,
          homeProfile: referenceFamily,
          awayProfile: 'cross',
          seed: seed + 90_001,
        });
        outcomes.get(deck.id)!.push({ gf: away.awayScore, ga: away.homeScore });
        matches += 1;
      }
    }
  }

  const summaries = decks.map((deck) => {
    const deckOutcomes = outcomes.get(deck.id)!;
    let wins = 0;
    let draws = 0;
    let gf = 0;
    let ga = 0;
    for (const outcome of deckOutcomes) {
      gf += outcome.gf;
      ga += outcome.ga;
      if (outcome.gf > outcome.ga) wins += 1;
      else if (outcome.gf === outcome.ga) draws += 1;
    }
    return {
      id: deck.id,
      core: deck.core,
      effectiveCost: deck.effectiveCost,
      matches: deckOutcomes.length,
      winRate: rounded(wins / deckOutcomes.length),
      drawRate: rounded(draws / deckOutcomes.length),
      goalsFor: rounded(gf / deckOutcomes.length),
      goalsAgainst: rounded(ga / deckOutcomes.length),
      goalDifference: rounded((gf - ga) / deckOutcomes.length),
    };
  });

  return { seeds: [...seeds], matches, decks, summaries };
}

export function formatV8CrossMinimalReport(report: V8CrossMinimalReport): string {
  return [
    `V8 minimal Cross sensitivity · ${report.decks.length} decks · ${report.matches} matches · ${report.seeds.length} seeds`,
    '',
    ...report.summaries.map((summary) => [
      summary.id,
      `W ${Math.round(summary.winRate * 100)}%`,
      `D ${Math.round(summary.drawRate * 100)}%`,
      `GF ${summary.goalsFor}`,
      `GA ${summary.goalsAgainst}`,
      `GD ${summary.goalDifference >= 0 ? '+' : ''}${summary.goalDifference}`,
      `Cost ${summary.effectiveCost}`,
    ].join(' | ')),
  ].join('\n');
}
