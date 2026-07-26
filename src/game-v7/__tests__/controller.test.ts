import { describe, expect, it } from 'vitest';
import { V7MatchController, v7Fixture } from '@/game-v7';

function fresh() {
  return new V7MatchController(v7Fixture());
}

/** Drive a controller to full time with no interaction. */
function playThrough(controller: V7MatchController): void {
  let guard = 0;
  while (controller.getPhase() !== 'fulltime' && guard++ < 20) {
    controller.drainBeats(); // present the pending sequence before advancing the engine
    if (controller.canResolvePeriod()) controller.resolvePeriod();
    else if (controller.canResolveBreak()) controller.resolveBreak();
  }
  controller.drainBeats();
}

describe('controller lifecycle', () => {
  it('starts at period 1 with a kickoff feed and initial chances', () => {
    const c = fresh();
    expect(c.getPhase()).toBe('period');
    const view = c.getView();
    expect(view.period).toBe(1);
    expect(view.player.score).toBe(0);
    expect(c.getEvents().some((e) => e.kind === 'kickoff')).toBe(true);
    expect(c.getEvents().some((e) => e.kind === 'chance_created')).toBe(true);
  });

  it('cannot resolve one phase twice', () => {
    const c = fresh();
    c.drainBeats();
    c.resolvePeriod();
    expect(c.canResolvePeriod()).toBe(false);
    expect(() => c.resolvePeriod()).toThrow();
  });

  it('cannot advance after full time', () => {
    const c = fresh();
    playThrough(c);
    expect(c.getPhase()).toBe('fulltime');
    expect(c.getResult()).not.toBeNull();
    expect(() => c.resolvePeriod()).toThrow();
    expect(() => c.resolveBreak()).toThrow();
  });

  it('reaches full time with four period snapshots and a result', () => {
    const c = fresh();
    playThrough(c);
    expect(c.getSnapshots()).toHaveLength(4);
    expect(['VICTORY', 'DRAW', 'DEFEAT']).toContain(c.getResult());
  });
});

describe('break plans through the controller', () => {
  it('accepts a legal player plan and rejects an illegal one before resolution', () => {
    const c = fresh();
    c.drainBeats();
    c.resolvePeriod(); // → break 1
    c.drainBeats();
    expect(c.canResolveBreak()).toBe(true);
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;

    // Illegal: a cost-4 bench card cannot come on at break 1 (energy 3).
    const illegal = c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b1' }] });
    expect(illegal.ok).toBe(false);
    expect(c.getDiagnostics().validationErrors.length).toBeGreaterThan(0);
    // The illegal plan did not advance the match.
    expect(c.getView().period).toBe(1);
    expect(c.getPhase()).toBe('break');

    // Legal: a cost-2 bench card is affordable.
    const legal = c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b3' }] });
    expect(legal.ok).toBe(true);
    expect(c.getDiagnostics().validationErrors).toHaveLength(0);
  });

  it('applies a submitted substitution when the break resolves', () => {
    const c = fresh();
    c.drainBeats();
    c.resolvePeriod();
    c.drainBeats();
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;
    c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b3' }] });
    c.resolveBreak();
    const active = c.getView().player.active.map((p) => p.cardId);
    expect(active).toContain('h_b3');
    expect(active).not.toContain(cf.cardId);
  });
});

describe('determinism + restart', () => {
  it('replays the same scripted match to the same score and event stream', () => {
    const a = fresh();
    const b = fresh();
    playThrough(a);
    playThrough(b);
    expect(a.getView().player.score).toBe(b.getView().player.score);
    expect(a.getView().opponent.score).toBe(b.getView().opponent.score);
    expect(a.getResult()).toBe(b.getResult());
    expect(a.getEvents().map((e) => `${e.kind}:${e.text}`)).toEqual(b.getEvents().map((e) => `${e.kind}:${e.text}`));
  });

  it('restart restores the original seed and initial state', () => {
    const c = fresh();
    const before = c.getView();
    playThrough(c);
    expect(c.getPhase()).toBe('fulltime');
    c.restart();
    expect(c.getPhase()).toBe('period');
    expect(c.getView().period).toBe(1);
    expect(c.getView().player.score).toBe(0);
    expect(c.getView().opponent.score).toBe(0);
    expect(c.getDiagnostics().seed).toBe(before.seed);
    expect(c.getView().player.active.map((p) => p.cardId)).toEqual(before.player.active.map((p) => p.cardId));
  });
});
