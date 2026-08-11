import { calibrationEnergyForPeriod, calibrationPlayCost } from './calibration-balance';
import { V8_CALIBRATION_PLAYERS, getV8CalibrationPlayer } from './calibration-cards';
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

const VARIANTS_PER_FAMILY = 8;

export const V8_DECK_VALIDATION_SEEDS = [
  8_082_026,
  8_186_755,
  8_291_484,
  8_396_213,
  8_500_942,
  8_605_671,
  8_710_400,
  8_815_129,
] as const;

const FAMILY_LOCKS: Readonly<Record<V8CalibrationSquadKey, readonly string[]>> = {
  cross: ['schmeichel', 'beckham', 'wambach'],
  through_ball: ['schmeichel', 'morgan', 'valderrama'],
  dribbling_penalty: ['schmeichel', 'duff', 'neymar'],
  control_defence: ['schmeichel', 'makelele', 'gentile'],
  long_shot_set_piece: ['schmeichel', 'charlton', 'lloyd'],
  balanced_midrange: ['schmeichel', 'gentile', 'sinclair'],
};

export interface V8DeckValidationDeck {
  id: string;
  family: V8CalibrationSquadKey;
  playerIds: readonly string[];
  swaps: number;
  effectiveCost: number;
  zoneCoverage: Readonly<Record<V8Zone, number>>;
}

