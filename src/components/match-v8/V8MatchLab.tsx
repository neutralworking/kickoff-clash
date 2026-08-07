'use client';

import { useMemo, useState } from 'react';
import {
  contributionInZone,
  deployPlayer,
  emptyV8Board,
  goalsFromAttackDefence,
  outOfPositionPenalty,
  teamTotals,
  type V8Board,
  type V8ChanceType,
  type V8PlayerCard,
  type V8Zone,
} from '@/engine-v8';
import './v8lab.css';

type LabPlayer = V8PlayerCard & {
  actionName?: string;
  createsChance?: Extract<V8ChanceType, 'cross' | 'through_ball'>;
  receivesCross?: boolean;
};

type LabChance = {
  id: string;
  kind: 'chance';
  name: string;
  chanceType: Extract<V8ChanceType, 'cross' | 'through_ball'>;
  cost: number;
  attackBoost: number;
};

type HandCard =
  | { kind: 'player'; card: LabPlayer }
  | { kind: 'chance'; card: LabChance };

type PendingPlay =
  | { kind: 'player'; handId: string; card: LabPlayer; zone: V8Zone; cost: number }
  | { kind: 'chance'; handId: string; card: LabChance; zone: 'ATT'; cost: number }
  | { kind: 'manager'; handId: 'manager'; zone: V8Zone; cost: number };

type TeamState = {
  hand: HandCard[];
  drawPile: LabPlayer[];
  board: V8Board;
  managerAvailable: boolean;
  deployOrder: number;
};

type SelectedCard = { kind: 'hand'; id: string } | { kind: 'manager'; id: 'manager' } | null;

type MatchEvent = {
  period: number;
  text: string;
};

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const PERIOD_LABELS = ['0–22', '22–HT', 'HT–66', '66–FT'] as const;
const ENERGY_CURVES = {
  controlled: [4, 6, 7, 9],
  explosive: [4, 6, 8, 10],
} as const;

const MANAGER_COST = 3;
const MANAGER_NAME = 'CONTROL';

function player(
  id: string,
  name: string,
  position: string,
  attack: number,
  defence: number,
  naturalZone: V8Zone,
  cost: number,
  extras: Partial<LabPlayer> = {},
): LabPlayer {
  return {
    id,
    name,
    position,
    printedAttack: attack,
    printedDefence: defence,
    cost,
    naturalZones: [naturalZone],
    ...extras,
  };
}

const HOME_XI: readonly LabPlayer[] = [
  player('h_gk', 'Otto Kerr', 'GK', 1, 6, 'DEF', 3, { actionName: 'STARFISH' }),
  player('h_lb', 'Rue Vance', 'LB', 3, 4, 'DEF', 2),
  player('h_lcb', 'Dane Holt', 'CB', 2, 5, 'DEF', 3, { actionName: 'WALL' }),
  player('h_rcb', 'Ivo Senn', 'CB', 2, 4, 'DEF', 2),
  player('h_rb', 'Cass Ojo', 'RB', 3, 4, 'DEF', 2),
  player('h_lm', 'Lio Fen', 'LM', 6, 3, 'MID', 5),
  player('h_cm', 'Ren Colm', 'CM', 7, 3, 'MID', 5, { actionName: 'VISION', createsChance: 'through_ball' }),
  player('h_rm', 'Tave Rune', 'RM', 6, 3, 'MID', 5, { actionName: 'BEND IT', createsChance: 'cross' }),
  player('h_lw', 'Rai Okonkwo', 'LW', 9, 2, 'ATT', 5),
  player('h_cf', 'Niko Vale', 'CF', 9, 2, 'ATT', 5, { actionName: 'BOBO BOMBER', receivesCross: true }),
  player('h_rw', 'Juno Pike', 'RW', 9, 2, 'ATT', 5),
];

