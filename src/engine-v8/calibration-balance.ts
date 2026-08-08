import type { V8CalibrationPlayerCard } from './calibration-cards';

export const V8_CALIBRATION_ENERGY_CURVE = [2, 4, 6, 8] as const;

/**
 * Temporary V8 lab balance override.
 * Source tracker / reconciliation Costs remain untouched. Most calibration cards
 * play one Energy cheaper (minimum 1), while Wambach and Di María stay at their
 * printed Cost: broad/compact-core validation showed the 2-Energy versions were
 * disproportionately strong as shallow Cross splashes.
 */
export function calibrationPlayCost(card: Pick<V8CalibrationPlayerCard, 'id' | 'cost'>): number {
  if (card.id === 'wambach' || card.id === 'di-maria') return Math.max(1, card.cost);
  return Math.max(1, card.cost - 1);
}

export function calibrationEnergyForPeriod(period: number): number {
  return V8_CALIBRATION_ENERGY_CURVE[period - 1] ?? 0;
}
