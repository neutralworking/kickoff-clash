import { describe, expect, it } from 'vitest';
import type { MatchReceiptEvent, PeriodNumber } from '@/engine-v7';
import { buildBeats } from '@/game-v7';

// Unit tests for the pure receipt → beat grouping. These build hand-authored
// receipt streams so the grouping rules are pinned independent of the engine.

function receipt(
  eventType: string,
  overrides: Partial<MatchReceiptEvent> = {},
): MatchReceiptEvent {
  return {
    id: overrides.id ?? `r:${eventType}:${Math.random()}`,
    period: (overrides.period ?? 1) as PeriodNumber,
    phase: overrides.phase ?? 'test',
    eventType,
    message: overrides.message ?? eventType,
    ...(overrides.side ? { side: overrides.side } : {}),
    ...(overrides.sourceId ? { sourceId: overrides.sourceId } : {}),
    ...(overrides.actionName ? { actionName: overrides.actionName } : {}),
    ...(overrides.targetIds ? { targetIds: overrides.targetIds } : {}),
    data: overrides.data ?? {},
  };
}

describe('buildBeats — order + coverage', () => {
  it('preserves receipt order as beat order', () => {
    const receipts = [
      receipt('kickoff', { id: 'k' }),
      receipt('chance_created', { id: 'c', side: 'player', data: { count: 2, left: 1, centre: 1, right: 0 } }),
      receipt('chance_roll', { id: 'r1', side: 'player', data: { sector: 'left', rolls: [3], finalRoll: 3, threshold: 6, rerollsUsed: 0, scored: false } }),
      receipt('chance_missed', { id: 'm1', side: 'player', data: { sector: 'left', finalRoll: 3, threshold: 6 } }),
      receipt('period_end', { id: 'pe', data: { matchOver: false, playerScore: 0, opponentScore: 0 } }),
    ];
    const { beats } = buildBeats(receipts);
    expect(beats.map((b) => b.kind)).toEqual(['kickoff', 'chance', 'roll', 'miss', 'period_end']);
    // Every source receipt id is represented across the beats.
    const ids = new Set(beats.flatMap((b) => b.sourceReceiptIds));
    for (const r of receipts) expect(ids.has(r.id)).toBe(true);
  });

  it('folds a goal + attribution into one goal beat retaining both source ids', () => {
    const receipts = [
      receipt('goal_scored', { id: 'g', side: 'player', data: { sector: 'centre', finalRoll: 6, threshold: 6, playerScore: 1, opponentScore: 0 } }),
      receipt('attribution', { id: 'a', side: 'player', data: { scorerId: 'h_cf' } }),
    ];
    const { beats } = buildBeats(receipts, { nameOf: (id) => (id === 'h_cf' ? 'Vale' : id) });
    expect(beats).toHaveLength(1);
    expect(beats[0]!.kind).toBe('goal');
    expect(beats[0]!.sourceReceiptIds).toEqual(['g', 'a']);
    expect(beats[0]!.sourceId).toBe('h_cf');
    expect(beats[0]!.causalPath).toEqual(['Centre chance', 'Roll 6', 'Goal — Vale']);
  });

  it('keeps rerolls attached to the original chance (one roll beat)', () => {
    const receipts = [
      receipt('chance_roll', { id: 'r', side: 'player', data: { sector: 'centre', rolls: [2, 4, 6], finalRoll: 6, threshold: 6, rerollsUsed: 2, scored: true } }),
    ];
    const { beats } = buildBeats(receipts);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.kind).toBe('roll');
    expect(beats[0]!.data.rolls).toEqual([2, 4, 6]);
    expect(beats[0]!.data.rerollsUsed).toBe(2);
    // The detail shows the whole sequence, not three separate events.
    expect(String(beats[0]!.detail)).toContain('2 → 4 → 6');
  });

  it('groups action → effect → chance into a connected sequence keeping every id', () => {
    const receipts = [
      receipt('action_activated', { id: 'act', side: 'player', sourceId: 'h_cm', actionName: 'Pep Talk' }),
      receipt('ongoing_applied', { id: 'eff', side: 'player', sourceId: 'h_cm', actionName: 'Pep Talk', message: 'Pep Talk is active.' }),
      receipt('chance_created', { id: 'chn', side: 'player', data: { count: 1, left: 0, centre: 1, right: 0 } }),
    ];
    const { beats } = buildBeats(receipts);
    expect(beats.map((b) => b.kind)).toEqual(['action', 'effect', 'chance']);
    const allIds = beats.flatMap((b) => b.sourceReceiptIds);
    expect(allIds).toEqual(['act', 'eff', 'chn']);
    expect(beats[0]!.title).toBe('PEP TALK');
  });

  it('keeps an action fizzle visible rather than dropping it', () => {
    const { beats } = buildBeats([
      receipt('action_fizzled', { id: 'f', side: 'player', actionName: 'Spark', data: { reason: 'condition_failed' } }),
    ]);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.kind).toBe('fizzle');
    expect(beats[0]!.title).toBe('ACTION FAILED');
    expect(String(beats[0]!.detail)).toContain('condition failed');
  });
});

