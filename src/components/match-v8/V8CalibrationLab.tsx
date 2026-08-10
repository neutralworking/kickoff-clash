'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  buildV8CalibrationMatchTelemetry,
  calibrationHandPlayers,
  calibrationHandTacticals,
  calibrationPlayerCard,
  calibrationPlayersInZone,
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
  planV8CalibrationWindow,
  previewCalibrationTacticalCost,
  removeCalibrationPlayerFromHand,
  resolveCommittedCalibrationTactical,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  spendCalibrationTacticalFromHand,
  tacticalDefinition,
  windowEligibleCalibrationTacticals,
  V8_CALIBRATION_SQUAD_KEYS,
  type V8CalibrationMatchTelemetry,
  type V8CalibrationPeriodTelemetry,
  type V8CalibrationPlayerCard,
  type V8CalibrationSide,
  type V8CalibrationSquadKey,
  type V8CalibrationState,
  type V8CalibrationWindowPlay,
  type V8TacticalCardInstance,
  type V8Zone,
} from '@/engine-v8';
import { calibrationEnergyForPeriod, calibrationPlayCost } from '@/engine-v8/calibration-balance';
import { managerPortraitSrc, portraitSrc } from '../cards/portrait';
import './v8lab.css';
import './v8recap.css';

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const PERIOD_LABELS = ['0–22', '22–HT', 'HT–66', '66–FT'] as const;
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

/**
 * The Generated-Tactical Window pause: reveals have resolved, scoring has not run yet, and the
 * human side holds at least one affordable this-period-generated Tactical. CPU window plays were
 * already chosen from the same post-reveal state, so both sides' choices are blind.
 */
type WindowPhase = {
  resolved: V8CalibrationState;
  allPending: PendingPlay[];
  cpuPlays: V8CalibrationWindowPlay[];
  cpuManagerAvailable: boolean;
  reveal: RevealOrder;
  queued: Array<{ cardId: string; name: string; zone: V8Zone; cost: number }>;
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
      <span className="v8-chip__name">{card.matchName}</span>
      <b>{attack}/{defence}</b>
      <small>{suppressed ? 'NO ACTION' : moveable ? (moved ? 'MOVE USED' : 'MOVEABLE') : card.actionName}</small>
    </span>
  );
}

