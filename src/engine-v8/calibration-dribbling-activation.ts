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
  opposingDepthZone,
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

export const V8_DRIBBLING_ACTIVATION_SEEDS = [
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
  'schmeichel', 'gentile', 'seedorf', 'iniesta', 'beckenbauer', 'makelele',
  'bremner', 'sinclair', 'beckham', 'charlton', 'ramos',
] as const;

const CASES = [
  { id: 'duff-neymar', core: ['duff', 'neymar'] },
  { id: 'garrincha-neymar', core: ['garrincha', 'neymar'] },
  { id: 'duff-garrincha', core: ['duff', 'garrincha'] },
  { id: 'duff-neymar-panenka', core: ['duff', 'neymar', 'panenka'] },
  { id: 'garrincha-neymar-panenka', core: ['garrincha', 'neymar', 'panenka'] },
  { id: 'duff-garrincha-neymar-panenka', core: ['duff', 'garrincha', 'neymar', 'panenka'] },
] as const;

type ActionCounts = {
  duffReveals: number;
  duffTargetPresent: number;
  duffReductions: number;
  garrinchaReveals: number;
  garrinchaTargetPresent: number;
  garrinchaReductions: number;
  garrinchaComboBonuses: number;
  neymarReveals: number;
  neymarTargetPresent: number;
  neymarPenaltyGenerations: number;
  penaltyResolutions: number;
};

export interface V8DribblingActivationSummary extends ActionCounts {
  id: string;
  core: readonly string[];
  matches: number;
  winRate: number;
  goalDifference: number;
}

export interface V8DribblingActivationReport {
  matches: number;
  summaries: readonly V8DribblingActivationSummary[];
}

function emptyCounts(): ActionCounts {
  return {
    duffReveals: 0, duffTargetPresent: 0, duffReductions: 0,
    garrinchaReveals: 0, garrinchaTargetPresent: 0, garrinchaReductions: 0, garrinchaComboBonuses: 0,
    neymarReveals: 0, neymarTargetPresent: 0, neymarPenaltyGenerations: 0,
    penaltyResolutions: 0,
  };
}

