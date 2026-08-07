import type { V8CalibrationPlayerCard } from './calibration-cards';

export const V8_CALIBRATION_ENERGY_CURVE = [2, 4, 6, 8] as const;

/**
 * Temporary V8 lab balance override.
 * Source tracker / reconciliation Costs remain untouched; the calibration lab
 * plays every player one Energy cheaper, to a minimum of 1.
 */
export function calibrationPlayCost(card: Pick<V8CalibrationPlayerCard, 'cost'>): number {
  return Math.max(1, card.cost - 1);
}

export function calibrationEnergyForPeriod(period: number): number {
  return V8_CALIBRATION_ENERGY_CURVE[period - 1] ?? 0;
}
