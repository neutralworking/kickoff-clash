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
// Token targeting from normalized data: a token effect carries the resolved
// chance target (`tokenTarget = { side: own | enemy, selector }`) preserved from
// the action. The effect's `type` drives behavior; the target — never the type —
// decides which tokens are hit. `own` resolves to the effect's acting `side`,
// `enemy` to the other side, so debuffing enemy chances is just `side: enemy`.
// `first_in_sector` targets the lowest-order token per in-scope sector;
// `all_in_sector` targets every in-scope token. A token effect with no
// `tokenTarget` (never produced by a chance-targeting action) is ignored.

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

/** The concrete side a token effect targets, from its relative target + acting side. */
function targetedSide(entry: LedgerEffect): TeamSide | undefined {
  if (!entry.tokenTarget) return undefined;
  return entry.tokenTarget.side === 'own' ? entry.side : other(entry.side);
}

/** The tokens an effect selects: in-scope by sector, narrowed by the selector. */
function selectTokens(tokens: readonly ChanceToken[], entry: LedgerEffect): ChanceToken[] {
  const inScope = tokens.filter((token) => entry.sector === undefined || entry.sector === token.sector);
  if (entry.tokenTarget?.selector === 'all_in_sector') return inScope;
  // first_in_sector → the lowest-order token in each in-scope sector.
  const firstBySector = new Map<Sector, ChanceToken>();
  for (const token of [...inScope].sort((a, b) => a.order - b.order)) {
    if (!firstBySector.has(token.sector)) firstBySector.set(token.sector, token);
  }
  return [...firstBySector.values()];
}

/**
 * Apply the token-level ledger effects to one side's chance tokens. Ownership
 * and precision come entirely from each effect's preserved `tokenTarget`; the
 * effect type only decides what to do to the selected tokens.
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
    if (!entry.tokenTarget || targetedSide(entry) !== side) continue;

    const selected = selectTokens(out, entry);
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
      receipts.push(
        receipt('chance_cancelled', `Chance in the ${token.sector} was cancelled.`, token.side, token.id, {
          sector: token.sector,
          tokenId: token.id,
          order: token.order,
        }),
      );
      tokenOutcomes.push(roll);
      continue;
    }

    receipts.push(
      receipt('chance_roll', `Rolled ${roll.rolls.join('/')} vs ${roll.threshold}.`, token.side, token.id, {
        sector: token.sector,
        tokenId: token.id,
        order: token.order,
        rolls: roll.rolls,
        finalRoll: roll.finalRoll,
        threshold: roll.threshold,
        rerollsUsed: roll.rerollsUsed,
        scored: roll.scored,
      }),
    );

    if (!roll.scored) {
      receipts.push(
        receipt('chance_missed', `Missed (${roll.finalRoll} < ${roll.threshold}).`, token.side, token.id, {
          sector: token.sector,
          tokenId: token.id,
          order: token.order,
          finalRoll: roll.finalRoll,
          threshold: roll.threshold,
        }),
      );
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

    receipts.push(
      receipt('goal_scored', `GOAL for ${token.side} (${roll.finalRoll} ≥ ${roll.threshold}).`, token.side, token.id, {
        goalOrder: goal.order,
        sector: token.sector,
        tokenId: token.id,
        order: token.order,
        finalRoll: roll.finalRoll,
        threshold: roll.threshold,
        playerScore: score.player,
        opponentScore: score.opponent,
        ...(attribution.scorerId ? { scorerId: attribution.scorerId } : {}),
      }),
    );
    if (attribution.fizzled) {
      receipts.push(
        receipt('attribution_fizzled', `Goal for ${token.side} has no eligible scorer.`, token.side, token.id, {
          sector: token.sector,
          tokenId: token.id,
        }),
      );
    } else {
      receipts.push(receipt('attribution', `${attribution.scorerId} scores for ${token.side}.`, token.side, token.id, {
        scorerId: attribution.scorerId,
        eligible: attribution.eligibleIds,
        sector: token.sector,
        tokenId: token.id,
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
