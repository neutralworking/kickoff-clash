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
  applyCalibrationModifier,
  calibrationPlayerCard,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  calibrationTeamTotals,
  createV8CalibrationMatch,
  currentCalibrationDefence,
  hasReducedDefence,
  isCalibrationActionEnabled,
  opposingDepthZone,
  resolveCommittedCalibrationTactical,
  resolveGeneratedTacticalWindow,
  seedCalibrationPlayer,
  type V8CalibrationRuntimePlayer,
  type V8CalibrationSide,
  type V8CalibrationState,
} from './calibration-runtime';
import {
  V8_CALIBRATION_SQUAD_KEYS,
  getV8CalibrationSquad,
  type V8CalibrationSquadKey,
} from './calibration-squads';
import { goalsFromAttackDefence, type V8Zone } from './core';

export type V8DribblingTimingMode = 'immediate' | 'settled_dribble';

const SEEDS = [8_082_026, 8_291_484, 8_500_942, 8_710_400, 8_919_858, 9_129_316, 9_338_774, 9_548_232] as const;
const SUPPORT = ['schmeichel', 'gentile', 'seedorf', 'iniesta', 'beckenbauer', 'makelele', 'bremner', 'sinclair', 'beckham', 'charlton', 'ramos'] as const;
const DRIBBLE_IDS = new Set(['duff', 'garrincha', 'neymar']);

const CASES = [
  { id: 'duff-neymar', core: ['duff', 'neymar'] },
  { id: 'garrincha-neymar', core: ['garrincha', 'neymar'] },
  { id: 'duff-garrincha', core: ['duff', 'garrincha'] },
  { id: 'duff-neymar-panenka', core: ['duff', 'neymar', 'panenka'] },
  { id: 'garrincha-neymar-panenka', core: ['garrincha', 'neymar', 'panenka'] },
  { id: 'duff-garrincha-neymar', core: ['duff', 'garrincha', 'neymar'] },
  { id: 'duff-garrincha-neymar-panenka', core: ['duff', 'garrincha', 'neymar', 'panenka'] },
] as const;

export interface V8SettledDribbleSummary {
  mode: V8DribblingTimingMode;
  id: string;
  matches: number;
  winRate: number;
  drawRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  duffReductions: number;
  garrinchaReductions: number;
  garrinchaComboBonuses: number;
  neymarPenaltyGenerations: number;
  penaltyResolutions: number;
  enhancedPenaltyResolutions: number;
  windowPenaltyResolutions: number;
}

export interface V8SettledDribbleReport {
  matches: number;
  summaries: readonly V8SettledDribbleSummary[];
}

type Counters = Pick<V8SettledDribbleSummary,
  'duffReductions' | 'garrinchaReductions' | 'garrinchaComboBonuses' | 'neymarPenaltyGenerations' |
  'penaltyResolutions' | 'enhancedPenaltyResolutions' | 'windowPenaltyResolutions'>;

type Outcome = Counters & { gf: number; ga: number };

