import { describe, expect, it } from 'vitest';
import { calculatedChanceCount } from '@/engine-v7';
import {
  V7MatchController,
  buildPeriodPresentation,
  pressureFromSnapshot,
  v7Fixture,
} from '@/game-v7';

function completeFixtureMatch(seed: number): { score: string; rolls: number[][] } {
  const controller = new V7MatchController({ ...v7Fixture(), seed });
  while (controller.getPhase() !== 'fulltime') {
    if (controller.getPhase() === 'period') controller.resolvePeriod();
    else controller.resolveBreak();
  }
  const view = controller.getView();
  return {
    score: `${view.player.score}-${view.opponent.score}`,
    rolls: controller.getSnapshots().flatMap((snapshot) => snapshot.tokenOutcomes.map((token) => [...token.rolls])),
  };
}

describe('V7 structured presentation', () => {
  it('calculates the base bars from complete Home ATT v Away DEF bands and the reverse', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const view = controller.getView();
    const pressure = pressureFromSnapshot(snapshot, view);

    expect(calculatedChanceCount(59, 46)).toBe(2);
    expect(calculatedChanceCount(53, 42)).toBe(2);
    expect(pressure.player.difference).toBe(13);
    expect(pressure.opponent.difference).toBe(11);
    expect(pressure.player.baseChances).toBe(2);
    expect(pressure.opponent.baseChances).toBe(2);
    expect(pressure.player.baseChances).toBe(
      calculatedChanceCount(pressure.player.attack, pressure.player.enemyDefence),
    );
    expect(pressure.opponent.baseChances).toBe(
      calculatedChanceCount(pressure.opponent.attack, pressure.opponent.enemyDefence),
    );
    expect(pressure.player.finalChances).toBe(
      snapshot.tokenOutcomes.filter((token) => token.side === 'player' && !token.cancelled).length,
    );
    expect(pressure.opponent.finalChances).toBe(
      snapshot.tokenOutcomes.filter((token) => token.side === 'opponent' && !token.cancelled).length,
    );
  });

  it('stages each complete base chance band before the unconverted remainder, adjustments and rolls', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const view = controller.getView();
    const pressure = pressureFromSnapshot(snapshot, view);
    const beats = buildPeriodPresentation(snapshot, view);

    expect(beats[0]?.kind).toBe('lock');
    expect(beats[1]).toMatchObject({ kind: 'pressure', side: 'player' });

    const homeThresholds = beats.filter((beat) => beat.kind === 'threshold' && beat.side === 'player');
    const awayThresholds = beats.filter((beat) => beat.kind === 'threshold' && beat.side === 'opponent');
    const homeChanceBeat = beats.find((beat) => beat.kind === 'chances' && beat.side === 'player');
    const awayPressureBeat = beats.find((beat) => beat.kind === 'pressure' && beat.side === 'opponent');
    const overviewIndex = beats.findIndex((beat) => beat.kind === 'overview');
    const firstRollIndex = beats.findIndex((beat) => beat.kind === 'roll');

    expect(homeThresholds).toHaveLength(2);
    expect(awayThresholds).toHaveLength(2);
    expect(homeThresholds.map((beat) => beat.thresholdIndex)).toEqual([1, 2]);
    expect(homeChanceBeat?.thresholdTotal).toBe(2);
    expect(awayPressureBeat).toBeDefined();
    expect(overviewIndex).toBeGreaterThan(beats.findIndex((beat) => beat.kind === 'chances' && beat.side === 'opponent'));
    expect(firstRollIndex).toBeGreaterThan(overviewIndex);
    expect(pressure.player.difference % 5).toBe(3);
    expect(pressure.opponent.difference % 5).toBe(1);
  });

  it('uses the structured final roll and surviving chance total', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const pressure = pressureFromSnapshot(snapshot, controller.getView());
    const outcome = snapshot.tokenOutcomes.find((token) => !token.cancelled)!;
    const beats = buildPeriodPresentation(snapshot, controller.getView());
    const roll = beats.find((beat) => beat.kind === 'roll' && beat.id.includes(outcome.tokenId));

    expect(roll?.finalRoll).toBe(outcome.finalRoll);
    expect(roll?.threshold).toBe(outcome.threshold);
    expect(roll?.rolls).toEqual(outcome.rolls);
    expect(roll?.sector).toBe(outcome.sector);
    expect(roll?.chanceIndex).toBeGreaterThan(0);
    expect(roll?.chanceTotal).toBe(pressure[outcome.side].finalChances);
  });

  it('surfaces material action and position modifiers in the calculation', () => {
    const controller = new V7MatchController(v7Fixture());
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots()[0]!;
    const pressure = pressureFromSnapshot(snapshot, controller.getView());

    expect(pressure.player.modifiers.some((modifier) => modifier.label.includes('Talisman') || modifier.label.includes('Wall'))).toBe(true);
    expect(pressure.opponent.modifiers.length).toBeGreaterThan(0);
  });

  it('preserves exact same-seed replays and varies full matches across new seeds', () => {
    const seed = 20260724;
    const first = completeFixtureMatch(seed);
    const replay = completeFixtureMatch(seed);
    const newMatches = [20260723, 1410647606, 599558173, 1980918488, 17330263].map(completeFixtureMatch);

    expect(first).toEqual(replay);
    expect(new Set(newMatches.map((match) => match.score)).size).toBeGreaterThan(1);
    expect(new Set(newMatches.map((match) => JSON.stringify(match.rolls))).size).toBe(newMatches.length);
  });
});
