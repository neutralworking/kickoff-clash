import { describe, expect, it } from 'vitest';
import { simulatePrototypeBatch } from '../simulation';

const CONTROLLED = [3, 5, 7, 9] as const;
const EXPLOSIVE = [4, 6, 8, 10] as const;

describe('V8 prototype economy simulation', () => {
  it('replays deterministically for the same seeds and energy curve', () => {
    const first = simulatePrototypeBatch(80, CONTROLLED, 1000);
    const replay = simulatePrototypeBatch(80, CONTROLLED, 1000);
    expect(replay).toEqual(first);
  });

  it('keeps all three zones relevant after re-costing around natural zone power', () => {
    const result = simulatePrototypeBatch(120, CONTROLLED, 2000);
    const totalShare = result.zoneShare.DEF + result.zoneShare.MID + result.zoneShare.ATT;

    expect(totalShare).toBeCloseTo(1, 8);
    expect(result.zoneShare.DEF).toBeGreaterThan(0.15);
    expect(result.zoneShare.MID).toBeGreaterThan(0.15);
    expect(result.zoneShare.ATT).toBeGreaterThan(0.15);
    expect(result.averagePlayersDeployedPerTeam).toBeGreaterThan(4);
    expect(result.averagePlayersDeployedPerTeam).toBeLessThan(9);
  });

  it('makes genuine 1-cost players part of the 3-energy tempo game', () => {
    const result = simulatePrototypeBatch(160, CONTROLLED, 2500);

    expect(result.averageOneCostPlayersDeployedPerTeam).toBeGreaterThan(1);
    expect(result.periodOneMultiPlayRate).toBeGreaterThan(0.2);
  });

  it('creates playable future-period Chance cards rather than automatic chance resolution', () => {
    const result = simulatePrototypeBatch(120, CONTROLLED, 3000);

    expect(result.averageChanceCardsCreatedPerTeam).toBeGreaterThan(0.5);
    expect(result.averageChanceCardsPlayedPerTeam).toBeGreaterThan(0.1);
    expect(result.averageChanceCardsPlayedPerTeam).toBeLessThanOrEqual(result.averageChanceCardsCreatedPerTeam);
  });

  it('makes the final period the largest scoring window under full-board period banking', () => {
    const result = simulatePrototypeBatch(120, CONTROLLED, 4000);
    const finalPeriod = result.averageGoalsByPeriod[3]!;

    expect(finalPeriod).toBeGreaterThan(result.averageGoalsByPeriod[0]!);
    expect(finalPeriod).toBeGreaterThan(result.averageGoalsByPeriod[1]!);
  });

  it('shows the more generous energy curve as the more explosive comparison', () => {
    const controlled = simulatePrototypeBatch(120, CONTROLLED, 5000);
    const explosive = simulatePrototypeBatch(120, EXPLOSIVE, 5000);

    expect(explosive.averagePlayersDeployedPerTeam).toBeGreaterThanOrEqual(controlled.averagePlayersDeployedPerTeam);
    expect(explosive.averageCombinedGoals).toBeGreaterThanOrEqual(controlled.averageCombinedGoals);
  });
});