const AWAY_XI: readonly LabPlayer[] = [
  player('a_gk', 'Bram Reef', 'GK', 1, 6, 'DEF', 3),
  player('a_lcb', 'Sig Reed', 'CB', 2, 5, 'DEF', 3),
  player('a_ccb', 'Tomas Lock', 'CB', 3, 6, 'DEF', 3),
  player('a_rcb', 'Gio Pace', 'CB', 3, 4, 'DEF', 2),
  player('a_lwb', 'Kes Rowan', 'LWB', 4, 3, 'MID', 4),
  player('a_dm', 'Malik Daro', 'DM', 3, 4, 'MID', 4),
  player('a_cm', 'Aris Nov', 'CM', 6, 3, 'MID', 5, { actionName: 'VISION', createsChance: 'through_ball' }),
  player('a_rwb', 'Rex Hale', 'RWB', 4, 3, 'MID', 4, { actionName: 'EARLY CROSS', createsChance: 'cross' }),
  player('a_lf', 'Bo Marsh', 'LF', 8, 2, 'ATT', 4),
  player('a_cf', 'Coby Wren', 'CF', 9, 2, 'ATT', 5, { actionName: 'TARGET MAN', receivesCross: true }),
  player('a_rf', 'Ravi Tuck', 'RF', 8, 2, 'ATT', 4),
];

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

function handPlayer(card: LabPlayer): HandCard {
  return { kind: 'player', card };
}

function createTeam(xi: readonly LabPlayer[], seed: number): TeamState {
  const ordered = seededShuffle(xi, seed);
  const opening = ordered.slice(0, 3).map(handPlayer);
  const drawPile = ordered.slice(3);
  const firstDraw = drawPile.splice(0, 2).map(handPlayer);
  return {
    hand: [...opening, ...firstDraw],
    drawPile,
    board: emptyV8Board(),
    managerAvailable: true,
    deployOrder: 0,
  };
}

function drawTwo(team: TeamState): TeamState {
  const drawPile = [...team.drawPile];
  const drawn = drawPile.splice(0, 2).map(handPlayer);
  return { ...team, drawPile, hand: [...team.hand, ...drawn] };
}

function chanceFrom(type: Extract<V8ChanceType, 'cross' | 'through_ball'>, sourceId: string, period: number): LabChance {
  return type === 'cross'
    ? { id: `cross-${sourceId}-${period}`, kind: 'chance', name: 'CROSS', chanceType: 'cross', cost: 1, attackBoost: 3 }
    : { id: `through-${sourceId}-${period}`, kind: 'chance', name: 'THROUGH BALL', chanceType: 'through_ball', cost: 1, attackBoost: 4 };
}

function handId(card: HandCard): string {
  return card.card.id;
}

function boardWithPendingPlayers(board: V8Board, pending: readonly PendingPlay[]): V8Board {
  let next = board;
  let order = Math.max(0, ...ZONES.flatMap((zone) => next[zone].map((deployed) => deployed.deployedOrder)));
  for (const play of pending) {
    if (play.kind !== 'player') continue;
    order += 1;
    next = deployPlayer(next, play.card, play.zone, order);
  }
  return next;
}

function transientBoost(board: V8Board, pending: readonly PendingPlay[]): { attack: number; defence: number } {
  let attack = 0;
  let defence = 0;
  for (const play of pending) {
    if (play.kind === 'chance') {
      const receiverBonus = play.card.chanceType === 'cross'
        && board.ATT.some((deployed) => (deployed.card as LabPlayer).receivesCross)
        ? 2
        : 0;
      attack += play.card.attackBoost + receiverBonus;
    }
    if (play.kind === 'manager') {
      const count = board[play.zone].length;
      if (play.zone === 'ATT') attack += count * 2;
      if (play.zone === 'DEF') defence += count * 2;
      if (play.zone === 'MID') {
        attack += count;
        defence += count;
      }
    }
  }
  return { attack, defence };
}

