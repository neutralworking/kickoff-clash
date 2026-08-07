import type {
  ChanceToken,
  ChanceType,
  MatchReceiptEvent,
  PeriodNumber,
  Sector,
  TeamSide,
} from '../../lib/match-v7/types';
import {
  allocateCalculatedChances,
  calculatedChanceCount,
  type SectorChanceAllocation,
  type SectorPressureInput,
} from '../core/chances';
import { createRng, type DeterministicRng } from '../core/rng';
import { receiptEvent } from '../runtime/receipt';
import type { LedgerEffect } from '../actions/effects';
import type { EffectivePlayer } from './stats';

// Chance creation + pre-roll shaping. Calculated ATT pressure always produces
// Box chances. Action effects may then add typed tokens, reshape type, or move a
// token without changing its identity or origin. Finisher assignment happens in
// finishers.ts after this pass, before cancellation/threshold/reroll effects.

export const DEFAULT_GOAL_ROLL: ChanceToken['minimumGoalRoll'] = 6;
export const NATURAL_SECTOR_CAP = 4;
export const ACTION_SECTOR_CAP = NATURAL_SECTOR_CAP + 1;

const SECTORS: readonly Sector[] = ['left', 'centre', 'right'];
const SECTOR_RANK: Record<Sector, number> = { left: 0, centre: 1, right: 2 };
const other = (side: TeamSide): TeamSide => (side === 'player' ? 'opponent' : 'player');

export interface ChanceCreation {
  tokens: ChanceToken[];
  count: number;
  allocation: SectorChanceAllocation[];
  receipts: MatchReceiptEvent[];
}

export interface ChanceShapeResult {
  tokens: ChanceToken[];
  receipts: MatchReceiptEvent[];
}

function sum(players: readonly EffectivePlayer[], key: 'attack' | 'defence'): number {
  return players.reduce((total, player) => total + player[key], 0);
}

function sectorInputs(
  ownActive: readonly EffectivePlayer[],
  enemyActive: readonly EffectivePlayer[],
): SectorPressureInput[] {
  return SECTORS.map((sector) => {
    const inSector = ownActive.filter((player) => player.sector === sector);
    return {
      sector,
      attack: sum(inSector, 'attack'),
      defenceAgainst: sum(enemyActive.filter((player) => player.sector === sector), 'defence'),
      attackingPlayers: inSector.length,
    };
  });
}

function chanceReceipt(
  token: ChanceToken,
  period: PeriodNumber,
  eventType: string,
  message: string,
  data: Record<string, unknown> = {},
  entry?: LedgerEffect,
): MatchReceiptEvent {
  return receiptEvent({
    id: `rcpt:${eventType}:${token.id}${entry ? `:${entry.id}` : ''}`,
    period,
    phase: 'chance_creation',
    eventType,
    message,
    side: token.side,
    ...(entry ? { sourceId: entry.sourceCardId, actionName: entry.actionName } : {}),
    data: {
      tokenId: token.id,
      origin: token.origin,
      chanceType: token.chanceType,
      sector: token.sector,
      ...(token.sourceActionInstanceId ? { sourceActionInstanceId: token.sourceActionInstanceId } : {}),
      ...data,
    },
  });
}

/** Create one side's calculated Box chances for a period from the current board. */
export function createChances(
  side: TeamSide,
  period: PeriodNumber,
  ownActive: readonly EffectivePlayer[],
  enemyActive: readonly EffectivePlayer[],
  rng: DeterministicRng,
): ChanceCreation {
  const count = calculatedChanceCount(sum(ownActive, 'attack'), sum(enemyActive, 'defence'));
  const allocation = allocateCalculatedChances(count, sectorInputs(ownActive, enemyActive), rng).map((entry) => ({
    ...entry,
    chances: Math.min(entry.chances, NATURAL_SECTOR_CAP),
  }));

  const tokens: ChanceToken[] = [];
  const receipts: MatchReceiptEvent[] = [];
  let order = 0;
  for (const sector of SECTORS) {
    const sectorChances = allocation.find((entry) => entry.sector === sector)?.chances ?? 0;
    for (let index = 0; index < sectorChances; index += 1) {
      const token: ChanceToken = {
        id: `chance:${side}:${period}:${sector}:${index}`,
        side,
        sector,
        origin: 'calculated',
        chanceType: 'box',
        order: order++,
        minimumGoalRoll: DEFAULT_GOAL_ROLL,
        rerolls: 0,
        cancelled: false,
      };
      tokens.push(token);
      receipts.push(chanceReceipt(token, period, 'chance_created', `Box chance created in the ${sector}.`));
    }
  }

  return { tokens, count, allocation, receipts };
}

