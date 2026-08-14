import { describe, expect, it } from 'vitest';
import { ALL_FORMATIONS, getFormation } from '../formations';
import { LINEUP_LAYOUTS, lineupPitchPosition } from '../lineup-layout';

function positionsFor(formationId: string) {
  const formation = getFormation(formationId);
  return formation.slots.map((slot, index) => lineupPitchPosition(formation, slot, index));
}

describe('team-selection formation layouts', () => {
  it('defines one bounded presentation coordinate for every supported slot', () => {
    expect(Object.keys(LINEUP_LAYOUTS).sort()).toEqual(ALL_FORMATIONS.map((formation) => formation.id).sort());

    for (const formation of ALL_FORMATIONS) {
      const positions = positionsFor(formation.id);
      expect(positions, formation.id).toHaveLength(formation.slots.length);
      for (const position of positions) {
        expect(position.x, `${formation.id} x`).toBeGreaterThanOrEqual(0);
        expect(position.x, `${formation.id} x`).toBeLessThanOrEqual(100);
        expect(position.y, `${formation.id} y`).toBeGreaterThanOrEqual(0);
        expect(position.y, `${formation.id} y`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('renders 4-4-2 as two level banks of four and a front two', () => {
    const positions = positionsFor('4-4-2');
    expect(new Set(positions.slice(1, 5).map(({ y }) => y))).toEqual(new Set([68]));
    expect(new Set(positions.slice(5, 9).map(({ y }) => y))).toEqual(new Set([34]));
    expect(new Set(positions.slice(9).map(({ y }) => y))).toEqual(new Set([0]));
  });

  it('keeps 4-2-3-1 in four distinct outfield bands', () => {
    const positions = positionsFor('4-2-3-1');
    expect(Math.min(...positions.slice(1, 5).map(({ y }) => y))).toBeGreaterThan(Math.max(...positions.slice(5, 7).map(({ y }) => y)));
    expect(Math.min(...positions.slice(5, 7).map(({ y }) => y))).toBeGreaterThan(Math.max(...positions.slice(7, 10).map(({ y }) => y)));
    expect(Math.min(...positions.slice(7, 10).map(({ y }) => y))).toBeGreaterThan(positions[10]!.y);
  });

  it('keeps 5-4-1 wide midfielders above its deeper central pair', () => {
    const formation = getFormation('5-4-1');
    const positions = positionsFor('5-4-1');
    const wideY = formation.slots.flatMap((slot, index) => slot.type === 'WM' ? [positions[index]!.y] : []);
    const centralY = formation.slots.flatMap((slot, index) => slot.type === 'CM' ? [positions[index]!.y] : []);
    expect(Math.max(...wideY)).toBeLessThan(Math.min(...centralY));
  });

  it('preserves each formation’s intended number of outfield units', () => {
    const unitCounts: Record<string, number> = {
      '4-3-3': 5,
      '4-4-2': 3,
      '3-5-2': 3,
      '4-2-3-1': 4,
      '3-4-3': 3,
      '5-3-2': 4,
      '5-4-1': 5,
      '4-1-2-1-2': 5,
    };

    for (const formation of ALL_FORMATIONS) {
      const outfieldYs = positionsFor(formation.id).slice(1).map(({ y }) => y);
      const units = outfieldYs.reduce<number[]>((groups, y) => {
        if (!groups.some((groupY) => Math.abs(groupY - y) <= 4)) groups.push(y);
        return groups;
      }, []);
      expect(units, formation.id).toHaveLength(unitCounts[formation.id]);
    }
  });
});
