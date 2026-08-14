'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  buildV8CalibrationMatchTelemetry,
  calibrationHandPlayers,
  calibrationHandTacticals,
  calibrationEffectiveOutOfPositionPenalty,
  calibrationPlayerCard,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  calibrationSquadCostProfile,
  calibrationTeamTotals,
  captureV8CalibrationPeriodTelemetry,
  createV8CalibrationMatch,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  getV8CalibrationSquad,
  goalsFromAttackDefence,
  isCalibrationActionEnabled,
  moveCalibrationPlayer,
  outOfPositionPenalty,
  previewCalibrationTacticalCost,
  removeCalibrationPlayerFromHand,
  resolveCommittedCalibrationTactical,
  revealCalibrationPlayer,
  spendCalibrationTacticalFromHand,
  tacticalDefinition,
  V8_GOAL_BAND,
  V8_CALIBRATION_SQUAD_KEYS,
  type V8CalibrationMatchTelemetry,
  type V8CalibrationPeriodTelemetry,
  type V8CalibrationPlayerCard,
  type V8CalibrationSide,
  type V8CalibrationSquadKey,
  type V8CalibrationState,
  type V8TacticalCardInstance,
  type V8Zone,
} from '@/engine-v8';
import { calibrationEnergyForPeriod, calibrationPlayCost } from '@/engine-v8/calibration-balance';
import {
  CONTROL_MANAGER_V8,
  resolveManagerV8Action,
  type ManagerV8Profile,
} from '@/lib/manager-v8';
import './v8lab.css';
import './v8recap.css';

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const PERIOD_LABELS = ['PERIOD 1/4', 'PERIOD 2/4', 'PERIOD 3/4', 'PERIOD 4/4'] as const;
const DEFAULT_HOME_SQUAD: V8CalibrationSquadKey = 'cross';
const DEFAULT_AWAY_SQUAD: V8CalibrationSquadKey = 'balanced_midrange';
const GOAL_STREAM_START_MS = 560;
const GOAL_STREAM_DURATION_MS = 760;
const GOAL_STREAM_STEP_MS = 200;
const GOAL_ARRIVAL_MS = GOAL_STREAM_START_MS + GOAL_STREAM_DURATION_MS;

type ManagerProfiles = Record<V8CalibrationSide, ManagerV8Profile>;
type MatchScore = { home: number; away: number };

type PendingPlay =
  | { kind: 'player'; side: V8CalibrationSide; cardId: string; zone: V8Zone; cost: number }
  | { kind: 'tactical'; side: V8CalibrationSide; card: V8TacticalCardInstance; zone: V8Zone; cost: number }
  | { kind: 'manager'; side: V8CalibrationSide; zone: V8Zone; cost: number };

type Selection =
  | { kind: 'player'; cardId: string }
  | { kind: 'tactical'; cardId: string }
  | { kind: 'manager' }
  | { kind: 'move'; runtimeId: string }
  | null;

type HandDragState = {
  kind: 'player' | 'tactical' | 'manager';
  cardId: string;
  label: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  overZone: V8Zone | null;
  moved: boolean;
};

type UndoSnapshot = {
  state: V8CalibrationState;
  homeManagerAvailable: boolean;
  pending: PendingPlay[];
};

type RevealOrder = { first: V8CalibrationSide; reason: string };

type RevealTarget = {
  runtimeId: string | null;
  side: V8CalibrationSide;
  zone: V8Zone;
};

type RevealStatDelta = {
  side: V8CalibrationSide;
  axis: 'ATT' | 'DEF';
  value: number;
};

type RevealSpecialOutcome = {
  id: string;
  label: string;
  side: V8CalibrationSide;
  zone: V8Zone;
  cardIds: string[];
  destination: 'hand' | 'stay';
  tone: 'tactical' | 'blocked';
};

type RevealBeat = {
  index: number;
  total: number;
  side: V8CalibrationSide;
  zone: V8Zone;
  cardId: string | null;
  sourceRuntimeId: string | null;
  name: string;
  action: string;
  targets: RevealTarget[];
  statDeltas: RevealStatDelta[];
  specialOutcomes: RevealSpecialOutcome[];
};

type ResolutionMoment = {
  id: number;
  period: number;
  label: string;
  reveal: RevealOrder;
  homeGoals: number;
  awayGoals: number;
  homeAttack: number;
  awayDefence: number;
  awayAttack: number;
  homeDefence: number;
  nextHomeScore: number;
  nextAwayScore: number;
};

type RevealPhase = {
  id: number;
  stage: 'commitment' | 'source' | 'consequence' | 'settle';
  resolvedState: V8CalibrationState;
  stagedState: V8CalibrationState | null;
  allPending: PendingPlay[];
  orderedPlays: PendingPlay[];
  nextIndex: number;
  activeBeat: RevealBeat | null;
  cpuManagerAvailable: boolean;
  reveal: RevealOrder;
};

type PlacementImpact = {
  zone: V8Zone;
  attackBefore: number;
  attackAfter: number;
  defenceBefore: number;
  defenceAfter: number;
  goalsBefore: number;
  goalsAfter: number;
  goalsAgainstBefore: number;
  goalsAgainstAfter: number;
  rawPenalty: 0 | 2 | 5;
  effectivePenalty: 0 | 2 | 5;
  actionEffect: string;
};

export type V8LiveFixture = {
  homePlayerIds: readonly string[];
  awayPlayerIds: readonly string[];
  seed: number;
  homeManager?: ManagerV8Profile;
  homeLabel?: string;
  awayLabel?: string;
  contextLabel?: string;
};

export type V8LiveMatchResult = {
  homeScore: number;
  awayScore: number;
  state: V8CalibrationState;
};

type V8CalibrationLabProps = {
  fixture?: V8LiveFixture;
  onComplete?: (result: V8LiveMatchResult) => void;
};

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

function createSquadMatch(homeSquad: V8CalibrationSquadKey, awaySquad: V8CalibrationSquadKey, seed: number): V8CalibrationState {
  return withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(getV8CalibrationSquad(homeSquad).playerIds, seed),
    seededShuffle(getV8CalibrationSquad(awaySquad).playerIds, seed + 1),
  ));
}

function createFixtureMatch(fixture: V8LiveFixture): V8CalibrationState {
  return withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(fixture.homePlayerIds, fixture.seed),
    seededShuffle(fixture.awayPlayerIds, fixture.seed + 1),
  ));
}

function occupiedPlayerSlots(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone, pending: readonly PendingPlay[]): number {
  const queuedPlayers = pending.filter((play) => play.side === side && play.zone === zone && (play.kind === 'player' || play.kind === 'manager')).length;
  return calibrationPlayersInZone(state, side, zone).length + queuedPlayers;
}

function priority(state: V8CalibrationState, homeScore: number, awayScore: number, seed: number): RevealOrder {
  if (homeScore !== awayScore) return { first: homeScore > awayScore ? 'home' : 'away', reason: 'score lead' };
  const home = calibrationTeamTotals(state, 'home');
  const away = calibrationTeamTotals(state, 'away');
  if (home.attack !== away.attack) return { first: home.attack > away.attack ? 'home' : 'away', reason: 'ATT' };
  const homeStrength = home.attack + home.defence;
  const awayStrength = away.attack + away.defence;
  if (homeStrength !== awayStrength) return { first: homeStrength > awayStrength ? 'home' : 'away', reason: 'board strength' };
  const mixed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return { first: mixed % 2 === 0 ? 'home' : 'away', reason: 'seeded tiebreak' };
}

function resolveSequence(
  state: V8CalibrationState,
  plays: readonly PendingPlay[],
  managers: ManagerProfiles,
  score: MatchScore,
): V8CalibrationState {
  let next = state;
  for (const play of plays) {
    if (play.kind === 'player') {
      next = revealCalibrationPlayer(next, play.side, play.cardId, play.zone);
    } else if (play.kind === 'tactical') {
      next = resolveCommittedCalibrationTactical(next, play.side, play.card, play.zone, play.cost);
    } else {
      next = resolveManagerV8Action(next, managers[play.side], play.side, play.zone, score);
    }
  }
  return next;
}

function cleanPlacementEffect(card: V8CalibrationPlayerCard, text: string): string {
  const withoutIdentity = text
    .replace(`${card.realName} · ${card.actionName}`, '')
    .replace(`${card.realName} ·`, '')
    .replace(/^\s*[:.→-]\s*/, '')
    .trim();
  return withoutIdentity || card.actionText;
}

function previewPlayerPlacement(
  state: V8CalibrationState,
  pending: readonly PendingPlay[],
  card: V8CalibrationPlayerCard,
  zone: V8Zone,
  managers: ManagerProfiles,
  score: MatchScore,
): PlacementImpact {
  const committedHomePlays = pending.filter((play) => play.side === 'home');
  const before = resolveSequence(state, committedHomePlays, managers, score);
  const homeBefore = calibrationTeamTotals(before, 'home');
  const awayBefore = calibrationTeamTotals(before, 'away');
  const eventCount = before.events.length;
  const after = resolveSequence(before, [{
    kind: 'player',
    side: 'home',
    cardId: card.id,
    zone,
    cost: calibrationPlayCost(card),
  }], managers, score);
  const homeAfter = calibrationTeamTotals(after, 'home');
  const awayAfter = calibrationTeamTotals(after, 'away');
  const genericAction = `${card.realName} · ${card.actionName}.`;
  const actionEvent = after.events.slice(eventCount).findLast((event) => (
    event.type !== 'player_revealed' && event.text !== genericAction
  ));
  const runtimePlayer = after.players[calibrationRuntimeId('home', card.id)];

  return {
    zone,
    attackBefore: homeBefore.attack,
    attackAfter: homeAfter.attack,
    defenceBefore: homeBefore.defence,
    defenceAfter: homeAfter.defence,
    goalsBefore: goalsFromAttackDefence(homeBefore.attack, awayBefore.defence),
    goalsAfter: goalsFromAttackDefence(homeAfter.attack, awayAfter.defence),
    goalsAgainstBefore: goalsFromAttackDefence(awayBefore.attack, homeBefore.defence),
    goalsAgainstAfter: goalsFromAttackDefence(awayAfter.attack, homeAfter.defence),
    rawPenalty: outOfPositionPenalty(card, zone),
    effectivePenalty: runtimePlayer ? calibrationEffectiveOutOfPositionPenalty(after, runtimePlayer) : outOfPositionPenalty(card, zone),
    actionEffect: cleanPlacementEffect(card, actionEvent?.text ?? card.actionText),
  };
}

