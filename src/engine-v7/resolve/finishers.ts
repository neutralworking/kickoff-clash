import type {
  ChanceToken,
  ChanceType,
  FinisherAssignment,
  MatchReceiptEvent,
  PeriodNumber,
  PositionCode,
  TeamSide,
  V7TeamState,
} from '../../lib/match-v7/types';
import type { LedgerEffect } from '../actions/effects';
import { createRng } from '../core/rng';
import { receiptEvent } from '../runtime/receipt';
import { selectChanceTokens, targetedChanceSide } from './chances';
import type { EffectivePlayer } from './stats';

const DEFAULT_ELIGIBILITY: Record<ChanceType, readonly PositionCode[]> = {
  box: ['CF', 'LF', 'RF', 'LW', 'AM', 'RW'],
  cross: ['CF', 'LF', 'RF', 'LW', 'RW'],
  through_ball: ['CF', 'LF', 'RF', 'LW', 'AM', 'RW'],
  corner: ['CF', 'LF', 'RF', 'CB'],
};

export interface FinisherResult {
  tokens: ChanceToken[];
  receipts: MatchReceiptEvent[];
}

export function eligibleFinisher(player: EffectivePlayer, chanceType: ChanceType): boolean {
  return player.zone === 'active'
    && !player.emergencyGoalkeeper
    && player.position !== undefined
    && DEFAULT_ELIGIBILITY[chanceType].includes(player.position);
}

function finisherReceipt(
  eventType: string,
  token: ChanceToken,
  period: PeriodNumber,
  message: string,
  data: Record<string, unknown>,
  entry?: LedgerEffect,
): MatchReceiptEvent {
  return receiptEvent({
    id: `rcpt:${eventType}:${token.side}:${period}:${token.id}${entry ? `:${entry.id}` : ''}`,
    period,
    phase: 'finisher_assignment',
    eventType,
    message,
    side: token.side,
    ...(entry ? { sourceId: entry.sourceCardId, actionName: entry.actionName } : {}),
    data: {
      tokenId: token.id,
      chanceType: token.chanceType,
      origin: token.origin,
      sector: token.sector,
      ...data,
    },
  });
}

function weightedFinisher(
  token: ChanceToken,
  eligible: readonly EffectivePlayer[],
  seed: number,
  period: PeriodNumber,
): EffectivePlayer | undefined {
  if (eligible.length === 0) return undefined;
  const weighted = eligible.map((player) => ({ player, weight: Math.max(0, player.attack) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return [...eligible].sort((a, b) => a.cardId.localeCompare(b.cardId))[0];

  const rng = createRng(seed, `finisher:${period}:${token.id}`);
  let cursor = rng.next() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.player;
  }
  return weighted.at(-1)?.player;
}

function strongestFallback(active: readonly EffectivePlayer[], team: V7TeamState): EffectivePlayer | undefined {
  const order = new Map(team.players.map((player) => [player.cardId, player.deploymentOrder]));
  return active
    .filter((player) => player.zone === 'active' && !player.emergencyGoalkeeper)
    .sort((a, b) => b.attack - a.attack || (order.get(a.cardId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.cardId) ?? Number.MAX_SAFE_INTEGER) || a.cardId.localeCompare(b.cardId))[0];
}

/**
 * Resolve explicit claims in ledger order, then deterministically assign every
 * surviving unclaimed token. Claims are team-wide when their target uses the
 * global `first` selector; a CF can therefore claim a Cross from either wing.
 */
export function assignFinishers(
  input: readonly ChanceToken[],
  ledger: readonly LedgerEffect[],
  side: TeamSide,
  period: PeriodNumber,
  active: readonly EffectivePlayer[],
  team: V7TeamState,
  seed: number,
): FinisherResult {
  let tokens = input.map((token) => ({ ...token }));
  const receipts: MatchReceiptEvent[] = [];
  const activeById = new Map(active.filter((player) => player.zone === 'active').map((player) => [player.cardId, player]));

  for (const entry of ledger) {
    if (entry.effect.type !== 'claim_chance' || targetedChanceSide(entry) !== side) continue;
    const candidate = selectChanceTokens(tokens, entry).find((token) => !token.cancelled);
    const claimant = activeById.get(entry.sourceCardId);

    if (!candidate) {
      const synthetic: ChanceToken = {
        id: `claim:${entry.id}`,
        side,
        sector: entry.sector ?? 'centre',
        origin: 'action',
        chanceType: entry.tokenTarget?.chanceTypes?.[0] ?? 'box',
        order: Number.MAX_SAFE_INTEGER,
        minimumGoalRoll: 6,
        rerolls: 0,
        cancelled: true,
      };
      receipts.push(finisherReceipt(
        'claim_fizzled',
        synthetic,
        period,
        `${entry.actionName} found no matching chance to claim.`,
        { finisherId: entry.sourceCardId, reason: 'no_matching_token' },
        entry,
      ));
      continue;
    }

    if (!claimant || claimant.emergencyGoalkeeper) {
      receipts.push(finisherReceipt(
        'claim_fizzled',
        candidate,
        period,
        `${entry.actionName} could not claim the chance.`,
        { finisherId: entry.sourceCardId, reason: claimant ? 'emergency_goalkeeper' : 'inactive' },
        entry,
      ));
      continue;
    }

    if (candidate.finisherId) {
      receipts.push(finisherReceipt(
        'claim_fizzled',
        candidate,
        period,
        `${entry.actionName} arrived after the chance was already claimed.`,
        { finisherId: entry.sourceCardId, existingFinisherId: candidate.finisherId, reason: 'already_claimed' },
        entry,
      ));
      continue;
    }

    tokens = tokens.map((token) => token.id === candidate.id
      ? { ...token, finisherId: entry.sourceCardId, finisherAssignment: 'claimed' as const }
      : token);
    const claimed = tokens.find((token) => token.id === candidate.id)!;
    receipts.push(finisherReceipt(
      'chance_claimed',
      claimed,
      period,
      `${entry.actionName}: ${entry.sourceCardId} claims the ${claimed.chanceType.replace('_', ' ')} chance.`,
      { finisherId: entry.sourceCardId, sourceActionInstanceId: entry.sourceInstanceId },
      entry,
    ));
    receipts.push(finisherReceipt(
      'finisher_assigned',
      claimed,
      period,
      `${entry.sourceCardId} will finish the ${claimed.chanceType.replace('_', ' ')} chance.`,
      { finisherId: entry.sourceCardId, assignment: 'claimed' satisfies FinisherAssignment },
      entry,
    ));
  }

  tokens = tokens.map((token) => {
    if (token.cancelled || token.finisherId) return token;
    const eligible = active.filter((player) => eligibleFinisher(player, token.chanceType));
    const selected = weightedFinisher(token, eligible, seed, period);
    const assignment: FinisherAssignment = selected ? 'default' : 'fallback';
    const finisher = selected ?? strongestFallback(active, team);
    if (!finisher) return token;

    const updated: ChanceToken = { ...token, finisherId: finisher.cardId, finisherAssignment: assignment };
    receipts.push(finisherReceipt(
      'finisher_assigned',
      updated,
      period,
      `${finisher.cardId} will finish the ${token.chanceType.replace('_', ' ')} chance.`,
      { finisherId: finisher.cardId, assignment },
    ));
    return updated;
  });

  return { tokens, receipts };
}
