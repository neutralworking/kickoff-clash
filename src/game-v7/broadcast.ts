import type { PeriodNumber, TeamSide } from '@/engine-v7';
import type { MatchEvent, MatchEventKind } from './receipts';

export type BroadcastBeatKind =
  | 'kickoff'
  | 'action'
  | 'change'
  | 'chance'
  | 'roll'
  | 'goal'
  | 'miss'
  | 'period_end'
  | 'priority'
  | 'full_time'
  | 'info';

export interface BroadcastBeat {
  id: string;
  kind: BroadcastBeatKind;
  period: PeriodNumber;
  side?: TeamSide;
  eyebrow: string;
  title: string;
  detail?: string;
  sourceEventIds: string[];
  emphasis: 'neutral' | 'positive' | 'negative' | 'warning';
  durationMs: number;
}

const BEAT_KIND: Partial<Record<MatchEventKind, BroadcastBeatKind>> = {
  kickoff: 'kickoff',
  action_activation: 'action',
  action_fizzle: 'action',
  disabled_action: 'action',
  formation_change: 'change',
  substitution: 'change',
  movement: 'change',
  chance_created: 'chance',
  chance_cancelled: 'chance',
  die_roll: 'roll',
  reroll: 'roll',
  goal: 'goal',
  attribution: 'goal',
  unattributed_goal: 'goal',
  miss: 'miss',
  period_end: 'period_end',
  priority_change: 'priority',
  full_time: 'full_time',
};

const HIDDEN_STANDALONE_EVENTS = new Set<MatchEventKind>([
  'effect_applied',
  'effect_expired',
  'info',
  'priority_change',
]);

function labelFor(event: MatchEvent): Pick<BroadcastBeat, 'eyebrow' | 'title' | 'emphasis'> {
  switch (event.kind) {
    case 'action_activation': return { eyebrow: 'Your action', title: event.text, emphasis: 'positive' };
    case 'action_fizzle':
    case 'disabled_action': return { eyebrow: 'Action failed', title: event.text, emphasis: 'negative' };
    case 'substitution': return { eyebrow: 'Your change', title: event.text, emphasis: 'neutral' };
    case 'formation_change': return { eyebrow: 'Formation change', title: event.text, emphasis: 'neutral' };
    case 'movement': return { eyebrow: 'Movement', title: event.text, emphasis: 'neutral' };
    case 'chance_created': return { eyebrow: 'Attack', title: 'Chance created', emphasis: 'warning' };
    case 'chance_cancelled': return { eyebrow: 'Chance cancelled', title: event.text, emphasis: 'negative' };
    case 'die_roll': return { eyebrow: 'Roll', title: event.text, emphasis: 'warning' };
    case 'reroll': return { eyebrow: 'Reroll', title: event.text, emphasis: 'warning' };
    case 'goal': return { eyebrow: 'Goal', title: event.text, emphasis: 'positive' };
    case 'attribution': return { eyebrow: 'Scorer', title: event.text, emphasis: 'positive' };
    case 'unattributed_goal': return { eyebrow: 'Goal', title: event.text, emphasis: 'positive' };
    case 'miss': return { eyebrow: 'Miss', title: event.text, emphasis: 'negative' };
    case 'period_end': return { eyebrow: 'Period complete', title: event.text, emphasis: 'neutral' };
    case 'priority_change': return { eyebrow: 'Priority', title: event.text, emphasis: 'neutral' };
    case 'full_time': return { eyebrow: 'Full time', title: event.text, emphasis: 'warning' };
    case 'kickoff': return { eyebrow: 'Kick off', title: event.text, emphasis: 'positive' };
    default: return { eyebrow: 'Match update', title: event.text, emphasis: 'neutral' };
  }
}

function durationFor(kind: BroadcastBeatKind): number {
  if (kind === 'goal' || kind === 'full_time') return 1800;
  if (kind === 'roll' || kind === 'chance') return 1200;
  return 900;
}

function canJoin(current: BroadcastBeat, event: MatchEvent): boolean {
  if (current.period !== event.period || current.side !== event.side) return false;
  if (current.kind === 'action') return event.kind === 'effect_applied' || event.kind === 'chance_created';
  if (current.kind === 'roll') return event.kind === 'reroll';
  if (current.kind === 'goal') return event.kind === 'attribution' || event.kind === 'unattributed_goal';
  if (current.kind === 'change') return event.kind === 'substitution' || event.kind === 'movement';
  return false;
}

export function buildBroadcastBeats(events: readonly MatchEvent[]): BroadcastBeat[] {
  const beats: BroadcastBeat[] = [];

  for (const event of events) {
    const current = beats.at(-1);
    if (current && canJoin(current, event)) {
      current.sourceEventIds.push(event.id);
      current.detail = current.detail ? `${current.detail} · ${event.text}` : event.text;
      continue;
    }

    // Passive upkeep is still retained in receipts and diagnostics, but it is not
    // a match moment. Ongoing effects such as "Wall is active" should live on the
    // relevant card rather than interrupting goals, chances and coaching changes.
    if (HIDDEN_STANDALONE_EVENTS.has(event.kind)) continue;

    const kind = BEAT_KIND[event.kind] ?? 'info';
    const label = labelFor(event);
    beats.push({
      id: `beat:${event.id}`,
      kind,
      period: event.period,
      ...(event.side ? { side: event.side } : {}),
      ...label,
      sourceEventIds: [event.id],
      durationMs: durationFor(kind),
    });
  }

  return beats;
}

export interface MatchDirectorSnapshot {
  currentBeat: BroadcastBeat | null;
  history: readonly BroadcastBeat[];
  pending: number;
  complete: boolean;
  isPlaying: boolean;
}

/**
 * Owns the order in which the player experiences a resolved match sequence.
 * The internal queue and cursor are deliberately private so UI components only
 * depend on the current beat and completed history, never storage mechanics.
 */
export class MatchDirector {
  private beats: BroadcastBeat[] = [];
  private cursor = 0;

  load(beats: readonly BroadcastBeat[]): void {
    this.beats = [...beats];
    this.cursor = 0;
  }

  append(beats: readonly BroadcastBeat[]): void {
    this.beats.push(...beats);
  }

  currentBeat(): BroadcastBeat | null {
    return this.beats[this.cursor] ?? null;
  }

  history(): readonly BroadcastBeat[] {
    return this.beats.slice(0, this.cursor);
  }

  advance(): BroadcastBeat | null {
    if (this.cursor < this.beats.length) this.cursor += 1;
    return this.currentBeat();
  }

  skip(): void {
    this.cursor = this.beats.length;
  }

  reset(): void {
    this.beats = [];
    this.cursor = 0;
  }

  isPlaying(): boolean {
    return this.currentBeat() !== null;
  }

  snapshot(): MatchDirectorSnapshot {
    return {
      currentBeat: this.currentBeat(),
      history: this.history(),
      pending: Math.max(0, this.beats.length - this.cursor),
      complete: !this.isPlaying(),
      isPlaying: this.isPlaying(),
    };
  }
}
