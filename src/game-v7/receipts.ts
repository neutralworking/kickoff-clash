import type { MatchReceiptEvent, PeriodNumber, TeamSide } from '@/engine-v7';

// Receipt → event-feed translation. Engine receipts are the AUTHORITATIVE source
// for the match feed — the UI never diffs old vs new state to invent events. Each
// receipt maps to zero or more ordered UI events; a couple of receipts (a roll
// that consumed rerolls) fan out into two events so the feed reads naturally.
// Chance creation, kickoff and full time have no engine receipt today, so the
// controller synthesises those from real data (the created tokens / final state),
// never from a state diff.

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

export interface MatchEvent {
  id: string;
  kind: MatchEventKind;
  period: PeriodNumber;
  side?: TeamSide;
  text: string;
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
  chance_cancelled: 'chance_cancelled',
  chance_roll: 'die_roll',
  chance_missed: 'miss',
  goal_scored: 'goal',
  attribution: 'attribution',
  attribution_fizzled: 'unattributed_goal',
  period_end: 'period_end',
  priority_set: 'priority_change',
};

function baseEvent(receipt: MatchReceiptEvent, kind: MatchEventKind, suffix = ''): MatchEvent {
  return {
    id: suffix ? `${receipt.id}:${suffix}` : receipt.id,
    kind,
    period: receipt.period,
    ...(receipt.side ? { side: receipt.side } : {}),
    text: receipt.message,
  };
}

/** Translate one engine receipt into ordered UI events. */
export function translateReceipt(receipt: MatchReceiptEvent): MatchEvent[] {
  // A disabled/blocked action is its own event kind.
  if (receipt.eventType === 'action_blocked' || receipt.eventType === 'ongoing_suppressed') {
    return [baseEvent(receipt, receipt.data.reason === 'disabled' ? 'disabled_action' : 'info')];
  }

  const kind = EVENT_KIND[receipt.eventType] ?? 'info';
  const events = [baseEvent(receipt, kind)];

  // A roll that consumed rerolls fans out a dedicated reroll event.
  if (receipt.eventType === 'chance_roll' && typeof receipt.data.rerollsUsed === 'number' && receipt.data.rerollsUsed > 0) {
    events.push({
      id: `${receipt.id}:reroll`,
      kind: 'reroll',
      period: receipt.period,
      ...(receipt.side ? { side: receipt.side } : {}),
      text: `Reroll ×${receipt.data.rerollsUsed} → ${String(receipt.data.finalRoll ?? '')}`.trim(),
    });
  }

  return events;
}

export function translateReceipts(receipts: readonly MatchReceiptEvent[]): MatchEvent[] {
  return receipts.flatMap(translateReceipt);
}

/** A synthesised feed event (chance creation, kickoff, full time) with a stable id. */
export function syntheticEvent(id: string, kind: MatchEventKind, period: PeriodNumber, text: string, side?: TeamSide): MatchEvent {
  return { id, kind, period, ...(side ? { side } : {}), text };
}
