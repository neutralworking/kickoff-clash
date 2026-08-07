import { outOfPositionPenalty } from './core';
import { getV8CalibrationPlayer } from './calibration-cards';
import {
  calibrationPlayerCard,
  calibrationPlayersInZone,
  currentCalibrationAttack,
  currentCalibrationDefence,
  tacticalDefinition,
  type V8CalibrationSide,
  type V8CalibrationState,
} from './calibration-runtime';
import type { V8TacticalCardInstance } from './tactical';
import type { V8CalibrationSquadKey } from './calibration-squads';

export type V8CalibrationTelemetryPlay =
  | { kind: 'player'; side: V8CalibrationSide; cardId: string }
  | { kind: 'tactical'; side: V8CalibrationSide; card: V8TacticalCardInstance }
  | { kind: 'manager'; side: V8CalibrationSide };

export interface V8CalibrationTeamPeriodTelemetry {
  goals: number;
  attack: number;
  defence: number;
  attackingMargin: number;
  tacticalAttack: number;
  actionAttackDelta: number;
  actionDefenceDelta: number;
  unusedEnergy: number;
  playersDeployed: number;
  tacticalsPlayed: number;
  tacticalAttackGenerated: number;
  cancelledChances: number;
  majorChains: string[];
}

export interface V8CalibrationPeriodTelemetry {
  period: number;
  home: V8CalibrationTeamPeriodTelemetry;
  away: V8CalibrationTeamPeriodTelemetry;
}

export interface V8CalibrationTeamMatchTelemetry {
  playersDeployed: number;
  playersUndeployed: number;
  totalUnusedEnergy: number;
  tacticalsPlayed: number;
  tacticalAttackGenerated: number;
  cancelledChances: number;
  majorChains: string[];
}

export interface V8CalibrationMatchTelemetry {
  homeSquad: V8CalibrationSquadKey;
  awaySquad: V8CalibrationSquadKey;
  finalScore: string;
  winner: V8CalibrationSide | 'draw';
  totalGoals: number;
  periods: V8CalibrationPeriodTelemetry[];
  home: V8CalibrationTeamMatchTelemetry;
  away: V8CalibrationTeamMatchTelemetry;
}

function playerActionDeltas(state: V8CalibrationState, side: V8CalibrationSide): { attack: number; defence: number } {
  let attack = 0;
  let defence = 0;

  for (const player of Object.values(state.players).filter((candidate) => candidate.side === side)) {
    const card = calibrationPlayerCard(player);
    if (player.zone === 'MID' || player.zone === 'ATT') {
      attack += currentCalibrationAttack(state, player.runtimeId) - card.printedAttack;
    }
    if (player.zone === 'DEF' || player.zone === 'MID') {
      defence += currentCalibrationDefence(state, player.runtimeId) - card.printedDefence;
    }
  }

  // STEP UP's successful cancellation rider is a zone modifier rather than a player modifier,
  // so include it explicitly in the Action-driven DEF delta.
  const baresi = Object.values(state.players)
    .filter((player) => player.side === side && calibrationPlayerCard(player).actionKey === 'baresi_step_up');
  for (const player of baresi) {
    const name = calibrationPlayerCard(player).realName;
    const stepUpEvents = state.events.filter((event) => event.period === state.period && event.text.startsWith(`${name} · STEP UP: +2 DEF`));
    defence += stepUpEvents.length * 2;
  }

  return { attack, defence };
}

function triggerPressAttack(state: V8CalibrationState, side: V8CalibrationSide): number {
  if (!state.triggerPress[side].ATT) return 0;
  return calibrationPlayersInZone(state, side, 'ATT').reduce((sum, player) => {
    const card = calibrationPlayerCard(player);
    const penalty = outOfPositionPenalty(card, 'ATT');
    return sum + currentCalibrationDefence(state, player.runtimeId) - penalty;
  }, 0);
}

function actionLabelFromGeneratedBy(card: V8TacticalCardInstance): string | null {
  if (!card.generatedBy) return null;
  try {
    return getV8CalibrationPlayer(card.generatedBy).actionName;
  } catch {
    return null;
  }
}

function stripSpecialistLabel(label: string): string {
  return label.replace(/ · uncancellable/g, '');
}

function majorChainsForSide(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  plays: readonly V8CalibrationTelemetryPlay[],
): string[] {
  const tacticalPlays = plays.filter((play): play is Extract<V8CalibrationTelemetryPlay, { kind: 'tactical' }> => play.kind === 'tactical' && play.side === side);
  const chains: string[] = [];

  for (const resolution of state.tacticalResolutions.filter((item) => item.side === side)) {
    const committed = tacticalPlays.find((play) => play.card.id === resolution.cardId)?.card;
    const creator = committed ? actionLabelFromGeneratedBy(committed) : null;
    const tacticalName = tacticalDefinition(resolution.type).name;
    const specialists = resolution.specialistBonuses.map(stripSpecialistLabel);

    if (resolution.cancelled) {
      chains.push(`${creator ? `${creator} → ` : ''}${tacticalName} → CANCELLED`);
      continue;
    }

    if (creator || specialists.length > 0 || (committed?.attModifier ?? 0) !== 0 || Number(committed?.metadata.bonusAttInMid ?? 0) !== 0) {
      chains.push([
        creator,
        tacticalName,
        ...specialists,
      ].filter(Boolean).join(' → ') + ` = +${resolution.attack} ATT`);
    }
  }

  for (const event of state.events.filter((item) => item.period === state.period && item.type === 'chance_cancelled')) {
    if (!chains.some((chain) => chain.includes(event.text.split(' is cancelled')[0] ?? ''))) chains.push(event.text);
  }

  return [...new Set(chains)].slice(0, 6);
}

