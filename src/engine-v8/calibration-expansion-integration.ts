import { V8_EXPANSION_BATCH_01 } from './calibration-expansion-batch-01';
import { V8_EXPANSION_BATCH_02 } from './calibration-expansion-batch-02';
import { V8_EXPANSION_BATCH_03 } from './calibration-expansion-batch-03';
import { V8_EXPANSION_BATCH_04 } from './calibration-expansion-batch-04';
import type { V8Zone } from './core';

export type V8ExpansionIntegrationSquadKey = 'mix_alpha' | 'mix_beta' | 'mix_gamma';

export interface V8ExpansionIntegrationPlacement {
  cardId: string;
  zone: V8Zone;
}

export interface V8ExpansionIntegrationSquad {
  key: V8ExpansionIntegrationSquadKey;
  label: string;
  placements: readonly V8ExpansionIntegrationPlacement[];
}

const ALL_EXPANSION_CONTRACTS = [
  ...V8_EXPANSION_BATCH_01,
  ...V8_EXPANSION_BATCH_02,
  ...V8_EXPANSION_BATCH_03,
  ...V8_EXPANSION_BATCH_04,
] as const;

/**
 * Larger-roster integration cohort. Only contracts with authoritative playable values enter this
 * set; stats_required cards remain explicitly blocked rather than receiving calibration guesses.
 */
export const V8_EXPANSION_RUNTIME_READY_IDS = ALL_EXPANSION_CONTRACTS
  .filter((card) => card.implementationState === 'runtime_ready')
  .map((card) => card.id) as readonly string[];

export const V8_EXPANSION_BLOCKED_IDS = ALL_EXPANSION_CONTRACTS
  .filter((card) => card.implementationState !== 'runtime_ready')
  .map((card) => card.id) as readonly string[];

/**
 * Three mixed football XIs for integration only. They are deliberately not added to the six
 * reference balance squads: these fixtures test coexistence / ordering, not archetype win rate.
 * Across the three lists every runtime-ready expansion card appears at least once.
 */
export const V8_EXPANSION_INTEGRATION_SQUADS: Readonly<Record<V8ExpansionIntegrationSquadKey, V8ExpansionIntegrationSquad>> = {
  mix_alpha: {
    key: 'mix_alpha',
    label: 'Expansion Mix Alpha',
    placements: [
      { cardId: 'yashin', zone: 'DEF' },
      { cardId: 'ashley-cole', zone: 'DEF' },
      { cardId: 'cannavaro', zone: 'DEF' },
      { cardId: 'lucy-bronze', zone: 'DEF' },
      { cardId: 'davids', zone: 'MID' },
      { cardId: 'aitana-bonmati', zone: 'MID' },
      { cardId: 'cruyff', zone: 'MID' },
      { cardId: 'chris-waddle', zone: 'MID' },
      { cardId: 'maradona', zone: 'ATT' },
      { cardId: 'alan-shearer', zone: 'ATT' },
      { cardId: 'cavani', zone: 'ATT' },
    ],
  },
  mix_beta: {
    key: 'mix_beta',
    label: 'Expansion Mix Beta',
    placements: [
      { cardId: 'gordon-banks', zone: 'DEF' },
      { cardId: 'john-terry', zone: 'DEF' },
      { cardId: 'puyol', zone: 'DEF' },
      { cardId: 'nesta', zone: 'DEF' },
      { cardId: 'andy-robertson', zone: 'MID' },
      { cardId: 'tymoshchuk', zone: 'MID' },
      { cardId: 'pirlo', zone: 'MID' },
      { cardId: 'alexia-putellas', zone: 'MID' },
      { cardId: 'bergkamp', zone: 'ATT' },
      { cardId: 'ellen-white', zone: 'ATT' },
      { cardId: 'ali-daei', zone: 'ATT' },
    ],
  },
  mix_gamma: {
    key: 'mix_gamma',
    label: 'Expansion Mix Gamma',
    placements: [
      { cardId: 'yashin', zone: 'DEF' },
      { cardId: 'bobby-moore', zone: 'DEF' },
      { cardId: 'cannavaro', zone: 'DEF' },
      { cardId: 'bryan-robson', zone: 'MID' },
      { cardId: 'di-stefano', zone: 'MID' },
      { cardId: 'abedi-pele', zone: 'MID' },
      { cardId: 'cruyff', zone: 'MID' },
      { cardId: 'brian-laudrup', zone: 'ATT' },
      { cardId: 'berbatov', zone: 'ATT' },
      { cardId: 'dempsey', zone: 'ATT' },
      { cardId: 'alexandra-popp', zone: 'ATT' },
    ],
  },
} as const;

export const V8_EXPANSION_INTEGRATION_SQUAD_KEYS = Object.keys(
  V8_EXPANSION_INTEGRATION_SQUADS,
) as V8ExpansionIntegrationSquadKey[];

export function getV8ExpansionIntegrationSquad(key: V8ExpansionIntegrationSquadKey): V8ExpansionIntegrationSquad {
  return V8_EXPANSION_INTEGRATION_SQUADS[key];
}
