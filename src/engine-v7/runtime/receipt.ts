import type { MatchReceiptEvent, PeriodNumber, TeamSide } from '../../lib/match-v7/types';

export interface ReceiptEventInput {
  id: string;
  period: PeriodNumber;
  phase: string;
  eventType: string;
  message: string;
  side?: TeamSide;
  sourceId?: string;
  actionName?: string;
  targetIds?: string[];
  data?: Record<string, unknown>;
}

export function receiptEvent(input: ReceiptEventInput): MatchReceiptEvent {
  return { ...input, data: input.data ?? {} };
}
