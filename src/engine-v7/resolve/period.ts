import type {
  ChanceToken,
  MatchReceiptEvent,
  PeriodNumber,
  RuntimePlayerState,
  Sector,
  TeamSide,
  V7MatchState,
} from '../../lib/match-v7/types';
import { receiptEvent } from '../runtime/receipt';
import { createRng } from '../core/rng';
import type { LedgerEffect } from '../actions/effects';
import { applyChanceShapeEffects, selectChanceTokens, targetedChanceSide } from './chances';
import { assignFinishers } from './finishers';
import { rollToken, type TokenRoll } from './rolls';
import type { RerollPolicy } from './rerolls';
import { effectivePlayers, type CardRegistry, type EffectivePlayer } from './stats';

// Period resolution. The typed-chance pipeline is intentionally explicit:
// calculated Box tokens → Action-created tokens → type shaping → movement →
// claims/default finisher assignment → cancel/threshold/reroll → roll. Origin,
// type and finisher remain separate facts on the same stable token id throughout.

export const FINAL_PERIOD: PeriodNumber = 4;

const SECTOR_RANK: Record<Sector, number> = { left: 0, centre: 1, right: 2 };
const SIDE_RANK: Record<TeamSide, number> = { player: 0, opponent: 1 };

export interface ResolvedToken extends TokenRoll {
  /** Compatibility alias used by existing presentation code. */
  scorerId?: string;
}

export interface GoalEvent {
  order: number;
  side: TeamSide;
  period: PeriodNumber;
  sector: Sector;
  tokenId: string;
  scorerId?: string;
}

export interface PeriodSnapshot {
  period: PeriodNumber;
  score: Record<TeamSide, number>;
  tokenOutcomes: ResolvedToken[];
  goals: GoalEvent[];
  lineup: Record<TeamSide, RuntimePlayerState[]>;
  effective: Record<TeamSide, EffectivePlayer[]>;
  ledger: LedgerEffect[];
}

export interface PeriodResolutionInput {
  state: V7MatchState;
  ledger: readonly LedgerEffect[];
  chances: Record<TeamSide, ChanceToken[]>;
  registry: CardRegistry;
  policy?: RerollPolicy;
}

export interface PeriodResolution {
  state: V7MatchState;
  ledger: LedgerEffect[];
  tokenOutcomes: ResolvedToken[];
  goals: GoalEvent[];
  receipts: MatchReceiptEvent[];
  snapshot: PeriodSnapshot;
}

function effectDependsOnClaim(entry: LedgerEffect, ledger: readonly LedgerEffect[]): boolean {
  return ledger.some((other) => other.sourceInstanceId === entry.sourceInstanceId && other.effect.type === 'claim_chance');
}

/**
 * Apply conversion-level token effects after finishers are fixed. Type filters
 * are preserved on the ledger target. When an Action couples `claim_chance` with
 * a threshold/reroll, the conversion modifier applies only if that same source
 * actually won the claim; a fizzled specialist never grants free value.
 */
export function applyTokenEffects(
  tokens: readonly ChanceToken[],
  ledger: readonly LedgerEffect[],
  side: TeamSide,
): ChanceToken[] {
  let out = tokens.map((token) => ({ ...token }));

  for (const entry of ledger) {
    const effect = entry.effect;
    if (effect.type !== 'set_goal_threshold' && effect.type !== 'add_reroll' && effect.type !== 'cancel_chance') {
      continue;
    }
    if (!entry.tokenTarget || targetedChanceSide(entry) !== side) continue;

    let selected = selectChanceTokens(out, entry);
    if (effectDependsOnClaim(entry, ledger) && effect.type !== 'cancel_chance') {
      selected = selected.filter((token) => token.finisherAssignment === 'claimed' && token.finisherId === entry.sourceCardId);
    }

    if (effect.type === 'cancel_chance') {
      const ids = new Set(
        selected
          .filter((token) => !token.cancelled)
          .sort((a, b) => SECTOR_RANK[a.sector] - SECTOR_RANK[b.sector] || a.order - b.order)
          .slice(0, effect.count)
          .map((token) => token.id),
      );
      out = out.map((token) => (ids.has(token.id) ? { ...token, cancelled: true } : token));
      continue;
    }

    const ids = new Set(selected.map((token) => token.id));
    if (effect.type === 'set_goal_threshold') {
      out = out.map((token) => (ids.has(token.id) ? { ...token, minimumGoalRoll: effect.minimumRoll } : token));
    } else {
      out = out.map((token) => (ids.has(token.id) ? { ...token, rerolls: token.rerolls + effect.count } : token));
    }
  }

  return out;
}

function stableOrder(tokens: readonly ChanceToken[]): ChanceToken[] {
  return [...tokens].sort(
    (a, b) =>
      SIDE_RANK[a.side] - SIDE_RANK[b.side] ||
      SECTOR_RANK[a.sector] - SECTOR_RANK[b.sector] ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
}

function tokenData(token: ChanceToken, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tokenId: token.id,
    origin: token.origin,
    chanceType: token.chanceType,
    sector: token.sector,
    ...(token.sourceActionInstanceId ? { sourceActionInstanceId: token.sourceActionInstanceId } : {}),
    ...(token.finisherId ? { finisherId: token.finisherId, scorerId: token.finisherId } : {}),
    ...(token.finisherAssignment ? { finisherAssignment: token.finisherAssignment } : {}),
    ...extra,
  };
}

