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
import { rollToken, type TokenRoll } from './rolls';
import type { RerollPolicy } from './rerolls';
import { attributeGoal } from './attribution';
import { effectivePlayers, type CardRegistry, type EffectivePlayer } from './stats';

// Period resolution. Takes the chance tokens the break resolver created, applies
// the token-level ledger effects (threshold / reroll / cancel), rolls every
// surviving token in a stable order on the deterministic RNG, attributes each
// goal on a separate substream, and returns immutable score + state plus an
// end-of-period snapshot. It reads the ledger — it does not roll it into state.
//
// Token targeting from normalized data: an effect's `type` drives behavior and
// its `side` + `sector` select tokens. By convention a buff (set_goal_threshold,
// add_reroll) hits the acting side's own tokens; a cancel_chance hits the
// opposing side's tokens. (The chance target's own/enemy selector is not carried
// on the ledger today — see the PR's design questions.)

export const FINAL_PERIOD: PeriodNumber = 4;

const SECTOR_RANK: Record<Sector, number> = { left: 0, centre: 1, right: 2 };
const SIDE_RANK: Record<TeamSide, number> = { player: 0, opponent: 1 };
const other = (side: TeamSide): TeamSide => (side === 'player' ? 'opponent' : 'player');

export interface ResolvedToken extends TokenRoll {
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

/** Apply the token-level ledger effects to one side's chance tokens. */
export function applyTokenEffects(
  tokens: readonly ChanceToken[],
  ledger: readonly LedgerEffect[],
  side: TeamSide,
): ChanceToken[] {
  let out = tokens.map((token) => ({ ...token }));
  const matches = (effect: LedgerEffect, token: ChanceToken): boolean =>
    effect.sector === undefined || effect.sector === token.sector;

  for (const entry of ledger) {
    const effect = entry.effect;
    if (entry.side === side) {
      if (effect.type === 'set_goal_threshold') {
        out = out.map((token) => (matches(entry, token) ? { ...token, minimumGoalRoll: effect.minimumRoll } : token));
      } else if (effect.type === 'add_reroll') {
        out = out.map((token) => (matches(entry, token) ? { ...token, rerolls: token.rerolls + effect.count } : token));
      }
    } else if (entry.side === other(side) && effect.type === 'cancel_chance') {
      const targets = out
        .filter((token) => !token.cancelled && matches(entry, token))
        .sort((a, b) => SECTOR_RANK[a.sector] - SECTOR_RANK[b.sector] || a.order - b.order)
        .slice(0, effect.count);
      const ids = new Set(targets.map((token) => token.id));
      out = out.map((token) => (ids.has(token.id) ? { ...token, cancelled: true } : token));
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

export function resolvePeriod(input: PeriodResolutionInput): PeriodResolution {
  const { state, registry, policy } = input;
  const period = state.period;
  if (period > FINAL_PERIOD) {
    throw new Error(`Cannot resolve period ${period}: beyond the final period ${FINAL_PERIOD}.`);
  }

  const ledger = [...input.ledger];
  const adjusted: Record<TeamSide, ChanceToken[]> = {
    player: applyTokenEffects(input.chances.player, ledger, 'player'),
    opponent: applyTokenEffects(input.chances.opponent, ledger, 'opponent'),
  };

  const effective: Record<TeamSide, EffectivePlayer[]> = {
    player: effectivePlayers(state.player, registry, ledger),
    opponent: effectivePlayers(state.opponent, registry, ledger),
  };
  const activeOf = (side: TeamSide): EffectivePlayer[] => effective[side].filter((player) => player.zone === 'active');

  const rollRng = createRng(state.seed, `rolls:${period}`);
  const receipts: MatchReceiptEvent[] = [];
  const tokenOutcomes: ResolvedToken[] = [];
  const goals: GoalEvent[] = [];
  const score: Record<TeamSide, number> = { player: state.player.score, opponent: state.opponent.score };
  let goalOrder = 0;

  const receipt = (
    eventType: string,
    message: string,
    side: TeamSide,
    tokenId: string,
    data: Record<string, unknown> = {},
  ): MatchReceiptEvent =>
    receiptEvent({
      id: `rcpt:${eventType}:${side}:${period}:${tokenId}`,
      period,
      phase: 'period_resolution',
      eventType,
      message,
      side,
      data,
    });

  for (const token of stableOrder([...adjusted.player, ...adjusted.opponent])) {
    const roll = rollToken(token, rollRng, policy);

    if (roll.cancelled) {
      receipts.push(receipt('chance_cancelled', `Chance in the ${token.sector} was cancelled.`, token.side, token.id));
      tokenOutcomes.push(roll);
      continue;
    }

    receipts.push(
      receipt('chance_roll', `Rolled ${roll.rolls.join('/')} vs ${roll.threshold}.`, token.side, token.id, {
        rolls: roll.rolls,
        finalRoll: roll.finalRoll,
        threshold: roll.threshold,
        rerollsUsed: roll.rerollsUsed,
      }),
    );

    if (!roll.scored) {
      receipts.push(receipt('chance_missed', `Missed (${roll.finalRoll} < ${roll.threshold}).`, token.side, token.id));
      tokenOutcomes.push(roll);
      continue;
    }

    const attrRng = createRng(state.seed, `attribution:${period}:${token.side}:${token.sector}:${token.order}`);
    const attribution = attributeGoal(token.side, token.sector, activeOf(token.side), attrRng);
    score[token.side] += 1;
    const goal: GoalEvent = {
      order: goalOrder++,
      side: token.side,
      period,
      sector: token.sector,
      tokenId: token.id,
      ...(attribution.scorerId ? { scorerId: attribution.scorerId } : {}),
    };
    goals.push(goal);

    receipts.push(receipt('goal_scored', `GOAL for ${token.side} (${roll.finalRoll} ≥ ${roll.threshold}).`, token.side, token.id, { goalOrder: goal.order }));
    if (attribution.fizzled) {
      receipts.push(receipt('attribution_fizzled', `Goal for ${token.side} has no eligible scorer.`, token.side, token.id));
    } else {
      receipts.push(receipt('attribution', `${attribution.scorerId} scores for ${token.side}.`, token.side, token.id, {
        scorerId: attribution.scorerId,
        eligible: attribution.eligibleIds,
      }));
    }

    tokenOutcomes.push({ ...roll, ...(attribution.scorerId ? { scorerId: attribution.scorerId } : {}) });
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
