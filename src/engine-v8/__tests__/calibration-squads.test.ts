import { describe, expect, it } from 'vitest';
import { V8_CALIBRATION_PLAYERS } from '../calibration-cards';
import {
  calibrationSquadCostProfile,
  getV8CalibrationSquad,
  V8_CALIBRATION_SQUAD_KEYS,
} from '../calibration-squads';

const EXPECTED_COSTS = {
  cross: { total: 28, costs: [2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4] },
  through_ball: { total: 30, costs: [1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4] },
  dribbling_penalty: { total: 27, costs: [1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3] },
  control_defence: { total: 27, costs: [1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4] },
  long_shot_set_piece: { total: 26, costs: [1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3] },
  balanced_midrange: { total: 28, costs: [2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4] },
} as const;

describe('V8 coherent calibration squads', () => {
  it('defines six legal 11-card XIs using only the 30-card calibration pool', () => {
    const pool = new Set(V8_CALIBRATION_PLAYERS.map((player) => player.id));
    expect(V8_CALIBRATION_SQUAD_KEYS).toHaveLength(6);

    for (const key of V8_CALIBRATION_SQUAD_KEYS) {
      const squad = getV8CalibrationSquad(key);
      expect(squad.playerIds).toHaveLength(11);
      expect(new Set(squad.playerIds).size).toBe(11);
      expect(squad.playerIds.every((id) => pool.has(id))).toBe(true);
    }
  });

  it('keeps the intended archetype cores intact', () => {
    expect(getV8CalibrationSquad('cross').playerIds).toEqual(expect.arrayContaining(['beckham', 'cafu', 'wambach', 'hegerberg', 'dzajic']));
    expect(getV8CalibrationSquad('through_ball').playerIds).toEqual(expect.arrayContaining(['valderrama', 'litmanen', 'morgan', 'shevchenko']));
    expect(getV8CalibrationSquad('dribbling_penalty').playerIds).toEqual(expect.arrayContaining(['duff', 'okocha', 'neymar', 'ronaldo', 'panenka']));
    expect(getV8CalibrationSquad('control_defence').playerIds).toEqual(expect.arrayContaining(['makelele', 'gentile', 'seedorf', 'baresi', 'schmeichel', 'bremner', 'iniesta', 'beckenbauer']));
    expect(getV8CalibrationSquad('long_shot_set_piece').playerIds).toEqual(expect.arrayContaining(['charlton', 'lloyd', 'eriksen', 'ramos', 'panenka']));
  });

  it('has playable compressed Cost curves under 2 / 4 / 6 / 8 Energy', () => {
    for (const key of V8_CALIBRATION_SQUAD_KEYS) {
      const profile = calibrationSquadCostProfile(key);
      const expected = EXPECTED_COSTS[key];
      expect(profile.totalCost).toBe(expected.total);
      expect(profile.effectiveCosts).toEqual(expected.costs);
      expect(profile.maxCardsByEnergy).toEqual({ 2: expect.any(Number), 4: expect.any(Number), 6: expect.any(Number), 8: expect.any(Number) });
      expect(profile.maxCardsByEnergy[2]).toBeGreaterThanOrEqual(1);
      expect(profile.maxCardsByEnergy[4]).toBeGreaterThanOrEqual(2);
      expect(profile.maxCardsByEnergy[6]).toBeGreaterThanOrEqual(3);
      expect(profile.maxCardsByEnergy[8]).toBeGreaterThanOrEqual(4);
    }
  });
});