export function resolvePeriod(input: PeriodResolutionInput): PeriodResolution {
  const { state, registry, policy } = input;
  const period = state.period;
  if (period > FINAL_PERIOD) {
    throw new Error(`Cannot resolve period ${period}: beyond the final period ${FINAL_PERIOD}.`);
  }

  const ledger = [...input.ledger];
  const effective: Record<TeamSide, EffectivePlayer[]> = {
    player: effectivePlayers(state.player, registry, ledger),
    opponent: effectivePlayers(state.opponent, registry, ledger),
  };
  const activeOf = (side: TeamSide): EffectivePlayer[] => effective[side].filter((player) => player.zone === 'active');
  const teamOf = (side: TeamSide) => side === 'player' ? state.player : state.opponent;

  const receipts: MatchReceiptEvent[] = [];
  const assigned: Record<TeamSide, ChanceToken[]> = { player: [], opponent: [] };

  for (const side of ['player', 'opponent'] as const) {
    const shaped = applyChanceShapeEffects(input.chances[side], ledger, side, period, activeOf(side), state.seed);
    receipts.push(...shaped.receipts);
    const finishers = assignFinishers(shaped.tokens, ledger, side, period, activeOf(side), teamOf(side), state.seed);
    receipts.push(...finishers.receipts);
    assigned[side] = finishers.tokens;
  }

  const adjusted: Record<TeamSide, ChanceToken[]> = {
    player: applyTokenEffects(assigned.player, ledger, 'player'),
    opponent: applyTokenEffects(assigned.opponent, ledger, 'opponent'),
  };

  const rollRng = createRng(state.seed, `rolls:${period}`);
  const tokenOutcomes: ResolvedToken[] = [];
  const goals: GoalEvent[] = [];
  const score: Record<TeamSide, number> = { player: state.player.score, opponent: state.opponent.score };
  let goalOrder = 0;

  const receipt = (
    eventType: string,
    message: string,
    token: ChanceToken,
    data: Record<string, unknown> = {},
  ): MatchReceiptEvent =>
    receiptEvent({
      id: `rcpt:${eventType}:${token.side}:${period}:${token.id}`,
      period,
      phase: 'period_resolution',
      eventType,
      message,
      side: token.side,
      data: tokenData(token, data),
    });

  for (const token of stableOrder([...adjusted.player, ...adjusted.opponent])) {
    const roll = rollToken(token, rollRng, policy);

    if (roll.cancelled) {
      receipts.push(receipt('chance_cancelled', `${token.chanceType.replace('_', ' ')} chance in the ${token.sector} was cancelled.`, token));
      tokenOutcomes.push({ ...roll, ...(token.finisherId ? { scorerId: token.finisherId } : {}) });
      continue;
    }

    receipts.push(
      receipt('chance_roll', `Rolled ${roll.rolls.join('/')} vs ${roll.threshold} for ${token.finisherId ?? 'the attack'}.`, token, {
        rolls: roll.rolls,
        finalRoll: roll.finalRoll,
        threshold: roll.threshold,
        rerollsUsed: roll.rerollsUsed,
      }),
    );

    if (!roll.scored) {
      receipts.push(receipt('chance_missed', `Missed (${roll.finalRoll} < ${roll.threshold}).`, token, { finalRoll: roll.finalRoll, threshold: roll.threshold }));
      tokenOutcomes.push({ ...roll, ...(token.finisherId ? { scorerId: token.finisherId } : {}) });
      continue;
    }

    score[token.side] += 1;
    const goal: GoalEvent = {
      order: goalOrder++,
      side: token.side,
      period,
      sector: token.sector,
      tokenId: token.id,
      ...(token.finisherId ? { scorerId: token.finisherId } : {}),
    };
    goals.push(goal);

    receipts.push(receipt('goal_scored', `GOAL for ${token.side} (${roll.finalRoll} ≥ ${roll.threshold}).`, token, { goalOrder: goal.order }));
    if (token.finisherId) {
      receipts.push(receipt('attribution', `${token.finisherId} scores for ${token.side}.`, token, {
        scorerId: token.finisherId,
        finisherId: token.finisherId,
        assignment: token.finisherAssignment,
      }));
    } else {
      receipts.push(receipt('attribution_fizzled', `Goal for ${token.side} has no assigned finisher.`, token));
    }

    tokenOutcomes.push({ ...roll, ...(token.finisherId ? { scorerId: token.finisherId } : {}) });
  }

  const player = {
    ...state.player,
    score: score.player,
    cumulativeGrossChances: state.player.cumulativeGrossChances + adjusted.player.length,
  };
  const opponent = {
    ...state.opponent,
    score: score.opponent,
    cumulativeGrossChances: state.opponent.cumulativeGrossChances + adjusted.opponent.length,
  };

  const nextState: V7MatchState = { ...state, player, opponent, receipt: [...state.receipt, ...receipts] };

  const snapshot: PeriodSnapshot = {
    period,
    score: { ...score },
    tokenOutcomes,
    goals,
    lineup: {
      player: state.player.players.filter((entry) => entry.zone === 'active'),
      opponent: state.opponent.players.filter((entry) => entry.zone === 'active'),
    },
    effective,
    ledger,
  };

  return { state: nextState, ledger, tokenOutcomes, goals, receipts, snapshot };
}
