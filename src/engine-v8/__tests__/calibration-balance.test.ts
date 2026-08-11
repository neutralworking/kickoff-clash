import { describe, expect, it } from 'vitest';
import { calibrationEnergyForPeriod, calibrationPlayCost, V8_CALIBRATION_ENERGY_CURVE } from '../calibration-balance';

describe('V8 calibration balance overrides', () => {
  it('uses the 2 / 4 / 6 / 8 Energy curve', () => {
    expect(V8_CALIBRATION_ENERGY_CURVE).toEqual([2, 4, 6, 8]);
    expect([1, 2, 3, 4].map(calibrationEnergyForPeriod)).toEqual([2, 4, 6, 8]);
  });

  it('compresses most player Costs by one without going below 1', () => {
    expect(calibrationPlayCost({ id: 'hegerberg', cost: 5 })).toBe(4);
    expect(calibrationPlayCost({ id: 'beckham', cost: 3 })).toBe(2);
    expect(calibrationPlayCost({ id: 'panenka', cost: 2 })).toBe(1);
    expect(calibrationPlayCost({ id: 'example', cost: 1 })).toBe(1);
  });

  it('keeps Wambach and Di Maria at printed Cost after compact-core validation', () => {
    expect(calibrationPlayCost({ id: 'wambach', cost: 3 })).toBe(3);
    expect(calibrationPlayCost({ id: 'di-maria', cost: 3 })).toBe(3);
  });
});
