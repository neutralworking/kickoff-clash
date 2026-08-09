import { V8_EXPANSION_BATCH_01 } from './calibration-expansion-batch-01';
import { V8_EXPANSION_BATCH_02 } from './calibration-expansion-batch-02';
import { V8_EXPANSION_BATCH_03 } from './calibration-expansion-batch-03';
import { V8_EXPANSION_BATCH_04 } from './calibration-expansion-batch-04';
import { V8_EXPANSION_BATCH_05 } from './calibration-expansion-batch-05';
import { V8_EXPANSION_BATCH_06 } from './calibration-expansion-batch-06';
import type { V8Zone } from './core';

export type V8ExpansionIntegrationSquadKey = 'mix_alpha' | 'mix_beta' | 'mix_gamma' | 'mix_delta' | 'mix_epsilon';

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
  ...V8_EXPANSION_BATCH_05,
  ...V8_EXPANSION_BATCH_06,
] as const;

/** Larger-roster integration cohort, split by why a card is not yet playable. */
export const V8_EXPANSION_RUNTIME_READY_IDS = ALL_EXPANSION_CONTRACTS
  .filter((card) => card.implementationState === 'runtime_ready')
  .map((card) => card.id) as readonly string[];

export const V8_EXPANSION_STATS_BLOCKED_IDS = ALL_EXPANSION_CONTRACTS
  .filter((card) => card.implementationState === 'stats_required')
  .map((card) => card.id) as readonly string[];

export const V8_EXPANSION_PRIMITIVE_REQUIRED_IDS = ALL_EXPANSION_CONTRACTS
  .filter((card) => card.implementationState === 'primitive_required')
  .map((card) => card.id) as readonly string[];

/** Backwards-compatible alias: "blocked" still means missing authoritative stats, not design work. */
export const V8_EXPANSION_BLOCKED_IDS = V8_EXPANSION_STATS_BLOCKED_IDS;

/**
 * Mixed football XIs for integration only. They are deliberately not added to the six reference
 * balance squads: these fixtures test coexistence / ordering, not archetype win rate. As the
 * runtime-ready cohort grows, new XIs are added rather than overfilling zones or removing useful
 * movement space from established interaction fixtures.
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
      { cardId: 'caroline-graham-hansen', zone: 'DEF' },
      { cardId: 'bryan-robson', zone: 'MID' },
      { cardId: 'di-stefano', zone: 'MID' },
      { cardId: 'abedi-pele', zone: 'MID' },
      { cardId: 'carli-lloyd', zone: 'MID' },
      { cardId: 'brian-laudrup', zone: 'ATT' },
      { cardId: 'berbatov', zone: 'ATT' },
      { cardId: 'dempsey', zone: 'ATT' },
      { cardId: 'alexandra-popp', zone: 'ATT' },
    ],
  },
  mix_delta: {
    key: 'mix_delta',
    label: 'Expansion Mix Delta',
    placements: [
      { cardId: 'peter-shilton', zone: 'DEF' },
      { cardId: 'paul-mcgrath', zone: 'DEF' },
      { cardId: 'tony-adams', zone: 'DEF' },
      { cardId: 'roberto-carlos', zone: 'DEF' },
      { cardId: 'ronaldinho', zone: 'MID' },
      { cardId: 'paul-scholes', zone: 'MID' },
      { cardId: 'shunsuke-nakamura', zone: 'MID' },
      { cardId: 'carlos-valderrama', zone: 'MID' },
      { cardId: 'christian-eriksen', zone: 'ATT' },
      { cardId: 'ole-gunnar-solskjaer', zone: 'ATT' },
      { cardId: 'jari-litmanen', zone: 'ATT' },
    ],
  },
  mix_epsilon: {
    key: 'mix_epsilon',
    label: 'Expansion Mix Epsilon',
    placements: [
      { cardId: 'gordon-banks', zone: 'DEF' },
      { cardId: 'ashley-cole', zone: 'DEF' },
      { cardId: 'paul-mcgrath', zone: 'DEF' },
      { cardId: 'tony-adams', zone: 'DEF' },
      { cardId: 'keira-walsh', zone: 'MID' },
      { cardId: 'carli-lloyd', zone: 'MID' },
      { cardId: 'rory-delap', zone: 'MID' },
      { cardId: 'paul-scholes', zone: 'MID' },
      { cardId: 'caroline-graham-hansen', zone: 'ATT' },
      { cardId: 'ronaldinho', zone: 'ATT' },
      { cardId: 'alan-shearer', zone: 'ATT' },
    ],
  },
} as const;

export const V8_EXPANSION_INTEGRATION_SQUAD_KEYS = Object.keys(
  V8_EXPANSION_INTEGRATION_SQUADS,
) as V8ExpansionIntegrationSquadKey[];

export function getV8ExpansionIntegrationSquad(key: V8ExpansionIntegrationSquadKey): V8ExpansionIntegrationSquad {
  return V8_EXPANSION_INTEGRATION_SQUADS[key];
}