function planBot(team: TeamState, opponentBoard: V8Board, energy: number, periodIndex: number): PendingPlay[] {
  const pending: PendingPlay[] = [];
  const used = new Set<string>();
  let remaining = energy;
  let projectedBoard = team.board;

  while (remaining > 0) {
    const ownTotals = teamTotals(projectedBoard);
    const oppTotals = teamTotals(opponentBoard);
    const baseNet = goalsFromAttackDefence(ownTotals.attack, oppTotals.defence)
      - goalsFromAttackDefence(oppTotals.attack, ownTotals.defence);
    let best: { play: PendingPlay; score: number } | null = null;

    for (const handCard of team.hand) {
      const id = handId(handCard);
      if (used.has(id)) continue;
      if (handCard.card.cost > remaining) continue;

      if (handCard.kind === 'chance') {
        const projectedBoost = handCard.card.attackBoost;
        const net = goalsFromAttackDefence(ownTotals.attack + projectedBoost, oppTotals.defence)
          - goalsFromAttackDefence(oppTotals.attack, ownTotals.defence);
        const score = (net - baseNet) * 100 + projectedBoost - handCard.card.cost;
        if (best === null || score > best.score) {
          best = {
            play: { kind: 'chance', handId: id, card: handCard.card, zone: 'ATT', cost: handCard.card.cost },
            score,
          };
        }
        continue;
      }

      for (const zone of ZONES) {
        const alreadyQueued = pending.filter((play) => play.kind === 'player' && play.zone === zone).length;
        if (team.board[zone].length + alreadyQueued >= 4) continue;
        const contribution = contributionInZone(handCard.card, zone);
        const score = (contribution.attack + contribution.defence) * (4 - periodIndex)
          - handCard.card.cost
          - outOfPositionPenalty(handCard.card, zone) * 2;
        if (best === null || score > best.score) {
          best = {
            play: { kind: 'player', handId: id, card: handCard.card, zone, cost: handCard.card.cost },
            score,
          };
        }
      }
    }

    if (team.managerAvailable && !used.has('manager') && remaining >= MANAGER_COST && periodIndex >= 2) {
      const counts = ZONES.map((zone) => ({ zone, count: projectedBoard[zone].length }));
      counts.sort((a, b) => b.count - a.count);
      const preferred = counts[0];
      if (preferred && preferred.count > 0) {
        const managerScore = preferred.count * 2 - MANAGER_COST + periodIndex * 2;
        if (best === null || managerScore > best.score) {
          best = { play: { kind: 'manager', handId: 'manager', zone: preferred.zone, cost: MANAGER_COST }, score: managerScore };
        }
      }
    }

    if (!best || best.score <= 0) break;
    pending.push(best.play);
    used.add(best.play.handId);
    remaining -= best.play.cost;
    if (best.play.kind === 'player') {
      projectedBoard = deployPlayer(projectedBoard, best.play.card, best.play.zone, team.deployOrder + pending.length);
    }
  }

  return pending;
}

function applyPending(team: TeamState, pending: readonly PendingPlay[], period: number): { team: TeamState; generated: HandCard[] } {
  let board = team.board;
  let deployOrder = team.deployOrder;
  const playedIds = new Set(pending.filter((play) => play.kind !== 'manager').map((play) => play.handId));
  const generated: HandCard[] = [];

  for (const play of pending) {
    if (play.kind !== 'player') continue;
    deployOrder += 1;
    board = deployPlayer(board, play.card, play.zone, deployOrder);
    if (play.card.createsChance) {
      generated.push({ kind: 'chance', card: chanceFrom(play.card.createsChance, play.card.id, period) });
    }
  }

  return {
    team: {
      ...team,
      board,
      deployOrder,
      managerAvailable: team.managerAvailable && !pending.some((play) => play.kind === 'manager'),
      hand: team.hand.filter((card) => !playedIds.has(handId(card))),
    },
    generated,
  };
}

function slipperyPitchAdjustment(homeBoard: V8Board, awayBoard: V8Board, periodIndex: number, seed: number) {
  const all = [
    ...ZONES.flatMap((zone) => homeBoard[zone].map((deployed) => ({ side: 'home' as const, zone, deployed }))),
    ...ZONES.flatMap((zone) => awayBoard[zone].map((deployed) => ({ side: 'away' as const, zone, deployed }))),
  ];
  if (all.length === 0) return null;

  const chosen = all[(seed + periodIndex * 17) % all.length]!;
  const attackHit = chosen.zone === 'ATT' || (chosen.zone === 'MID' && (seed + periodIndex) % 2 === 0);
  return {
    side: chosen.side,
    name: chosen.deployed.card.name,
    stat: attackHit ? 'ATT' as const : 'DEF' as const,
    attack: attackHit ? -5 : 0,
    defence: attackHit ? 0 : -5,
  };
}

function formatPenalty(card: LabPlayer, zone: V8Zone): string {
  const penalty = outOfPositionPenalty(card, zone);
  return penalty === 0 ? 'NATURAL' : `-${penalty}/-${penalty}`;
}

