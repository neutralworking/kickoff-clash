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

export const V8_DRIBBLING_COMPACT_SEEDS = [
  8_082_026,
  8_291_484,
  8_500_942,
  8_710_400,
  8_919_858,
  9_129_316,
  9_338_774,
  9_548_232,
] as const;

// Strong general-purpose shell with no Penalty generators or Penalty specialist.
const NEUTRAL_SUPPORT = [
  'schmeichel',
  'gentile',
  'seedorf',
  'iniesta',
  'beckenbauer',
  'makelele',
  'bremner',
  'sinclair',
  'beckham',
  'charlton',
  'ramos',
] as const;

// Okocha/Ronaldo are intentionally excluded from this first control panel. Their current
// calibration placement/profile needs a separate semantic pass so this experiment stays a
// clean read on the existing reducer -> generator -> Panenka dependency chain.
const CORE_CASES = [
  { id: 'neutral', core: [] },
  { id: 'duff', core: ['duff'] },
  { id: 'garrincha', core: ['garrincha'] },
  { id: 'neymar', core: ['neymar'] },
  { id: 'panenka', core: ['panenka'] },
  { id: 'duff-garrincha', core: ['duff', 'garrincha'] },
  { id: 'duff-neymar', core: ['duff', 'neymar'] },
  { id: 'garrincha-neymar', core: ['garrincha', 'neymar'] },
  { id: 'duff-panenka', core: ['duff', 'panenka'] },
  { id: 'garrincha-panenka', core: ['garrincha', 'panenka'] },
  { id: 'duff-neymar-panenka', core: ['duff', 'neymar', 'panenka'] },
  { id: 'garrincha-neymar-panenka', core: ['garrincha', 'neymar', 'panenka'] },
  { id: 'duff-garrincha-neymar-panenka', core: ['duff', 'garrincha', 'neymar', 'panenka'] },
] as const;

export interface V8DribblingCompactDeck {
  id: string;
  core: readonly string[];
  playerIds: readonly string[];
  effectiveCost: number;
}

export interface V8DribblingCompactSummary {
  id: string;
  core: readonly string[];
  effectiveCost: number;
  matches: number;
  winRate: number;
  drawRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  penaltiesPerMatch: number;
  enhancedPenaltiesPerMatch: number;
  windowPenaltiesPerMatch: number;
}

export interface V8DribblingCompactReport {
  seeds: readonly number[];
  matches: number;
  decks: readonly V8DribblingCompactDeck[];
  summaries: readonly V8DribblingCompactSummary[];
}

type SideOutcome = {
  score: number;
  penalties: number;
  enhancedPenalties: number;
  windowPenalties: number;
};

type MatchOutcome = {
  home: SideOutcome;
  away: SideOutcome;
};

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

