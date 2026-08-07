export type V8Zone = 'DEF' | 'MID' | 'ATT';

export type V8ActionTiming = 'on_reveal' | 'ongoing' | 'triggered' | 'end_of_period';

export type V8Status = 'moveable';

export interface V8ActionDefinition {
  id: string;
  name: string;
  timing: V8ActionTiming;
  text: string;
}

export interface V8PlayerCard {
  id: string;
  name: string;
  position: string;
  printedAttack: number;
  printedDefence: number;
  cost: number;
  naturalZones: readonly V8Zone[];
  actions?: readonly V8ActionDefinition[];
  statuses?: readonly V8Status[];
}

export type V8ChanceType = 'cross' | 'through_ball' | 'corner' | 'set_piece' | 'open_play';

export interface V8ChanceCard {
  kind: 'chance';
  id: string;
  name: string;
  chanceType: V8ChanceType;
  cost: number;
  targetZone: V8Zone;
  attackBoost: number;
  defenceBoost?: number;
}

export interface V8ManagerCard {
  kind: 'manager';
  id: string;
  name: string;
  cost: number;
  action: V8ActionDefinition;
}

export interface V8DeployedPlayer {
  card: V8PlayerCard;
  zone: V8Zone;
  deployedOrder: number;
}

export type V8Board = Record<V8Zone, readonly V8DeployedPlayer[]>;

export interface V8TeamTotals {
  attack: number;
  defence: number;
  byZone: Record<V8Zone, { attack: number; defence: number }>;
}

export interface V8TemporaryZoneBoost {
  zone: V8Zone;
  attack?: number;
  defence?: number;
}

export interface V8PeriodScore {
  homeGoals: number;
  awayGoals: number;
  homeAttack: number;
  homeDefence: number;
  awayAttack: number;
  awayDefence: number;
}

export const V8_PERIODS = [
  { index: 1, label: '0–22', minuteStart: 0, minuteEnd: 22 },
  { index: 2, label: '22–HT', minuteStart: 22, minuteEnd: 45 },
  { index: 3, label: 'HT–66', minuteStart: 45, minuteEnd: 66 },
  { index: 4, label: '66–FT', minuteStart: 66, minuteEnd: 90 },
] as const;

export const V8_ZONE_CAPACITY = 4;
export const V8_GOAL_BAND = 5;
export const V8_OPENING_PLAYER_CARDS = 3;
export const V8_DRAW_PER_PERIOD = 2;

const ZONE_INDEX: Record<V8Zone, number> = { DEF: 0, MID: 1, ATT: 2 };

export function emptyV8Board(): V8Board {
  return { DEF: [], MID: [], ATT: [] };
}

/**
 * Natural = no penalty. One zone away = -2 ATT and -2 DEF. Two zones away = -5/-5.
 * Multi-zone players use the nearest natural zone.
 */
export function outOfPositionPenalty(card: Pick<V8PlayerCard, 'naturalZones'>, targetZone: V8Zone): 0 | 2 | 5 {
  if (card.naturalZones.includes(targetZone)) return 0;

  const target = ZONE_INDEX[targetZone];
  const distance = Math.min(...card.naturalZones.map((zone) => Math.abs(target - ZONE_INDEX[zone])));
  return distance === 1 ? 2 : 5;
}

export function effectiveStatsInZone(
  card: Pick<V8PlayerCard, 'printedAttack' | 'printedDefence' | 'naturalZones'>,
  targetZone: V8Zone,
): { attack: number; defence: number; penalty: 0 | 2 | 5 } {
  const penalty = outOfPositionPenalty(card, targetZone);
  return {
    attack: card.printedAttack - penalty,
    defence: card.printedDefence - penalty,
    penalty,
  };
}

/**
 * DEF contributes DEF only; ATT contributes ATT only; MID contributes both in full.
 */
export function contributionInZone(
  card: Pick<V8PlayerCard, 'printedAttack' | 'printedDefence' | 'naturalZones'>,
  targetZone: V8Zone,
): { attack: number; defence: number; penalty: 0 | 2 | 5 } {
  const stats = effectiveStatsInZone(card, targetZone);

  if (targetZone === 'DEF') return { attack: 0, defence: stats.defence, penalty: stats.penalty };
  if (targetZone === 'ATT') return { attack: stats.attack, defence: 0, penalty: stats.penalty };
  return stats;
}

/**
 * Useful for V8 card calibration: this is the amount of board power a card contributes
 * when played naturally, before Actions. MID is deliberately ATT + DEF because both count.
 */
export function naturalZonePower(card: Pick<V8PlayerCard, 'printedAttack' | 'printedDefence' | 'naturalZones'>): number {
  return Math.max(...card.naturalZones.map((zone) => {
    const contribution = contributionInZone(card, zone);
    return contribution.attack + contribution.defence;
  }));
}

