import { describe, expect, it } from 'vitest';
import { buildBroadcastBeats, MatchDirector, type MatchEvent } from '@/game-v7';

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

describe('MatchDirector', () => {
  it('presents one beat at a time and exposes completed history', () => {
    const director = new MatchDirector();
    const beats = buildBroadcastBeats([
      event('chance', 'chance_created', 'Chance created'),
      event('goal', 'goal', 'Goal'),
    ]);

    director.load(beats);
    expect(director.snapshot()).toMatchObject({ pending: 2, complete: false, isPlaying: true });
    expect(director.currentBeat()?.kind).toBe('chance');
    expect(director.history()).toEqual([]);

    director.advance();
    expect(director.currentBeat()?.kind).toBe('goal');
    expect(director.history().map((beat) => beat.kind)).toEqual(['chance']);

    director.skip();
    expect(director.snapshot()).toMatchObject({ pending: 0, complete: true, isPlaying: false });
    expect(director.currentBeat()).toBeNull();
    expect(director.history().map((beat) => beat.kind)).toEqual(['chance', 'goal']);
  });

  it('resets all presentation state', () => {
    const director = new MatchDirector();
    director.load(buildBroadcastBeats([event('goal', 'goal', 'Goal')]));
    director.advance();
    director.reset();

    expect(director.snapshot()).toEqual({
      currentBeat: null,
      history: [],
      pending: 0,
      complete: true,
      isPlaying: false,
    });
  });
});
