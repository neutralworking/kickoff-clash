import type { PeriodNumber, PeriodSnapshot, Sector, TeamSide } from '@/engine-v7';
import type { SubDecision } from './adapter/lineup';
import type { UiMatchView, UiPlayerView } from './adapter/match';

export type PresentationBeatKind =
  | 'reveal'
  | 'pressure'
  | 'chances'
  | 'roll'
  | 'cancelled'
  | 'goal'
  | 'miss'
  | 'period_end'
  | 'full_time';

export interface SectorChanceCounts {
  left: number;
  centre: number;
  right: number;
}

export interface PressureSidePresentation {
  attack: number;
  enemyDefence: number;
  difference: number;
  chances: number;
  sectors: SectorChanceCounts;
}

export interface PressurePresentation {
  player: PressureSidePresentation;
  opponent: PressureSidePresentation;
}

export interface PresentationBeat {
  id: string;
  kind: PresentationBeatKind;
  period: PeriodNumber;
  side?: TeamSide;
  sector?: Sector;
  cardId?: string;
  title: string;
  detail?: string;
  durationMs: number;
  pressure?: PressurePresentation;
  rolls?: number[];
  finalRoll?: number;
  threshold?: number;
  scored?: boolean;
  substitution?: {
    outCardId: string;
    inCardId: string;
    attackDelta: number;
    defenceDelta: number;
    chanceDelta: number;
  };
}

function emptySectors(): SectorChanceCounts {
  return { left: 0, centre: 0, right: 0 };
}

function sumActive(snapshot: PeriodSnapshot, side: TeamSide, stat: 'attack' | 'defence'): number {
  return snapshot.effective[side]
    .filter((player) => player.zone === 'active')
    .reduce((total, player) => total + Math.max(0, player[stat]), 0);
}

function sidePressure(snapshot: PeriodSnapshot, side: TeamSide): PressureSidePresentation {
  const enemy: TeamSide = side === 'player' ? 'opponent' : 'player';
  const attack = sumActive(snapshot, side, 'attack');
  const enemyDefence = sumActive(snapshot, enemy, 'defence');
  const sectors = emptySectors();
  const tokens = snapshot.tokenOutcomes.filter((token) => token.side === side);
  for (const token of tokens) sectors[token.sector] += 1;
  return {
    attack,
    enemyDefence,
    difference: attack - enemyDefence,
    chances: tokens.length,
    sectors,
  };
}

export function pressureFromSnapshot(snapshot: PeriodSnapshot): PressurePresentation {
  return {
    player: sidePressure(snapshot, 'player'),
    opponent: sidePressure(snapshot, 'opponent'),
  };
}

function playerName(view: UiMatchView, cardId?: string): string | undefined {
  if (!cardId) return undefined;
  const all = [
    ...view.player.active,
    ...view.player.bench,
    ...view.opponent.active,
    ...view.opponent.bench,
  ];
  return all.find((player) => player.cardId === cardId)?.shortName;
}

