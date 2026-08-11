export * from './calibration-squads-base';

import { calibrationPlayCost, V8_CALIBRATION_ENERGY_CURVE } from './calibration-balance';
import { getV8CalibrationPlayer } from './calibration-cards';
import {
  V8_CALIBRATION_SQUADS as BASE_CALIBRATION_SQUADS,
  type V8CalibrationCostProfile,
  type V8CalibrationSquad,
  type V8CalibrationSquadKey,
} from './calibration-squads-base';

/**
 * Compact Dribbling / Penalty reference candidate.
 *
 * Duff is the independent dribbler, Neymar is the Penalty creator and Panenka is
 * the optional conversion payoff. The remaining eight slots are useful neutral
 * football cards rather than extra Penalty dependencies.
 */
const DRIBBLING_PENALTY_COMPACT: V8CalibrationSquad = {
  key: 'dribbling_penalty',
  label: 'DRIBBLING / PENALTY',
  shortLabel: 'Dribble',
  identity: 'Use Duff to attack the line, Neymar to win a Penalty and Panenka to amplify the conversion without requiring an all-in dribbling XI.',
  playerIds: [
    'duff',
    'neymar',
    'panenka',
    'schmeichel',
    'gentile',
    'seedorf',
    'iniesta',
    'beckenbauer',
    'makelele',
    'bremner',
    'sinclair',
  ],
};

export const V8_CALIBRATION_SQUADS: Readonly<Record<V8CalibrationSquadKey, V8CalibrationSquad>> = {
  ...BASE_CALIBRATION_SQUADS,
  dribbling_penalty: DRIBBLING_PENALTY_COMPACT,
};

export const V8_CALIBRATION_SQUAD_KEYS = Object.keys(V8_CALIBRATION_SQUADS) as V8CalibrationSquadKey[];

export function getV8CalibrationSquad(key: V8CalibrationSquadKey): V8CalibrationSquad {
  return V8_CALIBRATION_SQUADS[key];
}

export function calibrationSquadCostProfile(key: V8CalibrationSquadKey): V8CalibrationCostProfile {
  const squad = getV8CalibrationSquad(key);
  const effectiveCosts = squad.playerIds
    .map((id) => calibrationPlayCost(getV8CalibrationPlayer(id)))
    .sort((a, b) => a - b);
  const totalCost = effectiveCosts.reduce((sum, cost) => sum + cost, 0);
  const countByCost: Record<number, number> = {};
  for (const cost of effectiveCosts) countByCost[cost] = (countByCost[cost] ?? 0) + 1;

  const maxCardsByEnergy: Record<number, number> = {};
  for (const energy of V8_CALIBRATION_ENERGY_CURVE) {
    let spent = 0;
    let cards = 0;
    for (const cost of effectiveCosts) {
      if (spent + cost > energy) break;
      spent += cost;
      cards += 1;
    }
    maxCardsByEnergy[energy] = cards;
  }

  return {
    effectiveCosts,
    totalCost,
    averageCost: totalCost / effectiveCosts.length,
    countByCost,
    maxCardsByEnergy,
  };
}