export function buildV8DribblingCompactDecks(): V8DribblingCompactDeck[] {
  return CORE_CASES.map(({ id, core }) => {
    const support = NEUTRAL_SUPPORT.filter((playerId) => !core.includes(playerId as never)).slice(0, 11 - core.length);
    const playerIds = [...core, ...support];
    if (playerIds.length !== 11 || new Set(playerIds).size !== 11) throw new Error(`Invalid Dribbling compact deck ${id}`);
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

function periodPenaltyStats(state: V8CalibrationState, side: V8CalibrationSide): Omit<SideOutcome, 'score'> {
  const penalties = state.tacticalResolutions.filter((resolution) => resolution.side === side && resolution.type === 'penalty');
  return {
    penalties: penalties.length,
    enhancedPenalties: penalties.filter((resolution) => resolution.specialistBonuses.some((label) => label.includes('CHIPPED PENALTY'))).length,
    windowPenalties: penalties.filter((resolution) => resolution.window).length,
  };
}

function simulateMatch(args: {
  homeDeck: readonly string[];
  awayDeck: readonly string[];
  homeProfile: V8CalibrationSquadKey;
  awayProfile: V8CalibrationSquadKey;
  seed: number;
}): MatchOutcome {
  let state = withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(args.homeDeck, args.seed),
    seededShuffle(args.awayDeck, args.seed + 1),
  ));
  const home: SideOutcome = { score: 0, penalties: 0, enhancedPenalties: 0, windowPenalties: 0 };
  const away: SideOutcome = { score: 0, penalties: 0, enhancedPenalties: 0, windowPenalties: 0 };
  let homeManagerAvailable = true;
  let awayManagerAvailable = true;

  for (let periodIndex = 0; periodIndex < 4; periodIndex += 1) {
    const homePlan = planV8CalibrationSide(state, 'home', homeManagerAvailable, args.homeProfile);
    const awayPlan = planV8CalibrationSide(homePlan.state, 'away', awayManagerAvailable, args.awayProfile);
    homeManagerAvailable = homePlan.managerAvailable;
    awayManagerAvailable = awayPlan.managerAvailable;
    const plays = [...homePlan.pending, ...awayPlan.pending];
    const first = priority(awayPlan.state, home.score, away.score, args.seed + awayPlan.state.period * 101);
    let resolved = resolveSequence(awayPlan.state, plays.filter((play) => play.side === first));
    resolved = resolveSequence(resolved, plays.filter((play) => play.side !== first));
    resolved = resolveGeneratedTacticalWindow(resolved, [
      ...planV8CalibrationWindow(resolved, 'home', args.homeProfile),
      ...planV8CalibrationWindow(resolved, 'away', args.awayProfile),
    ]).state;

    const homeTotals = calibrationTeamTotals(resolved, 'home');
    const awayTotals = calibrationTeamTotals(resolved, 'away');
    home.score += goalsFromAttackDefence(homeTotals.attack, awayTotals.defence);
    away.score += goalsFromAttackDefence(awayTotals.attack, homeTotals.defence);

    const homePenalty = periodPenaltyStats(resolved, 'home');
    const awayPenalty = periodPenaltyStats(resolved, 'away');
    home.penalties += homePenalty.penalties;
    home.enhancedPenalties += homePenalty.enhancedPenalties;
    home.windowPenalties += homePenalty.windowPenalties;
    away.penalties += awayPenalty.penalties;
    away.enhancedPenalties += awayPenalty.enhancedPenalties;
    away.windowPenalties += awayPenalty.windowPenalties;

    const wasFinal = resolved.period === 4;
    state = endV8CalibrationPeriod(resolved);
    if (!wasFinal) state = withCalibrationEnergy(state);
  }

  return { home, away };
}

export function runV8DribblingCompactSensitivity(
  seeds: readonly number[] = V8_DRIBBLING_COMPACT_SEEDS,
): V8DribblingCompactReport {
  const decks = buildV8DribblingCompactDecks();
  const outcomes = new Map<string, Array<{ gf: number; ga: number; penalties: number; enhanced: number; window: number }>>();
  for (const deck of decks) outcomes.set(deck.id, []);
  let matches = 0;

  for (const deck of decks) {
    for (const referenceFamily of V8_CALIBRATION_SQUAD_KEYS) {
      const reference = getV8CalibrationSquad(referenceFamily).playerIds;
      for (const seed of seeds) {
        const home = simulateMatch({
          homeDeck: deck.playerIds,
          awayDeck: reference,
          homeProfile: 'dribbling_penalty',
          awayProfile: referenceFamily,
          seed,
        });
        outcomes.get(deck.id)!.push({
          gf: home.home.score,
          ga: home.away.score,
          penalties: home.home.penalties,
          enhanced: home.home.enhancedPenalties,
          window: home.home.windowPenalties,
        });
        matches += 1;

        const away = simulateMatch({
          homeDeck: reference,
          awayDeck: deck.playerIds,
          homeProfile: referenceFamily,
          awayProfile: 'dribbling_penalty',
          seed: seed + 95_003,
        });
        outcomes.get(deck.id)!.push({
          gf: away.away.score,
          ga: away.home.score,
          penalties: away.away.penalties,
          enhanced: away.away.enhancedPenalties,
          window: away.away.windowPenalties,
        });
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
    let penalties = 0;
    let enhanced = 0;
    let window = 0;
    for (const outcome of deckOutcomes) {
      gf += outcome.gf;
      ga += outcome.ga;
      penalties += outcome.penalties;
      enhanced += outcome.enhanced;
      window += outcome.window;
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
      penaltiesPerMatch: rounded(penalties / deckOutcomes.length),
      enhancedPenaltiesPerMatch: rounded(enhanced / deckOutcomes.length),
      windowPenaltiesPerMatch: rounded(window / deckOutcomes.length),
    };
  });

  return { seeds: [...seeds], matches, decks, summaries };
}

export function formatV8DribblingCompactReport(report: V8DribblingCompactReport): string {
  return [
    `V8 compact Dribbling sensitivity · ${report.decks.length} decks · ${report.matches} matches · ${report.seeds.length} seeds`,
    '',
    ...report.summaries.map((summary) => [
      summary.id,
      `W ${Math.round(summary.winRate * 100)}%`,
      `D ${Math.round(summary.drawRate * 100)}%`,
      `GF ${summary.goalsFor}`,
      `GA ${summary.goalsAgainst}`,
      `GD ${summary.goalDifference >= 0 ? '+' : ''}${summary.goalDifference}`,
      `PEN ${summary.penaltiesPerMatch}`,
      `+Panenka ${summary.enhancedPenaltiesPerMatch}`,
      `window ${summary.windowPenaltiesPerMatch}`,
      `Cost ${summary.effectiveCost}`,
    ].join(' | ')),
  ].join('\n');
}
