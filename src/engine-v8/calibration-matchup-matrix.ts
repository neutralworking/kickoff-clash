import { goalsFromAttackDefence, type V8Zone } from './core';
import { calibrationEnergyForPeriod, calibrationPlayCost } from './calibration-balance';
import {
  endV8CalibrationPeriod,
  isCalibrationTacticalAvailable,
  revealCalibrationPlayer,
  spendCalibrationTacticalFromHand,
} from './calibration-decay';
import { type V8CalibrationPlayerCard } from './calibration-cards';
import {
  calibrationHandPlayers,
  calibrationHandTacticals,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  calibrationTeamTotals,
  createV8CalibrationMatch,
  moveCalibrationPlayer,
  previewCalibrationTacticalCost,
  removeCalibrationPlayerFromHand,
  resolveCommittedCalibrationTactical,
  resolveGeneratedTacticalWindow,
  tacticalDefinition,
  windowEligibleCalibrationTacticals,
  type V8CalibrationSide,
  type V8CalibrationState,
  type V8CalibrationWindowPlay,
} from './calibration-runtime';
import {
  V8_CALIBRATION_SQUAD_KEYS,
  getV8CalibrationSquad,
  type V8CalibrationSquadKey,
} from './calibration-squads';
import {
  buildV8CalibrationMatchTelemetry,
  captureV8CalibrationPeriodTelemetry,
  type V8CalibrationMatchTelemetry,
  type V8CalibrationPeriodTelemetry,
} from './calibration-telemetry';
import type { V8TacticalCardInstance, V8TacticalType } from './tactical';

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const MANAGER_COST = 3;

export type V8CalibrationMatrixPlay =
  | { kind: 'player'; side: V8CalibrationSide; cardId: string; zone: V8Zone; cost: number }
  | { kind: 'tactical'; side: V8CalibrationSide; card: V8TacticalCardInstance; zone: V8Zone; cost: number }
  | { kind: 'manager'; side: V8CalibrationSide; zone: V8Zone; cost: number };

export interface V8CalibrationPlannerResult {
  state: V8CalibrationState;
  pending: V8CalibrationMatrixPlay[];
  managerAvailable: boolean;
}

export interface V8CalibrationSimulatedMatch {
  seed: number;
  homeSquad: V8CalibrationSquadKey;
  awaySquad: V8CalibrationSquadKey;
  homeScore: number;
  awayScore: number;
  telemetry: V8CalibrationMatchTelemetry;
}

export interface V8CalibrationPairSummary {
  squadA: V8CalibrationSquadKey;
  squadB: V8CalibrationSquadKey;
  matches: number;
  squadAWins: number;
  draws: number;
  squadBWins: number;
  squadAWinRate: number;
  drawRate: number;
  squadBWinRate: number;
  averageGoalsA: number;
  averageGoalsB: number;
  averageGoalDifferenceA: number;
}

export interface V8CalibrationSquadSummary {
  squad: V8CalibrationSquadKey;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  drawRate: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  averageGoalDifference: number;
  averageUnusedEnergy: number;
  averagePlayersDeployed: number;
  averageTacticalsPlayed: number;
  averageCancelledChances: number;
  tacticalAttackShare: number;
  averageWindowTacticalsPlayed: number;
  averageWindowEnergySpent: number;
  averageWindowTacticalAtt: number;
  averageWindowCancellations: number;
  topChains: Array<{ chain: string; count: number }>;
}

export interface V8CalibrationMatrixReport {
  seeds: readonly number[];
  matches: number;
  pairings: V8CalibrationPairSummary[];
  squads: V8CalibrationSquadSummary[];
}

interface V8CalibrationPlannerProfile {
  priorityPlayerIds: readonly string[];
  preferredZones: Readonly<Record<string, V8Zone>>;
}

/**
 * Calibration-only intent. These are not production AI instructions and they do not waive OOP.
 * The profile makes the named archetype actually attempt its defining football sequence.
 */
