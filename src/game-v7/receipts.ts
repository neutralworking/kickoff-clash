import type { ChanceType, MatchReceiptEvent, PeriodNumber, Sector, TeamSide } from '@/engine-v7';

// Receipt → event-feed translation. Engine receipts are authoritative. Typed
// chance metadata is carried structurally so presentation never parses strings
// to recover token origin, football type or intended finisher.

export type MatchEventKind =
  | 'kickoff'
  | 'formation_change'
  | 'substitution'
  | 'movement'
  | 'action_activation'
  | 'action_fizzle'
  | 'disabled_action'
  | 'effect_applied'
  | 'effect_expired'
  | 'chance_created'
  | 'chance_changed'
  | 'chance_moved'
  | 'chance_claimed'
  | 'chance_claim_fizzle'
  | 'finisher_assigned'
  | 'chance_cancelled'
  | 'die_roll'
  | 'reroll'
  | 'miss'
  | 'goal'
  | 'attribution'
  | 'unattributed_goal'
  | 'period_end'
  | 'priority_change'
  | 'full_time'
  | 'info';

export interface ChanceEventData {
  tokenId: string;
  origin?: 'calculated' | 'stored' | 'action';
  chanceType?: ChanceType;
  sector?: Sector;
  sourceActionInstanceId?: string;
  finisherId?: string;
  finisherAssignment?: 'default' | 'claimed' | 'fallback';
  from?: string;
  to?: string;
}

export interface MatchEvent {
  id: string;
  kind: MatchEventKind;
  period: PeriodNumber;
  side?: TeamSide;
  text: string;
  chance?: ChanceEventData;
}

const EVENT_KIND: Record<string, MatchEventKind> = {
  formation_switch: 'formation_change',
  substitution_off: 'substitution',
  substitution_on: 'substitution',
  movement: 'movement',
  action_activated: 'action_activation',
  action_fizzled: 'action_fizzle',
  game_start_applied: 'effect_applied',
  ongoing_applied: 'effect_applied',
  ongoing_inactive: 'info',
  effect_expired: 'effect_expired',
  chance_created: 'chance_created',
  chance_type_changed: 'chance_changed',
  chance_moved: 'chance_moved',
  chance_claimed: 'chance_claimed',
  claim_fizzled: 'chance_claim_fizzle',
  finisher_assigned: 'finisher_assigned',
  chance_cancelled: 'chance_cancelled',
  chance_roll: 'die_roll',
  chance_missed: 'miss',
  goal_scored: 'goal',
  attribution: 'attribution',
  attribution_fizzled: 'unattributed_goal',
  period_end: 'period_end',
  priority_set: 'priority_change',
};

function stringValue(data: Record<string, unknown>, key: string): string | undefined {
  return typeof data[key] === 'string' ? data[key] as string : undefined;
}

function chanceData(receipt: MatchReceiptEvent): ChanceEventData | undefined {
  const tokenId = stringValue(receipt.data, 'tokenId');
  if (!tokenId) return undefined;
  const origin = stringValue(receipt.data, 'origin');
  const chanceType = stringValue(receipt.data, 'chanceType');
  const sector = stringValue(receipt.data, 'sector');
  const assignment = stringValue(receipt.data, 'finisherAssignment') ?? stringValue(receipt.data, 'assignment');
  return {
    tokenId,
    ...(origin === 'calculated' || origin === 'stored' || origin === 'action' ? { origin } : {}),
    ...(chanceType === 'box' || chanceType === 'cross' || chanceType === 'through_ball' || chanceType === 'corner' ? { chanceType } : {}),
    ...(sector === 'left' || sector === 'centre' || sector === 'right' ? { sector } : {}),
    ...(stringValue(receipt.data, 'sourceActionInstanceId') ? { sourceActionInstanceId: stringValue(receipt.data, 'sourceActionInstanceId') } : {}),
    ...(stringValue(receipt.data, 'finisherId') ? { finisherId: stringValue(receipt.data, 'finisherId') } : {}),
    ...(assignment === 'default' || assignment === 'claimed' || assignment === 'fallback' ? { finisherAssignment: assignment } : {}),
    ...(stringValue(receipt.data, 'from') ? { from: stringValue(receipt.data, 'from') } : {}),
    ...(stringValue(receipt.data, 'to') ? { to: stringValue(receipt.data, 'to') } : {}),
  };
}

function baseEvent(receipt: MatchReceiptEvent, kind: MatchEventKind, suffix = ''): MatchEvent {
  const chance = chanceData(receipt);
  return {
    id: suffix ? `${receipt.id}:${suffix}` : receipt.id,
    kind,
    period: receipt.period,
    ...(receipt.side ? { side: receipt.side } : {}),
    text: receipt.message,
    ...(chance ? { chance } : {}),
  };
}

/** Translate one engine receipt into ordered UI events. */
export function translateReceipt(receipt: MatchReceiptEvent): MatchEvent[] {
  if (receipt.eventType === 'action_blocked' || receipt.eventType === 'ongoing_suppressed') {
    return [baseEvent(receipt, receipt.data.reason === 'disabled' ? 'disabled_action' : 'info')];
  }

  const kind = EVENT_KIND[receipt.eventType] ?? 'info';
  const events = [baseEvent(receipt, kind)];

  if (receipt.eventType === 'chance_roll' && typeof receipt.data.rerollsUsed === 'number' && receipt.data.rerollsUsed > 0) {
    events.push({
      id: `${receipt.id}:reroll`,
      kind: 'reroll',
      period: receipt.period,
      ...(receipt.side ? { side: receipt.side } : {}),
      text: `Reroll ×${receipt.data.rerollsUsed} → ${String(receipt.data.finalRoll ?? '')}`.trim(),
      ...(events[0]!.chance ? { chance: events[0]!.chance } : {}),
    });
  }

  return events;
}

export function translateReceipts(receipts: readonly MatchReceiptEvent[]): MatchEvent[] {
  return receipts.flatMap(translateReceipt);
}

/** A synthesised non-chance feed event (kickoff / full time) with a stable id. */
export function syntheticEvent(id: string, kind: MatchEventKind, period: PeriodNumber, text: string, side?: TeamSide): MatchEvent {
  return { id, kind, period, ...(side ? { side } : {}), text };
}
