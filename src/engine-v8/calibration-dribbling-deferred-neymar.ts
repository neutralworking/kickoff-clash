import { calibrationEnergyForPeriod } from './calibration-balance';
import { getV8CalibrationPlayer } from './calibration-cards';
import { endV8CalibrationPeriod, revealCalibrationPlayer } from './calibration-decay';
import {
  planV8CalibrationSide,
  planV8CalibrationWindow,
  type V8CalibrationMatrixPlay,
} from './calibration-matchup-matrix';
import {
  addCalibrationTacticalToHand,
  calibrationPlayersInZone,
  calibrationTeamTotals,
  createV8CalibrationMatch,
  currentCalibrationDefence,
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

export type V8DeferredNeymarMode = 'immediate' | 'post_reveal';

const SEEDS = [8_082_026, 8_291_484, 8_500_942, 8_710_400, 8_919_858, 9_129_316, 9_338_774, 9_548_232] as const;
const SUPPORT = ['schmeichel', 'gentile', 'seedorf', 'iniesta', 'beckenbauer', 'makelele', 'bremner', 'sinclair', 'beckham', 'charlton', 'ramos'] as const;
const CASES = [
  { id: 'duff-neymar', core: ['duff', 'neymar'] },
  { id: 'garrincha-neymar', core: ['garrincha', 'neymar'] },
  { id: 'duff-neymar-panenka', core: ['duff', 'neymar', 'panenka'] },
  { id: 'garrincha-neymar-panenka', core: ['garrincha', 'neymar', 'panenka'] },
  { id: 'duff-garrincha-neymar-panenka', core: ['duff', 'garrincha', 'neymar', 'panenka'] },
] as const;

export interface V8DeferredNeymarSummary {
  mode: V8DeferredNeymarMode;
  id: string;
  matches: number;
  winRate: number;
  drawRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  neymarPenaltyGenerations: number;
  penaltyResolutions: number;
  enhancedPenaltyResolutions: number;
  windowPenaltyResolutions: number;
}

export interface V8DeferredNeymarReport {
  matches: number;
  summaries: readonly V8DeferredNeymarSummary[];
}

function rounded(value: number): number { return Math.round(value * 1000) / 1000; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function deck(core: readonly string[]): string[] {
  return [...core, ...SUPPORT.filter((id) => !core.includes(id as never)).slice(0, 11 - core.length)];
}

function withEnergy(state: V8CalibrationState): V8CalibrationState {
  const energy = calibrationEnergyForPeriod(state.period);
  return { ...state, teams: { home: { ...state.teams.home, energy }, away: { ...state.teams.away, energy } } };
}

function applyManager(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): V8CalibrationState {
  const next = clone(state);
  const count = calibrationPlayersInZone(next, side, zone).length;
  if (zone === 'ATT') next.tacticalAttack[side].ATT += count * 2;
  if (zone === 'DEF') next.zoneDefenceBonus[side].DEF += count * 2;
  if (zone === 'MID') { next.tacticalAttack[side].MID += count; next.zoneDefenceBonus[side].MID += count; }
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

function hasReducedDefenderOpposite(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): boolean {
  const other: V8CalibrationSide = side === 'home' ? 'away' : 'home';
  return calibrationPlayersInZone(state, other, opposingDepthZone(zone)).some((player) => {
    const card = getV8CalibrationPlayer(player.cardId);
    return card.position !== 'GK'
      && card.naturalZones.includes('DEF')
      && currentCalibrationDefence(state, player.runtimeId) < card.printedDefence;
  });
}

function applyDeferredNeymar(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  plays: readonly V8CalibrationMatrixPlay[],
): { state: V8CalibrationState; generated: number } {
  const reveal = plays.find((play) => play.kind === 'player' && play.side === side && play.cardId === 'neymar');
  if (!reveal || reveal.kind !== 'player') return { state, generated: 0 };
  const alreadyGenerated = state.events.some((event) => event.period === state.period
    && event.type === 'tactical_generated'
    && event.text.includes('Neymar generates Penalty'));
  if (alreadyGenerated || !hasReducedDefenderOpposite(state, side, reveal.zone)) return { state, generated: 0 };

  const added = addCalibrationTacticalToHand(state, side, 'penalty', { generatedBy: 'neymar' });
  added.card.metadata.availableFromPeriod = state.period + 1;
  added.card.metadata.enteredHandPeriod = state.period;
  added.state.events.push({
    type: 'tactical_generated',
    period: state.period,
    text: 'Neymar generates Penalty (post-reveal RAINBOW FLICK check).',
  });
  return { state: added.state, generated: 1 };
}

type Outcome = { gf: number; ga: number; generated: number; resolved: number; enhanced: number; window: number };

function simulate(args: {
  deck: readonly string[];
  reference: readonly string[];
  deckSide: V8CalibrationSide;
  referenceProfile: V8CalibrationSquadKey;
  seed: number;
  mode: V8DeferredNeymarMode;
}): Outcome {
  const homeDeck = args.deckSide === 'home' ? args.deck : args.reference;
  const awayDeck = args.deckSide === 'away' ? args.deck : args.reference;
  let state = withEnergy(createV8CalibrationMatch(seededShuffle(homeDeck, args.seed), seededShuffle(awayDeck, args.seed + 1)));
  let homeScore = 0; let awayScore = 0; let homeManager = true; let awayManager = true;
  let generated = 0; let resolvedCount = 0; let enhanced = 0; let windowCount = 0;

  for (let periodIndex = 0; periodIndex < 4; periodIndex += 1) {
    const homeProfile: V8CalibrationSquadKey = args.deckSide === 'home' ? 'dribbling_penalty' : args.referenceProfile;
    const awayProfile: V8CalibrationSquadKey = args.deckSide === 'away' ? 'dribbling_penalty' : args.referenceProfile;
    const home = planV8CalibrationSide(state, 'home', homeManager, homeProfile);
    const away = planV8CalibrationSide(home.state, 'away', awayManager, awayProfile);
    homeManager = home.managerAvailable; awayManager = away.managerAvailable;
    const plays = [...home.pending, ...away.pending];
    const first = priority(away.state, homeScore, awayScore, args.seed + away.state.period * 101);
    let current = resolveSequence(away.state, plays.filter((play) => play.side === first));
    current = resolveSequence(current, plays.filter((play) => play.side !== first));
    if (args.mode === 'post_reveal') {
      const deferred = applyDeferredNeymar(current, args.deckSide, plays);
      current = deferred.state;
      generated += deferred.generated;
    }
    generated += current.events.filter((event) => event.period === current.period
      && event.type === 'tactical_generated'
      && event.text === 'Neymar generates Penalty.').length;

    current = resolveGeneratedTacticalWindow(current, [
      ...planV8CalibrationWindow(current, 'home', homeProfile),
      ...planV8CalibrationWindow(current, 'away', awayProfile),
    ]).state;
    const penalties = current.tacticalResolutions.filter((resolution) => resolution.side === args.deckSide && resolution.type === 'penalty');
    resolvedCount += penalties.length;
    enhanced += penalties.filter((resolution) => resolution.specialistBonuses.some((label) => label.includes('CHIPPED PENALTY'))).length;
    windowCount += penalties.filter((resolution) => resolution.window).length;

    const homeTotals = calibrationTeamTotals(current, 'home'); const awayTotals = calibrationTeamTotals(current, 'away');
    homeScore += goalsFromAttackDefence(homeTotals.attack, awayTotals.defence);
    awayScore += goalsFromAttackDefence(awayTotals.attack, homeTotals.defence);
    const final = current.period === 4;
    state = endV8CalibrationPeriod(current); if (!final) state = withEnergy(state);
  }
  return { gf: args.deckSide === 'home' ? homeScore : awayScore, ga: args.deckSide === 'home' ? awayScore : homeScore, generated, resolved: resolvedCount, enhanced, window: windowCount };
}

export function runV8DeferredNeymarSensitivity(): V8DeferredNeymarReport {
  const summaries: V8DeferredNeymarSummary[] = [];
  let totalMatches = 0;
  for (const mode of ['immediate', 'post_reveal'] as const) {
    for (const item of CASES) {
      const playerIds = deck(item.core);
      let matches = 0; let wins = 0; let draws = 0; let gf = 0; let ga = 0; let generated = 0; let resolved = 0; let enhanced = 0; let window = 0;
      for (const referenceProfile of V8_CALIBRATION_SQUAD_KEYS) {
        const reference = getV8CalibrationSquad(referenceProfile).playerIds;
        for (const seed of SEEDS) {
          for (const deckSide of ['home', 'away'] as const) {
            const result = simulate({ playerIds: undefined as never, deck: playerIds, reference, deckSide, referenceProfile, seed: seed + (deckSide === 'away' ? 95_003 : 0), mode } as Parameters<typeof simulate>[0]);
            matches += 1; totalMatches += 1; gf += result.gf; ga += result.ga; generated += result.generated; resolved += result.resolved; enhanced += result.enhanced; window += result.window;
            if (result.gf > result.ga) wins += 1; else if (result.gf === result.ga) draws += 1;
          }
        }
      }
      summaries.push({ mode, id: item.id, matches, winRate: rounded(wins / matches), drawRate: rounded(draws / matches), goalsFor: rounded(gf / matches), goalsAgainst: rounded(ga / matches), goalDifference: rounded((gf - ga) / matches), neymarPenaltyGenerations: generated, penaltyResolutions: resolved, enhancedPenaltyResolutions: enhanced, windowPenaltyResolutions: window });
    }
  }
  return { matches: totalMatches, summaries };
}

export function formatV8DeferredNeymarReport(report: V8DeferredNeymarReport): string {
  return [
    `V8 deferred RAINBOW FLICK sensitivity · ${report.matches} matches`, '',
    ...report.summaries.map((s) => `${s.mode} · ${s.id} | W ${Math.round(s.winRate * 100)}% | D ${Math.round(s.drawRate * 100)}% | GF ${s.goalsFor} | GA ${s.goalsAgainst} | GD ${s.goalDifference >= 0 ? '+' : ''}${s.goalDifference} | generated ${s.neymarPenaltyGenerations} | resolved ${s.penaltyResolutions} | enhanced ${s.enhancedPenaltyResolutions} | window ${s.windowPenaltyResolutions}`),
  ].join('\n');
}
