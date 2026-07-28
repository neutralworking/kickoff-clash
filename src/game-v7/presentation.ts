import {
  calculatedChanceCount,
  type PeriodNumber,
  type PeriodSnapshot,
  type Sector,
  type TeamSide,
} from '@/engine-v7';
import type { SubDecision } from './adapter/lineup';
import type { UiMatchView, UiPlayerView } from './adapter/match';

export type PresentationBeatKind =
  | 'reveal'
  | 'lock'
  | 'pressure'
  | 'threshold'
  | 'chances'
  | 'adjustment'
  | 'overview'
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

export interface PressureModifier {
  id: string;
  cardId?: string;
  label: string;
  detail: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface PressureSidePresentation {
  attack: number;
  enemyDefence: number;
  difference: number;
  /** Pure design-rule result: ceil((ATT - enemy DEF) / 5), minimum zero. */
  baseChances: number;
  /** Chances introduced after the base ATT-v-DEF calculation. */
  addedChances: number;
  /** Generated chances removed before rolling. */
  cancelledChances: number;
  /** Actual surviving chances that will roll. */
  finalChances: number;
  /** Compatibility alias for finalChances. */
  chances: number;
  sectors: SectorChanceCounts;
  modifiers: PressureModifier[];
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
  thresholdIndex?: number;
  thresholdTotal?: number;
  chanceIndex?: number;
  chanceTotal?: number;
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

function allPlayers(view?: UiMatchView): UiPlayerView[] {
  return view
    ? [...view.player.active, ...view.player.bench, ...view.opponent.active, ...view.opponent.bench]
    : [];
}

function playerName(view: UiMatchView | undefined, cardId?: string): string | undefined {
  if (!view || !cardId) return undefined;
  return allPlayers(view).find((player) => player.cardId === cardId)?.shortName;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function statModifierDetail(effect: Extract<PeriodSnapshot['ledger'][number]['effect'], { type: 'modify_stat' }>): string {
  const label = effect.stat === 'attack' ? 'ATT' : 'DEF';
  if (effect.mode === 'set') return `${label} set to ${effect.amount}`;
  if (effect.mode === 'multiply') return `${label} ×${effect.amount}`;
  return `${signed(effect.amount)} ${label}`;
}

function chanceTargetSide(entry: PeriodSnapshot['ledger'][number]): TeamSide | undefined {
  if (!entry.tokenTarget) return undefined;
  if (entry.tokenTarget.side === 'own') return entry.side;
  return entry.side === 'player' ? 'opponent' : 'player';
}

function modifiersForSide(
  snapshot: PeriodSnapshot,
  side: TeamSide,
  view?: UiMatchView,
): PressureModifier[] {
  const active = snapshot.effective[side].filter((player) => player.zone === 'active');
  const activeIds = new Set(active.map((player) => player.cardId));
  const modifiers: PressureModifier[] = [];

  for (const entry of snapshot.ledger) {
    const source = playerName(view, entry.sourceCardId) ?? 'Team effect';
    if (entry.effect.type === 'modify_stat') {
      const appliesHere = entry.targetIds.some((cardId) => activeIds.has(cardId));
      if (!appliesHere) continue;
      const amount = entry.effect.mode === 'flat' ? entry.effect.amount : 0;
      modifiers.push({
        id: entry.id,
        cardId: entry.sourceCardId,
        label: `${source} · ${entry.actionName}`,
        detail: statModifierDetail(entry.effect),
        tone: entry.effect.mode === 'flat' && amount < 0 ? 'negative' : 'positive',
      });
      continue;
    }

    if (entry.effect.type === 'add_chance' && entry.side === side) {
      modifiers.push({
        id: entry.id,
        cardId: entry.sourceCardId,
        label: `${source} · ${entry.actionName}`,
        detail: `+${entry.effect.count} ${entry.effect.count === 1 ? 'chance' : 'chances'}`,
        tone: 'positive',
      });
      continue;
    }

    if (entry.effect.type === 'cancel_chance' && chanceTargetSide(entry) === side) {
      modifiers.push({
        id: entry.id,
        cardId: entry.sourceCardId,
        label: `${source} · ${entry.actionName}`,
        detail: `−${entry.effect.count} ${entry.effect.count === 1 ? 'chance' : 'chances'}`,
        tone: 'negative',
      });
    }
  }

  for (const player of active) {
    if (!player.outOfPosition && !player.emergencyGoalkeeper) continue;
    const name = playerName(view, player.cardId) ?? player.cardId;
    modifiers.push({
      id: `position:${side}:${player.cardId}`,
      cardId: player.cardId,
      label: `${name} · ${player.emergencyGoalkeeper ? 'Emergency goalkeeper' : 'Out of position'}`,
      detail: player.emergencyGoalkeeper ? 'Placement penalty applied' : '−2 ATT · −2 DEF',
      tone: 'negative',
    });
  }

  return modifiers;
}

function sidePressure(snapshot: PeriodSnapshot, side: TeamSide, view?: UiMatchView): PressureSidePresentation {
  const enemy: TeamSide = side === 'player' ? 'opponent' : 'player';
  const attack = sumActive(snapshot, side, 'attack');
  const enemyDefence = sumActive(snapshot, enemy, 'defence');
  const difference = attack - enemyDefence;
  const baseChances = calculatedChanceCount(attack, enemyDefence);
  const generated = snapshot.tokenOutcomes.filter((token) => token.side === side);
  const cancelledChances = generated.filter((token) => token.cancelled).length;
  const finalChances = generated.length - cancelledChances;
  const addedChances = generated.length - baseChances;
  const sectors = emptySectors();
  for (const token of generated) {
    if (!token.cancelled) sectors[token.sector] += 1;
  }

  return {
    attack,
    enemyDefence,
    difference,
    baseChances,
    addedChances,
    cancelledChances,
    finalChances,
    chances: finalChances,
    sectors,
    modifiers: modifiersForSide(snapshot, side, view),
  };
}

export function pressureFromSnapshot(snapshot: PeriodSnapshot, view?: UiMatchView): PressurePresentation {
  return {
    player: sidePressure(snapshot, 'player', view),
    opponent: sidePressure(snapshot, 'opponent', view),
  };
}

function activeAttackerFor(snapshot: PeriodSnapshot, side: TeamSide, sector: Sector): string | undefined {
  return snapshot.effective[side]
    .filter((player) => player.zone === 'active' && player.sector === sector)
    .sort((a, b) => b.attack - a.attack || a.cardId.localeCompare(b.cardId))[0]?.cardId;
}

function pressureSequence(
  snapshot: PeriodSnapshot,
  pressure: PressurePresentation,
  side: TeamSide,
): PresentationBeat[] {
  const data = pressure[side];
  const sideLabel = side === 'player' ? 'Your' : 'Their';
  const beats: PresentationBeat[] = [{
    id: `presentation:${snapshot.period}:pressure:${side}`,
    kind: 'pressure',
    period: snapshot.period,
    side,
    title: `${sideLabel} pressure`,
    detail: `${data.attack} ATT − ${data.enemyDefence} DEF`,
    durationMs: 720,
    pressure,
  }];

  for (let index = 1; index <= data.baseChances; index += 1) {
    const visiblePressure = Math.min(Math.max(0, data.difference), index * 5);
    beats.push({
      id: `presentation:${snapshot.period}:threshold:${side}:${index}`,
      kind: 'threshold',
      period: snapshot.period,
      side,
      title: `Chance band ${index}`,
      detail: `${visiblePressure} of ${Math.max(0, data.difference)} positive pressure counted.`,
      durationMs: 500,
      pressure,
      thresholdIndex: index,
      thresholdTotal: data.baseChances,
    });
  }

  beats.push({
    id: `presentation:${snapshot.period}:chances:${side}`,
    kind: 'chances',
    period: snapshot.period,
    side,
    title: `${data.baseChances} base ${data.baseChances === 1 ? 'chance' : 'chances'}`,
    detail: `${data.attack} ATT − ${data.enemyDefence} DEF = ${signed(data.difference)} → ${data.baseChances}.`,
    durationMs: 900,
    pressure,
    thresholdIndex: data.baseChances,
    thresholdTotal: data.baseChances,
  });

  if (data.addedChances !== 0 || data.cancelledChances > 0) {
    const adjustments = [
      data.addedChances !== 0 ? `${signed(data.addedChances)} added` : null,
      data.cancelledChances > 0 ? `−${data.cancelledChances} cancelled` : null,
    ].filter(Boolean).join(' · ');
    beats.push({
      id: `presentation:${snapshot.period}:adjustment:${side}`,
      kind: 'adjustment',
      period: snapshot.period,
      side,
      title: `${data.finalChances} final ${data.finalChances === 1 ? 'chance' : 'chances'}`,
      detail: `${data.baseChances} base · ${adjustments}`,
      durationMs: 1000,
      pressure,
    });
  }

  return beats;
}

export function buildPeriodPresentation(
  snapshot: PeriodSnapshot,
  view: UiMatchView,
  fullTime = false,
): PresentationBeat[] {
  const pressure = pressureFromSnapshot(snapshot, view);
  const beats: PresentationBeat[] = [{
    id: `presentation:${snapshot.period}:lock`,
    kind: 'lock',
    period: snapshot.period,
    title: `Period ${snapshot.period} locked`,
    detail: 'Lineups are set. Calculating Home ATT against Away DEF, then Away ATT against Home DEF.',
    durationMs: 650,
    pressure,
  }];

  beats.push(...pressureSequence(snapshot, pressure, 'player'));
  beats.push(...pressureSequence(snapshot, pressure, 'opponent'));
  beats.push({
    id: `presentation:${snapshot.period}:overview`,
    kind: 'overview',
    period: snapshot.period,
    title: `${pressure.player.finalChances}–${pressure.opponent.finalChances} chances`,
    detail: 'Base pressure and action adjustments are resolved. Each surviving chance now rolls.',
    durationMs: 1050,
    pressure,
  });

  const outcomes = [...snapshot.tokenOutcomes].sort((a, b) => (
    (a.side === b.side ? 0 : a.side === 'player' ? -1 : 1)
    || ({ left: 0, centre: 1, right: 2 }[a.sector] - { left: 0, centre: 1, right: 2 }[b.sector])
    || a.order - b.order
  ));
  const rollIndex: Record<TeamSide, number> = { player: 0, opponent: 0 };

  for (const token of outcomes) {
    const sideLabel = token.side === 'player' ? 'Your' : 'Their';
    const sectorLabel = token.sector[0]!.toUpperCase() + token.sector.slice(1);
    const total = pressure[token.side].finalChances;
    const cardId = token.scorerId ?? activeAttackerFor(snapshot, token.side, token.sector);

    if (token.cancelled) {
      beats.push({
        id: `presentation:${snapshot.period}:${token.tokenId}:cancelled`,
        kind: 'cancelled',
        period: snapshot.period,
        side: token.side,
        sector: token.sector,
        cardId,
        title: `${sideLabel} chance cancelled`,
        detail: `${sectorLabel} lane shut down before the roll.`,
        durationMs: 850,
      });
      continue;
    }

    rollIndex[token.side] += 1;
    beats.push({
      id: `presentation:${snapshot.period}:${token.tokenId}:roll`,
      kind: 'roll',
      period: snapshot.period,
      side: token.side,
      sector: token.sector,
      cardId,
      title: `${sideLabel} chance ${rollIndex[token.side]} of ${total}`,
      detail: `${sectorLabel} attack · needs ${token.threshold}+`,
      durationMs: token.rerollsUsed > 0 ? 1900 : 1650,
      rolls: [...token.rolls],
      finalRoll: token.finalRoll,
      threshold: token.threshold,
      scored: token.scored,
      chanceIndex: rollIndex[token.side],
      chanceTotal: total,
    });

    if (token.scored) {
      const scorer = playerName(view, token.scorerId) ?? 'The attack';
      beats.push({
        id: `presentation:${snapshot.period}:${token.tokenId}:goal`,
        kind: 'goal',
        period: snapshot.period,
        side: token.side,
        sector: token.sector,
        cardId,
        title: 'GOAL!',
        detail: `${scorer} converts from the ${token.sector}.`,
        durationMs: 1900,
        rolls: [...token.rolls],
        finalRoll: token.finalRoll,
        threshold: token.threshold,
        scored: true,
        chanceIndex: rollIndex[token.side],
        chanceTotal: total,
      });
    } else {
      beats.push({
        id: `presentation:${snapshot.period}:${token.tokenId}:miss`,
        kind: 'miss',
        period: snapshot.period,
        side: token.side,
        sector: token.sector,
        cardId,
        title: 'Chance missed',
        detail: `${token.finalRoll} was below the ${token.threshold}+ target.`,
        durationMs: 900,
        rolls: [...token.rolls],
        finalRoll: token.finalRoll,
        threshold: token.threshold,
        scored: false,
        chanceIndex: rollIndex[token.side],
        chanceTotal: total,
      });
    }
  }

  beats.push({
    id: `presentation:${snapshot.period}:end`,
    kind: fullTime ? 'full_time' : 'period_end',
    period: snapshot.period,
    title: fullTime ? 'Full time' : `Period ${snapshot.period} complete`,
    detail: `${snapshot.score.player}–${snapshot.score.opponent}`,
    durationMs: fullTime ? 1500 : 850,
  });

  return beats;
}

function findPlayer(view: UiMatchView, cardId: string): UiPlayerView | undefined {
  return [...view.player.active, ...view.player.bench].find((player) => player.cardId === cardId);
}

function chanceCount(attack: number, defence: number): number {
  return calculatedChanceCount(attack, defence);
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
      detail: `${signed(attackDelta)} ATT · ${signed(defenceDelta)} DEF${outOfPositionPenalty ? ' · −2/−2 out of position' : ''}`,
      durationMs: 1100,
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