export interface V8DeckValidationDeckSummary {
  id: string;
  family: V8CalibrationSquadKey;
  swaps: number;
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

export interface V8DeckValidationFamilySummary {
  family: V8CalibrationSquadKey;
  decks: number;
  matches: number;
  meanWinRate: number;
  medianWinRate: number;
  minWinRate: number;
  maxWinRate: number;
  meanGoalDifference: number;
  medianGoalDifference: number;
  competitiveDecks: number;
  strongDecks: number;
  baselineWinRate: number;
  baselineGoalDifference: number;
}

export interface V8DeckValidationReport {
  seeds: readonly number[];
  decks: readonly V8DeckValidationDeck[];
  matches: number;
  deckSummaries: readonly V8DeckValidationDeckSummary[];
  families: readonly V8DeckValidationFamilySummary[];
}

interface SimulatedDeckMatch {
  homeScore: number;
  awayScore: number;
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

function legalVariant(playerIds: readonly string[], baseCost: number): boolean {
  if (playerIds.length !== 11 || new Set(playerIds).size !== 11) return false;
  if (!playerIds.includes('schmeichel')) return false;
  const cost = effectiveCost(playerIds);
  if (Math.abs(cost - baseCost) > 2) return false;
  const coverage = zoneCoverage(playerIds);
  return coverage.DEF >= 3 && coverage.MID >= 4 && coverage.ATT >= 2;
}

function variantKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}

function buildFamilyVariants(family: V8CalibrationSquadKey): V8DeckValidationDeck[] {
  const base = [...getV8CalibrationSquad(family).playerIds];
  const baseCost = effectiveCost(base);
  const locks = new Set(FAMILY_LOCKS[family]);
  const seen = new Set([variantKey(base)]);
  const variants: V8DeckValidationDeck[] = [{
    id: `${family}-base`,
    family,
    playerIds: base,
    swaps: 0,
    effectiveCost: baseCost,
    zoneCoverage: zoneCoverage(base),
  }];

  for (let variantIndex = 0; variantIndex < VARIANTS_PER_FAMILY; variantIndex += 1) {
    const swapCount = 2 + (variantIndex % 3);
    let accepted: string[] | null = null;

    for (let attempt = 0; attempt < 2_000 && !accepted; attempt += 1) {
      const seed = 71_003 + V8_CALIBRATION_SQUAD_KEYS.indexOf(family) * 10_000 + variantIndex * 997 + attempt * 131;
      const removable = seededShuffle(base.filter((id) => !locks.has(id)), seed).slice(0, swapCount);
      const kept = base.filter((id) => !removable.includes(id));
      const candidates = seededShuffle(
        V8_CALIBRATION_PLAYERS.map((player) => player.id).filter((id) => !kept.includes(id) && !locks.has(id)),
        seed ^ 0x9e3779b9,
      );
      const replacement = candidates.slice(0, swapCount);
      const proposed = [...kept, ...replacement];
      const key = variantKey(proposed);
      if (seen.has(key) || !legalVariant(proposed, baseCost)) continue;
      seen.add(key);
      accepted = proposed;
    }

    if (!accepted) throw new Error(`Could not generate legal ${family} variant ${variantIndex + 1}`);
    variants.push({
      id: `${family}-v${variantIndex + 1}`,
      family,
      playerIds: accepted,
      swaps: swapCount,
      effectiveCost: effectiveCost(accepted),
      zoneCoverage: zoneCoverage(accepted),
    });
  }

  return variants;
}

export function buildV8DeckValidationCohort(): V8DeckValidationDeck[] {
  return V8_CALIBRATION_SQUAD_KEYS.flatMap(buildFamilyVariants);
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

function simulateDeckMatch(args: {
  homeDeck: readonly string[];
  awayDeck: readonly string[];
  homeProfile: V8CalibrationSquadKey;
  awayProfile: V8CalibrationSquadKey;
  seed: number;
}): SimulatedDeckMatch {
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

function summarizeDeck(deck: V8DeckValidationDeck, outcomes: readonly { gf: number; ga: number }[]): V8DeckValidationDeckSummary {
  let wins = 0;
  let draws = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const outcome of outcomes) {
    goalsFor += outcome.gf;
    goalsAgainst += outcome.ga;
    if (outcome.gf > outcome.ga) wins += 1;
    else if (outcome.gf === outcome.ga) draws += 1;
  }
  const matches = outcomes.length;
  return {
    id: deck.id,
    family: deck.family,
    swaps: deck.swaps,
    effectiveCost: deck.effectiveCost,
    matches,
    wins,
    draws,
    losses: matches - wins - draws,
    winRate: rounded(wins / matches),
    drawRate: rounded(draws / matches),
    goalsFor: rounded(goalsFor / matches),
    goalsAgainst: rounded(goalsAgainst / matches),
    goalDifference: rounded((goalsFor - goalsAgainst) / matches),
  };
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle]!;
  return (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function summarizeFamily(family: V8CalibrationSquadKey, decks: readonly V8DeckValidationDeckSummary[]): V8DeckValidationFamilySummary {
  const familyDecks = decks.filter((deck) => deck.family === family);
  const baseline = familyDecks.find((deck) => deck.id.endsWith('-base'))!;
  const wins = familyDecks.map((deck) => deck.winRate);
  const gds = familyDecks.map((deck) => deck.goalDifference);
  return {
    family,
    decks: familyDecks.length,
    matches: familyDecks.reduce((sum, deck) => sum + deck.matches, 0),
    meanWinRate: rounded(wins.reduce((sum, value) => sum + value, 0) / wins.length),
    medianWinRate: rounded(median(wins)),
    minWinRate: rounded(Math.min(...wins)),
    maxWinRate: rounded(Math.max(...wins)),
    meanGoalDifference: rounded(gds.reduce((sum, value) => sum + value, 0) / gds.length),
    medianGoalDifference: rounded(median(gds)),
    competitiveDecks: familyDecks.filter((deck) => deck.winRate >= 0.4).length,
    strongDecks: familyDecks.filter((deck) => deck.winRate >= 0.5).length,
    baselineWinRate: baseline.winRate,
    baselineGoalDifference: baseline.goalDifference,
  };
}

export function runV8DeckValidation(
  seeds: readonly number[] = V8_DECK_VALIDATION_SEEDS,
): V8DeckValidationReport {
  const decks = buildV8DeckValidationCohort();
  const outcomes = new Map<string, Array<{ gf: number; ga: number }>>();
  for (const deck of decks) outcomes.set(deck.id, []);
  let matches = 0;

  for (const deck of decks) {
    for (const referenceFamily of V8_CALIBRATION_SQUAD_KEYS) {
      const reference = getV8CalibrationSquad(referenceFamily).playerIds;
      for (const seed of seeds) {
        const home = simulateDeckMatch({
          homeDeck: deck.playerIds,
          awayDeck: reference,
          homeProfile: deck.family,
          awayProfile: referenceFamily,
          seed,
        });
        outcomes.get(deck.id)!.push({ gf: home.homeScore, ga: home.awayScore });
        matches += 1;

        const away = simulateDeckMatch({
          homeDeck: reference,
          awayDeck: deck.playerIds,
          homeProfile: referenceFamily,
          awayProfile: deck.family,
          seed: seed + 50_003,
        });
        outcomes.get(deck.id)!.push({ gf: away.awayScore, ga: away.homeScore });
        matches += 1;
      }
    }
  }

  const deckSummaries = decks.map((deck) => summarizeDeck(deck, outcomes.get(deck.id)!));
  return {
    seeds: [...seeds],
    decks,
    matches,
    deckSummaries,
    families: V8_CALIBRATION_SQUAD_KEYS.map((family) => summarizeFamily(family, deckSummaries)),
  };
}

export function formatV8DeckValidationReport(report: V8DeckValidationReport): string {
  const familyLines = report.families.map((family) => [
    family.family,
    `${family.decks} decks`,
    `median W ${Math.round(family.medianWinRate * 100)}%`,
    `range ${Math.round(family.minWinRate * 100)}–${Math.round(family.maxWinRate * 100)}%`,
    `baseline ${Math.round(family.baselineWinRate * 100)}%`,
    `competitive ${family.competitiveDecks}/${family.decks}`,
    `strong ${family.strongDecks}/${family.decks}`,
    `median GD ${family.medianGoalDifference >= 0 ? '+' : ''}${family.medianGoalDifference}`,
  ].join(' | '));

  const topDecks = [...report.deckSummaries]
    .sort((a, b) => b.winRate - a.winRate || b.goalDifference - a.goalDifference)
    .slice(0, 12)
    .map((deck) => `${deck.id}: W ${Math.round(deck.winRate * 100)}% · GD ${deck.goalDifference >= 0 ? '+' : ''}${deck.goalDifference} · Cost ${deck.effectiveCost} · swaps ${deck.swaps}`);
  const bottomDecks = [...report.deckSummaries]
    .sort((a, b) => a.winRate - b.winRate || a.goalDifference - b.goalDifference)
    .slice(0, 12)
    .map((deck) => `${deck.id}: W ${Math.round(deck.winRate * 100)}% · GD ${deck.goalDifference >= 0 ? '+' : ''}${deck.goalDifference} · Cost ${deck.effectiveCost} · swaps ${deck.swaps}`);

  return [
    `V8 broad deck validation · ${report.decks.length} decks · ${report.matches} matches · ${report.seeds.length} seeds`,
    '',
    'FAMILY ROBUSTNESS',
    ...familyLines,
    '',
    'TOP DECKS',
    ...topDecks,
    '',
    'BOTTOM DECKS',
    ...bottomDecks,
  ].join('\n');
}