describe('buildBeats — score presentation', () => {
  it('stamps the resulting score only on the goal beat, not before', () => {
    const receipts = [
      receipt('chance_roll', { id: 'r', side: 'player', data: { sector: 'centre', rolls: [6], finalRoll: 6, threshold: 6, rerollsUsed: 0, scored: true } }),
      receipt('goal_scored', { id: 'g', side: 'player', data: { sector: 'centre', finalRoll: 6, threshold: 6, playerScore: 1, opponentScore: 0 } }),
    ];
    const { beats, endScore } = buildBeats(receipts);
    const roll = beats.find((b) => b.kind === 'roll')!;
    const goal = beats.find((b) => b.kind === 'goal')!;
    expect(roll.score).toBeUndefined();
    expect(goal.score).toEqual({ player: 1, opponent: 0 });
    expect(endScore).toEqual({ player: 1, opponent: 0 });
  });

  it('accumulates from the provided start score', () => {
    const { beats } = buildBeats(
      [receipt('goal_scored', { id: 'g', side: 'opponent', data: { sector: 'left', finalRoll: 6, threshold: 6 } })],
      { startScore: { player: 2, opponent: 1 } },
    );
    expect(beats[0]!.score).toEqual({ player: 2, opponent: 2 });
  });
});

describe('buildBeats — substitutions + callouts', () => {
  it('pairs a sub off + on into one beat and tags the player callout', () => {
    const receipts = [
      receipt('substitution_off', { id: 'off', side: 'player', sourceId: 'h_cf' }),
      receipt('substitution_on', { id: 'on', side: 'player', sourceId: 'h_b3', data: { slotKey: 'cf', sector: 'centre' } }),
    ];
    const { beats } = buildBeats(receipts, {
      nameOf: (id) => ({ h_cf: 'Vale', h_b3: 'Ferro' })[id] ?? id,
      playerIncomingCardIds: ['h_b3'],
    });
    expect(beats).toHaveLength(1);
    expect(beats[0]!.kind).toBe('substitution');
    expect(beats[0]!.sourceReceiptIds).toEqual(['off', 'on']);
    expect(beats[0]!.data).toMatchObject({ inCardId: 'h_b3', outCardId: 'h_cf', slotKey: 'cf' });
    expect(beats[0]!.callout).toMatchObject({ kind: 'change', label: 'YOUR CHANGE' });
  });

  it('tags a player-activated action with a "your action" callout', () => {
    const { beats } = buildBeats(
      [receipt('action_activated', { id: 'a', side: 'player', sourceId: 'h_cm', actionName: 'Spark' })],
      { playerActionSourceIds: ['h_cm'] },
    );
    expect(beats[0]!.callout).toMatchObject({ kind: 'action', label: 'YOUR ACTION' });
  });

  it('does not tag opponent or unrequested changes', () => {
    const { beats } = buildBeats(
      [receipt('substitution_on', { id: 'on', side: 'opponent', sourceId: 'a_b3', data: { slotKey: 'cm' } })],
      { playerIncomingCardIds: ['h_b3'] },
    );
    expect(beats[0]!.callout).toBeUndefined();
  });
});
