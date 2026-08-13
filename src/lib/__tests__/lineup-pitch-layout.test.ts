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
});
