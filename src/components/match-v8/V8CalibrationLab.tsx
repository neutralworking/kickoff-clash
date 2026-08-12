'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import { managerPortraitSrc, portraitSrc } from '../cards/portrait';
import './v8lab.css';
import './v8recap.css';

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const PERIOD_LABELS = ['PERIOD 1/4', 'PERIOD 2/4', 'PERIOD 3/4', 'PERIOD 4/4'] as const;
const MANAGER_COST = 3;
const MANAGER_NAME = 'CONTROL';
const DEFAULT_HOME_SQUAD: V8CalibrationSquadKey = 'cross';
const DEFAULT_AWAY_SQUAD: V8CalibrationSquadKey = 'balanced_midrange';

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

type PeriodRecap = {
  period: number;
  label: string;
  homeGoals: number;
  awayGoals: number;
  homeAttack: number;
  awayDefence: number;
  awayAttack: number;
  homeDefence: number;
  scoreAfter: string;
  highlights: string[];
};

type RevealOrder = { first: V8CalibrationSide; reason: string };

type RevealBeat = {
  index: number;
  total: number;
  side: V8CalibrationSide;
  zone: V8Zone;
  cardId: string | null;
  name: string;
  action: string;
  effect: string;
};

type ResolutionMoment = {
  id: number;
  period: number;
  label: string;
  reveal: RevealOrder;
  actionLine: string | null;
  tacticalLine: string | null;
  homeGoals: number;
  awayGoals: number;
  homeAttack: number;
  awayDefence: number;
  awayAttack: number;
  homeDefence: number;
  nextHomeScore: number;
  nextAwayScore: number;
  nextLabel: string;
  nextEnergy: number | null;
  revealedPlayerIds: string[];
  final: boolean;
};

type RevealPhase = {
  id: number;
  stage: 'commitment' | 'cards';
  resolvedState: V8CalibrationState;
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

function applyManager(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone): V8CalibrationState {
  const next = JSON.parse(JSON.stringify(state)) as V8CalibrationState;
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
    text: `${side === 'home' ? 'YOU' : 'CPU'} reveal ${MANAGER_NAME} → ${zone}: resolves on ${count} player${count === 1 ? '' : 's'}, then leaves the slot.`,
  });
  return next;
}

