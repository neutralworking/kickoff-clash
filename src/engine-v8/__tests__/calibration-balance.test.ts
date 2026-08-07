import { describe, expect, it } from 'vitest';
import { calibrationEnergyForPeriod, calibrationPlayCost, V8_CALIBRATION_ENERGY_CURVE } from '../calibration-balance';

describe('V8 calibration balance overrides', () => {
  it('uses the 2 / 4 / 6 / 8 Energy curve', () => {
    expect(V8_CALIBRATION_ENERGY_CURVE).toEqual([2, 4, 6, 8]);
    expect([1, 2, 3, 4].map(calibrationEnergyForPeriod)).toEqual([2, 4, 6, 8]);
  });

  it('compresses player Costs by one without going below 1', () => {
    expect(calibrationPlayCost({ cost: 5 })).toBe(4);
    expect(calibrationPlayCost({ cost: 3 })).toBe(2);
    expect(calibrationPlayCost({ cost: 2 })).toBe(1);
    expect(calibrationPlayCost({ cost: 1 })).toBe(1);
  });
});
