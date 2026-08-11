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

export type V8CompactCoreFamily = 'cross' | 'through_ball' | 'long_shot_set_piece';
export type V8CompactCoreSize = 3 | 4 | 5;

export const V8_COMPACT_CORE_SEEDS = [
  8_082_026,
  8_291_484,
  8_500_942,
  8_710_400,
  8_919_858,
  9_129_316,
  9_338_774,
  9_548_232,
] as const;

const FAMILY_CORES: Readonly<Record<V8CompactCoreFamily, readonly string[]>> = {
  cross: ['beckham', 'wambach', 'di-maria', 'dzajic', 'cafu'],
  through_ball: ['valderrama', 'morgan', 'shevchenko', 'litmanen', 'park'],
  long_shot_set_piece: ['charlton', 'lloyd', 'eriksen', 'ramos', 'panenka'],
};

// Same ranked shell for every family. These are strong broadly useful cards rather than
// cards selected to complete one of the three tested Chance packages.
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

export interface V8CompactCoreDeck {
  id: string;
  family: V8CompactCoreFamily;
  coreSize: V8CompactCoreSize;
  corePlayerIds: readonly string[];
  playerIds: readonly string[];
  effectiveCost: number;
  zoneCoverage: Readonly<Record<V8Zone, number>>;
}

export interface V8CompactCoreDeckSummary {
  id: string;
  family: V8CompactCoreFamily;
  coreSize: V8CompactCoreSize;
  effectiveCost: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  drawRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface V8CompactCoreReport {
  seeds: readonly number[];
  decks: readonly V8CompactCoreDeck[];
  matches: number;
  summaries: readonly V8CompactCoreDeckSummary[];
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

function zoneCoverage(playerIds: readonly string[]): Record<V8Zone, number> {
  const coverage: Record<V8Zone, number> = { DEF: 0, MID: 0, ATT: 0 };
  for (const id of playerIds) {
    for (const zone of getV8CalibrationPlayer(id).naturalZones) coverage[zone] += 1;
  }
  return coverage;
}

function buildDeck(family: V8CompactCoreFamily, coreSize: V8CompactCoreSize): V8CompactCoreDeck {
  const corePlayerIds = FAMILY_CORES[family].slice(0, coreSize);
  const support = NEUTRAL_SUPPORT.filter((id) => !corePlayerIds.includes(id)).slice(0, 11 - coreSize);
  const playerIds = [...corePlayerIds, ...support];
  if (playerIds.length !== 11 || new Set(playerIds).size !== 11) throw new Error(`Invalid compact-core deck ${family}-${coreSize}`);
  return {
    id: `${family}-core-${coreSize}`,
    family,
    coreSize,
    corePlayerIds,
    playerIds,
    effectiveCost: effectiveCost(playerIds),
    zoneCoverage: zoneCoverage(playerIds),
  };
}

export function buildV8CompactCoreDecks(): V8CompactCoreDeck[] {
  const families: readonly V8CompactCoreFamily[] = ['cross', 'through_ball', 'long_shot_set_piece'];
  const sizes: readonly V8CompactCoreSize[] = [3, 4, 5];
  return families.flatMap((family) => sizes.map((size) => buildDeck(family, size)));
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

function summarize(deck: V8CompactCoreDeck, outcomes: readonly { gf: number; ga: number }[]): V8CompactCoreDeckSummary {
  let wins = 0;
  let draws = 0;
  let gf = 0;
  let ga = 0;
  for (const outcome of outcomes) {
    gf += outcome.gf;
    ga += outcome.ga;
    if (outcome.gf > outcome.ga) wins += 1;
    else if (outcome.gf === outcome.ga) draws += 1;
  }
  const matches = outcomes.length;
  return {
    id: deck.id,
    family: deck.family,
    coreSize: deck.coreSize,
    effectiveCost: deck.effectiveCost,
    matches,
    wins,
    draws,
    losses: matches - wins - draws,
    winRate: rounded(wins / matches),
    drawRate: rounded(draws / matches),
    goalsFor: rounded(gf / matches),
    goalsAgainst: rounded(ga / matches),
    goalDifference: rounded((gf - ga) / matches),
  };
}

export function runV8CompactCoreSensitivity(
  seeds: readonly number[] = V8_COMPACT_CORE_SEEDS,
): V8CompactCoreReport {
  const decks = buildV8CompactCoreDecks();
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
          homeProfile: deck.family,
          awayProfile: referenceFamily,
          seed,
        });
        outcomes.get(deck.id)!.push({ gf: home.homeScore, ga: home.awayScore });
        matches += 1;

        const away = simulateMatch({
          homeDeck: reference,
          awayDeck: deck.playerIds,
          homeProfile: referenceFamily,
          awayProfile: deck.family,
          seed: seed + 70_007,
        });
        outcomes.get(deck.id)!.push({ gf: away.awayScore, ga: away.homeScore });
        matches += 1;
      }
    }
  }

  return {
    seeds: [...seeds],
    decks,
    matches,
    summaries: decks.map((deck) => summarize(deck, outcomes.get(deck.id)!)),
  };
}

export function formatV8CompactCoreReport(report: V8CompactCoreReport): string {
  const lines = report.summaries.map((summary) => [
    summary.id,
    `W ${Math.round(summary.winRate * 100)}%`,
    `D ${Math.round(summary.drawRate * 100)}%`,
    `GF ${summary.goalsFor}`,
    `GA ${summary.goalsAgainst}`,
    `GD ${summary.goalDifference >= 0 ? '+' : ''}${summary.goalDifference}`,
    `Cost ${summary.effectiveCost}`,
  ].join(' | '));

  return [
    `V8 compact-core sensitivity · ${report.decks.length} decks · ${report.matches} matches · ${report.seeds.length} seeds`,
    '',
    '3 / 4 / 5 SPECIALIST CORE',
    ...lines,
  ].join('\n');
}