const PLANNER_PROFILES: Readonly<Record<V8CalibrationSquadKey, V8CalibrationPlannerProfile>> = {
  cross: {
    priorityPlayerIds: ['wambach', 'beckham', 'di-maria', 'cafu', 'dzajic', 'hegerberg'],
    preferredZones: {
      wambach: 'ATT',
      hegerberg: 'ATT',
      dzajic: 'ATT',
      beckham: 'MID',
      'di-maria': 'MID',
      cafu: 'DEF',
    },
  },
  through_ball: {
    priorityPlayerIds: ['morgan', 'shevchenko', 'valderrama', 'litmanen', 'park'],
    preferredZones: {
      morgan: 'ATT',
      shevchenko: 'ATT',
      valderrama: 'MID',
      litmanen: 'MID',
      park: 'MID',
    },
  },
  dribbling_penalty: {
    priorityPlayerIds: ['panenka', 'duff', 'garrincha', 'neymar'],
    preferredZones: {
      panenka: 'ATT',
      duff: 'ATT',
      garrincha: 'ATT',
      neymar: 'ATT',
    },
  },
  control_defence: {
    priorityPlayerIds: [],
    preferredZones: {},
  },
  long_shot_set_piece: {
    priorityPlayerIds: ['ramos', 'lloyd', 'schmeichel', 'charlton', 'eriksen', 'makelele'],
    preferredZones: {
      ramos: 'DEF',
      lloyd: 'MID',
      charlton: 'MID',
      eriksen: 'MID',
    },
  },
  balanced_midrange: {
    priorityPlayerIds: ['ronaldo', 'okocha'],
    preferredZones: {
      ronaldo: 'ATT',
      okocha: 'ATT',
    },
  },
};

export const V8_CALIBRATION_MATRIX_SEEDS = Array.from(
  { length: 32 },
  (_, index) => 8_082_026 + index * 104_729,
);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function occupiedPlayerSlots(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  zone: V8Zone,
  pending: readonly V8CalibrationMatrixPlay[],
): number {
  const queued = pending.filter(
    (play) => play.side === side && play.zone === zone && (play.kind === 'player' || play.kind === 'manager'),
  ).length;
  return calibrationPlayersInZone(state, side, zone).length + queued;
}

function choosePlayerZone(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey,
  card: V8CalibrationPlayerCard,
  pending: readonly V8CalibrationMatrixPlay[],
): V8Zone | null {
  const preferred = PLANNER_PROFILES[squad].preferredZones[card.id];
  if (preferred && occupiedPlayerSlots(state, side, preferred, pending) < 4) return preferred;
  const natural = card.naturalZones.find((zone) => occupiedPlayerSlots(state, side, zone, pending) < 4);
  if (natural) return natural;
  return ZONES.find((zone) => occupiedPlayerSlots(state, side, zone, pending) < 4) ?? null;
}

function payPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  card: V8CalibrationPlayerCard,
): V8CalibrationState {
  const cost = calibrationPlayCost(card);
  if (state.teams[side].energy < cost) throw new Error('Not enough energy');
  const removed = removeCalibrationPlayerFromHand(state, side, card.id, { ignoreEnergy: true });
  return {
    ...removed,
    teams: {
      ...removed.teams,
      [side]: { ...removed.teams[side], energy: removed.teams[side].energy - cost },
    },
  };
}

function priorityPlayersForState(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey,
): readonly string[] {
  if (squad === 'through_ball') {
    const runnerEstablished = calibrationPlayersInZone(state, side, 'ATT')
      .some((player) => player.cardId === 'morgan' || player.cardId === 'shevchenko');
    return runnerEstablished
      ? ['valderrama', 'litmanen', 'morgan', 'shevchenko', 'park']
      : ['morgan', 'shevchenko', 'valderrama', 'litmanen', 'park'];
  }
  if (squad === 'long_shot_set_piece') {
    return state.period >= 3
      ? ['ramos', 'lloyd', 'schmeichel', 'charlton', 'eriksen', 'makelele']
      : ['lloyd', 'schmeichel', 'charlton', 'eriksen', 'makelele'];
  }
  return PLANNER_PROFILES[squad].priorityPlayerIds;
}