export function buildPeriodPresentation(
  snapshot: PeriodSnapshot,
  view: UiMatchView,
  fullTime = false,
): PresentationBeat[] {
  const pressure = pressureFromSnapshot(snapshot);
  const beats: PresentationBeat[] = [
    {
      id: `presentation:${snapshot.period}:pressure`,
      kind: 'pressure',
      period: snapshot.period,
      title: 'Pressure building',
      detail: 'ATT pushes against the opposing DEF in five-point steps.',
      durationMs: 1050,
      pressure,
    },
    {
      id: `presentation:${snapshot.period}:chances`,
      kind: 'chances',
      period: snapshot.period,
      title: `${pressure.player.chances}–${pressure.opponent.chances} chances`,
      detail: 'The bars lock. Each surviving chance now rolls.',
      durationMs: 1150,
      pressure,
    },
  ];

  const outcomes = [...snapshot.tokenOutcomes].sort((a, b) => (
    (a.side === b.side ? 0 : a.side === 'player' ? -1 : 1)
    || ({ left: 0, centre: 1, right: 2 }[a.sector] - { left: 0, centre: 1, right: 2 }[b.sector])
    || a.order - b.order
  ));

  for (const token of outcomes) {
    const sideLabel = token.side === 'player' ? 'Home' : 'Away';
    const sectorLabel = token.sector[0]!.toUpperCase() + token.sector.slice(1);
    if (token.cancelled) {
      beats.push({
        id: `presentation:${snapshot.period}:${token.tokenId}:cancelled`,
        kind: 'cancelled',
        period: snapshot.period,
        side: token.side,
        sector: token.sector,
        title: `${sideLabel} chance cancelled`,
        detail: `${sectorLabel} lane shut down before the roll.`,
        durationMs: 800,
      });
      continue;
    }

    beats.push({
      id: `presentation:${snapshot.period}:${token.tokenId}:roll`,
      kind: 'roll',
      period: snapshot.period,
      side: token.side,
      sector: token.sector,
      cardId: token.scorerId,
      title: `${sideLabel} roll`,
      detail: `${sectorLabel} chance · needs ${token.threshold}+`,
      durationMs: token.rerollsUsed > 0 ? 1450 : 1150,
      rolls: [...token.rolls],
      finalRoll: token.finalRoll,
      threshold: token.threshold,
      scored: token.scored,
    });

    if (token.scored) {
      const scorer = playerName(view, token.scorerId) ?? 'The attack';
      beats.push({
        id: `presentation:${snapshot.period}:${token.tokenId}:goal`,
        kind: 'goal',
        period: snapshot.period,
        side: token.side,
        sector: token.sector,
        cardId: token.scorerId,
        title: 'GOAL!',
        detail: `${scorer} converts from the ${token.sector}.`,
        durationMs: 1900,
        rolls: [...token.rolls],
        finalRoll: token.finalRoll,
        threshold: token.threshold,
        scored: true,
      });
    } else {
      beats.push({
        id: `presentation:${snapshot.period}:${token.tokenId}:miss`,
        kind: 'miss',
        period: snapshot.period,
        side: token.side,
        sector: token.sector,
        title: 'Chance missed',
        detail: `${token.finalRoll} was below the ${token.threshold}+ target.`,
        durationMs: 850,
        rolls: [...token.rolls],
        finalRoll: token.finalRoll,
        threshold: token.threshold,
        scored: false,
      });
    }
  }

  beats.push({
    id: `presentation:${snapshot.period}:end`,
    kind: fullTime ? 'full_time' : 'period_end',
    period: snapshot.period,
    title: fullTime ? 'Full time' : `Period ${snapshot.period} complete`,
    detail: `${snapshot.score.player}–${snapshot.score.opponent}`,
    durationMs: fullTime ? 1400 : 750,
  });

  return beats;
}

function findPlayer(view: UiMatchView, cardId: string): UiPlayerView | undefined {
  return [...view.player.active, ...view.player.bench].find((player) => player.cardId === cardId);
}

function chanceCount(attack: number, defence: number): number {
  const difference = attack - defence;
  return difference <= 0 ? 0 : Math.ceil(difference / 5);
}

export interface SubstitutionPreview {
  attackDelta: number;
  defenceDelta: number;
  homeChanceDelta: number;
  awayChanceDelta: number;
  nextHomeChances: number;
  nextAwayChances: number;
}

