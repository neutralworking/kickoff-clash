import { describe, expect, it } from 'vitest';
import { V7MatchController, v7Fixture, type MatchEventKind } from '@/game-v7';

// Integration: play the complete fixture match through the frontend controller
// end to end, without rendering any React. This is the "one deterministic V7
// match, start to finish" success criterion.

function playComplete(): V7MatchController {
  const controller = new V7MatchController(v7Fixture());
  let guard = 0;
  while (controller.getPhase() !== 'fulltime' && guard++ < 30) {
    if (controller.canResolvePeriod()) controller.resolvePeriod();
    else if (controller.canResolveBreak()) controller.resolveBreak();
    else break;
  }
  return controller;
}

describe('full V7 match through the controller', () => {
  it('plays kickoff → 4 periods → full time and produces a result', () => {
    const controller = playComplete();
    expect(controller.getPhase()).toBe('fulltime');
    expect(controller.getSnapshots()).toHaveLength(4);
    expect(controller.getView().period).toBe(4);
    expect(['VICTORY', 'DRAW', 'DEFEAT']).toContain(controller.getResult());
  });

  it('emits the core receipt-driven event kinds', () => {
    const kinds = new Set<MatchEventKind>(playComplete().getEvents().map((event) => event.kind));
    for (const required of ['kickoff', 'chance_created', 'die_roll', 'period_end', 'priority_change', 'full_time'] as MatchEventKind[]) {
      expect(kinds.has(required)).toBe(true);
    }
    // The tuned fixture scores, so goal + attribution appear too.
    expect(kinds.has('goal')).toBe(true);
    expect(kinds.has('attribution') || kinds.has('unattributed_goal')).toBe(true);
    // Kickoff applied the talisman / wall effects.
    expect(kinds.has('effect_applied')).toBe(true);
  });

  it('keeps the event feed in non-decreasing period order (engine order preserved)', () => {
    const events = playComplete().getEvents();
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i]!.period).toBeGreaterThanOrEqual(events[i - 1]!.period);
    }
  });

  it('replays byte-for-byte from the same seed and inputs', () => {
    const a = playComplete();
    const b = playComplete();
    expect(a.getView().player.score).toBe(b.getView().player.score);
    expect(a.getView().opponent.score).toBe(b.getView().opponent.score);
    expect(a.getEvents().map((e) => e.id)).toEqual(b.getEvents().map((e) => e.id));
    expect(a.getEvents().map((e) => e.text)).toEqual(b.getEvents().map((e) => e.text));
  });
});
