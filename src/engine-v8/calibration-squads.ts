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
 * Player values still come from the 30-card calibration pool. Most cards use the
 * lab-only source Cost - 1 compression (minimum 1); Wambach and Di María remain
 * at printed Cost after compact-core testing showed their compressed versions
 * were too efficient as shallow Cross splashes.
 *
 * The Cross reference is intentionally a three-card specialist core surrounded
 * by broadly useful footballers. The broader deck-validation pass showed this is
 * healthier than protecting the old six-specialist Cross XI.
 */
export const V8_CALIBRATION_SQUADS: Readonly<Record<V8CalibrationSquadKey, V8CalibrationSquad>> = {
  cross: {
    key: 'cross',
    label: 'CROSS',
    shortLabel: 'Cross',
    identity: 'Use a compact Beckham / Wambach / Di María Cross core inside a strong balanced structure.',
    playerIds: [
      'beckham',
      'wambach',
      'di-maria',
      'schmeichel',
      'gentile',
      'seedorf',
      'iniesta',
      'beckenbauer',
      'makelele',
      'bremner',
      'sinclair',
    ],
  },
  through_ball: {
    key: 'through_ball',
    label: 'THROUGH BALL',
    shortLabel: 'Through Ball',
    identity: 'Establish an ATT runner, build MID creation, then convert banked Through Balls.',
    playerIds: [
      'valderrama',
      'litmanen',
      'morgan',
      'shevchenko',
      'park',
      'makelele',
      'schmeichel',
      'seedorf',
      'bremner',
      'gentile',
      'ramos',
    ],
  },
  dribbling_penalty: {
    key: 'dribbling_penalty',
    label: 'DRIBBLING / PENALTY',
    shortLabel: 'Dribble',
    identity: 'Open the defensive line with dribbling, generate a Penalty, then amplify it in ATT.',
    playerIds: [
      'duff',
      'garrincha',
      'neymar',
      'panenka',
      'schmeichel',
      'gentile',
      'makelele',
      'seedorf',
      'bremner',
      'baresi',
      'beckenbauer',
    ],
  },
  control_defence: {
    key: 'control_defence',
    label: 'CONTROL / DEFENCE',
    shortLabel: 'Control',
    identity: 'Suppress and absorb pressure, then use one elite outlet rather than a full attacking line.',
    playerIds: [
      'makelele',
      'gentile',
      'seedorf',
      'baresi',
      'schmeichel',
      'bremner',
      'iniesta',
      'beckenbauer',
      'cafu',
      'lloyd',
      'sinclair',
    ],
  },
  long_shot_set_piece: {
    key: 'long_shot_set_piece',
    label: 'LONG SHOT / SET PIECE',
    shortLabel: 'Set Piece',
    identity: 'Build the MID shooting platform, keep enough structure behind it and send Ramos forward late for the Corner payoff.',
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
    identity: 'Reference XI with stable defence, flexible MID play and several independent scoring routes.',
    playerIds: [
      'schmeichel',
      'beckenbauer',
      'gentile',
      'ramos',
      'seedorf',
      'park',
      'okocha',
      'beckham',
      'ronaldo',
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
