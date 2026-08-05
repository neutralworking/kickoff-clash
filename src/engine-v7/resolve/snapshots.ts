import type {
  BreakIndex,
  BreakPlan,
  MatchReceiptEvent,
  PeriodNumber,
  Sector,
  V7TeamState,
} from '../../lib/match-v7/types';
import { receiptEvent } from '../runtime/receipt';
import type { EffectivePlayer } from './stats';

// Replacement stat snapshots (Batch-1 Law 1 / NW-159). When a bench card replaces
// an active card at a break, we freeze the OUTGOING card's *effective* ATT/DEF at
// the instant of replacement and hand it to the incoming card as data. An action
// that "takes over the mark" of whoever it replaced reads this frozen value, never
// a stat that keeps moving after the sub.
//
// The snapshot is captured just before the lineup change lands, from the effective
// players computed against the board at THIS side's resolution instant — so in
// priority order the trailing side snapshots against the leader's already-landed
// cards (A1). It is a pure function of the locked plans plus the pre-break board,
// and it is transient: it lives on the break resolution and is not re-evaluated
// when the board later changes.

export interface ReplacementSnapshot {
  side: BreakPlan['side'];
  /** The card being substituted off, whose stats are frozen here. */
  outCardId: string;
  /** The incoming bench card that takes the slot (and reads this snapshot). */
  inCardId: string;
  slotKey: string;
  sector?: Sector;
  /** Effective attack of the outgoing card at the moment of replacement. */
  attack: number;
  /** Effective defence of the outgoing card at the moment of replacement. */
  defence: number;
  period: PeriodNumber;
  breakIndex: BreakIndex;
}

export interface SnapshotCapture {
  snapshots: ReplacementSnapshot[];
  receipts: MatchReceiptEvent[];
}

/**
 * Freeze the outgoing card's effective stats for every slot-preserving
 * substitution in a locked plan. `effective` must be the pre-lineup effective
 * players for `team` (so the frozen value is the real, post-fold strength of the
 * card that is leaving). Movement-only and free-placement assignments are ignored —
 * a snapshot is taken only where an incoming card genuinely replaces the active
 * card that was holding its slot (i.e. that card is in `outgoingCardIds`).
 */
export function captureReplacementSnapshots(
  team: V7TeamState,
  effective: readonly EffectivePlayer[],
  plan: BreakPlan,
  coords: { period: PeriodNumber; breakIndex: BreakIndex },
): SnapshotCapture {
  const effectiveByCard = new Map(effective.map((player) => [player.cardId, player]));
  const activeCardBySlot = new Map<string, string>();
  for (const player of team.players) {
    if (player.zone === 'active' && player.currentSlotKey) activeCardBySlot.set(player.currentSlotKey, player.cardId);
  }
  const outgoing = new Set(plan.outgoingCardIds);

  const snapshots: ReplacementSnapshot[] = [];
  const receipts: MatchReceiptEvent[] = [];

  for (const assignment of plan.incomingAssignments) {
    const outCardId = activeCardBySlot.get(assignment.slotKey);
    // Only a genuine replacement: the incoming card takes the slot of an active
    // card that is being substituted off.
    if (!outCardId || !outgoing.has(outCardId)) continue;
    const out = effectiveByCard.get(outCardId);
    if (!out) continue;

    const snapshot: ReplacementSnapshot = {
      side: plan.side,
      outCardId,
      inCardId: assignment.cardId,
      slotKey: assignment.slotKey,
      ...(out.sector ? { sector: out.sector } : {}),
      attack: out.attack,
      defence: out.defence,
      period: coords.period,
      breakIndex: coords.breakIndex,
    };
    snapshots.push(snapshot);
    receipts.push(
      receiptEvent({
        id: `rcpt:${plan.side}:snapshot:${assignment.cardId}:${coords.period}:${coords.breakIndex}`,
        period: coords.period,
        phase: 'break_lineup',
        eventType: 'replacement_snapshot',
        message: `${assignment.cardId} inherits the mark of ${outCardId} (${out.attack}/${out.defence}).`,
        side: plan.side,
        sourceId: assignment.cardId,
        data: { outCardId, inCardId: assignment.cardId, attack: out.attack, defence: out.defence, slotKey: assignment.slotKey },
      }),
    );
  }

  return { snapshots, receipts };
}