/** Resolve an effect's relative chance target to a concrete team side. */
export function targetedChanceSide(entry: LedgerEffect): TeamSide | undefined {
  if (!entry.tokenTarget) return undefined;
  return entry.tokenTarget.side === 'own' ? entry.side : other(entry.side);
}

function chanceTypeMatches(token: ChanceToken, entry: LedgerEffect): boolean {
  const types = entry.tokenTarget?.chanceTypes;
  return !types || types.length === 0 || types.includes(token.chanceType);
}

/** Stable chance selection shared by shaping, finishers and token effects. */
export function selectChanceTokens(tokens: readonly ChanceToken[], entry: LedgerEffect): ChanceToken[] {
  if (!entry.tokenTarget) return [];
  const inScope = [...tokens]
    .filter((token) => (entry.sector === undefined || entry.sector === token.sector) && chanceTypeMatches(token, entry))
    .sort((a, b) => a.order - b.order || SECTOR_RANK[a.sector] - SECTOR_RANK[b.sector] || a.id.localeCompare(b.id));

  switch (entry.tokenTarget.selector) {
    case 'first':
      return inScope.slice(0, 1);
    case 'all_in_sector':
      return inScope;
    case 'first_in_sector': {
      const first = new Map<Sector, ChanceToken>();
      for (const token of inScope) if (!first.has(token.sector)) first.set(token.sector, token);
      return [...first.values()].sort((a, b) => a.order - b.order);
    }
    case 'last_in_sector': {
      const last = new Map<Sector, ChanceToken>();
      for (const token of inScope) last.set(token.sector, token);
      return [...last.values()].sort((a, b) => a.order - b.order);
    }
  }
}

function actionSector(
  entry: LedgerEffect,
  tokens: readonly ChanceToken[],
  active: readonly EffectivePlayer[],
  seed: number,
  period: PeriodNumber,
  tokenIndex: number,
): Sector {
  const effect = entry.effect;
  if (effect.type !== 'add_chance') return entry.sector ?? 'centre';
  if (effect.sectorMode === 'centre') return 'centre';
  if (effect.sectorMode === 'selected' && entry.sector) return entry.sector;
  if (effect.sectorMode === 'source') {
    return active.find((player) => player.cardId === entry.sourceCardId)?.sector ?? entry.sector ?? 'centre';
  }

  const counts = new Map<ChanceType | Sector, number>();
  for (const sector of SECTORS) counts.set(sector, tokens.filter((token) => token.sector === sector).length);
  if (effect.sectorMode === 'highest_pressure') {
    return [...SECTORS].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || SECTOR_RANK[a] - SECTOR_RANK[b])[0]!;
  }
  if (effect.sectorMode === 'lowest_pressure') {
    return [...SECTORS].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || SECTOR_RANK[a] - SECTOR_RANK[b])[0]!;
  }
  return createRng(seed, `chance-sector:${period}:${entry.id}:${tokenIndex}`).pick(SECTORS);
}