function rounded(value: number): number { return Math.round(value * 1000) / 1000; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function emptyCounters(): Counters {
  return { duffReductions: 0, garrinchaReductions: 0, garrinchaComboBonuses: 0, neymarPenaltyGenerations: 0, penaltyResolutions: 0, enhancedPenaltyResolutions: 0, windowPenaltyResolutions: 0 };
}
function addCounters(target: Counters, source: Counters): void {
  for (const key of Object.keys(target) as Array<keyof Counters>) target[key] += source[key];
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items]; let state = seed >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1)); [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function buildDeck(core: readonly string[]): string[] {
  return [...core, ...SUPPORT.filter((id) => !core.includes(id as never)).slice(0, 11 - core.length)];
}

function withEnergy(state: V8CalibrationState): V8CalibrationState {
  const energy = calibrationEnergyForPeriod(state.period);
  return { ...state, teams: { home: { ...state.teams.home, energy }, away: { ...state.teams.away, energy } } };
}

function applyManager(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): V8CalibrationState {
  const next = clone(state); const count = calibrationPlayersInZone(next, side, zone).length;
  if (zone === 'ATT') next.tacticalAttack[side].ATT += count * 2;
  if (zone === 'DEF') next.zoneDefenceBonus[side].DEF += count * 2;
  if (zone === 'MID') { next.tacticalAttack[side].MID += count; next.zoneDefenceBonus[side].MID += count; }
  return next;
}

function otherSide(side: V8CalibrationSide): V8CalibrationSide { return side === 'home' ? 'away' : 'home'; }
function opponentsHere(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): V8CalibrationRuntimePlayer[] {
  return calibrationPlayersInZone(state, otherSide(side), opposingDepthZone(zone));
}
function isDefender(player: V8CalibrationRuntimePlayer): boolean {
  const card = calibrationPlayerCard(player); return card.position !== 'GK' && card.naturalZones.includes('DEF');
}
function highestDefence(state: V8CalibrationState, players: readonly V8CalibrationRuntimePlayer[]): V8CalibrationRuntimePlayer | undefined {
  return [...players].sort((a, b) => currentCalibrationDefence(state, b.runtimeId) - currentCalibrationDefence(state, a.runtimeId)
    || a.deployedOrder - b.deployedOrder || a.runtimeId.localeCompare(b.runtimeId))[0];
}

function addNeymarPenalty(state: V8CalibrationState, side: V8CalibrationSide): V8CalibrationState {
  const added = addCalibrationTacticalToHand(state, side, 'penalty', { generatedBy: 'neymar' });
  added.card.metadata.availableFromPeriod = state.period + 1;
  added.card.metadata.enteredHandPeriod = state.period;
  added.state.events.push({ type: 'tactical_generated', period: state.period, text: 'Neymar generates Penalty (settled Dribble phase).' });
  return added.state;
}

function applySettledDribble(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  plays: readonly V8CalibrationMatrixPlay[],
  counters: Counters,
): V8CalibrationState {
  let next = state;
  for (const play of plays) {
    if (play.kind !== 'player' || play.side !== side || !DRIBBLE_IDS.has(play.cardId)) continue;
    const runtimeId = calibrationRuntimeId(side, play.cardId);
    const player = next.players[runtimeId];
    if (!player || !isCalibrationActionEnabled(next, runtimeId)) continue;
    const opponents = opponentsHere(next, side, player.zone);
    const card = getV8CalibrationPlayer(play.cardId);

    if (play.cardId === 'duff') {
      const target = highestDefence(next, opponents);
      if (target) {
        const before = currentCalibrationDefence(next, target.runtimeId);
        next = applyCalibrationModifier(next, target.runtimeId, { defence: -2, lifetime: 'period', source: card.actionName, sourceRuntimeId: runtimeId });
        if (currentCalibrationDefence(next, target.runtimeId) < before) counters.duffReductions += 1;
      }
      next = applyCalibrationModifier(next, runtimeId, { attack: 2, lifetime: 'period', source: card.actionName });
      continue;
    }

    if (play.cardId === 'garrincha') {
      const target = highestDefence(next, opponents.filter(isDefender));
      if (!target) continue;
      const alreadyReduced = hasReducedDefence(next, target.runtimeId);
      const before = currentCalibrationDefence(next, target.runtimeId);
      next = applyCalibrationModifier(next, target.runtimeId, { defence: -2, lifetime: 'period', source: card.actionName, sourceRuntimeId: runtimeId });
      if (currentCalibrationDefence(next, target.runtimeId) < before) counters.garrinchaReductions += 1;
      if (alreadyReduced) {
        next = applyCalibrationModifier(next, runtimeId, { attack: 4, lifetime: 'period', source: card.actionName });
        counters.garrinchaComboBonuses += 1;
      }
      continue;
    }

    if (play.cardId === 'neymar' && opponents.filter(isDefender).some((target) => hasReducedDefence(next, target.runtimeId))) {
      next = addNeymarPenalty(next, side);
      counters.neymarPenaltyGenerations += 1;
    }
  }
  return next;
}

function resolveSequence(
  state: V8CalibrationState,
  plays: readonly V8CalibrationMatrixPlay[],
  mode: V8DribblingTimingMode,
): V8CalibrationState {
  let next = state;
  for (const play of plays) {
    if (play.kind === 'player') {
      next = mode === 'settled_dribble' && DRIBBLE_IDS.has(play.cardId)
        ? seedCalibrationPlayer(next, play.side, play.cardId, play.zone)
        : revealCalibrationPlayer(next, play.side, play.cardId, play.zone);
    } else if (play.kind === 'tactical') next = resolveCommittedCalibrationTactical(next, play.side, play.card, play.zone, play.cost);
    else next = applyManager(next, play.side, play.zone);
  }
  return next;
}

function priority(state: V8CalibrationState, homeScore: number, awayScore: number, seed: number): V8CalibrationSide {
  if (homeScore !== awayScore) return homeScore > awayScore ? 'home' : 'away';
  const home = calibrationTeamTotals(state, 'home'); const away = calibrationTeamTotals(state, 'away');
  if (home.attack !== away.attack) return home.attack > away.attack ? 'home' : 'away';
  const hs = home.attack + home.defence; const as = away.attack + away.defence;
  if (hs !== as) return hs > as ? 'home' : 'away';
  return ((Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0) % 2 === 0 ? 'home' : 'away';
}

function simulate(args: {
  deck: readonly string[];
  reference: readonly string[];
  deckSide: V8CalibrationSide;
  referenceProfile: V8CalibrationSquadKey;
  seed: number;
  mode: V8DribblingTimingMode;
}): Outcome {
  const homeDeck = args.deckSide === 'home' ? args.deck : args.reference;
  const awayDeck = args.deckSide === 'away' ? args.deck : args.reference;
  let state = withEnergy(createV8CalibrationMatch(seededShuffle(homeDeck, args.seed), seededShuffle(awayDeck, args.seed + 1)));
  let homeScore = 0; let awayScore = 0; let homeManager = true; let awayManager = true;
  const counters = emptyCounters();

  for (let periodIndex = 0; periodIndex < 4; periodIndex += 1) {
    const homeProfile: V8CalibrationSquadKey = args.deckSide === 'home' ? 'dribbling_penalty' : args.referenceProfile;
    const awayProfile: V8CalibrationSquadKey = args.deckSide === 'away' ? 'dribbling_penalty' : args.referenceProfile;
    const home = planV8CalibrationSide(state, 'home', homeManager, homeProfile);
    const away = planV8CalibrationSide(home.state, 'away', awayManager, awayProfile);
    homeManager = home.managerAvailable; awayManager = away.managerAvailable;
    const plays = [...home.pending, ...away.pending];
    const first = priority(away.state, homeScore, awayScore, args.seed + away.state.period * 101);
    let current = resolveSequence(away.state, plays.filter((play) => play.side === first), args.mode);
    current = resolveSequence(current, plays.filter((play) => play.side !== first), args.mode);

    if (args.mode === 'settled_dribble') {
      // Both teams' committed cards are now visible. Preserve reveal priority between teams, but
      // preserve each team's commitment order inside its own settled Dribble step.
      current = applySettledDribble(current, first, plays.filter((play) => play.side === first), first === args.deckSide ? counters : emptyCounters());
      const second = otherSide(first);
      current = applySettledDribble(current, second, plays.filter((play) => play.side === second), second === args.deckSide ? counters : emptyCounters());
    }

    current = resolveGeneratedTacticalWindow(current, [
      ...planV8CalibrationWindow(current, 'home', homeProfile),
      ...planV8CalibrationWindow(current, 'away', awayProfile),
    ]).state;
    const penalties = current.tacticalResolutions.filter((resolution) => resolution.side === args.deckSide && resolution.type === 'penalty');
    counters.penaltyResolutions += penalties.length;
    counters.enhancedPenaltyResolutions += penalties.filter((resolution) => resolution.specialistBonuses.some((label) => label.includes('CHIPPED PENALTY'))).length;
    counters.windowPenaltyResolutions += penalties.filter((resolution) => resolution.window).length;

    const homeTotals = calibrationTeamTotals(current, 'home'); const awayTotals = calibrationTeamTotals(current, 'away');
    homeScore += goalsFromAttackDefence(homeTotals.attack, awayTotals.defence);
    awayScore += goalsFromAttackDefence(awayTotals.attack, homeTotals.defence);
    const final = current.period === 4; state = endV8CalibrationPeriod(current); if (!final) state = withEnergy(state);
  }
  return { gf: args.deckSide === 'home' ? homeScore : awayScore, ga: args.deckSide === 'home' ? awayScore : homeScore, ...counters };
}

export function runV8SettledDribbleSensitivity(): V8SettledDribbleReport {
  const summaries: V8SettledDribbleSummary[] = []; let totalMatches = 0;
  for (const mode of ['immediate', 'settled_dribble'] as const) {
    for (const item of CASES) {
      const playerIds = buildDeck(item.core); const counters = emptyCounters();
      let matches = 0; let wins = 0; let draws = 0; let gf = 0; let ga = 0;
      for (const referenceProfile of V8_CALIBRATION_SQUAD_KEYS) {
        const reference = getV8CalibrationSquad(referenceProfile).playerIds;
        for (const seed of SEEDS) {
          for (const deckSide of ['home', 'away'] as const) {
            const result = simulate({ deck: playerIds, reference, deckSide, referenceProfile, seed: seed + (deckSide === 'away' ? 95_003 : 0), mode });
            matches += 1; totalMatches += 1; gf += result.gf; ga += result.ga; addCounters(counters, result);
            if (result.gf > result.ga) wins += 1; else if (result.gf === result.ga) draws += 1;
          }
        }
      }
      summaries.push({ mode, id: item.id, matches, winRate: rounded(wins / matches), drawRate: rounded(draws / matches), goalsFor: rounded(gf / matches), goalsAgainst: rounded(ga / matches), goalDifference: rounded((gf - ga) / matches), ...counters });
    }
  }
  return { matches: totalMatches, summaries };
}

export function formatV8SettledDribbleReport(report: V8SettledDribbleReport): string {
  return [
    `V8 settled-pitch Dribble sensitivity · ${report.matches} matches`, '',
    ...report.summaries.map((s) => `${s.mode} · ${s.id} | W ${Math.round(s.winRate * 100)}% | D ${Math.round(s.drawRate * 100)}% | GF ${s.goalsFor} | GA ${s.goalsAgainst} | GD ${s.goalDifference >= 0 ? '+' : ''}${s.goalDifference} | Duff hits ${s.duffReductions} | Garr hits ${s.garrinchaReductions} combo ${s.garrinchaComboBonuses} | Neymar gen ${s.neymarPenaltyGenerations} | PEN ${s.penaltyResolutions} enhanced ${s.enhancedPenaltyResolutions} window ${s.windowPenaltyResolutions}`),
  ].join('\n');
}
