import { describe, expect, it } from 'vitest';
import {
  V7MatchController,
  buildPeriodPresentation,
  pressureFromSnapshot,
  v7Fixture,
} from '@/game-v7';

describe('V7 structured presentation', () => {
  it('stages lock, pressure thresholds, chance totals and then rolls', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const view = controller.getView();
    const pressure = pressureFromSnapshot(snapshot, view);
    const beats = buildPeriodPresentation(snapshot, view);

    expect(beats[0]?.kind).toBe('lock');
    expect(beats[1]).toMatchObject({ kind: 'pressure', side: 'player' });

    const homeChanceBeat = beats.find((beat) => beat.kind === 'chances' && beat.side === 'player');
    const awayPressureBeat = beats.find((beat) => beat.kind === 'pressure' && beat.side === 'opponent');
    const overviewBeat = beats.find((beat) => beat.kind === 'overview');
    const firstRollIndex = beats.findIndex((beat) => beat.kind === 'roll');

    expect(homeChanceBeat?.thresholdTotal).toBe(pressure.player.chances);
    expect(awayPressureBeat).toBeDefined();
    expect(overviewBeat).toBeDefined();
    expect(firstRollIndex).toBeGreaterThan(beats.findIndex((beat) => beat.kind === 'overview'));
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
    expect(roll?.chanceIndex).toBeGreaterThan(0);
    expect(roll?.chanceTotal).toBe(snapshot.tokenOutcomes.filter((token) => token.side === outcome.side).length);
  });

  it('surfaces material action and position modifiers in the pressure calculation', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const pressure = pressureFromSnapshot(snapshot, controller.getView());

    expect(pressure.player.modifiers.some((modifier) => modifier.label.includes('Talisman') || modifier.label.includes('Wall'))).toBe(true);
    expect(pressure.opponent.modifiers.length).toBeGreaterThan(0);
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
