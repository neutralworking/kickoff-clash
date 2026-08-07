'use client';

import { useMemo, useState } from 'react';
import {
  calibrationHandPlayers,
  calibrationHandTacticals,
  calibrationPlayerCard,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  calibrationTeamTotals,
  createV8CalibrationMatch,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
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
  type V8CalibrationPlayerCard,
  type V8CalibrationSide,
  type V8CalibrationState,
  type V8TacticalCardInstance,
  type V8Zone,
} from '@/engine-v8';
import { calibrationEnergyForPeriod, calibrationPlayCost } from '@/engine-v8/calibration-balance';
import './v8lab.css';
import './v8recap.css';

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const PERIOD_LABELS = ['0–22', '22–HT', 'HT–66', '66–FT'] as const;
const MANAGER_COST = 3;
const MANAGER_NAME = 'CONTROL';

const PRESETS = {
  creators: {
    label: 'CREATORS',
    home: ['beckham', 'wambach', 'hegerberg', 'di-maria', 'cafu', 'dzajic', 'morgan', 'shevchenko', 'valderrama', 'litmanen', 'schmeichel'],
    away: ['gentile', 'baresi', 'iniesta', 'bremner', 'seedorf', 'makelele', 'park', 'beckenbauer', 'sinclair', 'charlton', 'lloyd'],
  },
  dribblers: {
    label: 'DRIBBLERS',
    home: ['duff', 'garrincha', 'okocha', 'neymar', 'ronaldo', 'panenka', 'sinclair', 'di-maria', 'valderrama', 'park', 'schmeichel'],
    away: ['baresi', 'gentile', 'seedorf', 'makelele', 'beckenbauer', 'ramos', 'eriksen', 'wambach', 'hegerberg', 'charlton', 'lloyd'],
  },
  control: {
    label: 'CONTROL / SET PIECES',
    home: ['gentile', 'baresi', 'iniesta', 'bremner', 'seedorf', 'makelele', 'beckenbauer', 'charlton', 'lloyd', 'eriksen', 'ramos'],
    away: ['duff', 'garrincha', 'okocha', 'neymar', 'ronaldo', 'panenka', 'sinclair', 'di-maria', 'valderrama', 'park', 'schmeichel'],
  },
} as const;

type PresetKey = keyof typeof PRESETS;

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

function createPresetMatch(preset: PresetKey, seed: number): V8CalibrationState {
  const definition = PRESETS[preset];
  return withCalibrationEnergy(createV8CalibrationMatch(
    seededShuffle(definition.home, seed),
    seededShuffle(definition.away, seed + 1),
  ));
}

function occupiedPlayerSlots(state: V8CalibrationState, side: V8CalibrationSide, zone: V8Zone, pending: readonly PendingPlay[]): number {
  const queuedPlayers = pending.filter((play) => play.side === side && play.zone === zone && (play.kind === 'player' || play.kind === 'manager')).length;
  return calibrationPlayersInZone(state, side, zone).length + queuedPlayers;
}

