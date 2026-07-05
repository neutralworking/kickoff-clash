/**
 * KC rebuild engine — v1 tactical cards (SYNERGY_MODEL_V1 §3).
 *
 * A tactical card is the ONLY posture-deviation mechanism: playing one (only
 * between batches) opens a timed posture window, after which posture reverts
 * to the manager's default. Duration is a card stat (rarity-scalable later);
 * playing costs energy from the match budget. Pure data — no card class.
 */

import type { Posture } from '../contexts';

export interface TacticalCardDef {
  id: string;
  name: string;
  posture: Posture;
  durationBatches: number;
  energyCost: number;
}

export const TACTICAL_CARDS: TacticalCardDef[] = [
  { id: 'all-out', name: 'All Out Attack', posture: 'possession', durationBatches: 1, energyCost: 1 },
  { id: 'shut-shop', name: 'Shut Up Shop', posture: 'deep-block', durationBatches: 1, energyCost: 1 },
  { id: 'push-up', name: 'Push Up', posture: 'possession', durationBatches: 2, energyCost: 2 },
  { id: 'park-it', name: 'Park It', posture: 'deep-block', durationBatches: 2, energyCost: 2 },
  { id: 'control-half', name: 'Control the Half', posture: 'possession', durationBatches: 3, energyCost: 3 },
  { id: 'weather-storm', name: 'Weather the Storm', posture: 'deep-block', durationBatches: 3, energyCost: 3 },
];

export function getTacticalCard(id: string): TacticalCardDef | undefined {
  return TACTICAL_CARDS.find((c) => c.id === id);
}