function CardFace({ handCard, selected, pending, onClick }: {
  handCard: HandCard;
  selected: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  if (handCard.kind === 'chance') {
    return (
      <button className={`v8-card v8-card--chance${selected ? ' is-selected' : ''}${pending ? ' is-pending' : ''}`} onClick={onClick} disabled={pending}>
        <span className="v8-card__cost">{handCard.card.cost}</span>
        <span className="v8-card__position">CHANCE</span>
        <strong>{handCard.card.name}</strong>
        <small>+{handCard.card.attackBoost} ATT this period</small>
      </button>
    );
  }

  const card = handCard.card;
  return (
    <button className={`v8-card${selected ? ' is-selected' : ''}${pending ? ' is-pending' : ''}`} onClick={onClick} disabled={pending}>
      <span className="v8-card__cost">{card.cost}</span>
      <span className="v8-card__position">{card.position}</span>
      <strong>{card.name}</strong>
      <small>{card.actionName ?? '—'}</small>
      <span className="v8-card__att">{card.printedAttack} ATT</span>
      <span className="v8-card__def">{card.printedDefence} DEF</span>
    </button>
  );
}

function ZoneBoard({ zone, home, away, selectedPlayer, onZone }: {
  zone: V8Zone;
  home: V8Board;
  away: V8Board;
  selectedPlayer: LabPlayer | null;
  onZone: (zone: V8Zone) => void;
}) {
  const penalty = selectedPlayer ? formatPenalty(selectedPlayer, zone) : null;
  return (
    <button className="v8-zone" onClick={() => onZone(zone)}>
      <div className="v8-zone__heading">
        <strong>{zone}</strong>
        <span>{penalty ?? `${home[zone].length}/4`}</span>
      </div>
      <div className="v8-zone__side v8-zone__side--away">
        {away[zone].map((deployed) => (
          <span key={deployed.card.id} className="v8-chip v8-chip--away">{deployed.card.name}<b>{deployed.card.printedAttack}/{deployed.card.printedDefence}</b></span>
        ))}
        {Array.from({ length: Math.max(0, 4 - away[zone].length) }).map((_, index) => <i key={`away-${index}`} />)}
      </div>
      <div className="v8-zone__side">
        {home[zone].map((deployed) => (
          <span key={deployed.card.id} className="v8-chip">{deployed.card.name}<b>{deployed.card.printedAttack}/{deployed.card.printedDefence}</b></span>
        ))}
        {Array.from({ length: Math.max(0, 4 - home[zone].length) }).map((_, index) => <i key={`home-${index}`} />)}
      </div>
    </button>
  );
}

export default function V8MatchLab() {
  const [gameSeed, setGameSeed] = useState(8082026);
  const [curveName, setCurveName] = useState<keyof typeof ENERGY_CURVES>('controlled');
  const [periodIndex, setPeriodIndex] = useState(0);
  const [home, setHome] = useState<TeamState>(() => createTeam(HOME_XI, 8082026));
  const [away, setAway] = useState<TeamState>(() => createTeam(AWAY_XI, 8082027));
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [pending, setPending] = useState<PendingPlay[]>([]);
  const [selected, setSelected] = useState<SelectedCard>(null);
  const [finished, setFinished] = useState(false);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [conditionEnabled, setConditionEnabled] = useState(true);

  const energyCurve = ENERGY_CURVES[curveName];
  const energy = energyCurve[periodIndex] ?? 0;
  const energySpent = pending.reduce((sum, play) => sum + play.cost, 0);
  const energyLeft = energy - energySpent;
  const pendingIds = useMemo(() => new Set(pending.map((play) => play.handId)), [pending]);
  const selectedHand = selected?.kind === 'hand' ? home.hand.find((card) => handId(card) === selected.id) ?? null : null;
  const selectedPlayer = selectedHand?.kind === 'player' ? selectedHand.card : null;
  const projectedHome = useMemo(() => boardWithPendingPlayers(home.board, pending), [home.board, pending]);
  const homeTotals = teamTotals(home.board);
  const awayTotals = teamTotals(away.board);

  const reset = (nextSeed = gameSeed + 31, nextCurve = curveName) => {
    setGameSeed(nextSeed);
    setCurveName(nextCurve);
    setPeriodIndex(0);
    setHome(createTeam(HOME_XI, nextSeed));
    setAway(createTeam(AWAY_XI, nextSeed + 1));
    setHomeScore(0);
    setAwayScore(0);
    setPending([]);
    setSelected(null);
    setFinished(false);
    setEvents([]);
  };

  const selectHand = (card: HandCard) => {
    const id = handId(card);
    if (pendingIds.has(id)) return;
    setSelected((current) => current?.kind === 'hand' && current.id === id ? null : { kind: 'hand', id });
  };

  const queueToZone = (zone: V8Zone) => {
    if (finished || !selected) return;

    if (selected.kind === 'manager') {
      if (!home.managerAvailable || energyLeft < MANAGER_COST || pendingIds.has('manager')) return;
      setPending((current) => [...current, { kind: 'manager', handId: 'manager', zone, cost: MANAGER_COST }]);
      setSelected(null);
      return;
    }

    const handCard = home.hand.find((card) => handId(card) === selected.id);
    if (!handCard || handCard.card.cost > energyLeft) return;

    if (handCard.kind === 'chance') {
      if (zone !== 'ATT') return;
      setPending((current) => [...current, { kind: 'chance', handId: handCard.card.id, card: handCard.card, zone: 'ATT', cost: handCard.card.cost }]);
      setSelected(null);
      return;
    }

    const queuedInZone = pending.filter((play) => play.kind === 'player' && play.zone === zone).length;
    if (home.board[zone].length + queuedInZone >= 4) return;
    setPending((current) => [...current, { kind: 'player', handId: handCard.card.id, card: handCard.card, zone, cost: handCard.card.cost }]);
    setSelected(null);
  };

  const undoLast = () => {
    setPending((current) => current.slice(0, -1));
    setSelected(null);
  };

  const endPeriod = () => {
    if (finished) return;
    const botPending = planBot(away, home.board, energy, periodIndex);
    const homeApplied = applyPending(home, pending, periodIndex + 1);
    const awayApplied = applyPending(away, botPending, periodIndex + 1);
    const homeBoard = homeApplied.team.board;
    const awayBoard = awayApplied.team.board;
    const homeBoost = transientBoost(homeBoard, pending);
    const awayBoost = transientBoost(awayBoard, botPending);
    const condition = conditionEnabled ? slipperyPitchAdjustment(homeBoard, awayBoard, periodIndex, gameSeed) : null;

    if (condition?.side === 'home') {
      homeBoost.attack += condition.attack;
      homeBoost.defence += condition.defence;
    }
    if (condition?.side === 'away') {
      awayBoost.attack += condition.attack;
      awayBoost.defence += condition.defence;
    }

    const homeFinal = teamTotals(homeBoard);
    const awayFinal = teamTotals(awayBoard);
    const scoredHome = goalsFromAttackDefence(homeFinal.attack + homeBoost.attack, awayFinal.defence + awayBoost.defence);
    const scoredAway = goalsFromAttackDefence(awayFinal.attack + awayBoost.attack, homeFinal.defence + homeBoost.defence);
    const newHomeScore = homeScore + scoredHome;
    const newAwayScore = awayScore + scoredAway;

    const periodEvents: MatchEvent[] = [];
    const label = PERIOD_LABELS[periodIndex]!;
    periodEvents.push({ period: periodIndex + 1, text: `${label}: ${homeFinal.attack + homeBoost.attack} ATT vs ${awayFinal.defence + awayBoost.defence} DEF → ${scoredHome} goal${scoredHome === 1 ? '' : 's'}` });
    periodEvents.push({ period: periodIndex + 1, text: `${label}: opponent ${awayFinal.attack + awayBoost.attack} ATT vs ${homeFinal.defence + homeBoost.defence} DEF → ${scoredAway} goal${scoredAway === 1 ? '' : 's'}` });
    if (condition) periodEvents.push({ period: periodIndex + 1, text: `Slippery Pitch: ${condition.name} loses 5 ${condition.stat} this period.` });
    for (const generated of homeApplied.generated) periodEvents.push({ period: periodIndex + 1, text: `${generated.card.name} added to your hand for the next period.` });

    setHomeScore(newHomeScore);
    setAwayScore(newAwayScore);
    setEvents((current) => [...periodEvents, ...current].slice(0, 10));
    setPending([]);
    setSelected(null);

    if (periodIndex === 3) {
      setHome({ ...homeApplied.team, hand: [...homeApplied.team.hand, ...homeApplied.generated] });
      setAway({ ...awayApplied.team, hand: [...awayApplied.team.hand, ...awayApplied.generated] });
      setFinished(true);
      return;
    }

    const nextHome = drawTwo({ ...homeApplied.team, hand: [...homeApplied.team.hand, ...homeApplied.generated] });
    const nextAway = drawTwo({ ...awayApplied.team, hand: [...awayApplied.team.hand, ...awayApplied.generated] });
    setHome(nextHome);
    setAway(nextAway);
    setPeriodIndex((current) => current + 1);
  };

  return (
    <main className="v8-shell">
      <header className="v8-scorebar">
        <div><small>YOU</small><strong>{homeScore}</strong></div>
        <section>
          <b>{finished ? 'FULL TIME' : PERIOD_LABELS[periodIndex]}</b>
          <span>{finished ? 'Match complete' : `${energyLeft}/${energy} ENERGY`}</span>
        </section>
        <div><small>CPU</small><strong>{awayScore}</strong></div>
      </header>

      <div className="v8-condition">
        <button onClick={() => setConditionEnabled((value) => !value)} className={conditionEnabled ? 'is-on' : ''}>
          <strong>SLIPPERY PITCH</strong>
          <span>{conditionEnabled ? 'ON · random -5 each period' : 'OFF'}</span>
        </button>
        <button onClick={() => reset(gameSeed + 31, curveName)}>NEW DRAW</button>
      </div>

      <section className="v8-totals">
        <span>YOUR <b>{homeTotals.attack}</b> ATT</span>
        <span>YOUR <b>{homeTotals.defence}</b> DEF</span>
        <span>CPU <b>{awayTotals.attack}</b> ATT</span>
        <span>CPU <b>{awayTotals.defence}</b> DEF</span>
      </section>

      <section className="v8-pitch" aria-label="DEF MID ATT board">
        {ZONES.map((zone) => (
          <ZoneBoard key={zone} zone={zone} home={projectedHome} away={away.board} selectedPlayer={selectedPlayer} onZone={queueToZone} />
        ))}
      </section>

      <section className="v8-commit">
        <div>
          <strong>{pending.length ? `${pending.length} queued` : 'Choose a card, then a zone'}</strong>
          <span>Opponent plays are hidden until you end the period.</span>
        </div>
        <button onClick={undoLast} disabled={!pending.length}>UNDO</button>
        <button className="v8-primary" onClick={endPeriod} disabled={finished}>END PERIOD</button>
      </section>

      <section className="v8-hand-wrap">
        <div className="v8-hand-heading">
          <strong>HAND</strong>
          <span>{home.drawPile.length} XI cards unseen</span>
        </div>
        <div className="v8-hand">
          {home.hand.map((card) => (
            <CardFace
              key={handId(card)}
              handCard={card}
              selected={selected?.kind === 'hand' && selected.id === handId(card)}
              pending={pendingIds.has(handId(card))}
              onClick={() => selectHand(card)}
            />
          ))}
          {home.managerAvailable && (
            <button
              className={`v8-card v8-card--manager${selected?.kind === 'manager' ? ' is-selected' : ''}${pendingIds.has('manager') ? ' is-pending' : ''}`}
              onClick={() => !pendingIds.has('manager') && setSelected((current) => current?.kind === 'manager' ? null : { kind: 'manager', id: 'manager' })}
              disabled={pendingIds.has('manager')}
            >
              <span className="v8-card__cost">{MANAGER_COST}</span>
              <span className="v8-card__position">MANAGER</span>
              <strong>{MANAGER_NAME}</strong>
              <small>DEF: +2 DEF/player · MID: +1/+1 · ATT: +2 ATT/player</small>
            </button>
          )}
        </div>
      </section>

      <section className="v8-lab-controls">
        <span>ENERGY TEST</span>
        <button className={curveName === 'controlled' ? 'is-active' : ''} onClick={() => reset(gameSeed + 31, 'controlled')}>4 / 6 / 7 / 9</button>
        <button className={curveName === 'explosive' ? 'is-active' : ''} onClick={() => reset(gameSeed + 31, 'explosive')}>4 / 6 / 8 / 10</button>
      </section>

      {events.length > 0 && (
        <section className="v8-log">
          <strong>MATCH LOG</strong>
          {events.map((event, index) => <p key={`${event.period}-${index}`}>{event.text}</p>)}
        </section>
      )}

      {finished && (
        <div className="v8-result">
          <small>FULL TIME</small>
          <strong>{homeScore}–{awayScore}</strong>
          <b>{homeScore > awayScore ? 'VICTORY' : homeScore < awayScore ? 'DEFEAT' : 'DRAW'}</b>
          <button onClick={() => reset(gameSeed + 31, curveName)}>PLAY AGAIN</button>
        </div>
      )}
    </main>
  );
}