function priority(state: V8CalibrationState, homeScore: number, awayScore: number, seed: number): { first: V8CalibrationSide; reason: string } {
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

function PlayerHandCard({ card, selected, onClick }: { card: V8CalibrationPlayerCard; selected: boolean; onClick: () => void }) {
  return (
    <button className={`v8-card${selected ? ' is-selected' : ''}`} onClick={onClick}>
      <span className="v8-card__cost">{calibrationPlayCost(card)}</span>
      <span className="v8-card__position">{card.position}</span>
      <strong>{card.realName}</strong>
      <small><b>{card.actionName}</b><br />{card.actionText}</small>
      <span className="v8-card__att">{card.printedAttack} ATT</span>
      <span className="v8-card__def">{card.printedDefence} DEF</span>
    </button>
  );
}

function TacticalHandCard({ card, cost, selected, onClick }: { card: V8TacticalCardInstance; cost: number; selected: boolean; onClick: () => void }) {
  return (
    <button className={`v8-card v8-card--chance${selected ? ' is-selected' : ''}`} onClick={onClick}>
      <span className="v8-card__cost">{cost}</span>
      <span className="v8-card__position">TACTICAL</span>
      <strong>{card.name}</strong>
      <small>{tacticalDefinition(card.type).text}<br />{tacticalLabel(card)}</small>
    </button>
  );
}

function DeployedChip({ state, side, runtimeId, onMove }: { state: V8CalibrationState; side: V8CalibrationSide; runtimeId: string; onMove?: () => void }) {
  const player = state.players[runtimeId]!;
  const card = calibrationPlayerCard(player);
  const attack = currentCalibrationAttack(state, runtimeId);
  const defence = currentCalibrationDefence(state, runtimeId);
  const suppressed = !isCalibrationActionEnabled(state, runtimeId);
  const moveable = side === 'home' && (card.actionKey === 'cafu_pendolino' || card.actionKey === 'beckenbauer_der_kaiser');
  const moved = Boolean(state.periodCounters[`move:${runtimeId}`]);
  const canMove = moveable && !moved && Boolean(onMove);
  return (
    <span
      className={`v8-chip${side === 'away' ? ' v8-chip--away' : ''}${suppressed ? ' is-suppressed' : ''}`}
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
      {card.realName}
      <b>{attack}/{defence}</b>
      <small>{suppressed ? 'NO ACTION' : moveable ? (moved ? 'MOVE USED' : 'MOVEABLE') : card.actionName}</small>
    </span>
  );
}

function recapHighlights(state: V8CalibrationState, period: number): string[] {
  const useful = new Set(['player_moved', 'action_ignored', 'action_suppressed', 'modifier_changed', 'tactical_generated', 'tactical_modified', 'chance_resolved', 'chance_cancelled']);
  return state.events
    .filter((event) => event.period === period && useful.has(event.type))
    .map((event) => event.text)
    .slice(-6);
}

export default function V8CalibrationLab() {
  const [preset, setPreset] = useState<PresetKey>('creators');
  const [seed, setSeed] = useState(8082026);
  const [state, setState] = useState<V8CalibrationState>(() => createPresetMatch('creators', 8082026));
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [pending, setPending] = useState<PendingPlay[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [homeManagerAvailable, setHomeManagerAvailable] = useState(true);
  const [awayManagerAvailable, setAwayManagerAvailable] = useState(true);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [recaps, setRecaps] = useState<PeriodRecap[]>([]);
  const [finished, setFinished] = useState(false);

  const homePlayers = calibrationHandPlayers(state, 'home');
  const homeTacticals = calibrationHandTacticals(state, 'home');
  const totalsHome = calibrationTeamTotals(state, 'home');
  const totalsAway = calibrationTeamTotals(state, 'away');
  const currentPriority = useMemo(() => priority(state, homeScore, awayScore, seed + state.period * 101), [state, homeScore, awayScore, seed]);
  const latestRecap = recaps.at(-1);

  const reset = (nextPreset = preset, nextSeed = seed + 31) => {
    setPreset(nextPreset);
    setSeed(nextSeed);
    setState(createPresetMatch(nextPreset, nextSeed));
    setHomeScore(0);
    setAwayScore(0);
    setPending([]);
    setSelection(null);
    setHomeManagerAvailable(true);
    setAwayManagerAvailable(true);
    setUndoStack([]);
    setRecaps([]);
    setFinished(false);
  };

  const rememberUndo = () => {
    setUndoStack((stack) => [...stack, { state, homeManagerAvailable, pending }]);
  };

  const queueToZone = (zone: V8Zone) => {
    if (!selection || finished) return;

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
      if (!homeManagerAvailable || state.teams.home.energy < MANAGER_COST) return;
      if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return;
      rememberUndo();
      setState({
        ...state,
        teams: { ...state.teams, home: { ...state.teams.home, energy: state.teams.home.energy - MANAGER_COST } },
      });
      setPending((plays) => [...plays, { kind: 'manager', side: 'home', zone, cost: MANAGER_COST }]);
      setHomeManagerAvailable(false);
      setSelection(null);
      return;
    }

    if (selection.kind === 'player') {
      const card = getV8CalibrationPlayer(selection.cardId);
      const cost = calibrationPlayCost(card);
      if (occupiedPlayerSlots(state, 'home', zone, pending) >= 4) return;
      if (cost > state.teams.home.energy) return;
      rememberUndo();
      try {
        const paid = payCalibrationPlayer(state, 'home', card);
        setState(paid);
        setPending((plays) => [...plays, { kind: 'player', side: 'home', cardId: card.id, zone, cost }]);
        setSelection(null);
      } catch {
        return;
      }
      return;
    }

    const tactical = homeTacticals.find((card) => card.id === selection.cardId);
    if (!tactical || !tacticalDefinition(tactical.type).eligibleZones.includes(zone)) return;
    const cost = previewCalibrationTacticalCost(state, 'home', tactical, zone);
    if (cost > state.teams.home.energy) return;
    rememberUndo();
    try {
      const spent = spendCalibrationTacticalFromHand(state, 'home', tactical.id, zone);
      setState(spent.state);
      setPending((plays) => [...plays, { kind: 'tactical', side: 'home', card: spent.card, zone, cost: spent.cost }]);
      setSelection(null);
    } catch {
      return;
    }
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
    if (finished) return;
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

    const home = calibrationTeamTotals(resolved, 'home');
    const away = calibrationTeamTotals(resolved, 'away');
    const scoredHome = goalsFromAttackDefence(home.attack, away.defence);
    const scoredAway = goalsFromAttackDefence(away.attack, home.defence);
    const nextHomeScore = homeScore + scoredHome;
    const nextAwayScore = awayScore + scoredAway;
    resolved.events.push({ type: 'action_triggered', period, text: `${periodLabel}: ${home.attack} ATT vs ${away.defence} DEF → ${scoredHome} goal${scoredHome === 1 ? '' : 's'}.` });
    resolved.events.push({ type: 'action_triggered', period, text: `${periodLabel}: opponent ${away.attack} ATT vs ${home.defence} DEF → ${scoredAway} goal${scoredAway === 1 ? '' : 's'}.` });

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

    const wasFinal = resolved.period === 4;
    resolved = endV8CalibrationPeriod(resolved);
    if (!wasFinal) resolved = withCalibrationEnergy(resolved);
    setState(resolved);
    setHomeScore(nextHomeScore);
    setAwayScore(nextAwayScore);
    setAwayManagerAvailable(cpu.managerAvailable);
    setPending([]);
    setUndoStack([]);
    setSelection(null);
    if (wasFinal) setFinished(true);
  };

  const selectedPlayer = selection?.kind === 'player' ? getV8CalibrationPlayer(selection.cardId) : null;
  const selectedTactical = selection?.kind === 'tactical' ? homeTacticals.find((card) => card.id === selection.cardId) ?? null : null;

  return (
    <main className="v8-shell">
      <header className="v8-scorebar">
        <div><small>YOU</small><strong>{homeScore}</strong></div>
        <section>
          <b>{finished ? 'FULL TIME' : PERIOD_LABELS[state.period - 1]}</b>
          <span>{finished ? 'Calibration match complete' : `${state.teams.home.energy} ENERGY`}</span>
        </section>
        <div><small>CPU</small><strong>{awayScore}</strong></div>
      </header>

      <div className="v8-condition">
        <button>
          <strong>30-CARD V8 CALIBRATION</strong>
          <span>2/4/6/8 Energy · player Costs −1 (min 1) · source values unchanged</span>
        </button>
        <button onClick={() => reset(preset, seed + 31)}>NEW DRAW</button>
      </div>

      <section className="v8-lab-controls">
        <span>DECK PRESET</span>
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <button key={key} className={preset === key ? 'is-active' : ''} onClick={() => reset(key, seed + 31)}>{PRESETS[key].label}</button>
        ))}
      </section>

      <section className="v8-totals">
        <span>YOUR <b>{totalsHome.attack}</b> ATT</span>
        <span>YOUR <b>{totalsHome.defence}</b> DEF</span>
        <span>CPU <b>{totalsAway.attack}</b> ATT</span>
        <span>CPU <b>{totalsAway.defence}</b> DEF</span>
      </section>

      <section className="v8-pitch" aria-label="DEF MID ATT board">
        {ZONES.map((zone) => {
          const homeZone = calibrationPlayersInZone(state, 'home', zone);
          const awayZone = calibrationPlayersInZone(state, 'away', zone);
          const queuedPlayers = pending.filter((play) => play.side === 'home' && play.zone === zone && play.kind === 'player');
          const queuedManager = pending.find((play) => play.side === 'home' && play.zone === zone && play.kind === 'manager');
          const playerOccupancy = homeZone.length + queuedPlayers.length + (queuedManager ? 1 : 0);
          let guide = `${playerOccupancy}/4`;
          if (selectedPlayer) guide = outOfPositionPenalty(selectedPlayer, zone) === 0 ? 'NATURAL' : `-${outOfPositionPenalty(selectedPlayer, zone)}/-${outOfPositionPenalty(selectedPlayer, zone)}`;
          if (selectedTactical) guide = tacticalDefinition(selectedTactical.type).eligibleZones.includes(zone) ? `TACTICAL · ${tacticalLabel(selectedTactical, zone)}` : 'NO';
          if (selection?.kind === 'move') guide = 'MOVE';

          return (
            <button key={zone} className="v8-zone" onClick={() => queueToZone(zone)}>
              <div className="v8-zone__heading"><strong>{zone}</strong><span>{guide}</span></div>
              <div className="v8-zone__side v8-zone__side--away">
                {awayZone.map((player) => <DeployedChip key={player.runtimeId} state={state} side="away" runtimeId={player.runtimeId} />)}
                {Array.from({ length: Math.max(0, 4 - awayZone.length) }).map((_, index) => <i key={`away-${zone}-${index}`} />)}
              </div>
              <div className="v8-zone__side">
                {homeZone.map((player) => (
                  <DeployedChip key={player.runtimeId} state={state} side="home" runtimeId={player.runtimeId} onMove={() => setSelection({ kind: 'move', runtimeId: player.runtimeId })} />
                ))}
                {queuedPlayers.map((play) => play.kind === 'player' ? (
                  <span key={`queued-${play.cardId}`} className="v8-chip v8-chip--transient">{getV8CalibrationPlayer(play.cardId).realName}<b>PLAYER · QUEUED</b></span>
                ) : null)}
                {queuedManager && <span className="v8-chip v8-chip--transient">{MANAGER_NAME}<b>MANAGER · QUEUED</b></span>}
                {Array.from({ length: Math.max(0, 4 - playerOccupancy) }).map((_, index) => <i key={`home-${zone}-${index}`} />)}
              </div>
            </button>
          );
        })}
      </section>

      <section className="v8-commit">
        <div>
          <strong>{pending.length ? `${pending.length} committed` : selection?.kind === 'move' ? 'Choose destination zone' : 'Choose a card, then a zone'}</strong>
          <span>{currentPriority.first === 'home' ? 'YOU REVEAL FIRST' : 'CPU REVEALS FIRST'} · {currentPriority.reason} · Tacticals use no player slot.</span>
          {pending.filter((play) => play.kind === 'tactical').map((play) => play.kind === 'tactical' ? <span key={play.card.id}>{play.card.name} → {play.zone} · {tacticalLabel(play.card, play.zone)}</span> : null)}
        </div>
        <button onClick={undo} disabled={!undoStack.length}>UNDO</button>
        <button className="v8-primary" onClick={endPeriod} disabled={finished}>END PERIOD</button>
      </section>

      {latestRecap && (
        <details className="v8-recap" open>
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

      <section className="v8-hand-wrap">
        <div className="v8-hand-heading"><strong>HAND</strong><span>{state.teams.home.drawPile.length} XI cards unseen</span></div>
        <div className="v8-hand">
          {homePlayers.map((card) => (
            <PlayerHandCard key={card.id} card={card} selected={selection?.kind === 'player' && selection.cardId === card.id} onClick={() => setSelection({ kind: 'player', cardId: card.id })} />
          ))}
          {homeTacticals.map((card) => {
            const eligible = tacticalDefinition(card.type).eligibleZones;
            const costs = eligible.map((zone) => previewCalibrationTacticalCost(state, 'home', card, zone));
            return <TacticalHandCard key={card.id} card={card} cost={Math.min(...costs)} selected={selection?.kind === 'tactical' && selection.cardId === card.id} onClick={() => setSelection({ kind: 'tactical', cardId: card.id })} />;
          })}
          {homeManagerAvailable && (
            <button className={`v8-card v8-card--manager${selection?.kind === 'manager' ? ' is-selected' : ''}`} onClick={() => setSelection({ kind: 'manager' })}>
              <span className="v8-card__cost">{MANAGER_COST}</span>
              <span className="v8-card__position">MANAGER</span>
              <strong>{MANAGER_NAME}</strong>
              <small>Occupies a player slot while committed. On reveal: DEF +2 DEF/player · MID +1/+1 · ATT +2 ATT/player. Then disappears.</small>
            </button>
          )}
        </div>
      </section>

      {state.events.length > 0 && (
        <section className="v8-log">
          <strong>MATCH / ACTION LOG</strong>
          {[...state.events].reverse().slice(0, 30).map((event, index) => <p key={`${event.period}-${index}-${event.text}`}>{event.text}</p>)}
        </section>
      )}

      {finished && (
        <div className="v8-result">
          <small>FULL TIME</small>
          <strong>{homeScore}–{awayScore}</strong>
          <b>{homeScore > awayScore ? 'VICTORY' : homeScore < awayScore ? 'DEFEAT' : 'DRAW'}</b>
          <button onClick={() => reset(preset, seed + 31)}>PLAY AGAIN</button>
        </div>
      )}
    </main>
  );
}
