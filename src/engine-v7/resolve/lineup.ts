import type {
  BreakIndex,
  BreakPlan,
  MatchReceiptEvent,
  PeriodNumber,
  RuntimePlayerState,
  Sector,
  V7TeamState,
} from '../../lib/match-v7/types';
import { receiptEvent } from '../runtime/receipt';
import { slotByKey } from '../formations/geometry';
import type { CardRegistry } from './stats';

// Apply a locked break plan's lineup changes to a team state (A3/A4): the
// optional formation switch, the ordered substitutions (subbed-off cards leave
// the match → `removed`; incoming bench cards take the slot + sector of who they
// replace, i.e. free placement), and any movement. The end state is driven by
// the plan's authoritative `finalSlotAssignments`; `outgoingCardIds` says who
// left. This never mutates the input — it returns a new team state and an
// ordered receipt for every change.

export interface LineupCoords {
  period: PeriodNumber;
  breakIndex: BreakIndex;
}

export interface LineupResult {
  team: V7TeamState;
  receipts: MatchReceiptEvent[];
}

interface PriorSnapshot {
  zone: RuntimePlayerState['zone'];
  slotKey?: string;
}

export function applyLineup(
  team: V7TeamState,
  plan: BreakPlan,
  registry: CardRegistry,
  coords: LineupCoords,
): LineupResult {
  const receipts: MatchReceiptEvent[] = [];
  const newFormationId = plan.formationSwitchId ?? team.formationId;
  const formation = registry.formations.get(newFormationId) ?? registry.formations.get(team.formationId);

  const receipt = (
    eventType: string,
    message: string,
    cardId: string,
    data: Record<string, unknown> = {},
  ): MatchReceiptEvent =>
    receiptEvent({
      id: `rcpt:lineup:${team.side}:${eventType}:${cardId}:${coords.period}:${coords.breakIndex}`,
      period: coords.period,
      phase: 'break_lineup',
      eventType,
      message,
      side: team.side,
      sourceId: cardId,
      data,
    });

  if (plan.formationSwitchId && plan.formationSwitchId !== team.formationId) {
    receipts.push(
      receiptEvent({
        id: `rcpt:lineup:${team.side}:formation_switch:${coords.period}:${coords.breakIndex}`,
        period: coords.period,
        phase: 'break_lineup',
        eventType: 'formation_switch',
        message: `Switched formation to ${newFormationId}.`,
        side: team.side,
        data: { from: team.formationId, to: newFormationId },
      }),
    );
  }

  const prior = new Map<string, PriorSnapshot>(
    team.players.map((player) => [player.cardId, { zone: player.zone, ...(player.currentSlotKey ? { slotKey: player.currentSlotKey } : {}) }]),
  );
  const outgoing = new Set(plan.outgoingCardIds);
  const finalSlotOfCard = new Map<string, string>();
  for (const [slotKey, cardId] of Object.entries(plan.finalSlotAssignments)) finalSlotOfCard.set(cardId, slotKey);

  const sectorForSlot = (slotKey: string, fallback?: Sector): Sector | undefined =>
    (formation ? slotByKey(formation, slotKey)?.sector : undefined) ?? fallback;

  const players = team.players.map((player): RuntimePlayerState => {
    if (outgoing.has(player.cardId)) {
      const { currentSlotKey: _slot, currentSector: _sector, ...rest } = player;
      return { ...rest, zone: 'removed' };
    }

    const finalSlot = finalSlotOfCard.get(player.cardId);
    if (finalSlot) {
      const sector = sectorForSlot(finalSlot, player.currentSector);
      return { ...player, zone: 'active', currentSlotKey: finalSlot, ...(sector ? { currentSector: sector } : {}) };
    }

    return player;
  });

  // Emit receipts in plan order: offs, then ons, then moves.
  for (const cardId of plan.outgoingCardIds) {
    if (prior.get(cardId)?.zone === 'active') {
      receipts.push(receipt('substitution_off', `${cardId} is substituted off.`, cardId));
    }
  }
  for (const assignment of plan.incomingAssignments) {
    const before = prior.get(assignment.cardId);
    const finalSlot = finalSlotOfCard.get(assignment.cardId) ?? assignment.slotKey;
    if (before?.zone !== 'active') {
      receipts.push(receipt('substitution_on', `${assignment.cardId} comes on at ${finalSlot}.`, assignment.cardId, {
        slotKey: finalSlot,
        sector: sectorForSlot(finalSlot),
      }));
    }
  }
  for (const [cardId, finalSlot] of finalSlotOfCard) {
    const before = prior.get(cardId);
    const cameOn = before?.zone !== 'active';
    if (!cameOn && before?.slotKey && before.slotKey !== finalSlot) {
      receipts.push(receipt('movement', `${cardId} moves to ${finalSlot}.`, cardId, {
        from: before.slotKey,
        to: finalSlot,
        sector: sectorForSlot(finalSlot),
      }));
    }
  }

  return { team: { ...team, formationId: newFormationId, players }, receipts };
}
