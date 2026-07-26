import { describe, expect, it } from 'vitest';
import { BroadcastQueue, type BroadcastBeat } from '@/game-v7';

function beat(id: string, over: Partial<BroadcastBeat> = {}): BroadcastBeat {
  return {
    id,
    kind: 'info',
    period: 1,
    title: id,
    emphasis: 'normal',
    sourceReceiptIds: [id],
    durationHint: 1000,
    data: {},
    ...over,
  };
}

describe('BroadcastQueue transport', () => {
  it('presents one beat at a time in order via advance/show-next', () => {
    const q = new BroadcastQueue();
    q.enqueue([beat('a'), beat('b'), beat('c')]);
    expect(q.active()).toBeNull(); // nothing shown before the first advance
    expect(q.hasPending()).toBe(true);
    expect(q.advance()!.id).toBe('a');
    expect(q.advance()!.id).toBe('b');
    expect(q.advance()!.id).toBe('c');
    expect(q.advance()).toBeNull(); // exhausted
    expect(q.hasPending()).toBe(false);
  });

  it('skip is a single advance; skip-sequence drains the rest', () => {
    const q = new BroadcastQueue();
    q.enqueue([beat('a'), beat('b'), beat('c'), beat('d')]);
    q.advance(); // a
    expect(q.skip()!.id).toBe('b');
    q.drain();
    expect(q.active()!.id).toBe('d');
    expect(q.hasPending()).toBe(false);
    expect(q.presented().map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('play/pause toggles the playing flag without touching the cursor', () => {
    const q = new BroadcastQueue();
    q.enqueue([beat('a'), beat('b')]);
    q.advance();
    expect(q.isPlaying()).toBe(true);
    q.pause();
    expect(q.isPlaying()).toBe(false);
    expect(q.active()!.id).toBe('a'); // cursor unchanged
    q.play();
    expect(q.isPlaying()).toBe(true);
  });

  it('reduced-motion presents the whole sequence at once, preserving order', () => {
    const q = new BroadcastQueue({ reducedMotion: true });
    q.enqueue([beat('a'), beat('b'), beat('c')]);
    // Everything is immediately presented; nothing is pending.
    expect(q.hasPending()).toBe(false);
    expect(q.presented().map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(q.active()!.id).toBe('c');
    // A reduced-motion queue never reports itself as animating.
    expect(q.isPlaying()).toBe(false);
  });

  it('tracks the presented score from the latest scored beat, never ahead of it', () => {
    const q = new BroadcastQueue();
    q.enqueue([
      beat('roll'),
      beat('goal', { kind: 'goal', score: { player: 1, opponent: 0 } }),
      beat('after'),
    ]);
    expect(q.presentedScore()).toEqual({ player: 0, opponent: 0 });
    q.advance(); // roll — no score yet
    expect(q.presentedScore()).toEqual({ player: 0, opponent: 0 });
    q.advance(); // goal — score updates now
    expect(q.presentedScore()).toEqual({ player: 1, opponent: 0 });
    q.advance(); // after — score carries
    expect(q.presentedScore()).toEqual({ player: 1, opponent: 0 });
  });

  it('reset clears beats and cursor', () => {
    const q = new BroadcastQueue();
    q.enqueue([beat('a'), beat('b')]);
    q.advance();
    q.reset();
    expect(q.all()).toHaveLength(0);
    expect(q.active()).toBeNull();
    expect(q.hasPending()).toBe(false);
  });
});