function addCounts(target: ActionCounts, source: ActionCounts): void {
  for (const key of Object.keys(target) as Array<keyof ActionCounts>) target[key] += source[key];
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

function buildDeck(core: readonly string[]): string[] {
  const support = NEUTRAL_SUPPORT.filter((id) => !core.includes(id as never)).slice(0, 11 - core.length);
  return [...core, ...support];
}

function withCalibrationEnergy(state: V8CalibrationState): V8CalibrationState {
  const energy = calibrationEnergyForPeriod(state.period);
  return { ...state, teams: {
    home: { ...state.teams.home, energy },
    away: { ...state.teams.away, energy },
  } };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function applyManager(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): V8CalibrationState {
  const next = clone(state);
  const count = calibrationPlayersInZone(next, side, zone).length;
  if (zone === 'ATT') next.tacticalAttack[side].ATT += count * 2;
  if (zone === 'DEF') next.zoneDefenceBonus[side].DEF += count * 2;
  if (zone === 'MID') { next.tacticalAttack[side].MID += count; next.zoneDefenceBonus[side].MID += count; }
  return next;
}

function modifierCount(state: V8CalibrationState, side: V8CalibrationSide, source: string, attack?: number): number {
  return Object.values(state.players)
    .filter((player) => player.side === side)
    .flatMap((player) => player.modifiers)
    .filter((modifier) => modifier.source === source && (attack === undefined || modifier.attack === attack)).length;
}

function opposingDefendersHere(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): number {
  const other: V8CalibrationSide = side === 'home' ? 'away' : 'home';
  return calibrationPlayersInZone(state, other, opposingDepthZone(zone))
    .filter((player) => {
      const card = getV8CalibrationPlayer(player.cardId);
      return card.position !== 'GK' && card.naturalZones.includes('DEF');
    }).length;
}

function resolveSequence(
  state: V8CalibrationState,
  plays: readonly V8CalibrationMatrixPlay[],
  observedSide: V8CalibrationSide,
  counts: ActionCounts,
): V8CalibrationState {
  let next = state;
  for (const play of plays) {
    if (play.kind === 'player') {
      const observing = play.side === observedSide;
      const defenders = observing ? opposingDefendersHere(next, play.side, play.zone) : 0;
      const beforeDuff = observing ? modifierCount(next, play.side === 'home' ? 'away' : 'home', 'KNOCK AND RUN') : 0;
      const beforeGarrinchaReduction = observing ? modifierCount(next, play.side === 'home' ? 'away' : 'home', 'JOY OF THE PEOPLE') : 0;
      const beforeGarrinchaBonus = observing ? modifierCount(next, play.side, 'JOY OF THE PEOPLE', 4) : 0;
      const eventIndex = next.events.length;

      if (observing && play.cardId === 'duff') { counts.duffReveals += 1; if (defenders > 0) counts.duffTargetPresent += 1; }
      if (observing && play.cardId === 'garrincha') { counts.garrinchaReveals += 1; if (defenders > 0) counts.garrinchaTargetPresent += 1; }
      if (observing && play.cardId === 'neymar') { counts.neymarReveals += 1; if (defenders > 0) counts.neymarTargetPresent += 1; }

      next = revealCalibrationPlayer(next, play.side, play.cardId, play.zone);

      if (observing && play.cardId === 'duff') {
        const after = modifierCount(next, play.side === 'home' ? 'away' : 'home', 'KNOCK AND RUN');
        if (after > beforeDuff) counts.duffReductions += 1;
      }
      if (observing && play.cardId === 'garrincha') {
        const afterReduction = modifierCount(next, play.side === 'home' ? 'away' : 'home', 'JOY OF THE PEOPLE');
        const afterBonus = modifierCount(next, play.side, 'JOY OF THE PEOPLE', 4);
        if (afterReduction > beforeGarrinchaReduction) counts.garrinchaReductions += 1;
        if (afterBonus > beforeGarrinchaBonus) counts.garrinchaComboBonuses += 1;
      }
      if (observing && play.cardId === 'neymar') {
        const generated = next.events.slice(eventIndex)
          .filter((event) => event.type === 'tactical_generated' && event.text.includes('Neymar generates Penalty')).length;
        counts.neymarPenaltyGenerations += generated;
      }
    } else if (play.kind === 'tactical') next = resolveCommittedCalibrationTactical(next, play.side, play.card, play.zone, play.cost);
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

function simulate(args: {
  deck: readonly string[];
  reference: readonly string[];
  deckSide: V8CalibrationSide;
  referenceProfile: V8CalibrationSquadKey;
  seed: number;
}): { gf: number; ga: number; counts: ActionCounts } {
  const homeDeck = args.deckSide === 'home' ? args.deck : args.reference;
  const awayDeck = args.deckSide === 'away' ? args.deck : args.reference;
  let state = withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(homeDeck, args.seed), seededShuffle(awayDeck, args.seed + 1),
  ));
  let homeScore = 0;
  let awayScore = 0;
  let homeManagerAvailable = true;
  let awayManagerAvailable = true;
  const counts = emptyCounts();

  for (let periodIndex = 0; periodIndex < 4; periodIndex += 1) {
    const homeProfile: V8CalibrationSquadKey = args.deckSide === 'home' ? 'dribbling_penalty' : args.referenceProfile;
    const awayProfile: V8CalibrationSquadKey = args.deckSide === 'away' ? 'dribbling_penalty' : args.referenceProfile;
    const home = planV8CalibrationSide(state, 'home', homeManagerAvailable, homeProfile);
    const away = planV8CalibrationSide(home.state, 'away', awayManagerAvailable, awayProfile);
    homeManagerAvailable = home.managerAvailable;
    awayManagerAvailable = away.managerAvailable;
    const plays = [...home.pending, ...away.pending];
    const first = priority(away.state, homeScore, awayScore, args.seed + away.state.period * 101);
    let resolved = resolveSequence(away.state, plays.filter((play) => play.side === first), args.deckSide, counts);
    resolved = resolveSequence(resolved, plays.filter((play) => play.side !== first), args.deckSide, counts);
    resolved = resolveGeneratedTacticalWindow(resolved, [
      ...planV8CalibrationWindow(resolved, 'home', homeProfile),
      ...planV8CalibrationWindow(resolved, 'away', awayProfile),
    ]).state;

    counts.penaltyResolutions += resolved.tacticalResolutions
      .filter((resolution) => resolution.side === args.deckSide && resolution.type === 'penalty').length;
    const homeTotals = calibrationTeamTotals(resolved, 'home');
    const awayTotals = calibrationTeamTotals(resolved, 'away');
    homeScore += goalsFromAttackDefence(homeTotals.attack, awayTotals.defence);
    awayScore += goalsFromAttackDefence(awayTotals.attack, homeTotals.defence);
    const wasFinal = resolved.period === 4;
    state = endV8CalibrationPeriod(resolved);
    if (!wasFinal) state = withCalibrationEnergy(state);
  }

  return {
    gf: args.deckSide === 'home' ? homeScore : awayScore,
    ga: args.deckSide === 'home' ? awayScore : homeScore,
    counts,
  };
}

export function runV8DribblingActivationDiagnostic(): V8DribblingActivationReport {
  const summaries: V8DribblingActivationSummary[] = [];
  let totalMatches = 0;
  for (const item of CASES) {
    const deck = buildDeck(item.core);
    const counts = emptyCounts();
    let wins = 0;
    let gf = 0;
    let ga = 0;
    let matches = 0;
    for (const referenceProfile of V8_CALIBRATION_SQUAD_KEYS) {
      const reference = getV8CalibrationSquad(referenceProfile).playerIds;
      for (const seed of V8_DRIBBLING_ACTIVATION_SEEDS) {
        for (const deckSide of ['home', 'away'] as const) {
          const result = simulate({ deck, reference, deckSide, referenceProfile, seed: seed + (deckSide === 'away' ? 95_003 : 0) });
          gf += result.gf; ga += result.ga; if (result.gf > result.ga) wins += 1;
          addCounts(counts, result.counts);
          matches += 1; totalMatches += 1;
        }
      }
    }
    summaries.push({
      id: item.id,
      core: item.core,
      matches,
      winRate: Math.round((wins / matches) * 1000) / 1000,
      goalDifference: Math.round(((gf - ga) / matches) * 1000) / 1000,
      ...counts,
    });
  }
  return { matches: totalMatches, summaries };
}

export function formatV8DribblingActivationReport(report: V8DribblingActivationReport): string {
  return [
    `V8 Dribbling activation timing · ${report.matches} matches`,
    '',
    ...report.summaries.map((s) => [
      s.id,
      `W ${Math.round(s.winRate * 100)}%`,
      `GD ${s.goalDifference >= 0 ? '+' : ''}${s.goalDifference}`,
      `Duff target ${s.duffTargetPresent}/${s.duffReveals} hit ${s.duffReductions}`,
      `Garr target ${s.garrinchaTargetPresent}/${s.garrinchaReveals} hit ${s.garrinchaReductions} combo ${s.garrinchaComboBonuses}`,
      `Ney target ${s.neymarTargetPresent}/${s.neymarReveals} gen ${s.neymarPenaltyGenerations}`,
      `PEN resolved ${s.penaltyResolutions}`,
    ].join(' | ')),
  ].join('\n');
}
