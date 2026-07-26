import { describe, expect, it } from 'vitest';
import { V7MatchController, v7Fixture, type MatchEventKind } from '@/game-v7';

// Integration: play the complete fixture match through the frontend controller
// end to end, without rendering any React. This is the "one deterministic V7
// match, start to finish" success criterion.

function playComplete(): V7MatchController {
  const controller = new V7MatchController(v7Fixture());
  let guard = 0;
  while (controller.getPhase() !== 'fulltime' && guard++ < 30) {
    controller.drainBeats(); // present each sequence before the engine advances
    if (controller.canResolvePeriod()) controller.resolvePeriod();
    else if (controller.canResolveBreak()) controller.resolveBreak();
    else break;
  }
  controller.drainBeats();
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

// The full "broadcast experience" flow: present period one, submit a break plan
// (a substitution AND an action), present the break sequence, see a
// choice-to-consequence callout, then complete the match to a result. This is
// the end-to-end acceptance for the receipt-driven broadcast UI.
describe('broadcast flow — present, coach, callout, finish', () => {
  it('runs kickoff → period 1 → break plan → callout → full time', () => {
    const c = new V7MatchController(v7Fixture());

    // 1. Present period one's setup, then resolve + present period one.
    c.drainBeats();
    expect(c.canResolvePeriod()).toBe(true);
    c.resolvePeriod();
    c.drainBeats();
    expect(c.getPhase()).toBe('break');

    // 2. Submit a substitution AND an activated action at the break.
    const cf = c.getView().player.active.find((p) => p.position === 'CF')!;
    const activated = c.getView().player.actions.find((a) => a.timing === 'activated' && (a.remainingCharges ?? 1) > 0)!;
    const decision = {
      subs: [{ outCardId: cf.cardId, inCardId: 'h_b3' }],
      activations: [{ actionInstanceId: activated.instanceId, sourceId: activated.cardId }],
    };
    const submit = c.setPlayerDecision(decision);
    expect(submit.ok).toBe(true);
    // Not resolved until confirmed.
    expect(c.getPhase()).toBe('break');

    // 3. Confirm — resolve the break, which enqueues the break sequence.
    c.resolveBreak();
    expect(c.getPhase()).toBe('period');

    // 4. Present the break sequence and collect its beats.
    const breakBeats = [];
    while (c.hasPendingBeats()) {
      const beat = c.advanceBeat();
      if (beat) breakBeats.push(beat);
    }

    // 5. At least one choice-to-consequence callout was shown.
    const callouts = breakBeats.filter((b) => b.callout);
    expect(callouts.length).toBeGreaterThan(0);
    expect(callouts.map((b) => b.callout!.label)).toEqual(
      expect.arrayContaining([expect.stringMatching(/YOUR (CHANGE|ACTION)/)]),
    );

    // 6. Finish the match.
    let guard = 0;
    while (c.getPhase() !== 'fulltime' && guard++ < 20) {
      c.drainBeats();
      if (c.canResolvePeriod()) c.resolvePeriod();
      else if (c.canResolveBreak()) c.resolveBreak();
    }
    c.drainBeats();

    // 7. The match reaches a correct, presented result.
    expect(c.getPhase()).toBe('fulltime');
    expect(['VICTORY', 'DRAW', 'DEFEAT']).toContain(c.getResult());
    const finalBeat = c.getBeats().find((b) => b.kind === 'full_time')!;
    expect(finalBeat.score).toEqual({ player: c.getView().player.score, opponent: c.getView().opponent.score });
  });
});
