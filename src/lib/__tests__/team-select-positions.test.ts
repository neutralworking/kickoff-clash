import { describe, expect, it } from 'vitest';
import { getFormation, positionFitsSlot } from '../formations';
import { competenceOf } from '../team-select';

describe('multi-position team selection', () => {
  const formation = getFormation('4-3-3');
  const fullBack = formation.slots.find((slot) => slot.type === 'FB')!;
  const centreBack = formation.slots.find((slot) => slot.type === 'CB')!;
  const striker = formation.slots.find((slot) => slot.type === 'CF')!;

  it('accepts a player when any authored natural position fits the slot', () => {
    expect(positionFitsSlot(['CD', 'WD'], fullBack)).toBe(true);
    expect(positionFitsSlot(['CD', 'WD'], centreBack)).toBe(true);
    expect(positionFitsSlot(['CD', 'WD'], striker)).toBe(false);
  });

  it('uses the best matching natural position for the fit badge', () => {
    expect(competenceOf(['CD', 'WD'], fullBack)).toBe('primary');
    expect(competenceOf(['AM', 'WF'], striker)).toBe('secondary');
    expect(competenceOf(['CD', 'WD'], striker)).toBe('incompetent');
  });
});
