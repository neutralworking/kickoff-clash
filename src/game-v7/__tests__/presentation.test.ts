import { describe, expect, it } from 'vitest';
import {
  V7MatchController,
  buildPeriodPresentation,
  pressureFromSnapshot,
  v7Fixture,
} from '@/game-v7';

describe('V7 structured presentation', () => {
  it('reveals pressure and the real token count before rolls', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const pressure = pressureFromSnapshot(snapshot);
    const beats = buildPeriodPresentation(snapshot, controller.getView());

    expect(beats[0]?.kind).toBe('pressure');
    expect(beats[1]?.kind).toBe('chances');
    expect(pressure.player.chances).toBe(snapshot.tokenOutcomes.filter((token) => token.side === 'player').length);
    expect(pressure.opponent.chances).toBe(snapshot.tokenOutcomes.filter((token) => token.side === 'opponent').length);
  });

  it('uses the structured final roll and threshold instead of parsing commentary', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const outcome = snapshot.tokenOutcomes.find((token) => !token.cancelled)!;
    const beats = buildPeriodPresentation(snapshot, controller.getView());
    const roll = beats.find((beat) => beat.kind === 'roll' && beat.id.includes(outcome.tokenId));

    expect(roll?.finalRoll).toBe(outcome.finalRoll);
    expect(roll?.threshold).toBe(outcome.threshold);
    expect(roll?.rolls).toEqual(outcome.rolls);
    expect(roll?.sector).toBe(outcome.sector);
  });

  it('supports a new seed while preserving exact same-seed replays', () => {
    const seed = 20260724;
    const first = new V7MatchController({ ...v7Fixture(), seed });
    const replay = new V7MatchController({ ...v7Fixture(), seed });
    first.resolvePeriod();
    replay.resolvePeriod();

    expect(first.getView().seed).toBe(seed);
    expect(first.getSnapshots()[0]?.tokenOutcomes).toEqual(replay.getSnapshots()[0]?.tokenOutcomes);
  });
});