function resolveSequence(state: V8CalibrationState, plays: readonly PendingPlay[]): V8CalibrationState {
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
): PlacementImpact {
  const committedHomePlays = pending.filter((play) => play.side === 'home');
  const before = resolveSequence(state, committedHomePlays);
  const homeBefore = calibrationTeamTotals(before, 'home');
  const awayBefore = calibrationTeamTotals(before, 'away');
  const eventCount = before.events.length;
  const after = resolveSequence(before, [{
    kind: 'player',
    side: 'home',
    cardId: card.id,
    zone,
    cost: calibrationPlayCost(card),
  }]);
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
): { state: V8CalibrationState; beat: RevealBeat } {
  const beforeTotals = calibrationTeamTotals(state, play.side);
  const eventCount = state.events.length;
  const next = resolveSequence(state, [play]);
  const afterTotals = calibrationTeamTotals(next, play.side);
  const newEvents = next.events.slice(eventCount);

  const card = play.kind === 'player' ? getV8CalibrationPlayer(play.cardId) : null;
  const name = card?.matchName ?? (play.kind === 'tactical' ? play.card.name : MANAGER_NAME);
  const action = card?.actionName ?? (play.kind === 'tactical' ? 'TACTICAL' : 'MANAGER');
  const genericAction = card ? `${card.realName} · ${card.actionName}.` : null;
  const specificEvent = [...newEvents].reverse().find((event) => (
    event.type !== 'player_revealed'
    && event.text !== genericAction
  ));
  const attackDelta = afterTotals.attack - beforeTotals.attack;
  const defenceDelta = afterTotals.defence - beforeTotals.defence;
  const statChange = [
    attackDelta ? `${signed(attackDelta)} ATT` : null,
    defenceDelta ? `${signed(defenceDelta)} DEF` : null,
  ].filter(Boolean).join(' · ');

  return {
    state: next,
    beat: {
      index,
      total,
      side: play.side,
      zone: play.zone,
      cardId: card?.id ?? null,
      name,
      action,
      effect: specificEvent?.text ?? (statChange || 'BOARD STATE UNCHANGED'),
    },
  };
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

function planCpu(state: V8CalibrationState, managerAvailable: boolean): { state: V8CalibrationState; pending: PendingPlay[]; managerAvailable: boolean } {
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

    if (nextManagerAvailable && next.teams.away.energy >= MANAGER_COST && next.period >= 3) {
      const zone = [...ZONES]
        .filter((candidate) => occupiedPlayerSlots(next, 'away', candidate, pending) < 4)
        .sort((a, b) => calibrationPlayersInZone(next, 'away', b).length - calibrationPlayersInZone(next, 'away', a).length)[0];
      if (zone) {
        next = {
          ...next,
          teams: {
            ...next.teams,
            away: { ...next.teams.away, energy: next.teams.away.energy - MANAGER_COST },
          },
        };
        pending.push({ kind: 'manager', side: 'away', zone, cost: MANAGER_COST });
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
  const portrait = portraitSrc({ id: card.sourceCardId ?? card.id, name: card.realName, position: card.position });
  return (
    <button
      type="button"
      data-testid={`player-card-${card.id}`}
      data-card-id={card.id}
      className={`v8-card${selected ? ' is-selected' : ''}${affordable ? '' : ' is-unaffordable'}`}
      aria-pressed={selected}
      aria-label={`${card.realName}, ${card.position}, ${calibrationPlayCost(card)} Energy, ${card.printedAttack} ATT, ${card.printedDefence} DEF, ${card.actionName}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <span className="v8-card__art" aria-hidden="true"><i>{card.matchName.slice(0, 2).toUpperCase()}</i>{portrait && <img src={portrait} alt="" draggable={false} />}</span>
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

function DeployedChip({ state, side, runtimeId, fresh = false, onMove }: { state: V8CalibrationState; side: V8CalibrationSide; runtimeId: string; fresh?: boolean; onMove?: () => void }) {
  const player = state.players[runtimeId]!;
  const card = calibrationPlayerCard(player);
  const portrait = portraitSrc({ id: card.sourceCardId ?? card.id, name: card.realName, position: card.position });
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
      className={`v8-chip${side === 'away' ? ' v8-chip--away' : ''}${fresh ? ' is-fresh' : ''}${suppressed ? ' is-suppressed' : ''}`}
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
      <span className="v8-chip__portrait" aria-hidden="true"><i>{card.matchName.slice(0, 1)}</i>{portrait && <img src={portrait} alt="" draggable={false} />}</span>
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
      <b>{attack}/{defence}</b>
      <small>{suppressed ? 'NO ACTION' : moveable ? (moved ? 'MOVE USED' : 'MOVEABLE') : card.actionName}</small>
    </span>
  );
}

function recapHighlights(state: V8CalibrationState, period: number): string[] {
  const useful = new Set(['player_moved', 'action_ignored', 'action_suppressed', 'modifier_changed', 'tactical_generated', 'tactical_modified', 'chance_resolved', 'chance_cancelled']);
  const events = state.events.filter((event) => event.period === period && useful.has(event.type));
  return events.slice(-3).map((event) => event.text);
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

function ContestComparison({
  axis,
  user,
  cpu,
  compact = false,
}: {
  axis: 'ATT' | 'DEF';
  user: number;
  cpu: number;
  compact?: boolean;
}) {
  const attack = axis === 'ATT' ? user : cpu;
  const defence = axis === 'ATT' ? cpu : user;
  const margin = user - cpu;
  const goals = goalsFromAttackDefence(attack, defence);
  return (
    <div
      className={`v8-contest-comparison is-${axis.toLowerCase()}${axis === 'ATT' && goals ? ' is-converting' : ''}${axis === 'DEF' && !goals && margin >= 0 ? ' is-holding' : ''}${margin < 0 ? ' is-behind' : ''}${compact ? ' is-compact' : ''}`}
      data-axis={axis}
      data-margin={margin}
    >
      <header>{axis}</header>
      <span><small>YOU</small><b>{user}</b><i>{axis}</i></span>
      <em>VS</em>
      <span><small>CPU</small><b>{cpu}</b><i>{axis === 'ATT' ? 'DEF' : 'ATT'}</i></span>
      <strong>{signed(margin)} <small>{goals}{axis === 'ATT' ? 'G' : 'GA'}</small></strong>
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

function GoalContest({ side, attack, defence, goals }: { side: 'YOU' | 'CPU'; attack: number; defence: number; goals: number }) {
  const margin = Math.max(0, attack - defence);
  const thresholdFill = Math.min(100, Math.round((margin / V8_GOAL_BAND) * 100));
  return (
    <div className={`v8-goal-contest${goals ? ' is-converted' : ''}`} data-margin={margin} data-goals={goals}>
      <span><b>{side}</b> {attack} ATT <i>vs</i> {defence} DEF</span>
      <div className="v8-goal-meter" aria-label={`${side} attack margin ${margin} of ${V8_GOAL_BAND} needed for a goal`}>
        <i style={{ width: `${thresholdFill}%` }} />
        <b>+{V8_GOAL_BAND}</b>
      </div>
      <small>{goals ? `${goals} FULL THRESHOLD${goals === 1 ? '' : 'S'}` : `+${margin} / +${V8_GOAL_BAND}`}</small>
    </div>
  );
}

function GoalBurst({ side, goals }: { side: 'YOU' | 'CPU'; goals: number }) {
  if (!goals) return null;
  const labels = goals <= 3
    ? Array.from({ length: goals }, (_, index) => index === 0 ? 'GOAL' : `+${index + 1}`)
    : ['GOAL', '+2', `+${goals}`];
  return (
    <div className={`v8-goal-burst v8-goal-burst--${side.toLowerCase()}`} aria-label={`${side} score ${goals} goal${goals === 1 ? '' : 's'}`}>
      {labels.map((label, index) => <span key={label} style={{ animationDelay: `${1.45 + index * .13}s` }}><small>{side}</small><b>{label}</b></span>)}
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

export default function V8CalibrationLab() {
  const [homeSquad, setHomeSquad] = useState<V8CalibrationSquadKey>(DEFAULT_HOME_SQUAD);
  const [awaySquad, setAwaySquad] = useState<V8CalibrationSquadKey>(DEFAULT_AWAY_SQUAD);
  const [seed, setSeed] = useState(8082026);
  const [state, setState] = useState<V8CalibrationState>(() => createSquadMatch(DEFAULT_HOME_SQUAD, DEFAULT_AWAY_SQUAD, 8082026));
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [pending, setPending] = useState<PendingPlay[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [homeManagerAvailable, setHomeManagerAvailable] = useState(true);
  const [awayManagerAvailable, setAwayManagerAvailable] = useState(true);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [recaps, setRecaps] = useState<PeriodRecap[]>([]);
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

  const homePlayers = calibrationHandPlayers(state, 'home');
  const homeTacticals = calibrationHandTacticals(state, 'home');
  const totalsHome = calibrationTeamTotals(state, 'home');
  const totalsAway = calibrationTeamTotals(state, 'away');
  const currentPriority = useMemo(() => priority(state, homeScore, awayScore, seed + state.period * 101), [state, homeScore, awayScore, seed]);
  const homeCostProfile = useMemo(() => calibrationSquadCostProfile(homeSquad), [homeSquad]);
  const awayCostProfile = useMemo(() => calibrationSquadCostProfile(awaySquad), [awaySquad]);
  const latestRecap = recaps.at(-1);
  const latestTelemetry = telemetryPeriods.at(-1);
  const periodEnergy = calibrationEnergyForPeriod(state.period);

  useEffect(() => {
    if (!introVisible) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(() => setIntroVisible(false), reducedMotion ? 450 : 1650);
    return () => window.clearTimeout(timeout);
  }, [introVisible]);

  useEffect(() => {
    if (!resolutionMoment) return;
    const timeout = window.setTimeout(() => setResolutionMoment(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [resolutionMoment]);

  const reset = (nextHomeSquad = homeSquad, nextAwaySquad = awaySquad, nextSeed = seed + 31) => {
    setHomeSquad(nextHomeSquad);
    setAwaySquad(nextAwaySquad);
    setSeed(nextSeed);
    setState(createSquadMatch(nextHomeSquad, nextAwaySquad, nextSeed));
    setHomeScore(0);
    setAwayScore(0);
    setPending([]);
    setSelection(null);
    setHomeManagerAvailable(true);
    setAwayManagerAvailable(true);
    setUndoStack([]);
    setRecaps([]);
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
    if (finished || revealPhase) return false;
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
    if (finished || revealPhase || !homeManagerAvailable || state.teams.home.energy < MANAGER_COST) return false;
    if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
    rememberUndo();
    setState({
      ...state,
      teams: { ...state.teams, home: { ...state.teams.home, energy: state.teams.home.energy - MANAGER_COST } },
    });
    setPending((plays) => [...plays, { kind: 'manager', side: 'home', zone, cost: MANAGER_COST }]);
    setHomeManagerAvailable(false);
    setSelection(null);
    return true;
  };

  const queueTacticalToZone = (cardId: string, zone: V8Zone): boolean => {
    if (finished || revealPhase) return false;

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
    if (!selection || finished || revealPhase) return;

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
        && state.teams.home.energy >= MANAGER_COST
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
    if (finished || revealPhase || !ZONES.some((zone) => isHandDragZoneLegal(drag, zone))) return;

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
    if (revealPhase) return;
    const snapshot = undoStack.at(-1);
    if (!snapshot) return;
    setState(snapshot.state);
    setHomeManagerAvailable(snapshot.homeManagerAvailable);
    setPending(snapshot.pending);
    setUndoStack((stack) => stack.slice(0, -1));
    setSelection(null);
  };

  const endPeriod = () => {
    if (finished || revealPhase) return;
    const cpu = planCpu(state, awayManagerAvailable);
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
    const actionLine = [...resolved.events].reverse().find((event) => (
      event.period === period
      && event.type === 'action_triggered'
      && !event.text.includes(' REVEAL:')
    ))?.text ?? null;
    const lastCommittedTactical = [...allPending].reverse().find((play) => play.kind === 'tactical');
    const tacticalLine = lastCommittedTactical?.kind === 'tactical'
      ? `${lastCommittedTactical.card.name} → ${lastCommittedTactical.zone}`
      : null;
    const revealedPlayerIds = allPending.flatMap((play) => play.kind === 'player' ? [play.cardId] : []);
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

    setRecaps((items) => [...items, {
      period,
      label: periodLabel,
      homeGoals: scoredHome,
      awayGoals: scoredAway,
      homeAttack: home.attack,
      awayDefence: away.defence,
      awayAttack: away.attack,
      homeDefence: home.defence,
      scoreAfter: `${nextHomeScore}–${nextAwayScore}`,
      highlights: recapHighlights(resolved, period),
    }]);

    setResolutionMoment({
      id: resolutionSequence.current += 1,
      period,
      label: periodLabel,
      reveal,
      actionLine,
      tacticalLine,
      homeGoals: scoredHome,
      awayGoals: scoredAway,
      homeAttack: home.attack,
      awayDefence: away.defence,
      awayAttack: away.attack,
      homeDefence: home.defence,
      nextHomeScore,
      nextAwayScore,
      nextLabel: wasFinal ? 'FULL TIME' : PERIOD_LABELS[period] ?? 'NEXT PERIOD',
      nextEnergy: wasFinal ? null : calibrationEnergyForPeriod(period + 1),
      revealedPlayerIds,
      final: wasFinal,
    });

    let ended = endV8CalibrationPeriod(resolved, { home: nextHomeScore, away: nextAwayScore });
    if (!wasFinal) ended = withCalibrationEnergy(ended);
    if (wasFinal) {
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
    );
    setState(resolved);
    setPending([]);
    finishRevealRef.current(revealPhase, resolved);
  };

  useEffect(() => {
    if (!revealPhase) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reducedMotion ? 60 : revealPhase.stage === 'commitment' ? 520 : 620;

    const timeout = window.setTimeout(() => {
      if (revealPhase.nextIndex < revealPhase.orderedPlays.length) {
        const play = revealPhase.orderedPlays[revealPhase.nextIndex]!;
        const next = resolveRevealBeat(
          revealPhase.resolvedState,
          play,
          revealPhase.nextIndex + 1,
          revealPhase.orderedPlays.length,
        );
        setState(next.state);
        if (play.side === 'home') {
          const key = pendingPlayKey(play);
          setPending((plays) => plays.filter((candidate) => pendingPlayKey(candidate) !== key));
        }
        setRevealPhase({
          ...revealPhase,
          stage: 'cards',
          resolvedState: next.state,
          nextIndex: revealPhase.nextIndex + 1,
          activeBeat: next.beat,
        });
        return;
      }
      finishRevealRef.current(revealPhase, revealPhase.resolvedState);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [revealPhase]);

  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedPlayerCost = selectedPlayer ? calibrationPlayCost(selectedPlayer) : null;
  const selectedPlayerUnaffordable = selectedPlayerCost !== null && selectedPlayerCost > state.teams.home.energy;
  const selectedTactical = selection?.kind === 'tactical' ? calibrationHandTacticals(state, 'home').find((card) => card.id === selection.cardId) ?? null : null;
  const draggedPlayer = handDrag?.kind === 'player' ? getV8CalibrationPlayer(handDrag.cardId) : null;
  const draggedTactical = handDrag?.kind === 'tactical' ? calibrationHandTacticals(state, 'home').find((card) => card.id === handDrag.cardId) ?? null : null;
  const draggedPlayerPortrait = draggedPlayer ? portraitSrc({ id: draggedPlayer.sourceCardId ?? draggedPlayer.id, name: draggedPlayer.realName, position: draggedPlayer.position }) : null;
  const managerPortrait = managerPortraitSrc('control');
  const stagedFreshPlayerIds = revealPhase?.activeBeat?.cardId ? [revealPhase.activeBeat.cardId] : [];
  const placementImpacts = useMemo(() => {
    if (!selectedPlayer || selectedPlayerUnaffordable || revealPhase || finished) return [];
    return ZONES.flatMap((zone) => {
      if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return [];
      try {
        return [previewPlayerPlacement(state, pending, selectedPlayer, zone)];
      } catch {
        return [];
      }
    });
  }, [finished, pending, revealPhase, selectedPlayer, selectedPlayerUnaffordable, state]);
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
            ? state.teams.home.energy < MANAGER_COST
              ? `${MANAGER_COST} ENERGY REQUIRED · ${state.teams.home.energy} AVAILABLE`
              : 'DRAG MANAGER SKILL TO A ZONE'
            : selectedTactical
              ? `DRAG ${selectedTactical.name.toUpperCase()} TO A HIGHLIGHTED ZONE`
              : selectedPlayer
                ? `DRAG ${selectedPlayer.matchName} TO A ZONE`
                : 'DRAG A CARD TO THE PITCH';

  return (
    <main className={`v8-shell${handDrag ? ' is-dragging' : ''}${debugOpen ? ' is-debug-open' : ''}${revealPhase ? ' is-revealing' : ''}${resolutionMoment ? ' is-resolving' : ''}${resolutionMoment?.homeGoals ? ' has-home-goal' : ''}${resolutionMoment?.awayGoals ? ' has-away-goal' : ''}`}>
      {introVisible && (
        <button className="v8-match-intro" type="button" onClick={() => setIntroVisible(false)} data-testid="v8-match-intro" aria-label="Kickoff Clash match introduction. Tap to skip.">
          <small>KICKOFF CLASH</small>
          <span className="v8-match-intro__fixture">
            <i className="v8-match-intro__team v8-match-intro__team--home"><b>KC</b><strong>YOU</strong><em>HOME</em></i>
            <b className="v8-match-intro__versus">VS</b>
            <i className="v8-match-intro__team v8-match-intro__team--away"><b>KC</b><strong>CPU</strong><em>AWAY</em></i>
          </span>
          <span className="v8-match-intro__whistle">MATCH 01 · FOUR PERIODS</span>
        </button>
      )}

      <header className="v8-scorebar">
        <div className={`v8-scoreteam v8-scoreteam--home${resolutionMoment?.homeGoals ? ' is-scoring' : ''}`}>
          <small>YOU</small>
          <span><strong key={`home-${resolutionMoment?.id ?? 0}-${homeScore}`}>{homeScore}</strong></span>
        </div>
        <section>
          <b key={`period-${state.period}-${finished}`}>{finished ? 'FULL TIME' : PERIOD_LABELS[state.period - 1]}</b>
          <span>{finished ? 'MATCH COMPLETE' : 'MATCH 01'}</span>
        </section>
        <div className={`v8-scoreteam v8-scoreteam--away${resolutionMoment?.awayGoals ? ' is-scoring' : ''}`}>
          <small>CPU</small>
          <span><strong key={`away-${resolutionMoment?.id ?? 0}-${awayScore}`}>{awayScore}</strong></span>
        </div>
      </header>

      <section className="v8-live-contests" aria-label="Current scoring contests" data-testid="v8-live-contests">
        <ContestComparison axis="ATT" user={totalsHome.attack} cpu={totalsAway.defence} />
        <ContestComparison axis="DEF" user={totalsHome.defence} cpu={totalsAway.attack} />
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

      <section className={`v8-pitch${revealPhase ? ' is-revealing' : ''}${resolutionMoment ? ' is-resolving' : ''}`} aria-label="DEF MID ATT board"><div className="v8-pitch__stadium" aria-hidden="true"><i /><i /><i /></div>
        {ZONES.map((zone) => {
          const homeZone = calibrationPlayersInZone(state, 'home', zone);
          const awayZone = calibrationPlayersInZone(state, 'away', zone);
          const hiddenCpuCommitments = revealPhase
            ? (revealPhase.stage === 'commitment'
                ? revealPhase.orderedPlays
                : revealPhase.orderedPlays.slice(revealPhase.nextIndex))
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
          if (selection?.kind === 'manager') guide = playerOccupancy >= 4 ? 'FULL' : state.teams.home.energy < MANAGER_COST ? 'NO ENERGY' : 'MANAGER';
          if (selection?.kind === 'move') guide = 'MOVE';

          return (
            <button
              key={zone}
              type="button"
              data-v8-zone={zone}
              className={`v8-zone${revealPhase?.activeBeat?.zone === zone ? ' is-resolving-zone' : ''}${placementImpact ? ' has-placement-preview' : ''}${focusedPlacementImpact?.zone === zone ? ' is-placement-focus' : ''}${handDrag ? isHandDragZoneLegal(handDrag, zone) ? ' is-drag-target' : ' is-drag-disabled' : ''}${handDrag?.overZone === zone && isHandDragZoneLegal(handDrag, zone) ? ' is-drag-over' : ''}`}
              onClick={() => queueToZone(zone)}
            >
              <div className="v8-zone__heading"><strong>{zone}</strong><span data-testid={placementImpact ? `v8-placement-zone-${zone}` : undefined} data-penalty={placementImpact?.effectivePenalty}>{guide}</span></div>
              <div className="v8-zone__side v8-zone__side--away">
                {awayZone.map((player) => <DeployedChip key={player.runtimeId} state={state} side="away" runtimeId={player.runtimeId} fresh={stagedFreshPlayerIds.includes(player.cardId) || resolutionMoment?.revealedPlayerIds.includes(player.cardId) === true} />)}
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
                  <DeployedChip key={player.runtimeId} state={state} side="home" runtimeId={player.runtimeId} fresh={stagedFreshPlayerIds.includes(player.cardId) || resolutionMoment?.revealedPlayerIds.includes(player.cardId) === true} onMove={() => setSelection({ kind: 'move', runtimeId: player.runtimeId })} />
                ))}
                {queuedPlayers.map((play) => play.kind === 'player' ? (
                  <span key={`queued-${play.cardId}`} className="v8-chip v8-chip--transient"><span className="v8-card__sr">{getV8CalibrationPlayer(play.cardId).realName}</span>{getV8CalibrationPlayer(play.cardId).matchName}<b>PLAYER · QUEUED</b></span>
                ) : null)}
                {queuedManager && <span className="v8-chip v8-chip--transient">{MANAGER_NAME}<b>MANAGER · QUEUED</b></span>}
                {Array.from({ length: Math.max(0, 4 - playerOccupancy) }).map((_, index) => <i key={`home-${zone}-${index}`} />)}
              </div>
            </button>
          );
        })}
        {revealPhase && (
          <aside
            className={`v8-reveal-stage v8-reveal-stage--${revealPhase.stage}`}
            data-testid={revealPhase.stage === 'commitment' ? 'v8-opponent-commitment' : 'v8-reveal-stage'}
            data-reveal-index={revealPhase.activeBeat?.index}
            data-reveal-total={revealPhase.activeBeat?.total}
            data-reveal-zone={revealPhase.activeBeat?.zone}
            key={`${revealPhase.id}-${revealPhase.stage}-${revealPhase.nextIndex}`}
            aria-live="polite"
          >
            {revealPhase.stage === 'commitment' ? (
              <>
                <small>{PERIOD_LABELS[state.period - 1]} · COMMITMENT</small>
                <strong>OPPONENT LOCKED IN</strong>
                <span>{revealPhase.allPending.filter((play) => play.side === 'away').length} HIDDEN</span>
              </>
            ) : (
              <>
                <small>REVEAL {revealPhase.activeBeat?.index}/{revealPhase.activeBeat?.total} · {revealPhase.activeBeat?.side === 'home' ? 'YOU' : 'CPU'}</small>
                <strong>{revealPhase.activeBeat?.name}</strong>
                <span>{revealPhase.activeBeat?.action}</span>
                <em>{revealPhase.activeBeat?.effect}</em>
              </>
            )}
          </aside>
        )}
        {revealPhase && (
          <button className="v8-reveal-skip" type="button" onClick={skipReveal} aria-label="Skip reveal sequence">
            SKIP
          </button>
        )}
        {resolutionMoment && (
          <aside className="v8-resolution" data-testid="v8-resolution" key={resolutionMoment.id} aria-live="polite">
            {resolutionMoment.homeGoals + resolutionMoment.awayGoals > 0 && (
              <i className={`v8-goal-flash${resolutionMoment.homeGoals && resolutionMoment.awayGoals ? ' is-both' : resolutionMoment.homeGoals ? ' is-home' : ' is-away'}`} aria-hidden="true" />
            )}
            <div className="v8-resolution__beat v8-resolution__beat--reveal">
              <small>{resolutionMoment.label}</small>
              <strong>{resolutionMoment.reveal.first === 'home' ? 'YOU' : 'CPU'} REVEAL FIRST</strong>
              <span>{resolutionMoment.reveal.reason}</span>
            </div>
            <div className="v8-resolution__beat v8-resolution__beat--action">
              <small>{resolutionMoment.tacticalLine ? 'TACTICAL' : resolutionMoment.actionLine ? 'ACTION' : 'BOARD'}</small>
              <strong>{resolutionMoment.tacticalLine ?? resolutionMoment.actionLine ?? 'BOARD RESOLVED'}</strong>
              <span>{resolutionMoment.tacticalLine ? 'PLAY RESOLVED' : resolutionMoment.actionLine ? 'ACTION FIRED' : 'POSITIONS LOCKED'}</span>
            </div>
            <div className="v8-resolution__beat v8-resolution__beat--score" data-testid="v8-score-payoff" data-goals={resolutionMoment.homeGoals + resolutionMoment.awayGoals}>
              <div className="v8-resolution__matchups">
                <GoalContest side="YOU" attack={resolutionMoment.homeAttack} defence={resolutionMoment.awayDefence} goals={resolutionMoment.homeGoals} />
                <GoalContest side="CPU" attack={resolutionMoment.awayAttack} defence={resolutionMoment.homeDefence} goals={resolutionMoment.awayGoals} />
              </div>
              {resolutionMoment.homeGoals + resolutionMoment.awayGoals === 0 ? (
                <strong className="v8-no-goals">NO GOALS</strong>
              ) : (
                <div className="v8-goal-payoff" data-testid="v8-goal-payoff">
                  <GoalBurst side="YOU" goals={resolutionMoment.homeGoals} />
                  <GoalBurst side="CPU" goals={resolutionMoment.awayGoals} />
                </div>
              )}
              <span>FULL +7 ATT MARGINS CONVERT · TEAM ATT</span>
            </div>
            <div className="v8-resolution__beat v8-resolution__beat--next">
              <small>{resolutionMoment.final ? 'FULL TIME' : 'NEXT PERIOD'}</small>
              <strong>{resolutionMoment.nextHomeScore}–{resolutionMoment.nextAwayScore}</strong>
              <span>{resolutionMoment.nextLabel}{resolutionMoment.nextEnergy !== null ? ` · ${resolutionMoment.nextEnergy} ENERGY` : ''}</span>
            </div>
          </aside>
        )}
      </section>

      <section className="v8-commit">
        <EnergyMeter current={state.teams.home.energy} maximum={periodEnergy} />
        <div className="v8-commit__decision">
          {selectedPlayer && focusedPlacementImpact ? (
            <PlacementPreview card={selectedPlayer} impact={focusedPlacementImpact} />
          ) : (
            <>
              <strong>{revealPhase ? revealPhase.stage === 'commitment' ? 'OPPONENT COMMITTED' : 'REVEALING' : interactionLabel}</strong>
              <span>{currentPriority.first === 'home' ? 'YOU REVEAL FIRST' : 'CPU REVEALS FIRST'} · {currentPriority.reason} · Tacticals use no player slot.</span>
              {pending.filter((play) => play.kind === 'tactical').map((play) => play.kind === 'tactical' ? <span key={play.card.id}>{play.card.name} → {play.zone} · {tacticalLabel(play.card, play.zone)}</span> : null)}
            </>
          )}
        </div>
        <button onClick={undo} disabled={!undoStack.length || Boolean(revealPhase)}>UNDO</button>
        <button className="v8-primary" onClick={endPeriod} disabled={finished || Boolean(revealPhase)}>{revealPhase ? 'LOCKED' : 'END PERIOD'}</button>
      </section>

      {latestRecap && (
        <aside className="v8-period-result" data-testid="v8-period-result" aria-label={`${latestRecap.label} result`}>
          <header>
            <span><small>LAST PERIOD</small><strong>{latestRecap.label}</strong></span>
            <b>{latestRecap.homeGoals}–{latestRecap.awayGoals}</b>
            <em>MATCH {latestRecap.scoreAfter}</em>
          </header>
          <div className="v8-period-result__contests">
            <ContestComparison axis="ATT" user={latestRecap.homeAttack} cpu={latestRecap.awayDefence} compact />
            <ContestComparison axis="DEF" user={latestRecap.homeDefence} cpu={latestRecap.awayAttack} compact />
          </div>
          {latestRecap.highlights.length > 0 && (
            <div className="v8-period-result__changes">
              <small>KEY CHANGES</small>
              {latestRecap.highlights.slice(-2).map((text, index) => <span key={`${latestRecap.period}-${index}-${text}`}>{text}</span>)}
            </div>
          )}
        </aside>
      )}

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
        <div className="v8-hand">
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
          {homeManagerAvailable && (
            <button
              type="button"
              data-testid="manager-card"
              className={`v8-card v8-card--manager${selection?.kind === 'manager' ? ' is-selected' : ''}${state.teams.home.energy >= MANAGER_COST ? '' : ' is-unaffordable'}`}
              aria-pressed={selection?.kind === 'manager'}
              onClick={() => {
                if (consumeSuppressedClick('manager', 'manager')) return;
                setSelection({ kind: 'manager' });
              }}
              onPointerDown={(event) => startHandDrag(event, { kind: 'manager', cardId: 'manager', label: 'MANAGER SKILL' })}
            >
              <span className="v8-card__art v8-card__art--manager" aria-hidden="true"><i>CO</i>{managerPortrait && <img src={managerPortrait} alt="" draggable={false} />}</span>
              <span className="v8-card__cost">{MANAGER_COST}</span>
              <span className="v8-card__position">MANAGER</span>
              <strong>{MANAGER_NAME}</strong>
              <small>Occupies a player slot while committed. On reveal: DEF +2 DEF/player · MID +1/+1 · ATT +2 ATT/player. Then disappears.</small>
            </button>
          )}
        </div>
      </section>

      <button
        type="button"
        className="v8-debug-toggle"
        aria-expanded={debugOpen}
        onClick={() => setDebugOpen((open) => !open)}
      >
        {debugOpen ? 'CLOSE LAB TOOLS' : 'OPEN LAB TOOLS'}
      </button>

      {handDrag?.moved && (
        <div
          className={`v8-drag-ghost${handDrag.kind === 'tactical' ? ' v8-card--chance' : handDrag.kind === 'manager' ? ' v8-card--manager' : ''}`}
          data-testid="v8-drag-ghost"
          style={{ left: handDrag.x, top: handDrag.y }}
          aria-hidden="true"
        >
          <span className={`v8-card__art${handDrag.kind === 'tactical' ? ' v8-card__art--tactical' : handDrag.kind === 'manager' ? ' v8-card__art--manager' : ''}`}><i>{handDrag.kind === 'player' ? draggedPlayer?.matchName.slice(0, 2).toUpperCase() : handDrag.kind === 'tactical' ? 'TX' : 'CO'}</i>{handDrag.kind === 'player' && draggedPlayerPortrait && <img src={draggedPlayerPortrait} alt="" draggable={false} />}{handDrag.kind === 'manager' && managerPortrait && <img src={managerPortrait} alt="" draggable={false} />}</span>
          <span className="v8-card__cost">{handDrag.kind === 'player' && draggedPlayer
            ? calibrationPlayCost(draggedPlayer)
            : handDrag.kind === 'tactical' && draggedTactical
              ? Math.min(...tacticalDefinition(draggedTactical.type).eligibleZones.map((zone) => previewCalibrationTacticalCost(state, 'home', draggedTactical, zone)))
              : MANAGER_COST}</span>
          <span className="v8-card__position">{handDrag.kind === 'player' ? draggedPlayer?.position : handDrag.kind === 'tactical' ? 'TACTICAL' : 'MANAGER'}</span>
          <strong>{handDrag.kind === 'player' ? draggedPlayer?.matchName : handDrag.kind === 'tactical' ? draggedTactical?.name : MANAGER_NAME}</strong>
          <small><b>{handDrag.kind === 'player' ? draggedPlayer?.actionName : handDrag.kind === 'tactical' ? draggedTactical ? tacticalLabel(draggedTactical) : '' : 'MANAGER SKILL'}</b></small>
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

      {finished && (
        <div className="v8-result">
          <small>FULL TIME</small>
          <strong>{homeScore}–{awayScore}</strong>
          <b>{homeScore > awayScore ? 'VICTORY' : homeScore < awayScore ? 'DEFEAT' : 'DRAW'}</b>
          <button onClick={() => reset(homeSquad, awaySquad, seed + 31)}>PLAY AGAIN</button>
        </div>
      )}
    </main>
  );
}
