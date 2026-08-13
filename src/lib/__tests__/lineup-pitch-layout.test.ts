import { describe, expect, it } from 'vitest';
import { lineupPitchY } from '../../components/lineup';
import { getFormation } from '../formations';

describe('team-selection pitch lines', () => {
  it('keeps the 4-2-3-1 pivots on their own line', () => {
    const formation = getFormation('4-2-3-1');
    const outfieldLines = new Set(
      formation.slots
        .filter((slot) => slot.type !== 'GK')
        .map((slot) => lineupPitchY(slot.y)),
    );

    expect(outfieldLines.size).toBe(4);
    expect(lineupPitchY(78)).toBeGreaterThan(lineupPitchY(62));
    expect(lineupPitchY(62)).toBeGreaterThan(lineupPitchY(38));
    expect(lineupPitchY(38)).toBeGreaterThan(lineupPitchY(12));
  });

  it('pushes the 5-4-1 wide midfielders above its deeper central pair', () => {
    const formation = getFormation('5-4-1');
    const wideMidfielders = formation.slots.filter((slot) => slot.type === 'WM');
    const centralMidfielders = formation.slots.filter((slot) => slot.type === 'CM');

    expect(new Set(wideMidfielders.map((slot) => lineupPitchY(slot.y)))).toEqual(new Set([34]));
    expect(new Set(centralMidfielders.map((slot) => lineupPitchY(slot.y)))).toEqual(new Set([57]));
    expect(lineupPitchY(wideMidfielders[0]!.y)).toBeLessThan(lineupPitchY(centralMidfielders[0]!.y));
  });
});
