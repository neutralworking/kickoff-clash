'use client';

import { useMemo, useState } from 'react';
import {
  canPlayToZone,
  contributionInZone,
  deployPlayer,
  emptyV8Board,
  goalsFromAttackDefence,
  outOfPositionPenalty,
  revealPriority,
  teamTotals,
  zoneOccupancy,
  type V8Board,
  type V8ChanceType,
  type V8PlayerCard,
  type V8RevealPriorityReason,
  type V8Side,
  type V8SlotReservation,
  type V8Zone,
} from '@/engine-v8';
import './v8lab.css';

type LabPlayer = V8PlayerCard & {
  actionName?: string;
  createsChance?: Extract<V8ChanceType, 'cross' | 'through_ball'>;
  receivesCross?: boolean;
  onReveal?: 'press_next';
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

type ZonePenalty = { attack: number; defence: number };

type RevealWork = {
  team: TeamState;
  generated: HandCard[];
  boost: { attack: number; defence: number };
  penalties: Map<string, ZonePenalty>;
};

const ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'];
const PERIOD_LABELS = ['0–22', '22–HT', 'HT–66', '66–FT'] as const;
const ENERGY_CURVES = {
  controlled: [3, 5, 7, 9],
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
  player('h_lb', 'Rue Vance', 'LB', 2, 2, 'DEF', 1, { actionName: 'OVERLAP', naturalZones: ['DEF', 'MID'] }),
  player('h_lcb', 'Dane Holt', 'CB', 2, 5, 'DEF', 3, { actionName: 'WALL' }),
  player('h_rcb', 'Ivo Senn', 'CB', 0, 3, 'DEF', 1, { actionName: 'FRONT FOOT', onReveal: 'press_next' }),
  player('h_rb', 'Cass Ojo', 'RB', 3, 4, 'DEF', 2),
  player('h_lm', 'Lio Fen', 'LM', 6, 3, 'MID', 5),
  player('h_cm', 'Ren Colm', 'CM', 7, 3, 'MID', 5, { actionName: 'VISION', createsChance: 'through_ball' }),
  player('h_rm', 'Tave Rune', 'RM', 6, 3, 'MID', 5, { actionName: 'BEND IT', createsChance: 'cross' }),
  player('h_lw', 'Rai Okonkwo', 'LW', 9, 2, 'ATT', 5),
  player('h_cf', 'Niko Vale', 'CF', 9, 2, 'ATT', 5, { actionName: 'BOBO BOMBER', receivesCross: true }),
  player('h_rw', 'Juno Pike', 'RW', 3, 0, 'ATT', 1, { actionName: 'RUNNER' }),
];

const AWAY_XI: readonly LabPlayer[] = [
  player('a_gk', 'Bram Reef', 'GK', 1, 6, 'DEF', 3),
  player('a_lcb', 'Sig Reed', 'CB', 2, 5, 'DEF', 3),
  player('a_ccb', 'Tomas Lock', 'CB', 3, 6, 'DEF', 3),
  player('a_rcb', 'Gio Pace', 'CB', 0, 3, 'DEF', 1, { actionName: 'STEP UP', onReveal: 'press_next' }),
  player('a_lwb', 'Kes Rowan', 'LWB', 2, 2, 'DEF', 1, { actionName: 'OVERLAP', naturalZones: ['DEF', 'MID'] }),
  player('a_dm', 'Malik Daro', 'DM', 3, 4, 'MID', 4),
  player('a_cm', 'Aris Nov', 'CM', 6, 3, 'MID', 5, { actionName: 'VISION', createsChance: 'through_ball' }),
  player('a_rwb', 'Rex Hale', 'RWB', 4, 3, 'MID', 4, { actionName: 'EARLY CROSS', createsChance: 'cross' }),
  player('a_lf', 'Bo Marsh', 'LF', 3, 0, 'ATT', 1, { actionName: 'POACHER' }),
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

function slotReservations(pending: readonly PendingPlay[]): V8SlotReservation[] {
  return pending.map((play) => ({ zone: play.zone, kind: play.kind }));
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

function pressurePenalty(zone: V8Zone): ZonePenalty {
  if (zone === 'DEF') return { attack: 0, defence: 2 };
  if (zone === 'ATT') return { attack: 2, defence: 0 };
  return { attack: 2, defence: 2 };
}

function pressurePenaltyText(zone: V8Zone): string {
  if (zone === 'DEF') return '-2 DEF';
  if (zone === 'ATT') return '-2 ATT';
  return '-2 ATT / -2 DEF';
}

function totalsWithPenalties(board: V8Board, penalties: ReadonlyMap<string, ZonePenalty>): ReturnType<typeof teamTotals> {
  const byZone: ReturnType<typeof teamTotals>['byZone'] = {
    DEF: { attack: 0, defence: 0 },
    MID: { attack: 0, defence: 0 },
    ATT: { attack: 0, defence: 0 },
  };

  for (const zone of ZONES) {
    for (const deployed of board[zone]) {
      const penalty = penalties.get(deployed.card.id) ?? { attack: 0, defence: 0 };
      const contribution = contributionInZone({
        ...deployed.card,
        printedAttack: deployed.card.printedAttack - penalty.attack,
        printedDefence: deployed.card.printedDefence - penalty.defence,
      }, zone);
      byZone[zone].attack += contribution.attack;
      byZone[zone].defence += contribution.defence;
    }
  }

  return {
    attack: byZone.ATT.attack + byZone.MID.attack,
    defence: byZone.DEF.defence + byZone.MID.defence,
    byZone,
  };
}

function priorityReasonLabel(reason: V8RevealPriorityReason): string {
  if (reason === 'score') return 'score lead';
  if (reason === 'attack_edge') return 'ATT edge';
  if (reason === 'board_strength') return 'board strength';
  return 'seeded tiebreak';
}

function newRevealWork(team: TeamState): RevealWork {
  return {
    team: { ...team },
    generated: [],
    boost: { attack: 0, defence: 0 },
    penalties: new Map(),
  };
}

function resolveRevealWindow(
  home: TeamState,
  away: TeamState,
  homePending: readonly PendingPlay[],
  awayPending: readonly PendingPlay[],
  homeScore: number,
  awayScore: number,
  period: number,
  seed: number,
) {
  const priority = revealPriority(homeScore, awayScore, home.board, away.board, seed);
  const works: Record<V8Side, RevealWork> = {
    home: newRevealWork(home),
    away: newRevealWork(away),
  };
  const pendingBySide: Record<V8Side, readonly PendingPlay[]> = {
    home: homePending,
    away: awayPending,
  };
  const pressureWaiting: Record<V8Side, Record<V8Zone, number>> = {
    home: { DEF: 0, MID: 0, ATT: 0 },
    away: { DEF: 0, MID: 0, ATT: 0 },
  };
  const log: string[] = [];

  for (const side of [priority.first, priority.second]) {
    const opponent: V8Side = side === 'home' ? 'away' : 'home';
    const actor = side === 'home' ? 'YOU' : 'CPU';
    const work = works[side];

    for (const play of pendingBySide[side]) {
      if (play.kind === 'player') {
        const deployOrder = work.team.deployOrder + 1;
        const board = deployPlayer(work.team.board, play.card, play.zone, deployOrder);
        work.team = { ...work.team, board, deployOrder };
        log.push(`${actor} reveal ${play.card.name} → ${play.zone}.`);

        if (pressureWaiting[side][play.zone] > 0) {
          work.penalties.set(play.card.id, pressurePenalty(play.zone));
          pressureWaiting[side][play.zone] -= 1;
          log.push(`${play.card.name} is caught by pressure: ${pressurePenaltyText(play.zone)} this period.`);
        }

        if (play.card.createsChance) {
          const chance = chanceFrom(play.card.createsChance, play.card.id, period);
          work.generated.push({ kind: 'chance', card: chance });
          log.push(`${play.card.actionName ?? play.card.name}: ${chance.name} added for next period.`);
        }

        if (play.card.onReveal === 'press_next') {
          pressureWaiting[opponent][play.zone] += 1;
          log.push(`${play.card.actionName ?? play.card.name}: pressure waits for the next opposing reveal in ${play.zone}.`);
        }
        continue;
      }

      if (play.kind === 'chance') {
        const receiverBonus = play.card.chanceType === 'cross'
          && work.team.board.ATT.some((deployed) => (deployed.card as LabPlayer).receivesCross)
          ? 2
          : 0;
        const attackBoost = play.card.attackBoost + receiverBonus;
        work.boost.attack += attackBoost;
        log.push(`${actor} reveal ${play.card.name} → ATT: +${attackBoost} ATT, then the Chance leaves its slot.`);
        continue;
      }

      const count = work.team.board[play.zone].length;
      if (play.zone === 'ATT') work.boost.attack += count * 2;
      if (play.zone === 'DEF') work.boost.defence += count * 2;
      if (play.zone === 'MID') {
        work.boost.attack += count;
        work.boost.defence += count;
      }
      log.push(`${actor} reveal ${MANAGER_NAME} → ${play.zone}: resolves on ${count} player${count === 1 ? '' : 's'}, then the Manager leaves its slot.`);
    }
  }

  for (const side of ['home', 'away'] as const) {
    const work = works[side];
    const plays = pendingBySide[side];
    const playedIds = new Set(plays.filter((play) => play.kind !== 'manager').map((play) => play.handId));
    work.team = {
      ...work.team,
      managerAvailable: work.team.managerAvailable && !plays.some((play) => play.kind === 'manager'),
      hand: work.team.hand.filter((card) => !playedIds.has(handId(card))),
    };
  }

  return { home: works.home, away: works.away, priority, log };
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
    const reservations = slotReservations(pending);

    for (const handCard of team.hand) {
      const id = handId(handCard);
      if (used.has(id)) continue;
      if (handCard.card.cost > remaining) continue;

      if (handCard.kind === 'chance') {
        if (!canPlayToZone(team.board, 'ATT', reservations)) continue;
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
        if (!canPlayToZone(team.board, zone, reservations)) continue;
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
      const counts = ZONES
        .filter((zone) => canPlayToZone(team.board, zone, reservations))
        .map((zone) => ({ zone, count: projectedBoard[zone].length }));
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

function ZoneBoard({ zone, home, liveHome, away, pending, selectedPlayer, onZone }: {
  zone: V8Zone;
  home: V8Board;
  liveHome: V8Board;
  away: V8Board;
  pending: readonly PendingPlay[];
  selectedPlayer: LabPlayer | null;
  onZone: (zone: V8Zone) => void;
}) {
  const penalty = selectedPlayer ? formatPenalty(selectedPlayer, zone) : null;
  const transients = pending.filter((play) => play.zone === zone && play.kind !== 'player');
  const occupancy = zoneOccupancy(liveHome, zone, slotReservations(pending));
  const emptyHomeSlots = Math.max(0, 4 - home[zone].length - transients.length);

  return (
    <button className="v8-zone" onClick={() => onZone(zone)}>
      <div className="v8-zone__heading">
        <strong>{zone}</strong>
        <span>{penalty ?? `${occupancy}/4`}</span>
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
        {transients.map((play) => (
          <span key={play.handId} className="v8-chip v8-chip--transient">
            {play.kind === 'manager' ? MANAGER_NAME : play.card.name}
            <b>{play.kind === 'manager' ? 'MANAGER · REVEAL' : 'CHANCE · REVEAL'}</b>
          </span>
        ))}
        {Array.from({ length: emptyHomeSlots }).map((_, index) => <i key={`home-${index}`} />)}
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
  const currentPriority = useMemo(
    () => revealPriority(homeScore, awayScore, home.board, away.board, gameSeed + periodIndex * 101),
    [homeScore, awayScore, home.board, away.board, gameSeed, periodIndex],
  );

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
    const reservations = slotReservations(pending);

    if (selected.kind === 'manager') {
      if (!home.managerAvailable || energyLeft < MANAGER_COST || pendingIds.has('manager')) return;
      if (!canPlayToZone(home.board, zone, reservations)) return;
      setPending((current) => [...current, { kind: 'manager', handId: 'manager', zone, cost: MANAGER_COST }]);
      setSelected(null);
      return;
    }

    const handCard = home.hand.find((card) => handId(card) === selected.id);
    if (!handCard || handCard.card.cost > energyLeft) return;

    if (handCard.kind === 'chance') {
      if (zone !== 'ATT' || !canPlayToZone(home.board, zone, reservations)) return;
      setPending((current) => [...current, { kind: 'chance', handId: handCard.card.id, card: handCard.card, zone: 'ATT', cost: handCard.card.cost }]);
      setSelected(null);
      return;
    }

    if (!canPlayToZone(home.board, zone, reservations)) return;
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
    const reveal = resolveRevealWindow(
      home,
      away,
      pending,
      botPending,
      homeScore,
      awayScore,
      periodIndex + 1,
      gameSeed + periodIndex * 101,
    );
    const homeBoard = reveal.home.team.board;
    const awayBoard = reveal.away.team.board;
    const homeBoost = { ...reveal.home.boost };
    const awayBoost = { ...reveal.away.boost };
    const condition = conditionEnabled ? slipperyPitchAdjustment(homeBoard, awayBoard, periodIndex, gameSeed) : null;

    if (condition?.side === 'home') {
      homeBoost.attack += condition.attack;
      homeBoost.defence += condition.defence;
    }
    if (condition?.side === 'away') {
      awayBoost.attack += condition.attack;
      awayBoost.defence += condition.defence;
    }

    const homeFinal = totalsWithPenalties(homeBoard, reveal.home.penalties);
    const awayFinal = totalsWithPenalties(awayBoard, reveal.away.penalties);
    const scoredHome = goalsFromAttackDefence(homeFinal.attack + homeBoost.attack, awayFinal.defence + awayBoost.defence);
    const scoredAway = goalsFromAttackDefence(awayFinal.attack + awayBoost.attack, homeFinal.defence + homeBoost.defence);
    const newHomeScore = homeScore + scoredHome;
    const newAwayScore = awayScore + scoredAway;

    const periodEvents: MatchEvent[] = [];
    const label = PERIOD_LABELS[periodIndex]!;
    periodEvents.push({
      period: periodIndex + 1,
      text: `${label} REVEAL: ${reveal.priority.first === 'home' ? 'YOU' : 'CPU'} first · ${priorityReasonLabel(reveal.priority.reason)}.`,
    });
    for (const text of reveal.log) periodEvents.push({ period: periodIndex + 1, text });
    if (condition) periodEvents.push({ period: periodIndex + 1, text: `Slippery Pitch: ${condition.name} loses 5 ${condition.stat} this period.` });
    periodEvents.push({ period: periodIndex + 1, text: `${label}: ${homeFinal.attack + homeBoost.attack} ATT vs ${awayFinal.defence + awayBoost.defence} DEF → ${scoredHome} goal${scoredHome === 1 ? '' : 's'}` });
    periodEvents.push({ period: periodIndex + 1, text: `${label}: opponent ${awayFinal.attack + awayBoost.attack} ATT vs ${homeFinal.defence + homeBoost.defence} DEF → ${scoredAway} goal${scoredAway === 1 ? '' : 's'}` });

    setHomeScore(newHomeScore);
    setAwayScore(newAwayScore);
    setEvents((current) => [...periodEvents, ...current].slice(0, 20));
    setPending([]);
    setSelected(null);

    if (periodIndex === 3) {
      setHome({ ...reveal.home.team, hand: [...reveal.home.team.hand, ...reveal.home.generated] });
      setAway({ ...reveal.away.team, hand: [...reveal.away.team.hand, ...reveal.away.generated] });
      setFinished(true);
      return;
    }

    const nextHome = drawTwo({ ...reveal.home.team, hand: [...reveal.home.team.hand, ...reveal.home.generated] });
    const nextAway = drawTwo({ ...reveal.away.team, hand: [...reveal.away.team.hand, ...reveal.away.generated] });
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
          <ZoneBoard
            key={zone}
            zone={zone}
            home={projectedHome}
            liveHome={home.board}
            away={away.board}
            pending={pending}
            selectedPlayer={selectedPlayer}
            onZone={queueToZone}
          />
        ))}
      </section>

      <section className="v8-commit">
        <div>
          <strong>{pending.length ? `${pending.length} queued` : 'Choose a card, then a zone'}</strong>
          <span>{currentPriority.first === 'home' ? 'YOU REVEAL FIRST' : 'CPU REVEALS FIRST'} · {priorityReasonLabel(currentPriority.reason)} · cards resolve in play order.</span>
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
        <button className={curveName === 'controlled' ? 'is-active' : ''} onClick={() => reset(gameSeed + 31, 'controlled')}>3 / 5 / 7 / 9</button>
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