function teamPeriodTelemetry(args: {
  state: V8CalibrationState;
  side: V8CalibrationSide;
  opponent: V8CalibrationSide;
  goals: number;
  teamAttack: number;
  teamDefence: number;
  opponentDefence: number;
  plays: readonly V8CalibrationTelemetryPlay[];
}): V8CalibrationTeamPeriodTelemetry {
  const { state, side, goals, teamAttack, teamDefence, opponentDefence, plays } = args;
  const resolutions = state.tacticalResolutions.filter((resolution) => resolution.side === side);
  const directTacticalAttack = resolutions.reduce((sum, resolution) => sum + resolution.attack, 0);
  const pressAttack = triggerPressAttack(state, side);
  const actionDeltas = playerActionDeltas(state, side);

  return {
    goals,
    attack: teamAttack,
    defence: teamDefence,
    attackingMargin: teamAttack - opponentDefence,
    tacticalAttack: directTacticalAttack + pressAttack,
    actionAttackDelta: actionDeltas.attack,
    actionDefenceDelta: actionDeltas.defence,
    unusedEnergy: state.teams[side].energy,
    playersDeployed: plays.filter((play) => play.side === side && play.kind === 'player').length,
    tacticalsPlayed: plays.filter((play) => play.side === side && play.kind === 'tactical').length,
    tacticalAttackGenerated: directTacticalAttack + pressAttack,
    cancelledChances: resolutions.filter((resolution) => resolution.cancelled).length,
    majorChains: majorChainsForSide(state, side, plays),
  };
}

export function captureV8CalibrationPeriodTelemetry(args: {
  state: V8CalibrationState;
  homeGoals: number;
  awayGoals: number;
  homeAttack: number;
  homeDefence: number;
  awayAttack: number;
  awayDefence: number;
  plays: readonly V8CalibrationTelemetryPlay[];
}): V8CalibrationPeriodTelemetry {
  const { state, homeGoals, awayGoals, homeAttack, homeDefence, awayAttack, awayDefence, plays } = args;
  return {
    period: state.period,
    home: teamPeriodTelemetry({
      state,
      side: 'home',
      opponent: 'away',
      goals: homeGoals,
      teamAttack: homeAttack,
      teamDefence: homeDefence,
      opponentDefence: awayDefence,
      plays,
    }),
    away: teamPeriodTelemetry({
      state,
      side: 'away',
      opponent: 'home',
      goals: awayGoals,
      teamAttack: awayAttack,
      teamDefence: awayDefence,
      opponentDefence: homeDefence,
      plays,
    }),
  };
}

function aggregateTeam(
  state: V8CalibrationState,
  side: V8CalibrationSide,
  periods: readonly V8CalibrationPeriodTelemetry[],
): V8CalibrationTeamMatchTelemetry {
  const deployed = Object.values(state.players).filter((player) => player.side === side).length;
  const teamPeriods = periods.map((period) => period[side]);
  return {
    playersDeployed: deployed,
    playersUndeployed: Math.max(0, 11 - deployed),
    totalUnusedEnergy: teamPeriods.reduce((sum, period) => sum + period.unusedEnergy, 0),
    tacticalsPlayed: teamPeriods.reduce((sum, period) => sum + period.tacticalsPlayed, 0),
    tacticalAttackGenerated: teamPeriods.reduce((sum, period) => sum + period.tacticalAttackGenerated, 0),
    cancelledChances: teamPeriods.reduce((sum, period) => sum + period.cancelledChances, 0),
    majorChains: [...new Set(teamPeriods.flatMap((period) => period.majorChains))].slice(0, 10),
  };
}

export function buildV8CalibrationMatchTelemetry(args: {
  state: V8CalibrationState;
  homeSquad: V8CalibrationSquadKey;
  awaySquad: V8CalibrationSquadKey;
  homeScore: number;
  awayScore: number;
  periods: readonly V8CalibrationPeriodTelemetry[];
}): V8CalibrationMatchTelemetry {
  const { state, homeSquad, awaySquad, homeScore, awayScore, periods } = args;
  return {
    homeSquad,
    awaySquad,
    finalScore: `${homeScore}–${awayScore}`,
    winner: homeScore === awayScore ? 'draw' : homeScore > awayScore ? 'home' : 'away',
    totalGoals: homeScore + awayScore,
    periods: [...periods],
    home: aggregateTeam(state, 'home', periods),
    away: aggregateTeam(state, 'away', periods),
  };
}
