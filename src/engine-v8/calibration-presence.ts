import type { V8Zone } from './core';

export const V8_ALL_ZONES: readonly V8Zone[] = ['DEF', 'MID', 'ATT'] as const;

/**
 * Rules-layer presence is deliberately separate from stat contribution.
 *
 * EVERYWHERE means Kanté may satisfy predicates such as "a friendly player is here" in any zone,
 * while his printed ATT/DEF continue to contribute only in the zone where the card is physically
 * deployed. Disabling the Action collapses presence back to the physical zone.
 */
export function calibrationPresenceZonesForCard(
  cardId: string,
  physicalZone: V8Zone,
  actionEnabled = true,
): readonly V8Zone[] {
  if (cardId === 'kante' && actionEnabled) return V8_ALL_ZONES;
  return [physicalZone];
}

export function calibrationCardCountsAsPresentInZone(
  cardId: string,
  physicalZone: V8Zone,
  queryZone: V8Zone,
  actionEnabled = true,
): boolean {
  return calibrationPresenceZonesForCard(cardId, physicalZone, actionEnabled).includes(queryZone);
}