function placementThresholdLabel(impact: PlacementImpact): string {
  const goalDelta = impact.goalsAfter - impact.goalsBefore;
  const concededDelta = impact.goalsAgainstAfter - impact.goalsAgainstBefore;
  const changes = [
    goalDelta ? `${signed(goalDelta)}G` : null,
    concededDelta ? `${signed(concededDelta)}GA` : null,
  ].filter(Boolean);
  return changes.length ? changes.join(' · ') : 'NO GOAL CHANGE';
}

function placementPenaltyLabel(impact: PlacementImpact): string {
  if (!impact.rawPenalty) return 'NATURAL';
  if (!impact.effectivePenalty) return 'OOP IGNORED';
  return `−${impact.effectivePenalty}/−${impact.effectivePenalty} OOP`;
}

function compactPlacementLabel(impact: PlacementImpact): string {
  const attackDelta = impact.attackAfter - impact.attackBefore;
  const defenceDelta = impact.defenceAfter - impact.defenceBefore;
  const penalty = impact.rawPenalty
    ? impact.effectivePenalty ? `OOP−${impact.effectivePenalty}` : 'OOP×0'
    : 'NAT';
  const threshold = placementThresholdLabel(impact).replace('NO GOAL CHANGE', 'NO ΔG');
  return `${signed(attackDelta)}A ${signed(defenceDelta)}D · ${penalty} · ${threshold}`;
}

function PlacementPreview({ card, impact }: { card: V8CalibrationPlayerCard; impact: PlacementImpact }) {
  const attackDelta = impact.attackAfter - impact.attackBefore;
  const defenceDelta = impact.defenceAfter - impact.defenceBefore;
  return (
    <div
      className="v8-placement-preview"
      data-testid="v8-placement-preview"
      data-zone={impact.zone}
      data-goals-before={impact.goalsBefore}
      data-goals-after={impact.goalsAfter}
      data-goals-against-before={impact.goalsAgainstBefore}
      data-goals-against-after={impact.goalsAgainstAfter}
      title={`${card.actionName}: ${impact.actionEffect}`}
    >
      <strong>{card.matchName} → {impact.zone} <i>{placementPenaltyLabel(impact)}</i></strong>
      <span>
        ATT {impact.attackBefore}→{impact.attackAfter} <b>{signed(attackDelta)}</b>
        {' · '}DEF {impact.defenceBefore}→{impact.defenceAfter} <b>{signed(defenceDelta)}</b>
      </span>
      <em><b>{card.actionName}</b> · {placementThresholdLabel(impact)} · {impact.goalsBefore}→{impact.goalsAfter}G / {impact.goalsAgainstBefore}→{impact.goalsAgainstAfter}GA · VISIBLE BOARD</em>
    </div>
  );
}

function pendingPlayKey(play: PendingPlay): string {
  if (play.kind === 'player') return `player:${play.side}:${play.cardId}`;
  if (play.kind === 'tactical') return `tactical:${play.side}:${play.card.id}`;
  return `manager:${play.side}:${play.zone}`;
}

function resolveRevealBeat(
  state: V8CalibrationState,
  play: PendingPlay,
  index: number,
  total: number,
  managers: ManagerProfiles,
  score: MatchScore,
): { state: V8CalibrationState; beat: RevealBeat } {
  const beforeHome = calibrationTeamTotals(state, 'home');
  const beforeAway = calibrationTeamTotals(state, 'away');
  const eventCount = state.events.length;
  const next = resolveSequence(state, [play], managers, score);
  const afterHome = calibrationTeamTotals(next, 'home');
  const afterAway = calibrationTeamTotals(next, 'away');
  const newEvents = next.events.slice(eventCount);

  const card = play.kind === 'player' ? getV8CalibrationPlayer(play.cardId) : null;
  const manager = managers[play.side];
  const name = card?.matchName ?? (play.kind === 'tactical' ? 'TACTICAL' : manager.name);
  const action = card?.actionName ?? (play.kind === 'tactical' ? play.card.name : manager.actionName);
  const sourceRuntimeId = card
    ? Object.values(next.players).find((player) => player.side === play.side && player.cardId === card.id)?.runtimeId ?? null
    : null;
  const changedPlayers = Object.values(next.players).filter((player) => {
    const before = state.players[player.runtimeId];
    if (!before) return player.runtimeId === sourceRuntimeId;
    return before.zone !== player.zone
      || currentCalibrationAttack(state, player.runtimeId) !== currentCalibrationAttack(next, player.runtimeId)
      || currentCalibrationDefence(state, player.runtimeId) !== currentCalibrationDefence(next, player.runtimeId)
      || isCalibrationActionEnabled(state, player.runtimeId) !== isCalibrationActionEnabled(next, player.runtimeId);
  });
  const nonSourceTargets = changedPlayers.filter((player) => player.runtimeId !== sourceRuntimeId);
  const targetPlayers = nonSourceTargets.length
    ? nonSourceTargets
    : sourceRuntimeId ? changedPlayers.filter((player) => player.runtimeId === sourceRuntimeId) : [];
  const targets: RevealTarget[] = targetPlayers.length
    ? targetPlayers.map((player) => ({ runtimeId: player.runtimeId, side: player.side, zone: player.zone }))
    : [{ runtimeId: null, side: play.side, zone: play.zone }];
  const statDeltas: RevealStatDelta[] = [
    { side: 'home' as const, axis: 'ATT' as const, value: afterHome.attack - beforeHome.attack },
    { side: 'home' as const, axis: 'DEF' as const, value: afterHome.defence - beforeHome.defence },
    { side: 'away' as const, axis: 'ATT' as const, value: afterAway.attack - beforeAway.attack },
    { side: 'away' as const, axis: 'DEF' as const, value: afterAway.defence - beforeAway.defence },
  ].filter((delta) => delta.value !== 0);
  const specialOutcomes: RevealSpecialOutcome[] = [];
  for (const side of ['home', 'away'] as const) {
    const beforeTacticals = new Map(calibrationHandTacticals(state, side).map((candidate) => [candidate.id, candidate]));
    const afterTacticals = calibrationHandTacticals(next, side);
    const generatedNames = [...new Set(afterTacticals
      .filter((candidate) => !beforeTacticals.has(candidate.id))
      .map((candidate) => candidate.name))];
    for (const name of generatedNames) {
      const generated = afterTacticals.filter((candidate) => candidate.name === name && !beforeTacticals.has(candidate.id));
      specialOutcomes.push({
        id: `generated-${side}-${name}`,
        label: `${generated.length > 1 ? `${generated.length}× ` : ''}${name.toUpperCase()} CREATED`,
        side,
        zone: play.zone,
        cardIds: generated.map((candidate) => candidate.id),
        destination: 'hand',
        tone: 'tactical',
      });
    }

    for (const candidate of afterTacticals) {
      const before = beforeTacticals.get(candidate.id);
      if (!before || before.attModifier === candidate.attModifier) continue;
      specialOutcomes.push({
        id: `modified-${side}-${candidate.id}`,
        label: `${candidate.name.toUpperCase()} ${signed(candidate.attModifier - before.attModifier)} ATT`,
        side,
        zone: play.zone,
        cardIds: [candidate.id],
        destination: 'hand',
        tone: 'tactical',
      });
    }
  }
  const blockedEvent = [...newEvents].reverse().find((event) => event.type === 'action_suppressed' || event.type === 'action_ignored');
  if (blockedEvent) {
    const blockedTarget = targets.find((target) => target.runtimeId !== sourceRuntimeId) ?? targets[0]!;
    specialOutcomes.push({
      id: `blocked-${blockedEvent.type}`,
      label: blockedEvent.type === 'action_suppressed' ? 'ACTION DISABLED' : 'ACTION BLOCKED',
      side: blockedTarget.side,
      zone: blockedTarget.zone,
      cardIds: [],
      destination: 'stay',
      tone: 'blocked',
    });
  }
  return {
    state: next,
    beat: {
      index,
      total,
      side: play.side,
      zone: play.zone,
      cardId: card?.id ?? null,
      sourceRuntimeId,
      name,
      action,
      targets,
      statDeltas,
      specialOutcomes,
    },
  };
}

function actionPoint(zone: V8Zone, side: V8CalibrationSide): { x: number; y: number } {
  return {
    x: (ZONES.indexOf(zone) + .5) * (100 / ZONES.length),
    y: side === 'home' ? 73 : 27,
  };
}

function statDestination(delta: RevealStatDelta): 'ATT' | 'DEF' {
  return (delta.side === 'home' && delta.axis === 'ATT') || (delta.side === 'away' && delta.axis === 'DEF') ? 'ATT' : 'DEF';
}

function ActionConsequences({ beat }: { beat: RevealBeat }) {
  return (
    <div className="v8-consequences" data-testid="v8-consequences" aria-live="polite">
      {beat.statDeltas.map((delta, index) => {
        const target = beat.targets.find((candidate) => candidate.side === delta.side) ?? beat.targets[0] ?? { side: beat.side, zone: beat.zone };
        const point = actionPoint(target.zone, target.side);
        const destination = statDestination(delta);
        return (
          <strong
            className={`v8-consequence v8-consequence--stat v8-consequence--${destination.toLowerCase()}`}
            data-testid="v8-consequence"
            data-destination={destination}
            data-side={delta.side}
            data-axis={delta.axis}
            data-value={delta.value}
            key={`${delta.side}-${delta.axis}`}
            style={{
              '--v8-consequence-from-x': `${point.x}%`,
              '--v8-consequence-from-y': `${point.y}%`,
              '--v8-consequence-to-x': destination === 'ATT' ? '25%' : '75%',
              '--v8-consequence-delay': `${index * 45}ms`,
            } as CSSProperties}
          >
            {delta.side === 'home' ? 'YOU' : 'CPU'} {signed(delta.value)} {delta.axis}
          </strong>
        );
      })}
      {beat.specialOutcomes.map((outcome, index) => {
        const point = actionPoint(outcome.zone, outcome.side);
        return (
          <strong
            className={`v8-consequence v8-consequence--${outcome.tone} v8-consequence--${outcome.destination}`}
            data-testid="v8-consequence"
            data-destination={outcome.destination.toUpperCase()}
            key={outcome.id}
            style={{
              '--v8-consequence-from-x': `${point.x}%`,
              '--v8-consequence-from-y': `${point.y}%`,
              '--v8-consequence-to-x': '50%',
              '--v8-consequence-delay': `${(beat.statDeltas.length + index) * 45}ms`,
            } as CSSProperties}
          >
            {outcome.label}
          </strong>
        );
      })}
    </div>
  );
}