function recapHighlights(state: V8CalibrationState, period: number): string[] {
  const useful = new Set(['player_moved', 'action_ignored', 'action_suppressed', 'modifier_changed', 'tactical_generated', 'tactical_modified', 'window_tactical_played', 'chance_resolved', 'chance_cancelled']);
  // Window plays are their own labelled recap step ("Post-reveal: …"), never folded into
  // commitment-phase lines, so always keep them alongside the trailing highlights.
  const events = state.events.filter((event) => event.period === period && useful.has(event.type));
  const windowLines = events.filter((event) => event.type === 'window_tactical_played').map((event) => event.text);
  const rest = events.filter((event) => event.type !== 'window_tactical_played').map((event) => event.text);
  return [...rest.slice(-Math.max(0, 6 - windowLines.length)), ...windowLines];
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
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
  const [windowPhase, setWindowPhase] = useState<WindowPhase | null>(null);
  const [recaps, setRecaps] = useState<PeriodRecap[]>([]);
  const [telemetryPeriods, setTelemetryPeriods] = useState<V8CalibrationPeriodTelemetry[]>([]);
  const [matchTelemetry, setMatchTelemetry] = useState<V8CalibrationMatchTelemetry | null>(null);
  const [finished, setFinished] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);
  const [resolutionMoment, setResolutionMoment] = useState<ResolutionMoment | null>(null);
  const handDragRef = useRef<HandDragState | null>(null);
  const suppressHandClick = useRef<string | null>(null);
  const resolutionSequence = useRef(0);

  const homePlayers = calibrationHandPlayers(state, 'home');
  const homeTacticals = calibrationHandTacticals(state, 'home');
  const totalsHome = calibrationTeamTotals(state, 'home');
  const totalsAway = calibrationTeamTotals(state, 'away');
  const currentPriority = useMemo(() => priority(state, homeScore, awayScore, seed + state.period * 101), [state, homeScore, awayScore, seed]);
  const homeCostProfile = useMemo(() => calibrationSquadCostProfile(homeSquad), [homeSquad]);
  const awayCostProfile = useMemo(() => calibrationSquadCostProfile(awaySquad), [awaySquad]);
  const latestRecap = recaps.at(-1);
  const latestTelemetry = telemetryPeriods.at(-1);

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
  };

  const rememberUndo = () => {
    setUndoStack((stack) => [...stack, { state, homeManagerAvailable, pending }]);
  };

  const queuePlayerToZone = (cardId: string, zone: V8Zone): boolean => {
    if (finished || windowPhase) return false;
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
    if (finished || windowPhase || !homeManagerAvailable || state.teams.home.energy < MANAGER_COST) return false;
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
    if (finished) return false;

    if (windowPhase) {
      if (windowPhase.queued.some((play) => play.cardId === cardId)) return false;
      const tactical = windowEligibleCalibrationTacticals(windowPhase.resolved, 'home').find((card) => card.id === cardId);
      if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return false;
      const remainingEnergy = windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0);
      const cost = previewCalibrationTacticalCost(windowPhase.resolved, 'home', tactical, zone);
      if (cost > remainingEnergy) return false;
      setWindowPhase((phase) => (phase ? {
        ...phase,
        queued: [...phase.queued, { cardId: tactical.id, name: tactical.name, zone, cost }],
      } : phase));
      setSelection(null);
      return true;
    }

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
    if (!selection || finished) return;

    if (selection.kind === 'move') {
      if (windowPhase) return;
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

    // Mobile pitch is laid out in football depth: ATT at the opponent end, MID centrally,
    // DEF nearest the user's goal. Resolve the finger position against those thirds directly
    // instead of relying on nested slot/label DOM hitboxes.
    const progress = (y - rect.top) / rect.height;
    if (progress < 1 / 3) return 'ATT';
    if (progress < 2 / 3) return 'MID';
    return 'DEF';
  };

  const isHandDragZoneLegal = (drag: Pick<HandDragState, 'kind' | 'cardId'>, zone: V8Zone): boolean => {
    if (drag.kind === 'player') {
      if (windowPhase || occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return false;
      return calibrationPlayCost(getV8CalibrationPlayer(drag.cardId)) <= state.teams.home.energy;
    }

    if (drag.kind === 'manager') {
      return !windowPhase
        && homeManagerAvailable
        && state.teams.home.energy >= MANAGER_COST
        && occupiedPlayerSlots(state, 'home', zone, pending) < 4;
    }

    const sourceState = windowPhase?.resolved ?? state;
    const tactical = calibrationHandTacticals(sourceState, 'home').find((card) => card.id === drag.cardId);
    if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return false;
    if (windowPhase?.queued.some((play) => play.cardId === drag.cardId)) return false;
    const remainingEnergy = windowPhase
      ? windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0)
      : state.teams.home.energy;
    return previewCalibrationTacticalCost(sourceState, 'home', tactical, zone) <= remainingEnergy;
  };

  const startHandDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    drag: Pick<HandDragState, 'kind' | 'cardId' | 'label'>,
  ) => {
    setSelection(drag.kind === 'manager' ? { kind: 'manager' } : { kind: drag.kind, cardId: drag.cardId });
    if (finished || !ZONES.some((zone) => isHandDragZoneLegal(drag, zone))) return;

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
    const snapshot = undoStack.at(-1);
    if (!snapshot) return;
    setState(snapshot.state);
    setHomeManagerAvailable(snapshot.homeManagerAvailable);
    setPending(snapshot.pending);
    setUndoStack((stack) => stack.slice(0, -1));
    setSelection(null);
  };

  const endPeriod = () => {
    if (finished || windowPhase) return;
    const cpu = planCpu(state, awayManagerAvailable);
    const allPending = [...pending, ...cpu.pending];
    const reveal = priority(cpu.state, homeScore, awayScore, seed + state.period * 101);
    const first = allPending.filter((play) => play.side === reveal.first);
    const second = allPending.filter((play) => play.side !== reveal.first);
    let resolved = resolveSequence(cpu.state, first);
    resolved = resolveSequence(resolved, second);
    const period = resolved.period;
    const periodLabel = PERIOD_LABELS[period - 1];
    resolved.events.push({
      type: 'action_triggered',
      period,
      text: `${periodLabel} REVEAL: ${reveal.first === 'home' ? 'YOU' : 'CPU'} first · ${reveal.reason}.`,
    });

    // The Generated-Tactical Window: CPU choices are made blind from the post-reveal state.
    // Pause for the human only when they actually hold an affordable this-period Tactical;
    // otherwise the window resolves silently and the period scores in one click as before.
    const cpuWindowPlays = planV8CalibrationWindow(resolved, 'away');
    const humanCanPlay = windowEligibleCalibrationTacticals(resolved, 'home').some((card) => (
      tacticalDefinition(card.type).eligibleZones
        .some((zone) => previewCalibrationTacticalCost(resolved, 'home', card, zone) <= resolved.teams.home.energy)
    ));
    if (humanCanPlay) {
      setState(resolved);
      setPending([]);
      setUndoStack([]);
      setSelection(null);
      setWindowPhase({ resolved, allPending, cpuPlays: cpuWindowPlays, cpuManagerAvailable: cpu.managerAvailable, reveal, queued: [] });
      return;
    }
    finishPeriod(resolved, allPending, cpuWindowPlays, [], cpu.managerAvailable, reveal);
  };

  const finishPeriod = (
    postReveal: V8CalibrationState,
    allPending: PendingPlay[],
    cpuPlays: V8CalibrationWindowPlay[],
    humanPlays: V8CalibrationWindowPlay[],
    cpuManagerAvailable: boolean,
    reveal: RevealOrder,
  ) => {
    const window = resolveGeneratedTacticalWindow(postReveal, [...humanPlays, ...cpuPlays]);
    const resolved = window.state;
    const period = resolved.period;
    const periodLabel = PERIOD_LABELS[period - 1];
    const actionLine = [...resolved.events].reverse().find((event) => (
      event.period === period
      && event.type === 'action_triggered'
      && !event.text.includes(' REVEAL:')
    ))?.text ?? null;
    const lastWindowTactical = window.plays.at(-1);
    const lastCommittedTactical = [...allPending].reverse().find((play) => play.kind === 'tactical');
    const tacticalLine = lastWindowTactical
      ? `${lastWindowTactical.card.name} → ${lastWindowTactical.zone}`
      : lastCommittedTactical?.kind === 'tactical'
        ? `${lastCommittedTactical.card.name} → ${lastCommittedTactical.zone}`
        : null;
    const revealedPlayerIds = allPending.flatMap((play) => play.kind === 'player' ? [play.cardId] : []);
    const wasFinal = resolved.period === 4;
    const telemetryPlays = [
      ...allPending,
      ...window.plays.map((play) => ({ kind: 'tactical' as const, side: play.side, card: play.card, window: true, cost: play.cost })),
    ];

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
    setWindowPhase(null);
    if (wasFinal) setFinished(true);
  };

  const windowRemainingEnergy = windowPhase
    ? windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0)
    : 0;

  const windowChoices = useMemo(() => {
    if (!windowPhase) return [];
    const queuedIds = new Set(windowPhase.queued.map((play) => play.cardId));
    return windowEligibleCalibrationTacticals(windowPhase.resolved, 'home')
      .filter((card) => !queuedIds.has(card.id))
      .flatMap((card) => tacticalDefinition(card.type).eligibleZones.map((zone) => ({
        card,
        zone,
        cost: previewCalibrationTacticalCost(windowPhase.resolved, 'home', card, zone),
      })))
      .filter((choice) => choice.cost <= windowRemainingEnergy);
  }, [windowPhase, windowRemainingEnergy]);

  const queueWindowPlay = (cardId: string, name: string, zone: V8Zone, cost: number) => {
    setWindowPhase((phase) => (phase ? { ...phase, queued: [...phase.queued, { cardId, name, zone, cost }] } : phase));
  };

  const unqueueWindowPlay = (index: number) => {
    setWindowPhase((phase) => (phase ? { ...phase, queued: phase.queued.filter((_, itemIndex) => itemIndex !== index) } : phase));
  };

  const resolveWindow = () => {
    if (!windowPhase) return;
    finishPeriod(
      windowPhase.resolved,
      windowPhase.allPending,
      windowPhase.cpuPlays,
      windowPhase.queued.map((play) => ({ side: 'home' as const, cardId: play.cardId, zone: play.zone })),
      windowPhase.cpuManagerAvailable,
      windowPhase.reveal,
    );
  };

  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedPlayerCost = selectedPlayer ? calibrationPlayCost(selectedPlayer) : null;
  const selectedPlayerUnaffordable = selectedPlayerCost !== null && selectedPlayerCost > state.teams.home.energy;
  const selectedTactical = selection?.kind === 'tactical' ? calibrationHandTacticals(windowPhase?.resolved ?? state, 'home').find((card) => card.id === selection.cardId) ?? null : null;
  const draggedPlayer = handDrag?.kind === 'player' ? getV8CalibrationPlayer(handDrag.cardId) : null;
  const draggedTactical = handDrag?.kind === 'tactical' ? calibrationHandTacticals(windowPhase?.resolved ?? state, 'home').find((card) => card.id === handDrag.cardId) ?? null : null;
  const draggedPlayerPortrait = draggedPlayer ? portraitSrc({ id: draggedPlayer.sourceCardId ?? draggedPlayer.id, name: draggedPlayer.realName, position: draggedPlayer.position }) : null;
  const managerPortrait = managerPortraitSrc('control');
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
                : windowPhase
                  ? 'DRAG A TACTICAL TO THE PITCH'
                  : 'DRAG A CARD TO THE PITCH';

  return (
    <main className={`v8-shell${handDrag ? ' is-dragging' : ''}${debugOpen ? ' is-debug-open' : ''}${resolutionMoment ? ' is-resolving' : ''}${resolutionMoment?.homeGoals ? ' has-home-goal' : ''}${resolutionMoment?.awayGoals ? ' has-away-goal' : ''}`}>
      <header className="v8-scorebar">
        <div className={resolutionMoment?.homeGoals ? 'is-scoring' : ''}><small>YOU</small><strong key={`home-${resolutionMoment?.id ?? 0}-${homeScore}`}>{homeScore}</strong></div>
        <section>
          <b key={`period-${state.period}-${finished}`}>{finished ? 'FULL TIME' : PERIOD_LABELS[state.period - 1]}</b>
          <span>{finished ? 'MATCH COMPLETE' : `${state.teams.home.energy} ENERGY`}</span>
        </section>
        <div className={resolutionMoment?.awayGoals ? 'is-scoring' : ''}><small>CPU</small><strong key={`away-${resolutionMoment?.id ?? 0}-${awayScore}`}>{awayScore}</strong></div>
      </header>

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

      <section className={`v8-pitch${resolutionMoment ? ' is-resolving' : ''}`} aria-label="DEF MID ATT board"><div className="v8-pitch__stadium" aria-hidden="true"><i /><i /><i /></div>
        {ZONES.map((zone) => {
          const homeZone = calibrationPlayersInZone(state, 'home', zone);
          const awayZone = calibrationPlayersInZone(state, 'away', zone);
          const queuedPlayers = pending.filter((play) => play.side === 'home' && play.zone === zone && play.kind === 'player');
          const queuedManager = pending.find((play) => play.side === 'home' && play.zone === zone && play.kind === 'manager');
          const playerOccupancy = homeZone.length + queuedPlayers.length + (queuedManager ? 1 : 0);
          let guide = `${playerOccupancy}/4`;
          if (playerOccupancy >= 4) guide = 'FULL';
          else if (selectedPlayer) {
            const penalty = outOfPositionPenalty(selectedPlayer, zone);
            guide = selectedPlayerUnaffordable ? 'NO ENERGY' : penalty === 0 ? 'NATURAL' : `−${penalty} OOP`;
          }
          if (selectedTactical) {
            const sourceState = windowPhase?.resolved ?? state;
            const remainingEnergy = windowPhase
              ? windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0)
              : state.teams.home.energy;
            const eligible = tacticalDefinition(selectedTactical.type).eligibleZones.includes(zone);
            const tacticalCost = eligible ? previewCalibrationTacticalCost(sourceState, 'home', selectedTactical, zone) : Number.POSITIVE_INFINITY;
            guide = !eligible ? 'NO' : tacticalCost > remainingEnergy ? 'NO ENERGY' : `TACTICAL · ${tacticalLabel(selectedTactical, zone)}`;
          }
          if (selection?.kind === 'manager') guide = playerOccupancy >= 4 ? 'FULL' : state.teams.home.energy < MANAGER_COST ? 'NO ENERGY' : 'MANAGER';
          if (selection?.kind === 'move') guide = 'MOVE';

          return (
            <button
              key={zone}
              type="button"
              data-v8-zone={zone}
              className={`v8-zone${handDrag ? isHandDragZoneLegal(handDrag, zone) ? ' is-drag-target' : ' is-drag-disabled' : ''}${handDrag?.overZone === zone && isHandDragZoneLegal(handDrag, zone) ? ' is-drag-over' : ''}`}
              onClick={() => queueToZone(zone)}
            >
              <div className="v8-zone__heading"><strong>{zone}</strong><span>{guide}</span></div>
              <div className="v8-zone__side v8-zone__side--away">
                {awayZone.map((player) => <DeployedChip key={player.runtimeId} state={state} side="away" runtimeId={player.runtimeId} fresh={resolutionMoment?.revealedPlayerIds.includes(player.cardId) === true} />)}
                {Array.from({ length: Math.max(0, 4 - awayZone.length) }).map((_, index) => <i key={`away-${zone}-${index}`} />)}
              </div>
              <div className="v8-zone__side">
                {homeZone.map((player) => (
                  <DeployedChip key={player.runtimeId} state={state} side="home" runtimeId={player.runtimeId} fresh={resolutionMoment?.revealedPlayerIds.includes(player.cardId) === true} onMove={() => setSelection({ kind: 'move', runtimeId: player.runtimeId })} />
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
        {resolutionMoment && (
          <aside className="v8-resolution" data-testid="v8-resolution" key={resolutionMoment.id} aria-live="polite">
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
            <div className="v8-resolution__beat v8-resolution__beat--score">
              <div className="v8-resolution__matchups">
                <span>YOU <b>{resolutionMoment.homeAttack}</b> ATT <i>vs</i> {resolutionMoment.awayDefence} DEF</span>
                <span>CPU <b>{resolutionMoment.awayAttack}</b> ATT <i>vs</i> {resolutionMoment.homeDefence} DEF</span>
              </div>
              <strong>{resolutionMoment.homeGoals + resolutionMoment.awayGoals === 0
                ? 'NO GOALS'
                : resolutionMoment.homeGoals > 0 && resolutionMoment.awayGoals > 0
                  ? `${resolutionMoment.homeGoals + resolutionMoment.awayGoals} GOALS`
                  : resolutionMoment.homeGoals > 0
                    ? `+${resolutionMoment.homeGoals} ${resolutionMoment.homeGoals === 1 ? 'GOAL' : 'GOALS'} · YOU`
                    : `+${resolutionMoment.awayGoals} ${resolutionMoment.awayGoals === 1 ? 'GOAL' : 'GOALS'} · CPU`}</strong>
              <span>FULL +7 ATT MARGINS CONVERT</span>
            </div>
            <div className="v8-resolution__beat v8-resolution__beat--next">
              <small>{resolutionMoment.final ? 'FULL TIME' : 'NEXT PERIOD'}</small>
              <strong>{resolutionMoment.nextHomeScore}–{resolutionMoment.nextAwayScore}</strong>
              <span>{resolutionMoment.nextLabel}{resolutionMoment.nextEnergy !== null ? ` · ${resolutionMoment.nextEnergy} ENERGY` : ''}</span>
            </div>
          </aside>
        )}
      </section>

      {windowPhase ? (
        <section className="v8-commit v8-window" data-testid="v8-window">
          <div>
            <strong>TACTICAL WINDOW</strong>
            <span>Tacticals generated this period can be played now from your {windowRemainingEnergy} unused Energy. Unplayed cards stay in hand at printed cost.</span>
            <div className="v8-window__choices">
              {windowChoices.map((choice) => (
                <button
                  key={`${choice.card.id}-${choice.zone}`}
                  onClick={() => queueWindowPlay(choice.card.id, choice.card.name, choice.zone, choice.cost)}
                >
                  {choice.card.name} → {choice.zone} · {choice.cost}E
                </button>
              ))}
            </div>
            {windowPhase.queued.map((play, index) => (
              <span key={`${play.cardId}-${index}`}>
                Post-reveal: {play.name} ({play.cost}) → {play.zone}
                <button className="v8-window__remove" onClick={() => unqueueWindowPlay(index)} aria-label={`Remove ${play.name}`}>✕</button>
              </span>
            ))}
          </div>
          <button className="v8-primary" onClick={resolveWindow}>{windowPhase.queued.length ? 'RESOLVE WINDOW' : 'SKIP WINDOW'}</button>
        </section>
      ) : (
        <section className="v8-commit">
          <div>
            <strong>{interactionLabel}</strong>
            <span>{currentPriority.first === 'home' ? 'YOU REVEAL FIRST' : 'CPU REVEALS FIRST'} · {currentPriority.reason} · Tacticals use no player slot.</span>
            {pending.filter((play) => play.kind === 'tactical').map((play) => play.kind === 'tactical' ? <span key={play.card.id}>{play.card.name} → {play.zone} · {tacticalLabel(play.card, play.zone)}</span> : null)}
          </div>
          <button onClick={undo} disabled={!undoStack.length}>UNDO</button>
          <button className="v8-primary" onClick={endPeriod} disabled={finished}>END PERIOD</button>
        </section>
      )}

      {latestRecap && (
        <details className="v8-recap">
          <summary>
            <small>{latestRecap.label}</small>
            <strong>PERIOD RECAP</strong>
            <b>{latestRecap.homeGoals}–{latestRecap.awayGoals} · {latestRecap.scoreAfter}</b>
          </summary>
          <div className="v8-recap__body">
            <div className="v8-recap__equations">
              <span>YOU: <b>{latestRecap.homeAttack} ATT</b> vs {latestRecap.awayDefence} DEF → <b>{latestRecap.homeGoals} goals</b></span>
              <span>CPU: <b>{latestRecap.awayAttack} ATT</b> vs {latestRecap.homeDefence} DEF → <b>{latestRecap.awayGoals} goals</b></span>
            </div>
            {latestRecap.highlights.length > 0 && (
              <ul className="v8-recap__events">
                {latestRecap.highlights.map((text, index) => <li key={`${latestRecap.period}-${index}-${text}`}>{text}</li>)}
              </ul>
            )}
          </div>
        </details>
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
        <div className="v8-hand-heading"><strong>HAND</strong><span>{windowPhase ? 'DRAG TACTICAL TO PITCH' : 'DRAG CARD TO PITCH'} · {state.teams.home.drawPile.length} UNSEEN</span></div>
        <div className="v8-hand">
          {homePlayers.map((card) => (
            <PlayerHandCard
              key={card.id}
              card={card}
              selected={selection?.kind === 'player' && selection.cardId === card.id}
              affordable={!windowPhase && calibrationPlayCost(card) <= state.teams.home.energy}
              onClick={() => {
                if (consumeSuppressedClick('player', card.id)) return;
                setSelection({ kind: 'player', cardId: card.id });
              }}
              onPointerDown={(event) => startHandDrag(event, { kind: 'player', cardId: card.id, label: card.matchName })}
            />
          ))}
          {homeTacticals.map((card) => {
            const sourceState = windowPhase?.resolved ?? state;
            const eligible = tacticalDefinition(card.type).eligibleZones;
            const costs = eligible.map((zone) => previewCalibrationTacticalCost(sourceState, 'home', card, zone));
            const minimumCost = Math.min(...costs);
            const remainingEnergy = windowPhase
              ? windowPhase.resolved.teams.home.energy - windowPhase.queued.reduce((sum, play) => sum + play.cost, 0)
              : state.teams.home.energy;
            const windowEligible = !windowPhase || windowEligibleCalibrationTacticals(windowPhase.resolved, 'home').some((candidate) => candidate.id === card.id);
            const affordable = windowEligible && !windowPhase?.queued.some((play) => play.cardId === card.id) && minimumCost <= remainingEnergy;
            return (
              <TacticalHandCard
                key={card.id}
                card={card}
                cost={minimumCost}
                selected={selection?.kind === 'tactical' && selection.cardId === card.id}
                affordable={affordable}
                fresh={Boolean(windowPhase && windowEligible)}
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
              className={`v8-card v8-card--manager${selection?.kind === 'manager' ? ' is-selected' : ''}${!windowPhase && state.teams.home.energy >= MANAGER_COST ? '' : ' is-unaffordable'}`}
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
              ? Math.min(...tacticalDefinition(draggedTactical.type).eligibleZones.map((zone) => previewCalibrationTacticalCost(windowPhase?.resolved ?? state, 'home', draggedTactical, zone)))
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