export function previewSubstitutions(view: UiMatchView, subs: readonly SubDecision[]): SubstitutionPreview {
  const playerAttack = view.player.active.reduce((sum, player) => sum + player.attack, 0);
  const playerDefence = view.player.active.reduce((sum, player) => sum + player.defence, 0);
  const opponentAttack = view.opponent.active.reduce((sum, player) => sum + player.attack, 0);
  const opponentDefence = view.opponent.active.reduce((sum, player) => sum + player.defence, 0);
  let attackDelta = 0;
  let defenceDelta = 0;

  for (const sub of subs) {
    const outgoing = findPlayer(view, sub.outCardId);
    const incoming = findPlayer(view, sub.inCardId);
    if (!outgoing || !incoming) continue;
    const outOfPositionPenalty = incoming.sector !== outgoing.sector ? 2 : 0;
    attackDelta += Math.max(0, incoming.attack - outOfPositionPenalty) - outgoing.attack;
    defenceDelta += Math.max(0, incoming.defence - outOfPositionPenalty) - outgoing.defence;
  }

  const currentHomeChances = chanceCount(playerAttack, opponentDefence);
  const currentAwayChances = chanceCount(opponentAttack, playerDefence);
  const nextHomeChances = chanceCount(playerAttack + attackDelta, opponentDefence);
  const nextAwayChances = chanceCount(opponentAttack, playerDefence + defenceDelta);
  return {
    attackDelta,
    defenceDelta,
    homeChanceDelta: nextHomeChances - currentHomeChances,
    awayChanceDelta: nextAwayChances - currentAwayChances,
    nextHomeChances,
    nextAwayChances,
  };
}

export function buildSubstitutionRevealBeats(
  period: PeriodNumber,
  view: UiMatchView,
  subs: readonly SubDecision[],
): PresentationBeat[] {
  const preview = previewSubstitutions(view, subs);
  return subs.flatMap((sub, index) => {
    const outgoing = findPlayer(view, sub.outCardId);
    const incoming = findPlayer(view, sub.inCardId);
    if (!outgoing || !incoming) return [];
    const outOfPositionPenalty = incoming.sector !== outgoing.sector ? 2 : 0;
    const attackDelta = Math.max(0, incoming.attack - outOfPositionPenalty) - outgoing.attack;
    const defenceDelta = Math.max(0, incoming.defence - outOfPositionPenalty) - outgoing.defence;
    return [{
      id: `presentation:${period}:sub:${index}:${sub.outCardId}:${sub.inCardId}`,
      kind: 'reveal' as const,
      period,
      side: 'player' as const,
      sector: outgoing.sector,
      cardId: incoming.cardId,
      title: `${incoming.shortName} replaces ${outgoing.shortName}`,
      detail: `${attackDelta >= 0 ? '+' : ''}${attackDelta} ATT · ${defenceDelta >= 0 ? '+' : ''}${defenceDelta} DEF${outOfPositionPenalty ? ' · −2/−2 out of position' : ''}`,
      durationMs: 1050,
      substitution: {
        outCardId: outgoing.cardId,
        inCardId: incoming.cardId,
        attackDelta,
        defenceDelta,
        chanceDelta: preview.homeChanceDelta,
      },
    }];
  });
}

export interface PresentationSnapshot {
  currentBeat: PresentationBeat | null;
  history: readonly PresentationBeat[];
  pending: number;
  isPlaying: boolean;
}

export class PresentationDirector {
  private beats: PresentationBeat[] = [];
  private cursor = 0;

  append(beats: readonly PresentationBeat[]): void {
    this.beats.push(...beats);
  }

  currentBeat(): PresentationBeat | null {
    return this.beats[this.cursor] ?? null;
  }

  advance(): PresentationBeat | null {
    if (this.cursor < this.beats.length) this.cursor += 1;
    return this.currentBeat();
  }

  skip(): void {
    this.cursor = this.beats.length;
  }

  reset(): void {
    this.beats = [];
    this.cursor = 0;
  }

  snapshot(): PresentationSnapshot {
    return {
      currentBeat: this.currentBeat(),
      history: this.beats.slice(0, this.cursor),
      pending: Math.max(0, this.beats.length - this.cursor),
      isPlaying: this.currentBeat() !== null,
    };
  }
}
