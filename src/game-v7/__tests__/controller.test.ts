import { describe, expect, it } from 'vitest';
import { V7MatchController, v7Fixture } from '@/game-v7';

function fresh() {
  return new V7MatchController(v7Fixture());
}

/** Drive a controller to full time with no interaction. */
function playThrough(controller: V7MatchController): void {
  let guard = 0;
  while (controller.getPhase() !== 'fulltime' && guard++ < 20) {
    if (controller.canResolvePeriod()) controller.resolvePeriod();
    else if (controller.canResolveBreak()) controller.resolveBreak();
  }
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
    c.resolvePeriod();
    expect(c.canResolveBreak()).toBe(true);
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;

    const illegal = c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b1' }] });
    expect(illegal.ok).toBe(false);
    expect(c.getDiagnostics().validationErrors.length).toBeGreaterThan(0);
    expect(c.getView().period).toBe(1);
    expect(c.getPhase()).toBe('break');

    const legal = c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b3' }] });
    expect(legal.ok).toBe(true);
    expect(c.getDiagnostics().validationErrors).toHaveLength(0);
  });

  it('applies a submitted substitution when the break resolves', () => {
    const c = fresh();
    c.resolvePeriod();
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;
    c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b3' }] });
    c.resolveBreak();
    const active = c.getView().player.active.map((p) => p.cardId);
    expect(active).toContain('h_b3');
    expect(active).not.toContain(cf.cardId);
  });

  it('prepares and applies a deterministic opponent coaching response', () => {
    const c = fresh();
    c.resolvePeriod();
    c.setPlayerDecision({ subs: [], activations: [] });
    const prepared = c.prepareOpponentDecision();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.value.decision.subs).toHaveLength(1);
    expect(c.getPendingOpponentDecision()?.decision).toEqual(prepared.value.decision);
    const substitution = prepared.value.decision.subs[0]!;
    const before = c.getView().opponent.active.map((player) => player.cardId);
    expect(before).toContain(substitution.outCardId);
    expect(before).not.toContain(substitution.inCardId);

    const result = c.resolveBreak();
    expect(result.ok).toBe(true);
    const after = c.getView().opponent.active.map((player) => player.cardId);
    expect(after).toContain(substitution.inCardId);
    expect(after).not.toContain(substitution.outCardId);
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