export function teamTotals(board: V8Board, boosts: readonly V8TemporaryZoneBoost[] = []): V8TeamTotals {
  const byZone: V8TeamTotals['byZone'] = {
    DEF: { attack: 0, defence: 0 },
    MID: { attack: 0, defence: 0 },
    ATT: { attack: 0, defence: 0 },
  };

  for (const zone of ['DEF', 'MID', 'ATT'] as const) {
    for (const deployed of board[zone]) {
      const contribution = contributionInZone(deployed.card, zone);
      byZone[zone].attack += contribution.attack;
      byZone[zone].defence += contribution.defence;
    }
  }

  for (const boost of boosts) {
    byZone[boost.zone].attack += boost.attack ?? 0;
    byZone[boost.zone].defence += boost.defence ?? 0;
  }

  return {
    attack: byZone.ATT.attack + byZone.MID.attack,
    defence: byZone.DEF.defence + byZone.MID.defence,
    byZone,
  };
}

/** For every complete +5 ATT over opposing DEF, score one goal. */
export function goalsFromAttackDefence(attack: number, opposingDefence: number): number {
  return Math.max(0, Math.floor((attack - opposingDefence) / V8_GOAL_BAND));
}

/**
 * Current prototype semantics: goals are banked at the end of each period from the full,
 * persistent board state. This is deliberately isolated so alternative banking semantics
 * can be compared without changing card placement or stat rules.
 */
export function resolvePeriodScore(
  homeBoard: V8Board,
  awayBoard: V8Board,
  homeBoosts: readonly V8TemporaryZoneBoost[] = [],
  awayBoosts: readonly V8TemporaryZoneBoost[] = [],
): V8PeriodScore {
  const home = teamTotals(homeBoard, homeBoosts);
  const away = teamTotals(awayBoard, awayBoosts);

  return {
    homeGoals: goalsFromAttackDefence(home.attack, away.defence),
    awayGoals: goalsFromAttackDefence(away.attack, home.defence),
    homeAttack: home.attack,
    homeDefence: home.defence,
    awayAttack: away.attack,
    awayDefence: away.defence,
  };
}

export function canDeployToZone(board: V8Board, zone: V8Zone): boolean {
  return board[zone].length < V8_ZONE_CAPACITY;
}

export function deployPlayer(board: V8Board, card: V8PlayerCard, zone: V8Zone, deployedOrder: number): V8Board {
  if (!canDeployToZone(board, zone)) throw new Error(`${zone} is full`);

  return {
    ...board,
    [zone]: [...board[zone], { card, zone, deployedOrder }],
  };
}

export function canMovePlayer(card: Pick<V8PlayerCard, 'statuses'>): boolean {
  return card.statuses?.includes('moveable') ?? false;
}

export interface V8OpeningDraw<TPlayer extends V8PlayerCard = V8PlayerCard> {
  hand: readonly TPlayer[];
  drawPile: readonly TPlayer[];
}

/**
 * The Manager is not shuffled into this pile. It starts available beside the three-player hand.
 */
export function openingDraw<TPlayer extends V8PlayerCard>(orderedPlayers: readonly TPlayer[]): V8OpeningDraw<TPlayer> {
  if (orderedPlayers.length !== 11) throw new Error('A V8 XI must contain exactly 11 player cards');
  return {
    hand: orderedPlayers.slice(0, V8_OPENING_PLAYER_CARDS),
    drawPile: orderedPlayers.slice(V8_OPENING_PLAYER_CARDS),
  };
}

export function drawPlayers<TPlayer extends V8PlayerCard>(
  hand: readonly TPlayer[],
  drawPile: readonly TPlayer[],
  count = V8_DRAW_PER_PERIOD,
): V8OpeningDraw<TPlayer> {
  const drawn = drawPile.slice(0, count);
  return {
    hand: [...hand, ...drawn],
    drawPile: drawPile.slice(drawn.length),
  };
}

/** Chance cards are transient hand cards: they cost energy, resolve, disappear, and never use a zone slot. */
export function resolveChanceCard(chance: V8ChanceCard): V8TemporaryZoneBoost {
  return {
    zone: chance.targetZone,
    attack: chance.attackBoost,
    defence: chance.defenceBoost ?? 0,
  };
}

/** Manager cards are also transient. Their individual Action decides the actual boost/effect. */
export function spendTransientCardEnergy(availableEnergy: number, card: Pick<V8ChanceCard | V8ManagerCard, 'cost'>): number {
  if (card.cost > availableEnergy) throw new Error('Not enough energy');
  return availableEnergy - card.cost;
}