function payCalibrationPlayer(state: V8CalibrationState, side: V8CalibrationSide, card: V8CalibrationPlayerCard): V8CalibrationState {
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

function chooseCpuZone(state: V8CalibrationState, card: V8CalibrationPlayerCard, pending: readonly PendingPlay[]): V8Zone | null {
  const natural = card.naturalZones.find((zone) => occupiedPlayerSlots(state, 'away', zone, pending) < 4);
  if (natural) return natural;
  return ZONES.find((zone) => occupiedPlayerSlots(state, 'away', zone, pending) < 4) ?? null;
}

function planCpu(
  state: V8CalibrationState,
  managerAvailable: boolean,
  manager: ManagerV8Profile,
): { state: V8CalibrationState; pending: PendingPlay[]; managerAvailable: boolean } {
  let next = state;
  const pending: PendingPlay[] = [];
  let nextManagerAvailable = managerAvailable;

  while (next.teams.away.energy > 0) {
    const tacticals = calibrationHandTacticals(next, 'away');
    let tacticalPlayed = false;
    for (const card of tacticals) {
      const zones = tacticalDefinition(card.type).eligibleZones;
      const legal = zones
        .map((zone) => ({ zone, cost: previewCalibrationTacticalCost(next, 'away', card, zone) }))
        .filter(({ cost }) => cost <= next.teams.away.energy)
        .sort((a, b) => a.cost - b.cost)[0];
      if (!legal) continue;
      const spent = spendCalibrationTacticalFromHand(next, 'away', card.id, legal.zone);
      next = spent.state;
      pending.push({ kind: 'tactical', side: 'away', card: spent.card, zone: legal.zone, cost: spent.cost });
      tacticalPlayed = true;
      break;
    }
    if (tacticalPlayed) continue;

    const players = calibrationHandPlayers(next, 'away')
      .filter((card) => calibrationPlayCost(card) <= next.teams.away.energy)
      .sort((a, b) => calibrationPlayCost(a) - calibrationPlayCost(b) || b.printedAttack + b.printedDefence - (a.printedAttack + a.printedDefence));
    const chosen = players.find((card) => chooseCpuZone(next, card, pending));
    if (chosen) {
      const zone = chooseCpuZone(next, chosen, pending)!;
      const cost = calibrationPlayCost(chosen);
      next = payCalibrationPlayer(next, 'away', chosen);
      pending.push({ kind: 'player', side: 'away', cardId: chosen.id, zone, cost });
      continue;
    }

    if (nextManagerAvailable && next.teams.away.energy >= manager.cost && next.period >= 3) {
      const zone = [...ZONES]
        .filter((candidate) => occupiedPlayerSlots(next, 'away', candidate, pending) < 4)
        .sort((a, b) => calibrationPlayersInZone(next, 'away', b).length - calibrationPlayersInZone(next, 'away', a).length)[0];
      if (zone) {
        next = {
          ...next,
          teams: {
            ...next.teams,
            away: { ...next.teams.away, energy: next.teams.away.energy - manager.cost },
          },
        };
        pending.push({ kind: 'manager', side: 'away', zone, cost: manager.cost });
        nextManagerAvailable = false;
        continue;
      }
    }
    break;
  }

  return { state: next, pending, managerAvailable: nextManagerAvailable };
}

function tacticalLabel(card: V8TacticalCardInstance, zone: V8Zone | null = null): string {
  const base = card.baseAtt + card.attModifier + (zone === 'MID' ? Number(card.metadata.bonusAttInMid ?? 0) : 0);
  const mods: string[] = [];
  if (card.attModifier) mods.push(`${card.attModifier > 0 ? '+' : ''}${card.attModifier} generated`);
  if (card.metadata.bonusAttInMid) mods.push(`+${card.metadata.bonusAttInMid} if MID`);
  if (!card.cancellable) mods.push('uncancellable');
  if (card.metadata.freeThroughPeriod) mods.push(`0 cost P${card.metadata.freeThroughPeriod}`);
  return `${base} ATT${mods.length ? ` · ${mods.join(' · ')}` : ''}`;
}

function PlayerHandCard({
  card,
  selected,
  affordable,
  onClick,
  onPointerDown,
}: {
  card: V8CalibrationPlayerCard;
  selected: boolean;
  affordable: boolean;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const actionFont = card.actionName.length > 20 ? '5px' : card.actionName.length > 15 ? '5.5px' : '6.25px';
  return (
    <button
      type="button"
      data-testid={`player-card-${card.id}`}
      data-card-id={card.id}
      className={`v8-card${selected ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`}
      style={{ '--v8-action-font': actionFont } as CSSProperties}
      aria-pressed={selected}
      aria-label={`${card.realName}, ${card.position}, ${calibrationPlayCost(card)} Energy, ${card.printedAttack} ATT, ${card.printedDefence} DEF, ${card.actionName}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className="v8-card__art" aria-hidden="true"><i>{card.matchName.slice(0, 2).toUpperCase()}</i></span>
      <span className="v8-card__cost">{calibrationPlayCost(card)}</span>
      <span className="v8-card__position">{card.position}</span>
      <strong>{card.matchName}</strong>
      <span className="v8-card__sr">{card.realName}</span>
      <small><b>{card.actionName}</b><span className="v8-card__sr">{card.actionText}</span></small>
      <span className="v8-card__att">{card.printedAttack}<i>ATT</i></span>
      <span className="v8-card__def">{card.printedDefence}<i>DEF</i></span>
    </button>
  );
}

function TacticalHandCard({
  card,
  cost,
  selected,
  affordable,
  fresh,
  onClick,
  onPointerDown,
}: {
  card: V8TacticalCardInstance;
  cost: number;
  selected: boolean;
  affordable: boolean;
  fresh: boolean;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`tactical-card-${card.id}`}
      className={`v8-card v8-card--chance${selected ? ' is-selected' : ''}${fresh ? ' is-fresh' : ''}${affordable ? '' : ' is-unaffordable'}`}
      aria-pressed={selected}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className="v8-card__art v8-card__art--tactical" aria-hidden="true"><i>{card.name.slice(0, 1)}</i><em>TACTICAL</em></span>
      <span className="v8-card__cost">{cost}</span>
      <span className="v8-card__position">TACTICAL</span>
      <strong>{card.name}</strong>
      <small>{tacticalDefinition(card.type).text}<br />{tacticalLabel(card)}</small>
    </button>
  );
}

function DeployedChip({
  state,
  side,
  runtimeId,
  fresh = false,
  actionSource = false,
  consequenceTarget = false,
  onMove,
}: {
  state: V8CalibrationState;
  side: V8CalibrationSide;
  runtimeId: string;
  fresh?: boolean;
  actionSource?: boolean;
  consequenceTarget?: boolean;
  onMove?: () => void;
}) {
  const player = state.players[runtimeId]!;
  const card = calibrationPlayerCard(player);
  const attack = currentCalibrationAttack(state, runtimeId);
  const defence = currentCalibrationDefence(state, runtimeId);
  const attackDelta = attack - card.printedAttack;
  const defenceDelta = defence - card.printedDefence;
  const modifierText = [
    attackDelta ? `${signed(attackDelta)}A` : null,
    defenceDelta ? `${signed(defenceDelta)}D` : null,
  ].filter(Boolean).join(' ');
  const modifierTone = attackDelta < 0 || defenceDelta < 0
    ? attackDelta > 0 || defenceDelta > 0 ? 'mixed' : 'negative'
    : 'positive';
  const suppressed = !isCalibrationActionEnabled(state, runtimeId);
  const moveable = side === 'home' && card.statuses?.includes('moveable') === true;
  const moved = card.id === 'chris-waddle'
    ? Boolean(state.periodCounters[`waddle-drop-the-shoulder-move:${runtimeId}`])
    : card.id === 'brian-laudrup'
      ? Boolean(state.periodCounters[`laudrup-gliding-run:${runtimeId}`])
      : card.id === 'maradona'
        ? Boolean(state.matchCounters[`maradona-slalom-run:${runtimeId}`])
        : card.id === 'abedi-pele'
          ? Boolean(state.matchCounters[`abedi-jinking-run:${runtimeId}`])
          : Boolean(state.periodCounters[`move:${runtimeId}`]);
  const canMove = moveable && !moved && Boolean(onMove);
  return (
    <span
      className={`v8-chip${side === 'away' ? ' v8-chip--away' : ''}${fresh ? ' is-fresh' : ''}${actionSource ? ' is-action-source' : ''}${consequenceTarget ? ' has-consequence' : ''}${suppressed ? ' is-suppressed' : ''}`}
      data-action-source={actionSource || undefined}
      data-consequence-target={consequenceTarget || undefined}
      role={canMove ? 'button' : undefined}
      tabIndex={canMove ? 0 : undefined}
      onClick={(event) => {
        if (!canMove) return;
        event.stopPropagation();
        onMove?.();
      }}
      onKeyDown={(event) => {
        if (!canMove || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        event.stopPropagation();
        onMove?.();
      }}
    >
      <span className="v8-card__sr">{card.realName}</span>
      <span className="v8-chip__portrait" aria-hidden="true"><i>{card.matchName.slice(0, 1)}</i></span>
      <span className="v8-chip__position">{card.position}</span>
      {modifierText && (
        <span
          className={`v8-chip__modifier is-${modifierTone}`}
          title={`Current modifiers: ${attackDelta ? `${signed(attackDelta)} ATT` : '0 ATT'}, ${defenceDelta ? `${signed(defenceDelta)} DEF` : '0 DEF'}`}
          aria-label={`Current modifiers ${attackDelta ? `${signed(attackDelta)} attack` : 'zero attack'}, ${defenceDelta ? `${signed(defenceDelta)} defence` : 'zero defence'}`}
        >
          {modifierText}
        </span>
      )}
      <span className="v8-chip__name">{card.matchName}</span>
      <small>{suppressed ? 'NO ACTION' : moveable ? (moved ? 'MOVE USED' : 'MOVEABLE') : card.actionName}</small>
      <span className="v8-chip__stats" aria-label={`${attack} attack, ${defence} defence`}>
        <b>{attack}</b>
        <b>{defence}</b>
      </span>
    </span>
  );
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

function ContestComparison({
  axis,
  user,
  cpu,
  updating = false,
  resolution = null,
}: {
  axis: 'ATT' | 'DEF';
  user: number;
  cpu: number;
  updating?: boolean;
  resolution?: {
    side: V8CalibrationSide;
    goals: number;
    attackingMargin: number;
  } | null;
}) {
  const attack = axis === 'ATT' ? user : cpu;
  const defence = axis === 'ATT' ? cpu : user;
  const margin = user - cpu;
  const goals = goalsFromAttackDefence(attack, defence);
  const remainder = resolution ? resolution.attackingMargin - (resolution.goals * V8_GOAL_BAND) : 0;
  return (
    <div
      className={`v8-contest-comparison is-${axis.toLowerCase()}${axis === 'ATT' && goals ? ' is-converting' : ''}${axis === 'DEF' && !goals && margin >= 0 ? ' is-holding' : ''}${margin < 0 ? ' is-behind' : ''}${updating ? ' is-updating' : ''}${resolution ? ' is-resolving' : ''}`}
      data-axis={axis}
      data-margin={margin}
    >
      <header>{axis}</header>
      <span><small>YOU</small><b>{user}</b><i>{axis}</i></span>
      <em>VS</em>
      <span><small>CPU</small><b>{cpu}</b><i>{axis === 'ATT' ? 'DEF' : 'ATT'}</i></span>
      <strong aria-label={`${signed(margin)} margin`}>{signed(margin)}</strong>
      {resolution && (
        <div
          className={`v8-contest-conversion is-${resolution.side}${resolution.goals ? ' is-scoring' : ' is-denied'}`}
          data-testid="v8-contest-conversion"
          data-side={resolution.side}
          data-goals={resolution.goals}
          data-margin={resolution.attackingMargin}
          data-remainder={remainder}
          aria-label={resolution.goals
            ? `${resolution.attackingMargin} attacking margin converts to ${resolution.goals} goal${resolution.goals === 1 ? '' : 's'}`
            : `${resolution.attackingMargin} attacking margin does not score`}
        >
          <span>+{resolution.attackingMargin}</span>
          <i aria-hidden="true">→</i>
          {resolution.goals ? (
            <span className="v8-conversion-balls" aria-hidden="true">
              {Array.from({ length: resolution.goals }, (_, index) => (
                <b
                  className="v8-conversion-ball"
                  key={`${resolution.side}-goal-${index}`}
                  style={{ '--v8-goal-delay': `${(GOAL_STREAM_START_MS + (index * GOAL_STREAM_STEP_MS)) / 1000}s` } as CSSProperties}
                >⚽</b>
              ))}
            </span>
          ) : <strong>NO GOAL</strong>}
          <small>{resolution.goals && remainder ? `+${remainder} LEFT` : resolution.goals ? 'CONVERTED' : `NEEDS +${V8_GOAL_BAND}`}</small>
        </div>
      )}
    </div>
  );
}

function TelemetryTeamPeriod({ label, telemetry }: { label: string; telemetry: V8CalibrationPeriodTelemetry['home'] }) {
  return (
    <div className="v8-telemetry__team">
      <b>{label}</b>
      <span>{telemetry.goals} G · {telemetry.attack} ATT · {telemetry.defence} DEF · margin {signed(telemetry.attackingMargin)}</span>
      <span>Tactical ATT {telemetry.tacticalAttack} · Action Δ {signed(telemetry.actionAttackDelta)} ATT / {signed(telemetry.actionDefenceDelta)} DEF · Rule Δ {signed(telemetry.contributionRuleAttackDelta)} ATT / {signed(telemetry.contributionRuleDefenceDelta)} DEF</span>
      <span>{telemetry.playersDeployed} players · {telemetry.tacticalsPlayed} Tacticals · {telemetry.unusedEnergy} Energy unused · {telemetry.cancelledChances} cancelled</span>
      {telemetry.majorChains.map((chain) => <small key={chain}>{chain}</small>)}
    </div>
  );
}

function EnergyMeter({ current, maximum }: { current: number; maximum: number }) {
  return (
    <div className="v8-energy" data-testid="v8-energy" aria-label={`${current} of ${maximum} Energy available`}>
      <small>ENERGY</small>
      <strong>{current}<i>/{maximum}</i></strong>
      <span aria-hidden="true">
        {Array.from({ length: maximum }).map((_, index) => <i key={index} className={index < current ? 'is-filled' : ''} />)}
      </span>
    </div>
  );
}

export default function V8CalibrationLab({ fixture, onComplete }: V8CalibrationLabProps = {}) {
  const [homeSquad, setHomeSquad] = useState<V8CalibrationSquadKey>(DEFAULT_HOME_SQUAD);
  const [awaySquad, setAwaySquad] = useState<V8CalibrationSquadKey>(DEFAULT_AWAY_SQUAD);
  const [seed, setSeed] = useState(fixture?.seed ?? 8082026);
  const [state, setState] = useState<V8CalibrationState>(() => fixture
    ? createFixtureMatch(fixture)
    : createSquadMatch(DEFAULT_HOME_SQUAD, DEFAULT_AWAY_SQUAD, 8082026));
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [displayHomeScore, setDisplayHomeScore] = useState(0);
  const [displayAwayScore, setDisplayAwayScore] = useState(0);
  const [pending, setPending] = useState<PendingPlay[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [homeManagerAvailable, setHomeManagerAvailable] = useState(true);
  const [awayManagerAvailable, setAwayManagerAvailable] = useState(true);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [telemetryPeriods, setTelemetryPeriods] = useState<V8CalibrationPeriodTelemetry[]>([]);
  const [matchTelemetry, setMatchTelemetry] = useState<V8CalibrationMatchTelemetry | null>(null);
  const [finished, setFinished] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);
  const [resolutionMoment, setResolutionMoment] = useState<ResolutionMoment | null>(null);
  const [revealPhase, setRevealPhase] = useState<RevealPhase | null>(null);
  const [introVisible, setIntroVisible] = useState(true);
  const handDragRef = useRef<HandDragState | null>(null);
  const suppressHandClick = useRef<string | null>(null);
  const resolutionSequence = useRef(0);
  const revealSequence = useRef(0);
  const liveMode = Boolean(fixture);
  const homeLabel = fixture?.homeLabel ?? 'YOU';
  const awayLabel = fixture?.awayLabel ?? 'CPU';
  const contextLabel = fixture?.contextLabel ?? 'MATCH 01';
  const managerProfiles = useMemo<ManagerProfiles>(() => ({
    home: fixture?.homeManager ?? CONTROL_MANAGER_V8,
    away: CONTROL_MANAGER_V8,
  }), [fixture?.homeManager]);
  const homeManager = managerProfiles.home;
  const managerActionFont = homeManager.actionName.length > 22 ? '4.5px' : homeManager.actionName.length > 17 ? '5px' : '5.75px';
  const matchScore = useMemo<MatchScore>(() => ({ home: homeScore, away: awayScore }), [awayScore, homeScore]);

  const homePlayers = calibrationHandPlayers(state, 'home');
  const arrivingHomeTacticalIds = revealPhase?.stage === 'consequence'
    ? new Set(revealPhase.activeBeat?.specialOutcomes
        .filter((outcome) => outcome.side === 'home' && outcome.destination === 'hand')
        .flatMap((outcome) => outcome.cardIds) ?? [])
    : new Set<string>();
  const homeTacticals = calibrationHandTacticals(state, 'home')
    .filter((card) => !arrivingHomeTacticalIds.has(card.id));
  const totalsHome = calibrationTeamTotals(state, 'home');
  const totalsAway = calibrationTeamTotals(state, 'away');
  const currentPriority = useMemo(() => priority(state, homeScore, awayScore, seed + state.period * 101), [state, homeScore, awayScore, seed]);
  const displayedPriority: V8CalibrationSide | null = finished && !resolutionMoment
    ? null
    : revealPhase?.reveal.first ?? resolutionMoment?.reveal.first ?? currentPriority.first;
  const homeCostProfile = useMemo(() => calibrationSquadCostProfile(homeSquad), [homeSquad]);
  const awayCostProfile = useMemo(() => calibrationSquadCostProfile(awaySquad), [awaySquad]);
  const latestTelemetry = telemetryPeriods.at(-1);
  const periodEnergy = calibrationEnergyForPeriod(state.period);
  const handCardCount = homePlayers.length + homeTacticals.length + (homeManagerAvailable ? 1 : 0);
  const handColumns = Math.max(1, Math.ceil(handCardCount / 2));
  const handStyle = { '--v8-hand-columns': handColumns } as CSSProperties;

  useEffect(() => {
    if (!introVisible) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(() => setIntroVisible(false), reducedMotion ? 450 : 1650);
    return () => window.clearTimeout(timeout);
  }, [introVisible]);

  useEffect(() => {
    if (!resolutionMoment) return;
    const longestGoalRun = Math.max(resolutionMoment.homeGoals, resolutionMoment.awayGoals);
    const payoffDuration = longestGoalRun
      ? GOAL_ARRIVAL_MS + ((longestGoalRun - 1) * GOAL_STREAM_STEP_MS) + 720
      : 1800;
    const timeout = window.setTimeout(() => setResolutionMoment(null), payoffDuration);
    return () => window.clearTimeout(timeout);
  }, [resolutionMoment]);

  useEffect(() => {
    if (!resolutionMoment) return;
    const homeBefore = resolutionMoment.nextHomeScore - resolutionMoment.homeGoals;
    const awayBefore = resolutionMoment.nextAwayScore - resolutionMoment.awayGoals;
    setDisplayHomeScore(homeBefore);
    setDisplayAwayScore(awayBefore);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayHomeScore(resolutionMoment.nextHomeScore);
      setDisplayAwayScore(resolutionMoment.nextAwayScore);
      return;
    }

    const timers: number[] = [];
    for (let index = 0; index < resolutionMoment.homeGoals; index += 1) {
      timers.push(window.setTimeout(() => setDisplayHomeScore(homeBefore + index + 1), GOAL_ARRIVAL_MS + index * GOAL_STREAM_STEP_MS));
    }
    for (let index = 0; index < resolutionMoment.awayGoals; index += 1) {
      timers.push(window.setTimeout(() => setDisplayAwayScore(awayBefore + index + 1), GOAL_ARRIVAL_MS + index * GOAL_STREAM_STEP_MS));
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [resolutionMoment]);

  const reset = (nextHomeSquad = homeSquad, nextAwaySquad = awaySquad, nextSeed = seed + 31) => {
    setHomeSquad(nextHomeSquad);
    setAwaySquad(nextAwaySquad);
    setSeed(nextSeed);
    setState(fixture
      ? createFixtureMatch({ ...fixture, seed: nextSeed })
      : createSquadMatch(nextHomeSquad, nextAwaySquad, nextSeed));
    setHomeScore(0);
    setAwayScore(0);
    setDisplayHomeScore(0);
    setDisplayAwayScore(0);
    setPending([]);
    setSelection(null);
    setHomeManagerAvailable(true);
    setAwayManagerAvailable(true);
    setUndoStack([]);
    setTelemetryPeriods([]);
    setMatchTelemetry(null);
    setFinished(false);
    setResolutionMoment(null);
    setRevealPhase(null);
    setIntroVisible(true);
  };

  const rememberUndo = () => {
    setUndoStack((stack) => [...stack, { state, homeManagerAvailable, pending }]);
  };

  const queuePlayerToZone = (cardId: string, zone: V8Zone): boolean => {
    if (finished || revealPhase || resolutionMoment) return false;
    const card = getV8CalibrationPlayer(cardId);
    const cost = calibrationPlayCost(card);
    if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
    if (cost > state.teams.home.energy) return false;
    rememberUndo();
    try {
      const paid = payCalibrationPlayer(state, 'home', card);
      setState(paid);
      setPending((plays) => [...plays, { kind: 'player', side: 'home', cardId: card.id, zone, cost }]);
      setSelection(null);
      return true;
    } catch {
      return false;
    }
  };

  const queueManagerToZone = (zone: V8Zone): boolean => {
    if (finished || revealPhase || resolutionMoment || !homeManagerAvailable || state.teams.home.energy < homeManager.cost) return false;
    if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
    rememberUndo();
    setState({
      ...state,
      teams: { ...state.teams, home: { ...state.teams.home, energy: state.teams.home.energy - homeManager.cost } },
    });
    setPending((plays) => [...plays, { kind: 'manager', side: 'home', zone, cost: homeManager.cost }]);
    setHomeManagerAvailable(false);
    setSelection(null);
    return true;
  };

  const queueTacticalToZone = (cardId: string, zone: V8Zone): boolean => {
    if (finished || revealPhase || resolutionMoment) return false;

    const tactical = homeTacticals.find((card) => card.id === cardId);
    if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return false;
    const cost = previewCalibrationTacticalCost(state, 'home', tactical, zone);
    if (cost > state.teams.home.energy) return false;
    rememberUndo();
    try {
      const spent = spendCalibrationTacticalFromHand(state, 'home', tactical.id, zone);
      setState(spent.state);
      setPending((plays) => [...plays, { kind: 'tactical', side: 'home', card: spent.card, zone, cost: spent.cost }]);
      setSelection(null);
      return true;
    } catch {
      return false;
    }
  };

  const queueToZone = (zone: V8Zone) => {
    if (!selection || finished || revealPhase || resolutionMoment) return;

    if (selection.kind === 'move') {
      const player = state.players[selection.runtimeId];
      if (!player) return;
      try {
        setState(moveCalibrationPlayer(state, 'home', player.cardId, zone));
      } catch {
        return;
      }
      setSelection(null);
      return;
    }

    if (selection.kind === 'manager') {
      queueManagerToZone(zone);
      return;
    }

    if (selection.kind === 'player') {
      queuePlayerToZone(selection.cardId, zone);
      return;
    }

    queueTacticalToZone(selection.cardId, zone);
  };

  const setDrag = (next: HandDragState | null) => {
    handDragRef.current = next;
    setHandDrag(next);
  };

  const zoneAtPoint = (x: number, y: number): V8Zone | null => {
    const pitch = document.querySelector<HTMLElement>('.v8-pitch');
    const rect = pitch?.getBoundingClientRect();
    if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

    // The three locations run left to right: DEF, MID, ATT. Resolve against the pitch thirds
    // directly instead of relying on nested card and label hitboxes.
    const progress = (x - rect.left) / rect.width;
    if (progress < 1 / 3) return 'DEF';
    if (progress < 2 / 3) return 'MID';
    return 'ATT';
  };

  const isHandDragZoneLegal = (drag: Pick<HandDragState, 'kind' | 'cardId'>, zone: V8Zone): boolean => {
    if (drag.kind === 'player') {
      if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
      return calibrationPlayCost(getV8CalibrationPlayer(drag.cardId)) <= state.teams.home.energy;
    }

    if (drag.kind === 'manager') {
      return homeManagerAvailable
        && state.teams.home.energy >= homeManager.cost
        && occupiedPlayerSlots(state, 'home', zone, pending) < 4;
    }

    const tactical = calibrationHandTacticals(state, 'home').find((card) => card.id === drag.cardId);
    if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return false;
    return previewCalibrationTacticalCost(state, 'home', tactical, zone) <= state.teams.home.energy;
  };

  const startHandDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    drag: Pick<HandDragState, 'kind' | 'cardId' | 'label'>,
  ) => {
    setSelection(drag.kind === 'manager' ? { kind: 'manager' } : { kind: drag.kind, cardId: drag.cardId });
    if (finished || revealPhase || resolutionMoment || !ZONES.some((zone) => isHandDragZoneLegal(drag, zone))) return;

    const pointerId = event.pointerId;
    setDrag({
      ...drag,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      overZone: null,
      moved: false,
    });

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleFinish);
      window.removeEventListener('pointercancel', handleCancel);
    };

    const handleMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const current = handDragRef.current;
      if (!current) return;
      const dx = pointerEvent.clientX - current.startX;
      const dy = pointerEvent.clientY - current.startY;
      const startsVerticalDrag = Math.abs(dy) > 7 && Math.abs(dy) >= Math.abs(dx) * .72;
      const moved = current.moved || startsVerticalDrag;
      if (moved) pointerEvent.preventDefault();
      setDrag({
        ...current,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
        overZone: moved ? zoneAtPoint(pointerEvent.clientX, pointerEvent.clientY) : null,
        moved,
      });
    };

    const handleFinish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const current = handDragRef.current;
      cleanup();
      if (!current) return;
      const zone = current.moved ? zoneAtPoint(pointerEvent.clientX, pointerEvent.clientY) ?? current.overZone : null;
      setDrag(null);
      if (!current.moved) return;
      suppressHandClick.current = `${current.kind}:${current.cardId}`;
      if (!zone || !isHandDragZoneLegal(current, zone)) return;
      if (current.kind === 'player') queuePlayerToZone(current.cardId, zone);
      else if (current.kind === 'tactical') queueTacticalToZone(current.cardId, zone);
      else queueManagerToZone(zone);
    };

    const handleCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      setDrag(null);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleFinish);
    window.addEventListener('pointercancel', handleCancel);
  };

  const consumeSuppressedClick = (kind: HandDragState['kind'], cardId: string): boolean => {
    const key = `${kind}:${cardId}`;
    if (suppressHandClick.current !== key) return false;
    suppressHandClick.current = null;
    return true;
  };

  const undo = () => {
    if (revealPhase || resolutionMoment) return;
    const snapshot = undoStack.at(-1);
    if (!snapshot) return;
    setState(snapshot.state);
    setHomeManagerAvailable(snapshot.homeManagerAvailable);
    setPending(snapshot.pending);
    setUndoStack((stack) => stack.slice(0, -1));
    setSelection(null);
  };

  const endPeriod = () => {
    if (finished || revealPhase || resolutionMoment) return;
    const cpu = planCpu(state, awayManagerAvailable, managerProfiles.away);
    const allPending = [...pending, ...cpu.pending];
    // The priority advertised before commitment is authoritative. Recomputing it from the
    // CPU-planned state can make the reveal contradict the decision strip the player just saw.
    const reveal = currentPriority;
    const second = reveal.first === 'home' ? 'away' : 'home';
    const orderedPlays = [reveal.first, second]
      .flatMap((side) => allPending.filter((play) => play.side === side));
    setResolutionMoment(null);
    setSelection(null);
    setRevealPhase({
      id: revealSequence.current += 1,
      stage: 'commitment',
      resolvedState: cpu.state,
      stagedState: null,
      allPending,
      orderedPlays,
      nextIndex: 0,
      activeBeat: null,
      cpuManagerAvailable: cpu.managerAvailable,
      reveal,
    });
  };

  const finishPeriod = (
    postReveal: V8CalibrationState,
    allPending: PendingPlay[],
    cpuManagerAvailable: boolean,
    reveal: RevealOrder,
  ) => {
    const resolved = postReveal;
    const period = resolved.period;
    const periodLabel = PERIOD_LABELS[period - 1];
    const wasFinal = resolved.period === 4;
    const telemetryPlays = allPending;

    const home = calibrationTeamTotals(resolved, 'home');
    const away = calibrationTeamTotals(resolved, 'away');
    const scoredHome = goalsFromAttackDefence(home.attack, away.defence);
    const scoredAway = goalsFromAttackDefence(away.attack, home.defence);
    const nextHomeScore = homeScore + scoredHome;
    const nextAwayScore = awayScore + scoredAway;
    resolved.events.push({ type: 'action_triggered', period, text: `${periodLabel}: ${home.attack} ATT vs ${away.defence} DEF → ${scoredHome} goal${scoredHome === 1 ? '' : 's'}.` });
    resolved.events.push({ type: 'action_triggered', period, text: `${periodLabel}: opponent ${away.attack} ATT vs ${home.defence} DEF → ${scoredAway} goal${scoredAway === 1 ? '' : 's'}.` });

    const periodTelemetry = captureV8CalibrationPeriodTelemetry({
      state: resolved,
      homeGoals: scoredHome,
      awayGoals: scoredAway,
      homeAttack: home.attack,
      homeDefence: home.defence,
      awayAttack: away.attack,
      awayDefence: away.defence,
      plays: telemetryPlays,
    });
    const nextTelemetryPeriods = [...telemetryPeriods, periodTelemetry];
    setTelemetryPeriods(nextTelemetryPeriods);

    setResolutionMoment({
      id: resolutionSequence.current += 1,
      period,
      label: periodLabel,
      reveal,
      homeGoals: scoredHome,
      awayGoals: scoredAway,
      homeAttack: home.attack,
      awayDefence: away.defence,
      awayAttack: away.attack,
      homeDefence: home.defence,
      nextHomeScore,
      nextAwayScore,
    });

    let ended = endV8CalibrationPeriod(resolved, { home: nextHomeScore, away: nextAwayScore });
    if (!wasFinal) ended = withCalibrationEnergy(ended);
    if (wasFinal && !fixture) {
      setMatchTelemetry(buildV8CalibrationMatchTelemetry({
        state: ended,
        homeSquad,
        awaySquad,
        homeScore: nextHomeScore,
        awayScore: nextAwayScore,
        periods: nextTelemetryPeriods,
      }));
    }
    setState(ended);
    setHomeScore(nextHomeScore);
    setAwayScore(nextAwayScore);
    setAwayManagerAvailable(cpuManagerAvailable);
    setPending([]);
    setUndoStack([]);
    setSelection(null);
    if (wasFinal) setFinished(true);
  };

  const finishPeriodRef = useRef(finishPeriod);
  useEffect(() => {
    finishPeriodRef.current = finishPeriod;
  });

  const finishReveal = (phase: RevealPhase, resolved: V8CalibrationState) => {
    const period = resolved.period;
    const periodLabel = PERIOD_LABELS[period - 1];
    resolved.events.push({
      type: 'action_triggered',
      period,
      text: `${periodLabel} REVEAL: ${phase.reveal.first === 'home' ? 'YOU' : 'CPU'} first · ${phase.reveal.reason}.`,
    });

    setRevealPhase(null);
    setUndoStack([]);
    setSelection(null);
    setPending([]);
    finishPeriodRef.current(
      resolved,
      phase.allPending,
      phase.cpuManagerAvailable,
      phase.reveal,
    );
  };

  const finishRevealRef = useRef(finishReveal);
  useEffect(() => {
    finishRevealRef.current = finishReveal;
  });

  const skipReveal = () => {
    if (!revealPhase) return;
    const resolved = resolveSequence(
      revealPhase.resolvedState,
      revealPhase.orderedPlays.slice(revealPhase.nextIndex),
      managerProfiles,
      matchScore,
    );
    setState(resolved);
    setPending([]);
    finishRevealRef.current(revealPhase, resolved);
  };

  useEffect(() => {
    if (!revealPhase) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reducedMotion
      ? 30
      : revealPhase.stage === 'commitment'
        ? 240
        : revealPhase.stage === 'source'
          ? 360
          : revealPhase.stage === 'consequence'
            ? 520
            : 260;

    const timeout = window.setTimeout(() => {
      if (revealPhase.stage === 'source') {
        const stagedState = revealPhase.stagedState ?? revealPhase.resolvedState;
        const play = revealPhase.orderedPlays[revealPhase.nextIndex];
        setState(stagedState);
        if (play?.side === 'home') {
          const key = pendingPlayKey(play);
          setPending((plays) => plays.filter((candidate) => pendingPlayKey(candidate) !== key));
        }
        setRevealPhase({
          ...revealPhase,
          stage: 'consequence',
          resolvedState: stagedState,
          stagedState: null,
          nextIndex: revealPhase.nextIndex + 1,
        });
        return;
      }

      if (revealPhase.stage === 'consequence') {
        setRevealPhase({ ...revealPhase, stage: 'settle' });
        return;
      }

      if (revealPhase.nextIndex < revealPhase.orderedPlays.length) {
        const play = revealPhase.orderedPlays[revealPhase.nextIndex]!;
        const next = resolveRevealBeat(
          revealPhase.resolvedState,
          play,
          revealPhase.nextIndex + 1,
          revealPhase.orderedPlays.length,
          managerProfiles,
          matchScore,
        );
        setRevealPhase({
          ...revealPhase,
          stage: 'source',
          stagedState: next.state,
          activeBeat: next.beat,
        });
        return;
      }
      finishRevealRef.current(revealPhase, revealPhase.resolvedState);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [managerProfiles, matchScore, revealPhase]);

  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedPlayerCost = selectedPlayer ? calibrationPlayCost(selectedPlayer) : null;
  const selectedPlayerUnaffordable = selectedPlayerCost !== null && selectedPlayerCost > state.teams.home.energy;
  const selectedTactical = selection?.kind === 'tactical' ? calibrationHandTacticals(state, 'home').find((card) => card.id === selection.cardId) ?? null : null;
  const draggedPlayer = handDrag?.kind === 'player' ? getV8CalibrationPlayer(handDrag.cardId) : null;
  const draggedTactical = handDrag?.kind === 'tactical' ? calibrationHandTacticals(state, 'home').find((card) => card.id === handDrag.cardId) ?? null : null;
  const activeRevealBeat = revealPhase?.activeBeat ?? null;
  const revealConsequenceActive = revealPhase?.stage === 'consequence' && activeRevealBeat !== null;
  const revealSettleActive = revealPhase?.stage === 'settle' && activeRevealBeat !== null;
  const revealCardActive = (revealConsequenceActive || revealSettleActive) && activeRevealBeat !== null;
  const stagedFreshPlayerIds = revealConsequenceActive && activeRevealBeat.cardId ? [activeRevealBeat.cardId] : [];
  const actionSourceRuntimeId = revealCardActive ? activeRevealBeat.sourceRuntimeId : null;
  const consequenceTargetRuntimeIds = revealConsequenceActive
    ? new Set(activeRevealBeat.targets.flatMap((target) => target.runtimeId ? [target.runtimeId] : []))
    : new Set<string>();
  const heldDelta = (side: V8CalibrationSide, axis: 'ATT' | 'DEF') => revealConsequenceActive
    ? activeRevealBeat.statDeltas.find((delta) => delta.side === side && delta.axis === axis)?.value ?? 0
    : 0;
  const displayedHomeAttack = totalsHome.attack - heldDelta('home', 'ATT');
  const displayedHomeDefence = totalsHome.defence - heldDelta('home', 'DEF');
  const displayedAwayAttack = totalsAway.attack - heldDelta('away', 'ATT');
  const displayedAwayDefence = totalsAway.defence - heldDelta('away', 'DEF');
  const liveHomeAttack = resolutionMoment?.homeAttack ?? displayedHomeAttack;
  const liveHomeDefence = resolutionMoment?.homeDefence ?? displayedHomeDefence;
  const liveAwayAttack = resolutionMoment?.awayAttack ?? displayedAwayAttack;
  const liveAwayDefence = resolutionMoment?.awayDefence ?? displayedAwayDefence;
  const revealActionLeft = revealPhase?.activeBeat
    ? `${(ZONES.indexOf(revealPhase.activeBeat.zone) + .5) * (100 / ZONES.length)}%`
    : '50%';
  const homeScoreAnimating = resolutionMoment !== null
    && resolutionMoment.homeGoals > 0
    && displayHomeScore > (resolutionMoment.nextHomeScore - resolutionMoment.homeGoals);
  const awayScoreAnimating = resolutionMoment !== null
    && resolutionMoment.awayGoals > 0
    && displayAwayScore > (resolutionMoment.nextAwayScore - resolutionMoment.awayGoals);
  const placementImpacts = useMemo(() => {
    if (!selectedPlayer || selectedPlayerUnaffordable || revealPhase || resolutionMoment || finished) return [];
    return ZONES.flatMap((zone) => {
      if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return [];
      try {
        return [previewPlayerPlacement(state, pending, selectedPlayer, zone, managerProfiles, matchScore)];
      } catch {
        return [];
      }
    });
  }, [finished, managerProfiles, matchScore, pending, resolutionMoment, revealPhase, selectedPlayer, selectedPlayerUnaffordable, state]);
  const focusedPlacementZone = handDrag?.kind === 'player' && handDrag.overZone
    ? handDrag.overZone
    : selectedPlayer?.naturalZones.find((zone) => placementImpacts.some((impact) => impact.zone === zone))
      ?? placementImpacts[0]?.zone
      ?? null;
  const focusedPlacementImpact = focusedPlacementZone
    ? placementImpacts.find((impact) => impact.zone === focusedPlacementZone) ?? null
    : null;
  const interactionLabel = handDrag?.moved
    ? handDrag.overZone
      ? isHandDragZoneLegal(handDrag, handDrag.overZone)
        ? `DROP ${handDrag.label} IN ${handDrag.overZone}`
        : `${handDrag.overZone} IS NOT AVAILABLE`
      : 'DRAG OVER A HIGHLIGHTED ZONE'
    : pending.length
      ? `${pending.length} committed`
      : selection?.kind === 'move'
        ? 'CHOOSE DESTINATION ZONE'
        : selectedPlayerUnaffordable
          ? `${selectedPlayerCost} ENERGY REQUIRED · ${state.teams.home.energy} AVAILABLE`
          : selection?.kind === 'manager'
            ? state.teams.home.energy < homeManager.cost
              ? `${homeManager.cost} ENERGY REQUIRED · ${state.teams.home.energy} AVAILABLE`
              : `DRAG ${homeManager.actionName.toUpperCase()} TO A ZONE`
            : selectedTactical
              ? `DRAG ${selectedTactical.name.toUpperCase()} TO A HIGHLIGHTED ZONE`
              : selectedPlayer
                ? `DRAG ${selectedPlayer.matchName} TO A ZONE`
                : 'DRAG A CARD TO THE PITCH';

  return (
    <main data-visual-family="team-selection" className={`v8-shell${liveMode ? ' v8-shell--live' : ''}${handDrag ? ' is-dragging' : ''}${debugOpen ? ' is-debug-open' : ''}${revealPhase ? ' is-revealing' : ''}${resolutionMoment ? ' is-resolving' : ''}${resolutionMoment?.homeGoals ? ' has-home-goal' : ''}${resolutionMoment?.awayGoals ? ' has-away-goal' : ''}`}>
      {introVisible && (
        <button className="v8-match-intro" type="button" onClick={() => setIntroVisible(false)} data-testid="v8-match-intro" aria-label="Match introduction. Tap to skip.">
          <span className="v8-match-intro__fixture">
            <i className="v8-match-intro__team v8-match-intro__team--home"><b>KC</b><strong>{homeLabel}</strong><em>HOME</em></i>
            <b className="v8-match-intro__versus">VS</b>
            <i className="v8-match-intro__team v8-match-intro__team--away"><b>KC</b><strong>{awayLabel}</strong><em>AWAY</em></i>
          </span>
          <span className="v8-match-intro__whistle">{contextLabel} · FOUR PERIODS</span>
        </button>
      )}

      <header className="v8-scorebar">
        <div className={`v8-scoreteam v8-scoreteam--home${homeScoreAnimating ? ' is-scoring' : ''}`} data-priority={displayedPriority === 'home'}>
          <small>{homeLabel}</small>
          <span>
            <strong key={`home-${displayHomeScore}`}>{displayHomeScore}</strong>
            {displayedPriority === 'home' && <i className="v8-priority-ball" data-testid="v8-priority-ball-home" aria-label={`${homeLabel} has priority`}><span aria-hidden="true">⚽</span></i>}
          </span>
        </div>
        <section>
          <b key={`period-${state.period}-${finished}-${resolutionMoment?.id ?? 0}`}>{resolutionMoment ? resolutionMoment.label : finished ? 'FULL TIME' : PERIOD_LABELS[state.period - 1]}</b>
          <span>{finished && !resolutionMoment ? 'MATCH COMPLETE' : contextLabel}</span>
        </section>
        <div className={`v8-scoreteam v8-scoreteam--away${awayScoreAnimating ? ' is-scoring' : ''}`} data-priority={displayedPriority === 'away'}>
          <small>{awayLabel}</small>
          <span>
            <strong key={`away-${displayAwayScore}`}>{displayAwayScore}</strong>
            {displayedPriority === 'away' && <i className="v8-priority-ball" data-testid="v8-priority-ball-away" aria-label={`${awayLabel} has priority`}><span aria-hidden="true">⚽</span></i>}
          </span>
        </div>
      </header>

      <section
        className="v8-live-contests"
        aria-label="Current scoring contests"
        aria-live="polite"
        data-testid="v8-live-contests"
        data-resolution-active={Boolean(resolutionMoment)}
        data-goals={(resolutionMoment?.homeGoals ?? 0) + (resolutionMoment?.awayGoals ?? 0)}
        data-next-home-score={resolutionMoment?.nextHomeScore ?? displayHomeScore}
        data-next-away-score={resolutionMoment?.nextAwayScore ?? displayAwayScore}
      >
        <ContestComparison
          key={`att-${revealPhase?.id ?? 0}-${revealPhase?.nextIndex ?? 0}-${revealPhase?.stage ?? 'idle'}-${resolutionMoment?.id ?? 0}`}
          axis="ATT"
          user={liveHomeAttack}
          cpu={liveAwayDefence}
          updating={revealSettleActive}
          resolution={resolutionMoment ? {
            side: 'home',
            goals: resolutionMoment.homeGoals,
            attackingMargin: Math.max(0, resolutionMoment.homeAttack - resolutionMoment.awayDefence),
          } : null}
        />
        <ContestComparison
          key={`def-${revealPhase?.id ?? 0}-${revealPhase?.nextIndex ?? 0}-${revealPhase?.stage ?? 'idle'}-${resolutionMoment?.id ?? 0}`}
          axis="DEF"
          user={liveHomeDefence}
          cpu={liveAwayAttack}
          updating={revealSettleActive}
          resolution={resolutionMoment ? {
            side: 'away',
            goals: resolutionMoment.awayGoals,
            attackingMargin: Math.max(0, resolutionMoment.awayAttack - resolutionMoment.homeDefence),
          } : null}
        />
      </section>

      <div className="v8-condition" hidden={!debugOpen}>
        <button>
          <strong>V8 SQUAD CALIBRATION</strong>
          <span>2/4/6/8 Energy · player Costs −1 (min 1) · source values unchanged</span>
        </button>
        <button onClick={() => reset(homeSquad, awaySquad, seed + 31)}>NEW DRAW</button>
      </div>

      <section className="v8-lab-controls v8-lab-controls--squads" aria-label="Calibration squads" hidden={!debugOpen}>
        <label>
          <span>YOU SQUAD</span>
          <select data-testid="home-squad-select" value={homeSquad} onChange={(event) => reset(event.target.value as V8CalibrationSquadKey, awaySquad, seed + 31)}>
            {V8_CALIBRATION_SQUAD_KEYS.map((key) => <option key={key} value={key}>{getV8CalibrationSquad(key).label}</option>)}
          </select>
          <small>C{homeCostProfile.totalCost} · avg {homeCostProfile.averageCost.toFixed(2)}</small>
        </label>
        <label>
          <span>CPU SQUAD</span>
          <select data-testid="away-squad-select" value={awaySquad} onChange={(event) => reset(homeSquad, event.target.value as V8CalibrationSquadKey, seed + 31)}>
            {V8_CALIBRATION_SQUAD_KEYS.map((key) => <option key={key} value={key}>{getV8CalibrationSquad(key).label}</option>)}
          </select>
          <small>C{awayCostProfile.totalCost} · avg {awayCostProfile.averageCost.toFixed(2)}</small>
        </label>
      </section>

      <section className="v8-totals" hidden={!debugOpen}>
        <span>YOUR <b>{totalsHome.attack}</b> ATT</span>
        <span>YOUR <b>{totalsHome.defence}</b> DEF</span>
        <span>CPU <b>{totalsAway.attack}</b> ATT</span>
        <span>CPU <b>{totalsAway.defence}</b> DEF</span>
      </section>

      <section
        className={`v8-pitch${revealPhase ? ' is-revealing' : ''}${resolutionMoment ? ' is-resolving' : ''}`}
        aria-label="DEF MID ATT board"
        data-reveal-index={revealPhase?.activeBeat?.index}
        data-reveal-total={revealPhase?.activeBeat?.total}
        data-reveal-side={revealPhase?.activeBeat?.side}
        data-reveal-zone={revealPhase?.activeBeat?.zone}
        data-reveal-stage={revealPhase?.stage}
        data-opponent-commitments={revealPhase?.allPending.filter((play) => play.side === 'away').length}
      ><div className="v8-pitch__stadium" aria-hidden="true"><i /><i /><i /></div>
        {ZONES.map((zone) => {
          const homeZone = calibrationPlayersInZone(state, 'home', zone);
          const awayZone = calibrationPlayersInZone(state, 'away', zone);
          const hiddenCpuCommitments = revealPhase
            ? revealPhase.orderedPlays.slice(revealPhase.nextIndex + (revealPhase.stage === 'source' ? 1 : 0))
              .filter((play) => play.side === 'away' && play.zone === zone)
            : [];
          const queuedPlayers = pending.filter((play) => play.side === 'home' && play.zone === zone && play.kind === 'player');
          const queuedManager = pending.find((play) => play.side === 'home' && play.zone === zone && play.kind === 'manager');
          const placementImpact = placementImpacts.find((impact) => impact.zone === zone);
          const playerOccupancy = homeZone.length + queuedPlayers.length + (queuedManager ? 1 : 0);
          let guide = `${playerOccupancy}/4`;
          if (playerOccupancy >= 4) guide = 'FULL';
          else if (selectedPlayer) {
            const penalty = outOfPositionPenalty(selectedPlayer, zone);
            guide = selectedPlayerUnaffordable ? 'NO ENERGY' : penalty === 0 ? 'NATURAL' : `−${penalty} OOP`;
          }
          if (placementImpact) guide = compactPlacementLabel(placementImpact);
          if (selectedTactical) {
            const eligible = tacticalDefinition(selectedTactical.type).eligibleZones.includes(zone);
            const tacticalCost = eligible ? previewCalibrationTacticalCost(state, 'home', selectedTactical, zone) : Number.POSITIVE_INFINITY;
            guide = !eligible ? 'NO' : tacticalCost > state.teams.home.energy ? 'NO ENERGY' : `TACTICAL · ${tacticalLabel(selectedTactical, zone)}`;
          }
          if (selection?.kind === 'manager') guide = playerOccupancy >= 4 ? 'FULL' : state.teams.home.energy < homeManager.cost ? 'NO ENERGY' : homeManager.actionName.toUpperCase();
          if (selection?.kind === 'move') guide = 'MOVE';
          const consequenceTargetZone = revealConsequenceActive && activeRevealBeat.targets.some((target) => target.zone === zone);

          return (
            <button
              key={zone}
              type="button"
              data-v8-zone={zone}
              className={`v8-zone${revealPhase?.activeBeat?.zone === zone ? ' is-resolving-zone' : ''}${consequenceTargetZone ? ' has-consequence' : ''}${placementImpact ? ' has-placement-preview' : ''}${focusedPlacementImpact?.zone === zone ? ' is-placement-focus' : ''}${handDrag ? isHandDragZoneLegal(handDrag, zone) ? ' is-drag-target' : ' is-drag-disabled' : ''}${handDrag?.overZone === zone && isHandDragZoneLegal(handDrag, zone) ? ' is-drag-over' : ''}`}
              data-consequence-target={consequenceTargetZone || undefined}
              onClick={() => queueToZone(zone)}
            >
              <div className="v8-zone__heading"><strong>{zone}</strong><span data-testid={placementImpact ? `v8-placement-zone-${zone}` : undefined} data-penalty={placementImpact?.effectivePenalty}>{guide}</span></div>
              <div className="v8-zone__side v8-zone__side--away">
                {awayZone.map((player) => <DeployedChip key={player.runtimeId} state={state} side="away" runtimeId={player.runtimeId} fresh={stagedFreshPlayerIds.includes(player.cardId)} actionSource={player.runtimeId === actionSourceRuntimeId} consequenceTarget={consequenceTargetRuntimeIds.has(player.runtimeId)} />)}
                {Array.from({ length: Math.max(0, 4 - awayZone.length) }).map((_, index) => <i key={`away-${zone}-${index}`} />)}
                {hiddenCpuCommitments.length > 0 && (
                  <span className="v8-opponent-commitments" data-zone={zone} aria-label={`${hiddenCpuCommitments.length} hidden opponent commitment${hiddenCpuCommitments.length === 1 ? '' : 's'} in ${zone}`}>
                    {hiddenCpuCommitments.slice(0, 4).map((_, index) => <span key={`${zone}-hidden-${index}`} className="v8-opponent-card-back" data-testid="v8-opponent-card-back" aria-hidden="true"><i /><b>KC</b></span>)}
                    {hiddenCpuCommitments.length > 4 && <b className="v8-opponent-commitments__more">+{hiddenCpuCommitments.length - 4}</b>}
                  </span>
                )}
              </div>
              <div className="v8-zone__side">
                {homeZone.map((player) => (
                  <DeployedChip key={player.runtimeId} state={state} side="home" runtimeId={player.runtimeId} fresh={stagedFreshPlayerIds.includes(player.cardId)} actionSource={player.runtimeId === actionSourceRuntimeId} consequenceTarget={consequenceTargetRuntimeIds.has(player.runtimeId)} onMove={() => setSelection({ kind: 'move', runtimeId: player.runtimeId })} />
                ))}
                {queuedPlayers.map((play) => play.kind === 'player' ? (
                  <span key={`queued-${play.cardId}`} className="v8-chip v8-chip--transient"><span className="v8-card__sr">{getV8CalibrationPlayer(play.cardId).realName}</span>{getV8CalibrationPlayer(play.cardId).matchName}<b>PLAYER · QUEUED</b></span>
                ) : null)}
                {queuedManager && <span className="v8-chip v8-chip--transient">{homeManager.actionName.toUpperCase()}<b>MANAGER · QUEUED</b></span>}
                {Array.from({ length: Math.max(0, 4 - playerOccupancy) }).map((_, index) => <i key={`home-${zone}-${index}`} />)}
              </div>
            </button>
          );
        })}
        {revealPhase?.stage === 'source' && revealPhase.activeBeat && (
          <aside
            className={`v8-action-flash v8-action-flash--${revealPhase.activeBeat.side}`}
            data-testid="v8-action-flash"
            data-reveal-index={revealPhase.activeBeat.index}
            data-action-stage={revealPhase.stage}
            style={{ '--v8-action-left': revealActionLeft } as CSSProperties}
            key={`${revealPhase.id}-${revealPhase.activeBeat.index}-${revealPhase.stage}`}
            aria-live="polite"
          >
            <small>{revealPhase.activeBeat.name}</small>
            <strong>{revealPhase.activeBeat.action}</strong>
          </aside>
        )}
        {revealConsequenceActive && activeRevealBeat && <ActionConsequences beat={activeRevealBeat} />}
        {revealPhase && (
          <button className="v8-reveal-skip" type="button" onClick={skipReveal} aria-label="Skip reveal sequence">
            SKIP
          </button>
        )}
      </section>

      <section className="v8-commit">
        <EnergyMeter current={state.teams.home.energy} maximum={periodEnergy} />
        <div className="v8-commit__decision">
          {selectedPlayer && focusedPlacementImpact ? (
            <PlacementPreview card={selectedPlayer} impact={focusedPlacementImpact} />
          ) : (
            <>
              {!revealPhase && !resolutionMoment && <strong>{interactionLabel}</strong>}
              {pending.filter((play) => play.kind === 'tactical').map((play) => play.kind === 'tactical' ? <span key={play.card.id}>{play.card.name} → {play.zone} · {tacticalLabel(play.card, play.zone)}</span> : null)}
            </>
          )}
        </div>
        <button onClick={undo} disabled={!undoStack.length || Boolean(revealPhase) || Boolean(resolutionMoment)}>UNDO</button>
        <button className="v8-primary" onClick={endPeriod} disabled={finished || Boolean(revealPhase) || Boolean(resolutionMoment)}>{revealPhase || resolutionMoment ? 'CONFIRMED' : 'CONFIRM'}</button>
      </section>

      {latestTelemetry && (
        <details className="v8-telemetry" data-testid="v8-telemetry" open={finished} hidden={!debugOpen}>
          <summary>
            <strong>CALIBRATION TELEMETRY</strong>
            <span>{getV8CalibrationSquad(homeSquad).shortLabel} vs {getV8CalibrationSquad(awaySquad).shortLabel} · {telemetryPeriods.length}/4 periods</span>
          </summary>
          <div className="v8-telemetry__body">
            <div className="v8-telemetry__period" data-testid={`telemetry-period-${latestTelemetry.period}`}>
              <small>P{latestTelemetry.period} · {PERIOD_LABELS[latestTelemetry.period - 1]}</small>
              <TelemetryTeamPeriod label="YOU" telemetry={latestTelemetry.home} />
              <TelemetryTeamPeriod label="CPU" telemetry={latestTelemetry.away} />
            </div>

            {telemetryPeriods.length > 1 && (
              <div className="v8-telemetry__history">
                {telemetryPeriods.map((periodTelemetry) => (
                  <span key={periodTelemetry.period}>P{periodTelemetry.period}: {periodTelemetry.home.goals}–{periodTelemetry.away.goals} · margins {signed(periodTelemetry.home.attackingMargin)} / {signed(periodTelemetry.away.attackingMargin)}</span>
                ))}
              </div>
            )}

            {matchTelemetry && (
              <div className="v8-telemetry__match" data-testid="match-telemetry-final">
                <b>FULL MATCH · {matchTelemetry.finalScore} · {matchTelemetry.totalGoals} total goals · {matchTelemetry.winner === 'draw' ? 'DRAW' : matchTelemetry.winner === 'home' ? 'YOU WIN' : 'CPU WINS'}</b>
                <span>YOU: {matchTelemetry.home.playersDeployed} deployed / {matchTelemetry.home.playersUndeployed} undeployed · {matchTelemetry.home.totalUnusedEnergy} unused Energy · {matchTelemetry.home.tacticalsPlayed} Tacticals · {matchTelemetry.home.tacticalAttackGenerated} Tactical ATT · {matchTelemetry.home.cancelledChances} cancelled</span>
                <span>CPU: {matchTelemetry.away.playersDeployed} deployed / {matchTelemetry.away.playersUndeployed} undeployed · {matchTelemetry.away.totalUnusedEnergy} unused Energy · {matchTelemetry.away.tacticalsPlayed} Tacticals · {matchTelemetry.away.tacticalAttackGenerated} Tactical ATT · {matchTelemetry.away.cancelledChances} cancelled</span>
                {[...new Set([...matchTelemetry.home.majorChains, ...matchTelemetry.away.majorChains])].map((chain) => <small key={chain}>{chain}</small>)}
              </div>
            )}
          </div>
        </details>
      )}

      <section className="v8-hand-wrap">
        {selectedPlayer && focusedPlacementImpact ? (
          <div
            className="v8-hand-heading is-placement-preview"
            data-testid="v8-placement-action-effect"
            title={`${selectedPlayer.actionName}: ${focusedPlacementImpact.actionEffect}`}
          >
            <strong>{selectedPlayer.actionName}</strong>
            <span>{focusedPlacementImpact.actionEffect}</span>
          </div>
        ) : (
          <div className="v8-hand-heading"><strong>HAND</strong><span>DRAG CARD TO PITCH · {state.teams.home.drawPile.length} UNSEEN</span></div>
        )}
        <div className="v8-hand" style={handStyle} data-testid="v8-hand" data-columns={handColumns}>
          {homeManagerAvailable && (
            <button
              type="button"
              data-testid="manager-card"
              data-manager-id={homeManager.id}
              data-manager-action={homeManager.actionName}
              className={`v8-card v8-card--manager${selection?.kind === 'manager' ? ' is-selected' : ''}${state.teams.home.energy >= homeManager.cost ? '' : ' is-unaffordable'}`}
              style={{ '--v8-action-font': managerActionFont } as CSSProperties}
              aria-pressed={selection?.kind === 'manager'}
              aria-label={`${homeManager.name}, Manager, ${homeManager.cost} Energy, ${homeManager.actionName}: ${homeManager.actionText}`}
              onClick={() => {
                if (consumeSuppressedClick('manager', 'manager')) return;
                setSelection({ kind: 'manager' });
              }}
              onPointerDown={(event) => startHandDrag(event, { kind: 'manager', cardId: 'manager', label: homeManager.actionName.toUpperCase() })}
            >
              <span className="v8-card__art v8-card__art--manager" aria-hidden="true"><i>{homeManager.name.slice(0, 2).toUpperCase()}</i></span>
              <span className="v8-card__cost">{homeManager.cost}</span>
              <span className="v8-card__position">MANAGER</span>
              <strong>{homeManager.name.toUpperCase()}</strong>
              <small><b>{homeManager.actionName.toUpperCase()}</b><span className="v8-card__sr">{homeManager.actionText}</span></small>
            </button>
          )}
          {homePlayers.map((card) => (
            <PlayerHandCard
              key={card.id}
              card={card}
              selected={selection?.kind === 'player' && selection.cardId === card.id}
              affordable={calibrationPlayCost(card) <= state.teams.home.energy}
              onClick={() => {
                if (consumeSuppressedClick('player', card.id)) return;
                setSelection({ kind: 'player', cardId: card.id });
              }}
              onPointerDown={(event) => startHandDrag(event, { kind: 'player', cardId: card.id, label: card.matchName })}
            />
          ))}
          {homeTacticals.map((card) => {
            const eligible = tacticalDefinition(card.type).eligibleZones;
            const costs = eligible.map((zone) => previewCalibrationTacticalCost(state, 'home', card, zone));
            const minimumCost = Math.min(...costs);
            const affordable = minimumCost <= state.teams.home.energy;
            return (
              <TacticalHandCard
                key={card.id}
                card={card}
                cost={minimumCost}
                selected={selection?.kind === 'tactical' && selection.cardId === card.id}
                affordable={affordable}
                fresh={false}
                onClick={() => {
                  if (consumeSuppressedClick('tactical', card.id)) return;
                  setSelection({ kind: 'tactical', cardId: card.id });
                }}
                onPointerDown={(event) => startHandDrag(event, { kind: 'tactical', cardId: card.id, label: card.name.toUpperCase() })}
              />
            );
          })}
        </div>
      </section>

      {!liveMode && (
        <button
          type="button"
          className="v8-debug-toggle"
          aria-expanded={debugOpen}
          onClick={() => setDebugOpen((open) => !open)}
        >
          {debugOpen ? 'CLOSE LAB TOOLS' : 'OPEN LAB TOOLS'}
        </button>
      )}

      {handDrag?.moved && (
        <div
          className={`v8-drag-ghost${handDrag.kind === 'tactical' ? ' v8-card--chance' : handDrag.kind === 'manager' ? ' v8-card--manager' : ''}`}
          data-testid="v8-drag-ghost"
          style={{ left: handDrag.x, top: handDrag.y }}
          aria-hidden="true"
        >
          <span className={`v8-card__art${handDrag.kind === 'tactical' ? ' v8-card__art--tactical' : handDrag.kind === 'manager' ? ' v8-card__art--manager' : ''}`}><i>{handDrag.kind === 'player' ? draggedPlayer?.matchName.slice(0, 2).toUpperCase() : handDrag.kind === 'tactical' ? 'TX' : 'CO'}</i></span>
          <span className="v8-card__cost">{handDrag.kind === 'player' && draggedPlayer
            ? calibrationPlayCost(draggedPlayer)
            : handDrag.kind === 'tactical' && draggedTactical
              ? Math.min(...tacticalDefinition(draggedTactical.type).eligibleZones.map((zone) => previewCalibrationTacticalCost(state, 'home', draggedTactical, zone)))
              : homeManager.cost}</span>
          <span className="v8-card__position">{handDrag.kind === 'player' ? draggedPlayer?.position : handDrag.kind === 'tactical' ? 'TACTICAL' : 'MANAGER'}</span>
          <strong>{handDrag.kind === 'player' ? draggedPlayer?.matchName : handDrag.kind === 'tactical' ? draggedTactical?.name : homeManager.name.toUpperCase()}</strong>
          <small><b>{handDrag.kind === 'player' ? draggedPlayer?.actionName : handDrag.kind === 'tactical' ? draggedTactical ? tacticalLabel(draggedTactical) : '' : homeManager.actionName.toUpperCase()}</b></small>
          {handDrag.kind === 'player' && draggedPlayer && (
            <>
              <span className="v8-card__att">{draggedPlayer.printedAttack}<i>ATT</i></span>
              <span className="v8-card__def">{draggedPlayer.printedDefence}<i>DEF</i></span>
            </>
          )}
        </div>
      )}

      {state.events.length > 0 && (
        <section className="v8-log" hidden={!debugOpen}>
          <strong>MATCH / ACTION LOG</strong>
          {[...state.events].reverse().slice(0, 30).map((event, index) => <p key={`${event.period}-${index}-${event.text}`}>{event.text}</p>)}
        </section>
      )}

      {finished && !resolutionMoment && (
        <div className="v8-result">
          <small>FULL TIME</small>
          <strong>{homeScore}–{awayScore}</strong>
          <b>{homeScore > awayScore ? 'VICTORY' : homeScore < awayScore ? 'DEFEAT' : 'DRAW'}</b>
          <button onClick={() => fixture && onComplete
            ? onComplete({ homeScore, awayScore, state })
            : reset(homeSquad, awaySquad, seed + 31)}>
            {fixture && onComplete ? 'CONTINUE' : 'PLAY AGAIN'}
          </button>
        </div>
      )}
    </main>
  );
}