function destinationSector(
  entry: LedgerEffect,
  tokens: readonly ChanceToken[],
): Sector | undefined {
  const effect = entry.effect;
  if (effect.type !== 'move_chance') return undefined;
  if (effect.destination === 'left' || effect.destination === 'centre' || effect.destination === 'right') return effect.destination;
  if (effect.destination === 'selected') return entry.sector;

  const counts = new Map<Sector, number>();
  for (const sector of SECTORS) counts.set(sector, tokens.filter((token) => token.sector === sector).length);
  if (effect.destination === 'highest_pressure') {
    return [...SECTORS].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || SECTOR_RANK[a] - SECTOR_RANK[b])[0];
  }
  return [...SECTORS].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || SECTOR_RANK[a] - SECTOR_RANK[b])[0];
}

/**
 * Materialise Action-created chances, then reshape type, then move sector.
 * Identity and origin survive every mutation. Effects are read in ledger order
 * inside each verb so replay order is deterministic.
 */
export function applyChanceShapeEffects(
  input: readonly ChanceToken[],
  ledger: readonly LedgerEffect[],
  side: TeamSide,
  period: PeriodNumber,
  active: readonly EffectivePlayer[],
  seed: number,
): ChanceShapeResult {
  let tokens = input.map((token) => ({ ...token }));
  const receipts: MatchReceiptEvent[] = [];

  for (const entry of ledger) {
    const effect = entry.effect;
    if (effect.type !== 'add_chance') continue;
    const targetSide = entry.tokenTarget ? targetedChanceSide(entry) : entry.side;
    if (targetSide !== side) continue;

    for (let index = 0; index < effect.count; index += 1) {
      const sector = actionSector(entry, tokens, active, seed, period, index);
      if (tokens.filter((token) => token.sector === sector && !token.cancelled).length >= ACTION_SECTOR_CAP) continue;
      const token: ChanceToken = {
        id: `chance:${side}:${period}:action:${entry.id}:${index}`,
        side,
        sector,
        origin: 'action',
        chanceType: effect.chanceType,
        order: tokens.reduce((max, token) => Math.max(max, token.order), -1) + 1,
        minimumGoalRoll: DEFAULT_GOAL_ROLL,
        rerolls: 0,
        cancelled: false,
        sourceActionInstanceId: entry.sourceInstanceId,
      };
      tokens.push(token);
      receipts.push(chanceReceipt(token, period, 'chance_created', `${effect.chanceType.replace('_', ' ')} chance created by ${entry.actionName}.`, {}, entry));
    }
  }

  for (const entry of ledger) {
    const effect = entry.effect;
    if (effect.type !== 'change_chance_type' || targetedChanceSide(entry) !== side) continue;
    const selected = selectChanceTokens(tokens, entry).filter((token) => !token.cancelled).slice(0, Math.max(0, effect.count));
    const ids = new Set(selected.map((token) => token.id));
    tokens = tokens.map((token) => {
      if (!ids.has(token.id) || token.chanceType === effect.chanceType) return token;
      const from = token.chanceType;
      const updated = { ...token, chanceType: effect.chanceType };
      receipts.push(chanceReceipt(updated, period, 'chance_type_changed', `${entry.actionName} changed ${from.replace('_', ' ')} to ${effect.chanceType.replace('_', ' ')}.`, { from, to: effect.chanceType }, entry));
      return updated;
    });
  }

  for (const entry of ledger) {
    const effect = entry.effect;
    if (effect.type !== 'move_chance' || targetedChanceSide(entry) !== side) continue;
    const destination = destinationSector(entry, tokens);
    if (!destination) continue;
    const selected = selectChanceTokens(tokens, entry).filter((token) => !token.cancelled);
    const ids = new Set(selected.map((token) => token.id));
    tokens = tokens.map((token) => {
      if (!ids.has(token.id) || token.sector === destination) return token;
      const from = token.sector;
      const updated = { ...token, sector: destination };
      receipts.push(chanceReceipt(updated, period, 'chance_moved', `${entry.actionName} moved a ${token.chanceType.replace('_', ' ')} chance to the ${destination}.`, { from, to: destination }, entry));
      return updated;
    });
  }

  return { tokens, receipts };
}