function priorityIndex(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey,
  cardId: string,
): number {
  const index = priorityPlayersForState(state, side, squad).indexOf(cardId);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function shouldDeferPlayer(state: V8CalibrationState, squad: V8CalibrationSquadKey, cardId: string): boolean {
  return squad === 'long_shot_set_piece' && cardId === 'ramos' && state.period < 3;
}

/**
 * Lightweight calibration movement policy, not production AI.
 * Cafu goes one line forward so PENDOLINO creates Crosses. Beckenbauer toggles between his two
 * natural lines where doing so does not occupy the deliberately staged Penalty / set-piece lanes.
 */
function exerciseMovement(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey,
): V8CalibrationState {
  let next = state;

  const cafu = next.players[calibrationRuntimeId(side, 'cafu')];
  if (cafu) {
    const target: V8Zone | null = cafu.zone === 'DEF' ? 'MID' : cafu.zone === 'MID' ? 'ATT' : null;
    if (target && calibrationPlayersInZone(next, side, target).length < 4) {
      try {
        next = moveCalibrationPlayer(next, side, 'cafu', target);
      } catch {
        // Suppression/full-lane edge cases simply mean no calibration move this period.
      }
    }
  }

  const shouldExerciseKaiser = squad !== 'dribbling_penalty' && squad !== 'long_shot_set_piece';
  const beckenbauer = next.players[calibrationRuntimeId(side, 'beckenbauer')];
  if (shouldExerciseKaiser && beckenbauer) {
    const target: V8Zone | null = beckenbauer.zone === 'DEF' ? 'MID' : beckenbauer.zone === 'MID' ? 'DEF' : null;
    if (target && calibrationPlayersInZone(next, side, target).length < 4) {
      try {
        next = moveCalibrationPlayer(next, side, 'beckenbauer', target);
      } catch {
        // Same calibration-only fallback as Cafu.
      }
    }
  }

  return next;
}

type TacticalHoldPlan = {
  heldIds: ReadonlySet<string>;
  priorityPlayerId?: string;
  reservedEnergy: number;
};

function emptyHoldPlan(): TacticalHoldPlan {
  return { heldIds: new Set(), reservedEnergy: 0 };
}

function availableTactical(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  type: V8TacticalType,
): V8TacticalCardInstance | undefined {
  return calibrationHandTacticals(state, side)
    .find((card) => card.type === type && isCalibrationTacticalAvailable(state, card));
}

function holdForPlayer(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey,
  pending: readonly V8CalibrationMatrixPlay[],
  tactical: V8TacticalCardInstance | undefined,
  playerId: string,
): TacticalHoldPlan {
  if (!tactical || state.players[calibrationRuntimeId(side, playerId)]) return emptyHoldPlan();
  const player = calibrationHandPlayers(state, side).find((card) => card.id === playerId);
  if (!player || shouldDeferPlayer(state, squad, player.id)) return emptyHoldPlan();
  const cost = calibrationPlayCost(player);
  if (cost > state.teams[side].energy || !choosePlayerZone(state, side, squad, player, pending)) return emptyHoldPlan();
  return { heldIds: new Set([tactical.id]), priorityPlayerId: playerId, reservedEnergy: cost };
}

/**
 * A few explicit hold decisions are part of the calibration harness because spending the Tactical
 * before its obvious enabler reveals would make the named mechanic impossible to observe.
 */
function tacticalHoldPlan(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey,
  pending: readonly V8CalibrationMatrixPlay[],
): TacticalHoldPlan {
  if (squad === 'cross') {
    const plan = holdForPlayer(state, side, squad, pending, availableTactical(state, side, 'cross'), 'di-maria');
    if (plan.priorityPlayerId) return plan;
  }

  if (squad === 'through_ball') {
    const throughBall = availableTactical(state, side, 'through_ball');
    const hasRunner = calibrationPlayersInZone(state, side, 'ATT')
      .some((player) => player.cardId === 'morgan' || player.cardId === 'shevchenko');
    if (throughBall && !hasRunner) {
      for (const runnerId of ['morgan', 'shevchenko'] as const) {
        const plan = holdForPlayer(state, side, squad, pending, throughBall, runnerId);
        if (plan.priorityPlayerId) return plan;
      }
    }
  }

  if (squad === 'dribbling_penalty') {
    const plan = holdForPlayer(state, side, squad, pending, availableTactical(state, side, 'penalty'), 'panenka');
    if (plan.priorityPlayerId) return plan;
  }

  if (squad === 'long_shot_set_piece') {
    const longShotPlan = holdForPlayer(state, side, squad, pending, availableTactical(state, side, 'long_shot'), 'lloyd');
    if (longShotPlan.priorityPlayerId) return longShotPlan;
    if (state.period >= 3) {
      const cornerPlan = holdForPlayer(state, side, squad, pending, availableTactical(state, side, 'corner'), 'ramos');
      if (cornerPlan.priorityPlayerId) return cornerPlan;
    }
  }

  return emptyHoldPlan();
}

export function planV8CalibrationSide(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  managerAvailable: boolean,
  squad: V8CalibrationSquadKey = 'balanced_midrange',
): V8CalibrationPlannerResult {
  let next = exerciseMovement(state, side, squad);
  const pending: V8CalibrationMatrixPlay[] = [];
  let nextManagerAvailable = managerAvailable;
  const hold = tacticalHoldPlan(next, side, squad, pending);

  while (next.teams[side].energy > 0) {
    const priorityStillInHand = hold.priorityPlayerId
      ? calibrationHandPlayers(next, side).some((card) => card.id === hold.priorityPlayerId)
      : false;
    const reservedEnergy = priorityStillInHand ? hold.reservedEnergy : 0;
    const tacticals = calibrationHandTacticals(next, side);
    let tacticalPlayed = false;
    for (const card of tacticals) {
      if (hold.heldIds.has(card.id) || !isCalibrationTacticalAvailable(next, card)) continue;
      const legal = tacticalDefinition(card.type).eligibleZones
        .map((zone) => ({ zone, cost: previewCalibrationTacticalCost(next, side, card, zone) }))
        .filter(({ cost }) => cost <= next.teams[side].energy - reservedEnergy)
        .sort((a, b) => a.cost - b.cost)[0];
      if (!legal) continue;
      const spent = spendCalibrationTacticalFromHand(next, side, card.id, legal.zone);
      next = spent.state;
      pending.push({ kind: 'tactical', side, card: spent.card, zone: legal.zone, cost: spent.cost });
      tacticalPlayed = true;
      break;
    }
    if (tacticalPlayed) continue;

    const players = calibrationHandPlayers(next, side)
      .filter((card) => calibrationPlayCost(card) <= next.teams[side].energy && !shouldDeferPlayer(next, squad, card.id))
      .sort((a, b) => priorityIndex(next, side, squad, a.id) - priorityIndex(next, side, squad, b.id)
        || calibrationPlayCost(a) - calibrationPlayCost(b)
        || b.printedAttack + b.printedDefence - (a.printedAttack + a.printedDefence));
    const priorityPlayer = hold.priorityPlayerId
      ? players.find((card) => card.id === hold.priorityPlayerId && choosePlayerZone(next, side, squad, card, pending))
      : undefined;
    const chosen = priorityPlayer ?? players.find((card) => choosePlayerZone(next, side, squad, card, pending));
    if (chosen) {
      const zone = choosePlayerZone(next, side, squad, chosen, pending)!;
      const cost = calibrationPlayCost(chosen);
      next = payPlayer(next, side, chosen);
      pending.push({ kind: 'player', side, cardId: chosen.id, zone, cost });
      continue;
    }

    if (nextManagerAvailable && next.teams[side].energy >= MANAGER_COST && next.period >= 3) {
      const zone = [...ZONES]
        .filter((candidate) => occupiedPlayerSlots(next, side, candidate, pending) < 4)
        .sort((a, b) => calibrationPlayersInZone(next, side, b).length - calibrationPlayersInZone(next, side, a).length)[0];
      if (zone) {
        next = {
          ...next,
          teams: {
            ...next.teams,
            [side]: { ...next.teams[side], energy: next.teams[side].energy - MANAGER_COST },
          },
        };
        pending.push({ kind: 'manager', side, zone, cost: MANAGER_COST });
        nextManagerAvailable = false;
        continue;
      }
    }
    break;
  }

  return { state: next, pending, managerAvailable: nextManagerAvailable };
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

function resolveSequence(state: V8CalibrationState, plays: readonly V8CalibrationMatrixPlay[]): V8CalibrationState {
  let next = state;
  for (const play of plays) {
    if (play.kind === 'player') {
      next = revealCalibrationPlayer(next, play.side, play.cardId, play.zone);
    } else if (play.kind === 'tactical') {
      next = resolveCommittedCalibrationTactical(next, play.side, play.card, play.zone, play.cost);
    } else {
      next = applyManager(next, play.side, play.zone);
    }
  }
  return next;
}

/** Calibration-only sensitivity: model 93RD MINUTE as a set-piece run from Ramos's natural DEF role. */
function applyGlobalRamosCornerBonus(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey,
  fromResolutionIndex: number,
): void {
  if (squad !== 'long_shot_set_piece') return;
  const ramos = state.players[calibrationRuntimeId(side, 'ramos')];
  if (!ramos || state.suppressedActions[ramos.runtimeId] !== undefined) return;
  const bonus = state.period === 4 ? 5 : 3;

  for (const resolution of state.tacticalResolutions.slice(fromResolutionIndex)) {
    if (resolution.side !== side || resolution.type !== 'corner' || resolution.cancelled) continue;
    if (resolution.specialistBonuses.some((label) => label.startsWith('93RD MINUTE'))) continue;
    resolution.attack += bonus;
    resolution.specialistBonuses.push(`93RD MINUTE +${bonus}`);
    state.tacticalAttack[side][resolution.zone] += bonus;
  }
}

/**
 * Generated-Tactical Window calibration policy settled from the A/B pass:
 * free THREE LUNGS is cleared now; Offside Trap is held without a current Through Ball;
 * ordinary Chances cash immediately; a P3 Corner may wait for the P4 Ramos spike.
 */
export function planV8CalibrationWindow(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  squad: V8CalibrationSquadKey = 'balanced_midrange',
): V8CalibrationWindowPlay[] {
  const plays: V8CalibrationWindowPlay[] = [];
  let budget = state.teams[side].energy;
  const otherSide: V8CalibrationSide = side === 'home' ? 'away' : 'home';
  const hasRamos = Boolean(state.players[calibrationRuntimeId(side, 'ramos')]);
  const opponentWindowThroughBall = windowEligibleCalibrationTacticals(state, otherSide)
    .some((card) => card.type === 'through_ball');

  for (const card of windowEligibleCalibrationTacticals(state, side)) {
    let shouldPlay = true;

    if (card.type === 'corner'
      && squad === 'long_shot_set_piece'
      && state.period === 3
      && hasRamos) {
      shouldPlay = false;
    }

    if (card.type === 'offside_trap') shouldPlay = opponentWindowThroughBall;
    if (!shouldPlay) continue;

    const legal = tacticalDefinition(card.type).eligibleZones
      .map((zone) => ({ zone, cost: previewCalibrationTacticalCost(state, side, card, zone) }))
      .filter(({ cost }) => cost <= budget)
      .sort((a, b) => a.cost - b.cost)[0];
    if (!legal) continue;
    budget -= legal.cost;
    plays.push({ side, cardId: card.id, zone: legal.zone });
  }
  return plays;
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

export function simulateV8CalibrationMatch(args: {
  homeSquad: V8CalibrationSquadKey;
  awaySquad: V8CalibrationSquadKey;
  seed: number;
}): V8CalibrationSimulatedMatch {
  const { homeSquad, awaySquad, seed } = args;
  let state = withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(getV8CalibrationSquad(homeSquad).playerIds, seed),
    seededShuffle(getV8CalibrationSquad(awaySquad).playerIds, seed + 1),
  ));
  let homeScore = 0;
  let awayScore = 0;
  let homeManagerAvailable = true;
  let awayManagerAvailable = true;
  const periods: V8CalibrationPeriodTelemetry[] = [];

  for (let periodIndex = 0; periodIndex < 4; periodIndex += 1) {
    const home = planV8CalibrationSide(state, 'home', homeManagerAvailable, homeSquad);
    const away = planV8CalibrationSide(home.state, 'away', awayManagerAvailable, awaySquad);
    homeManagerAvailable = home.managerAvailable;
    awayManagerAvailable = away.managerAvailable;
    const plays = [...home.pending, ...away.pending];
    const first = priority(away.state, homeScore, awayScore, seed + away.state.period * 101);
    const commitmentResolutionStart = away.state.tacticalResolutions.length;
    let resolved = resolveSequence(away.state, plays.filter((play) => play.side === first));
    resolved = resolveSequence(resolved, plays.filter((play) => play.side !== first));
    applyGlobalRamosCornerBonus(resolved, 'home', homeSquad, commitmentResolutionStart);
    applyGlobalRamosCornerBonus(resolved, 'away', awaySquad, commitmentResolutionStart);

    const windowResolutionStart = resolved.tacticalResolutions.length;
    const windowPlays = [
      ...planV8CalibrationWindow(resolved, 'home', homeSquad),
      ...planV8CalibrationWindow(resolved, 'away', awaySquad),
    ];
    const window = resolveGeneratedTacticalWindow(resolved, windowPlays);
    resolved = window.state;
    applyGlobalRamosCornerBonus(resolved, 'home', homeSquad, windowResolutionStart);
    applyGlobalRamosCornerBonus(resolved, 'away', awaySquad, windowResolutionStart);

    const telemetryPlays = [
      ...plays,
      ...window.plays.map((play) => ({ kind: 'tactical' as const, side: play.side, card: play.card, window: true, cost: play.cost })),
    ];

    const homeTotals = calibrationTeamTotals(resolved, 'home');
    const awayTotals = calibrationTeamTotals(resolved, 'away');
    const homeGoals = goalsFromAttackDefence(homeTotals.attack, awayTotals.defence);
    const awayGoals = goalsFromAttackDefence(awayTotals.attack, homeTotals.defence);
    homeScore += homeGoals;
    awayScore += awayGoals;

    periods.push(captureV8CalibrationPeriodTelemetry({
      state: resolved,
      homeGoals,
      awayGoals,
      homeAttack: homeTotals.attack,
      homeDefence: homeTotals.defence,
      awayAttack: awayTotals.attack,
      awayDefence: awayTotals.defence,
      plays: telemetryPlays,
    }));

    const wasFinal = resolved.period === 4;
    state = endV8CalibrationPeriod(resolved);
    if (!wasFinal) state = withCalibrationEnergy(state);
  }

  return {
    seed,
    homeSquad,
    awaySquad,
    homeScore,
    awayScore,
    telemetry: buildV8CalibrationMatchTelemetry({
      state,
      homeSquad,
      awaySquad,
      homeScore,
      awayScore,
      periods,
    }),
  };
}

function rounded(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pairSummary(
  squadA: V8CalibrationSquadKey,
  squadB: V8CalibrationSquadKey,
  matches: readonly V8CalibrationSimulatedMatch[],
): V8CalibrationPairSummary {
  let squadAWins = 0;
  let squadBWins = 0;
  let draws = 0;
  let goalsA = 0;
  let goalsB = 0;

  for (const match of matches) {
    const aIsHome = match.homeSquad === squadA;
    const scoreA = aIsHome ? match.homeScore : match.awayScore;
    const scoreB = aIsHome ? match.awayScore : match.homeScore;
    goalsA += scoreA;
    goalsB += scoreB;
    if (scoreA === scoreB) draws += 1;
    else if (scoreA > scoreB) squadAWins += 1;
    else squadBWins += 1;
  }

  const count = matches.length;
  return {
    squadA,
    squadB,
    matches: count,
    squadAWins,
    draws,
    squadBWins,
    squadAWinRate: rounded(squadAWins / count),
    drawRate: rounded(draws / count),
    squadBWinRate: rounded(squadBWins / count),
    averageGoalsA: rounded(goalsA / count),
    averageGoalsB: rounded(goalsB / count),
    averageGoalDifferenceA: rounded((goalsA - goalsB) / count),
  };
}

function squadSummary(
  squad: V8CalibrationSquadKey,
  matches: readonly V8CalibrationSimulatedMatch[],
): V8CalibrationSquadSummary {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let unusedEnergy = 0;
  let playersDeployed = 0;
  let tacticalsPlayed = 0;
  let cancelledChances = 0;
  let tacticalAttack = 0;
  let totalAttack = 0;
  let windowTacticalsPlayed = 0;
  let windowEnergySpent = 0;
  let windowTacticalAtt = 0;
  let windowCancellations = 0;
  const chains = new Map<string, number>();

  const relevant = matches.filter((match) => match.homeSquad !== match.awaySquad && (match.homeSquad === squad || match.awaySquad === squad));
  for (const match of relevant) {
    const side: V8CalibrationSide = match.homeSquad === squad ? 'home' : 'away';
    const scoreFor = side === 'home' ? match.homeScore : match.awayScore;
    const scoreAgainst = side === 'home' ? match.awayScore : match.homeScore;
    goalsFor += scoreFor;
    goalsAgainst += scoreAgainst;
    if (scoreFor === scoreAgainst) draws += 1;
    else if (scoreFor > scoreAgainst) wins += 1;
    else losses += 1;

    const team = match.telemetry[side];
    unusedEnergy += team.totalUnusedEnergy;
    playersDeployed += team.playersDeployed;
    tacticalsPlayed += team.tacticalsPlayed;
    cancelledChances += team.cancelledChances;
    tacticalAttack += team.tacticalAttackGenerated;
    windowTacticalsPlayed += team.windowTacticalsPlayed;
    windowEnergySpent += team.windowEnergySpent;
    windowTacticalAtt += team.windowTacticalAtt;
    windowCancellations += team.windowCancellations;
    totalAttack += match.telemetry.periods.reduce((sum, period) => sum + period[side].attack, 0);
    for (const chain of team.majorChains) chains.set(chain, (chains.get(chain) ?? 0) + 1);
  }

  const count = relevant.length;
  return {
    squad,
    matches: count,
    wins,
    draws,
    losses,
    winRate: rounded(wins / count),
    drawRate: rounded(draws / count),
    averageGoalsFor: rounded(goalsFor / count),
    averageGoalsAgainst: rounded(goalsAgainst / count),
    averageGoalDifference: rounded((goalsFor - goalsAgainst) / count),
    averageUnusedEnergy: rounded(unusedEnergy / count),
    averagePlayersDeployed: rounded(playersDeployed / count),
    averageTacticalsPlayed: rounded(tacticalsPlayed / count),
    averageCancelledChances: rounded(cancelledChances / count),
    tacticalAttackShare: totalAttack > 0 ? rounded(tacticalAttack / totalAttack) : 0,
    averageWindowTacticalsPlayed: rounded(windowTacticalsPlayed / count),
    averageWindowEnergySpent: rounded(windowEnergySpent / count),
    averageWindowTacticalAtt: rounded(windowTacticalAtt / count),
    averageWindowCancellations: rounded(windowCancellations / count),
    topChains: [...chains.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([chain, countForChain]) => ({ chain, count: countForChain })),
  };
}

export function runV8CalibrationMatchupMatrix(
  seeds: readonly number[] = V8_CALIBRATION_MATRIX_SEEDS,
): V8CalibrationMatrixReport {
  const matches: V8CalibrationSimulatedMatch[] = [];
  for (const homeSquad of V8_CALIBRATION_SQUAD_KEYS) {
    for (const awaySquad of V8_CALIBRATION_SQUAD_KEYS) {
      for (const seed of seeds) {
        matches.push(simulateV8CalibrationMatch({ homeSquad, awaySquad, seed }));
      }
    }
  }

  const pairings: V8CalibrationPairSummary[] = [];
  for (let left = 0; left < V8_CALIBRATION_SQUAD_KEYS.length; left += 1) {
    for (let right = left + 1; right < V8_CALIBRATION_SQUAD_KEYS.length; right += 1) {
      const squadA = V8_CALIBRATION_SQUAD_KEYS[left]!;
      const squadB = V8_CALIBRATION_SQUAD_KEYS[right]!;
      pairings.push(pairSummary(
        squadA,
        squadB,
        matches.filter((match) => (
          (match.homeSquad === squadA && match.awaySquad === squadB)
          || (match.homeSquad === squadB && match.awaySquad === squadA)
        )),
      ));
    }
  }

  return {
    seeds: [...seeds],
    matches: matches.length,
    pairings,
    squads: V8_CALIBRATION_SQUAD_KEYS.map((squad) => squadSummary(squad, matches)),
  };
}

export function formatV8CalibrationMatrixReport(report: V8CalibrationMatrixReport): string {
  const squadLines = report.squads
    .map((squad) => [
      squad.squad,
      `W ${Math.round(squad.winRate * 100)}%`,
      `D ${Math.round(squad.drawRate * 100)}%`,
      `GF ${squad.averageGoalsFor}`,
      `GA ${squad.averageGoalsAgainst}`,
      `GD ${squad.averageGoalDifference >= 0 ? '+' : ''}${squad.averageGoalDifference}`,
      `unused E ${squad.averageUnusedEnergy}`,
      `deployed ${squad.averagePlayersDeployed}`,
      `Tactical share ${Math.round(squad.tacticalAttackShare * 100)}%`,
      `cancelled ${squad.averageCancelledChances}`,
      `window ${squad.averageWindowTacticalsPlayed} plays / ${squad.averageWindowEnergySpent} E / ${squad.averageWindowTacticalAtt} ATT`,
    ].join(' | '));
  const pairingLines = report.pairings
    .map((pair) => `${pair.squadA} vs ${pair.squadB}: ${Math.round(pair.squadAWinRate * 100)} / ${Math.round(pair.drawRate * 100)} / ${Math.round(pair.squadBWinRate * 100)} · goals ${pair.averageGoalsA}-${pair.averageGoalsB} · GD(A) ${pair.averageGoalDifferenceA >= 0 ? '+' : ''}${pair.averageGoalDifferenceA}`);
  const chainLines = report.squads
    .map((squad) => `${squad.squad}: ${squad.topChains.map((item) => `${item.count}× ${item.chain}`).join(' ; ') || 'none'}`);

  return [
    `V8 calibration matrix · ${report.matches} matches · ${report.seeds.length} seeds per ordered matchup`,
    '',
    'SQUAD SUMMARY (self-matches excluded)',
    ...squadLines,
    '',
    'PAIRINGS (both home/away orientations combined)',
    ...pairingLines,
    '',
    'TOP CHAINS',
    ...chainLines,
  ].join('\n');
}
