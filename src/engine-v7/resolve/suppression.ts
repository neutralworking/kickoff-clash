import type {
  BreakIndex,
  MatchReceiptEvent,
  PeriodNumber,
  V7TeamState,
} from '../../lib/match-v7/types';
import { disableActionInstance, type DisableWindow } from '../actions/disable';
import type { EffectLifetime, LedgerEffect } from '../actions/effects';
import { receiptEvent } from '../runtime/receipt';

// Action suppression (Batch-1 Law 7 / NW-166). A `disable_action` ledger effect is
// materialised onto its target cards' action instances by setting `disabledUntil`,
// so the existing disable checks — activation (activate.ts), Game-Start dispatch and
// the ongoing rebuild (dispatch.ts) — switch the target's actions off for the
// effect's window. The disable machinery (disable.ts) and those checks already
// exist; this is the wiring that turns the effect into an applied disable.
//
// v1 scope: the `all_player_actions` scope (silence every action on a target card).
// `named_action` needs an action reference on the effect (the contract carries a
// scope but no action id) and `manager_action` needs the manager-action instance
// model; both are out of this slice. An ongoing suppressor — whose `disable_action`
// effect is regenerated each period by the ongoing rebuild — is applied where that
// effect is regenerated, and is not handled here.

interface SuppressionCoords {
  period: PeriodNumber;
  breakIndex: BreakIndex;
}

/** Map an effect lifetime to the disable window an instance carries. Lifetimes that
 *  are not a fixed span (immediate / while_active / until_used) are not materialised
 *  as a disable here. */
function windowForLifetime(lifetime: EffectLifetime): DisableWindow | null {
  switch (lifetime.kind) {
    case 'match': return { matchEnd: true };
    case 'period': return { period: lifetime.untilPeriod };
    case 'break': return { period: lifetime.period, break: lifetime.breakIndex };
    default: return null;
  }
}

/** The later-extending of two disable windows (their union): a match window beats a
 *  period window; a whole-period window (no break bound) beats a break-bounded one;
 *  otherwise the further period, then the later break. */
export function laterWindow(a: DisableWindow | undefined, b: DisableWindow): DisableWindow {
  if (!a) return b;
  if (a.matchEnd) return a;
  if (b.matchEnd) return b;
  const aPeriod = a.period ?? 0;
  const bPeriod = b.period ?? 0;
  if (aPeriod !== bPeriod) return aPeriod > bPeriod ? a : b;
  const aBreak = a.break ?? Number.POSITIVE_INFINITY;
  const bBreak = b.break ?? Number.POSITIVE_INFINITY;
  return aBreak >= bBreak ? a : b;
}

export interface SuppressionResult {
  player: V7TeamState;
  opponent: V7TeamState;
  receipts: MatchReceiptEvent[];
}

/**
 * Apply the `disable_action` effects created in the current break onto their target
 * cards' action instances (setting `disabledUntil`). Only the `all_player_actions`
 * scope is materialised in this slice. Overlapping windows on one instance take
 * their union. Idempotent: it only reads effects stamped with the current break's
 * coordinates, so re-running does not double-apply.
 */
export function applyDisableEffects(
  board: { player: V7TeamState; opponent: V7TeamState },
  ledger: readonly LedgerEffect[],
  coords: SuppressionCoords,
): SuppressionResult {
  const windowByCard = new Map<string, DisableWindow>();
  for (const entry of ledger) {
    if (entry.effect.type !== 'disable_action') continue;
    if (entry.createdBreakIndex !== coords.breakIndex || entry.createdPeriod !== coords.period) continue;
    if (entry.effect.scope !== 'all_player_actions') continue;
    const window = windowForLifetime(entry.lifetime);
    if (!window) continue;
    for (const cardId of entry.targetIds) {
      windowByCard.set(cardId, laterWindow(windowByCard.get(cardId), window));
    }
  }

  if (windowByCard.size === 0) {
    return { player: board.player, opponent: board.opponent, receipts: [] };
  }

  const receipts: MatchReceiptEvent[] = [];
  const applyTeam = (team: V7TeamState): V7TeamState => ({
    ...team,
    players: team.players.map((player) => {
      const window = windowByCard.get(player.cardId);
      if (!window || player.actionInstances.length === 0) return player;
      const actionInstances = player.actionInstances.map((instance) => {
        const merged = laterWindow(instance.disabledUntil, window);
        receipts.push(
          receiptEvent({
            id: `rcpt:${team.side}:suppressed:${instance.instanceId}:${coords.period}:${coords.breakIndex}`,
            period: coords.period,
            phase: 'break_activation',
            eventType: 'action_suppressed',
            message: `${instance.printedActionId} on ${player.cardId} is suppressed.`,
            side: team.side,
            sourceId: player.cardId,
            data: { targetCardId: player.cardId, actionId: instance.printedActionId, until: merged },
          }),
        );
        return disableActionInstance(instance, merged);
      });
      return { ...player, actionInstances };
    }),
  });

  return { player: applyTeam(board.player), opponent: applyTeam(board.opponent), receipts };
}
