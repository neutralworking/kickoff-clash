import { describe, expect, it } from 'vitest';
import { buildBroadcastBeats, PresentationQueue, type MatchEvent } from '@/game-v7';

const event = (id: string, kind: MatchEvent['kind'], text: string, side: MatchEvent['side'] = 'player'): MatchEvent => ({
  id,
  kind,
  text,
  period: 1,
  side,
});

describe('buildBroadcastBeats', () => {
  it('preserves event order while grouping action consequences', () => {
    const beats = buildBroadcastBeats([
      event('a', 'action_activation', 'High Press activated'),
      event('b', 'effect_applied', '+2 centre attack'),
      event('c', 'chance_created', 'Centre chance created'),
      event('d', 'die_roll', 'Roll 6; 5 needed'),
      event('e', 'goal', 'Goal scored'),
      event('f', 'attribution', 'Malik scores'),
    ]);

    expect(beats.map((beat) => beat.kind)).toEqual(['action', 'roll', 'goal']);
    expect(beats[0].sourceEventIds).toEqual(['a', 'b', 'c']);
    expect(beats[0].detail).toContain('Centre chance created');
    expect(beats[2].sourceEventIds).toEqual(['e', 'f']);
  });

  it('keeps failed actions visible', () => {
    const beats = buildBroadcastBeats([event('a', 'action_fizzle', 'High Press failed: no legal target')]);
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ kind: 'action', eyebrow: 'Action failed', emphasis: 'negative' });
  });

  it('keeps rerolls attached to their roll', () => {
    const beats = buildBroadcastBeats([
      event('roll', 'die_roll', 'Roll 2'),
      event('reroll', 'reroll', 'Reroll ×1 → 5'),
      event('miss', 'miss', 'Chance missed'),
    ]);
    expect(beats.map((beat) => beat.kind)).toEqual(['roll', 'miss']);
    expect(beats[0].sourceEventIds).toEqual(['roll', 'reroll']);
  });
});

describe('PresentationQueue', () => {
  it('presents one beat at a time and drains safely', () => {
    const queue = new PresentationQueue();
    const beats = buildBroadcastBeats([
      event('chance', 'chance_created', 'Chance created'),
      event('goal', 'goal', 'Goal'),
    ]);

    queue.load(beats);
    expect(queue.snapshot()).toMatchObject({ pending: 2, presented: 0, complete: false });
    expect(queue.current()?.kind).toBe('chance');

    queue.next();
    expect(queue.current()?.kind).toBe('goal');

    queue.skipAll();
    expect(queue.snapshot()).toMatchObject({ pending: 0, complete: true });
    expect(queue.current()).toBeNull();
  });
});
