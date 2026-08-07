import { getV8CalibrationPlayer } from './calibration-cards';
import { calibrationPlayCost, V8_CALIBRATION_ENERGY_CURVE } from './calibration-balance';

export type V8CalibrationSquadKey =
  | 'cross'
  | 'through_ball'
  | 'dribbling_penalty'
  | 'control_defence'
  | 'long_shot_set_piece'
  | 'balanced_midrange';

export interface V8CalibrationSquad {
  key: V8CalibrationSquadKey;
  label: string;
  shortLabel: string;
  identity: string;
  playerIds: readonly string[];
}

export interface V8CalibrationCostProfile {
  effectiveCosts: readonly number[];
  totalCost: number;
  averageCost: number;
  countByCost: Readonly<Record<number, number>>;
  maxCardsByEnergy: Readonly<Record<number, number>>;
}

/**
 * Coherent 11-card calibration squads for V8 balance testing.
 *
 * These are deliberately test archetypes, not roster/source-of-truth changes.
 * Player values still come from the 30-card calibration pool and the lab-only
 * Cost compression remains source Cost - 1, minimum 1.
 */
export const V8_CALIBRATION_SQUADS: Readonly<Record<V8CalibrationSquadKey, V8CalibrationSquad>> = {
  cross: {
    key: 'cross',
    label: 'CROSS',
    shortLabel: 'Cross',
    identity: 'Create Crosses repeatedly, then commit specialist finishers in ATT.',
    playerIds: [
      'beckham',
      'cafu',
      'wambach',
      'hegerberg',
      'dzajic',
      'di-maria',
      'schmeichel',
      'baresi',
      'makelele',
      'seedorf',
      'park',
    ],
  },
  through_ball: {
    key: 'through_ball',
    label: 'THROUGH BALL',
    shortLabel: 'Through Ball',
    identity: 'Build MID, create Through Balls, then convert them with ATT runners.',
    playerIds: [
      'valderrama',
      'litmanen',
      'morgan',
      'shevchenko',
      'iniesta',
      'park',
      'makelele',
      'baresi',
      'schmeichel',
      'seedorf',
      'bremner',
    ],
  },
  dribbling_penalty: {
    key: 'dribbling_penalty',
    label: 'DRIBBLING / PENALTY',
    shortLabel: 'Dribble',
    identity: 'Reduce confronting DEF, turn the opening into Penalties, then amplify the payoff.',
    playerIds: [
      'duff',
      'garrincha',
      'okocha',
      'neymar',
      'ronaldo',
      'panenka',
      'schmeichel',
      'gentile',
      'makelele',
      'seedorf',
      'bremner',
    ],
  },
  control_defence: {
    key: 'control_defence',
    label: 'CONTROL / DEFENCE',
    shortLabel: 'Control',
    identity: 'Suppress, protect and absorb pressure while retaining enough flexible ATT to win.',
    playerIds: [
      'makelele',
      'gentile',
      'seedorf',
      'baresi',
      'schmeichel',
      'bremner',
      'iniesta',
      'beckenbauer',
      'di-maria',
      'wambach',
      'sinclair',
    ],
  },
  long_shot_set_piece: {
    key: 'long_shot_set_piece',
    label: 'LONG SHOT / SET PIECE',
    shortLabel: 'Set Piece',
    identity: 'Generate Long Shots and Corners around a stable defensive and midfield platform.',
    playerIds: [
      'charlton',
      'lloyd',
      'eriksen',
      'ramos',
      'panenka',
      'schmeichel',
      'beckenbauer',
      'makelele',
      'park',
      'seedorf',
      'sinclair',
    ],
  },
  balanced_midrange: {
    key: 'balanced_midrange',
    label: 'BALANCED / MIDRANGE',
    shortLabel: 'Balanced',
    identity: 'Baseline XI with defence, MID presence, disruption, flexible scoring and one modest creation package.',
    playerIds: [
      'schmeichel',
      'beckenbauer',
      'gentile',
      'makelele',
      'seedorf',
      'park',
      'iniesta',
      'beckham',
      'wambach',
      'sinclair',
      'charlton',
    ],
  },
} as const;

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
