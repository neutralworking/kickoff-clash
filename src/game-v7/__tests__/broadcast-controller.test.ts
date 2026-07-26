import { describe, expect, it } from 'vitest';
import { V7MatchController, v7Fixture } from '@/game-v7';

function fresh() {
  return new V7MatchController(v7Fixture());
}

/** Play to the next break with no interaction, presenting each sequence. */
function toFirstBreak(c: V7MatchController): void {
  c.drainBeats();
  c.resolvePeriod();
  c.drainBeats();
}

describe('broadcast gate — engine cannot advance while beats are pending', () => {
  it('blocks period resolution until the kickoff sequence is presented', () => {
    const c = fresh();
    expect(c.hasPendingBeats()).toBe(true);
    expect(c.canResolvePeriod()).toBe(false);
    expect(() => c.resolvePeriod()).toThrow(/pending/i);
    c.drainBeats();
    expect(c.canResolvePeriod()).toBe(true);
    expect(() => c.resolvePeriod()).not.toThrow();
  });

  it('blocks break resolution until the period sequence is presented', () => {
    const c = fresh();
    c.drainBeats();
    c.resolvePeriod(); // → break, with a fresh pending sequence
    expect(c.getPhase()).toBe('break');
    expect(c.hasPendingBeats()).toBe(true);
    expect(c.canResolveBreak()).toBe(false);
    expect(() => c.resolveBreak()).toThrow(/pending/i);
  });
});

describe('presented lineup updates exactly at the substitution beat', () => {
  it('reverts the sub in the stage view until its beat is presented', () => {
    const c = fresh();
    toFirstBreak(c);
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;
    const ok = c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b3' }] });
    expect(ok.ok).toBe(true);
    c.resolveBreak();

    // Engine truth already has the sub; the stage view does not, yet.
    expect(c.getView().player.active.map((p) => p.cardId)).toContain('h_b3');
    expect(c.getStageView().player.active.map((p) => p.cardId)).not.toContain('h_b3');
    expect(c.getStageView().player.active.map((p) => p.cardId)).toContain(cf.cardId);

    // Advance until the substitution beat is on screen.
    let guard = 0;
    while (c.getActiveBeat()?.kind !== 'substitution' && c.hasPendingBeats() && guard++ < 50) c.advanceBeat();
    const subBeat = c.getActiveBeat()!;
    expect(subBeat.kind).toBe('substitution');
    expect(subBeat.data.inCardId).toBe('h_b3');
    expect(subBeat.callout).toMatchObject({ label: 'YOUR CHANGE' });

    // Now the stage view reflects the change.
    expect(c.getStageView().player.active.map((p) => p.cardId)).toContain('h_b3');
    expect(c.getStageView().player.active.map((p) => p.cardId)).not.toContain(cf.cardId);
  });
});

describe('coaching selections do not resolve before confirmation', () => {
  it('setting a decision leaves the engine on the same break', () => {
    const c = fresh();
    toFirstBreak(c);
    const before = c.getView().period;
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;
    c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b3' }] });
    expect(c.getPhase()).toBe('break');
    expect(c.getView().period).toBe(before);
    // Nothing was applied to the pitch until resolveBreak.
    expect(c.getView().player.active.map((p) => p.cardId)).toContain(cf.cardId);
    expect(c.getView().player.active.map((p) => p.cardId)).not.toContain('h_b3');
  });

  it('explains why an unaffordable selection is illegal', () => {
    const c = fresh();
    toFirstBreak(c);
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;
    const res = c.setPlayerDecision({ subs: [{ outCardId: cf.cardId, inCardId: 'h_b1' }] }); // cost 4 > energy 3
    expect(res.ok).toBe(false);
    expect(c.getDiagnostics().validationErrors.join(' ')).toMatch(/energy|budget|afford|cost/i);
  });
});

describe('restart resets engine + presentation', () => {
  it('clears beats, cursor, and result', () => {
    const c = fresh();
    c.drainBeats();
    while (c.getPhase() !== 'fulltime') {
      c.drainBeats();
      if (c.canResolvePeriod()) c.resolvePeriod();
      else if (c.canResolveBreak()) c.resolveBreak();
    }
    c.drainBeats();
    expect(c.getResult()).not.toBeNull();

    c.restart();
    expect(c.getResult()).toBeNull();
    expect(c.getPhase()).toBe('period');
    expect(c.getActiveBeat()).toBeNull();
    expect(c.hasPendingBeats()).toBe(true); // a fresh kickoff sequence is queued
    expect(c.getStageView().player.score).toBe(0);
    expect(c.getStageView().opponent.score).toBe(0);
  });
});

describe('deterministic beat stream', () => {
  it('replays an identical ordered beat stream from the same seed + inputs', () => {
    const play = () => {
      const c = fresh();
      while (c.getPhase() !== 'fulltime') {
        c.drainBeats();
        if (c.canResolvePeriod()) c.resolvePeriod();
        else if (c.canResolveBreak()) c.resolveBreak();
      }
      c.drainBeats();
      return c.getBeats().map((b) => `${b.kind}:${b.id}:${b.title}`);
    };
    expect(play()).toEqual(play());
  });
});
