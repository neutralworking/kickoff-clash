import {
  SECTORS,
  chanceOutlook,
  commitBreak,
  effectiveBoards,
  validatePlan,
  type BoardReceipt,
  type CardStatReceipt,
  type SubPair,
  type V6MatchState,
} from '../../lib/match-v6';

export interface V6SideProjection {
  attack: number;
  defence: number;
  chances: number;
}

export interface V6PlanProjection {
  legal: boolean;
  reason?: string;
  cost: number;
  state: V6MatchState;
  before: {
    player: V6SideProjection;
    opponent: V6SideProjection;
  };
  after: {
    player: V6SideProjection;
    opponent: V6SideProjection;
  };
  deltas: {
    attack: number;
    defence: number;
    chancesFor: number;
    chancesAgainst: number;
  };
  incomingReceipts: CardStatReceipt[];
}

export interface V6OutgoingRecommendation {
  outCardId: string;
  projection: V6PlanProjection;
  score: number;
}

function totals(board: BoardReceipt): { attack: number; defence: number } {
  return SECTORS.reduce(
    (sum, sector) => ({
      attack: sum.attack + Math.max(0, board[sector].attack),
      defence: sum.defence + Math.max(0, board[sector].defence),
    }),
    { attack: 0, defence: 0 },
  );
}

function chanceTotal(outlook: Record<'left' | 'centre' | 'right', number>): number {
  return SECTORS.reduce((sum, sector) => sum + outlook[sector], 0);
}

function snapshot(state: V6MatchState): {
  player: V6SideProjection;
  opponent: V6SideProjection;
} {
  const boards = effectiveBoards(state);
  const outlook = chanceOutlook(state);
  const playerTotals = totals(boards.player);
  const opponentTotals = totals(boards.opponent);
  return {
    player: { ...playerTotals, chances: chanceTotal(outlook.player) },
    opponent: { ...opponentTotals, chances: chanceTotal(outlook.opponent) },
  };
}

/**
 * Preview the player's V6 substitution plan without mutating the live match.
 * The opponent plan is intentionally empty: this is the honest submitted-lineup
 * projection before the opponent's hidden response is revealed.
 */
export function previewPlayerPlan(state: V6MatchState, pairs: readonly SubPair[]): V6PlanProjection {
  const plan = { side: 'player' as const, pairs: [...pairs] };
  const validation = validatePlan(state, plan);
  const before = snapshot(state);
  const projected = state.breakIndex > 0 && validation.ok && pairs.length > 0
    ? commitBreak(state, plan, { side: 'opponent', pairs: [] }).state
    : state;
  const after = snapshot(projected);
  const projectedBoards = effectiveBoards(projected);
  const incomingIds = new Set(pairs.map((pair) => pair.inCardId));
  const incomingReceipts = SECTORS.flatMap((sector) => projectedBoards.player[sector].cards)
    .filter((receipt) => incomingIds.has(receipt.cardId));

  return {
    legal: validation.ok,
    ...(validation.reason ? { reason: validation.reason } : {}),
    cost: validation.effectiveCost,
    state: projected,
    before,
    after,
    deltas: {
      attack: after.player.attack - before.player.attack,
      defence: after.player.defence - before.player.defence,
      chancesFor: after.player.chances - before.player.chances,
      chancesAgainst: after.opponent.chances - before.opponent.chances,
    },
    incomingReceipts,
  };
}

/** Rank legal outgoing players for the currently selected substitute. */
export function recommendOutgoing(
  state: V6MatchState,
  existingPairs: readonly SubPair[],
  inCardId: string,
): V6OutgoingRecommendation | null {
  const alreadyOut = new Set(existingPairs.map((pair) => pair.outCardId));
  const candidates = state.player.cards.filter((card) => card.zone === 'active' && !alreadyOut.has(card.cardId));
  let best: V6OutgoingRecommendation | null = null;

  for (const candidate of candidates) {
    const projection = previewPlayerPlan(state, [...existingPairs, { outCardId: candidate.cardId, inCardId }]);
    if (!projection.legal) continue;
    const outOfPosition = projection.incomingReceipts.some((receipt) => receipt.cardId === inCardId && receipt.outOfPosition);
    const score =
      projection.deltas.chancesFor * 30 -
      projection.deltas.chancesAgainst * 30 +
      projection.deltas.attack +
      projection.deltas.defence -
      (outOfPosition ? 3 : 0);
    if (!best || score > best.score || (score === best.score && candidate.cardId.localeCompare(best.outCardId) < 0)) {
      best = { outCardId: candidate.cardId, projection, score };
    }
  }

  return best;
}
