import { describe, expect, it } from 'vitest';
import { V8_CALIBRATION_PLAYERS } from '../calibration-cards';
import {
  calibrationSquadCostProfile,
  getV8CalibrationSquad,
  V8_CALIBRATION_SQUAD_KEYS,
} from '../calibration-squads';

const EXPECTED_TOTAL_COST = {
  cross: 28,
  through_ball: 27,
  dribbling_penalty: 27,
  control_defence: 27,
  long_shot_set_piece: 26,
  balanced_midrange: 27,
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

  it('keeps a focused, playable core for each named archetype', () => {
    expect(getV8CalibrationSquad('cross').playerIds).toEqual(expect.arrayContaining(['beckham', 'wambach', 'di-maria']));
    expect(getV8CalibrationSquad('cross').playerIds).not.toEqual(expect.arrayContaining(['hegerberg', 'cafu', 'dzajic']));
    expect(getV8CalibrationSquad('through_ball').playerIds).toEqual(expect.arrayContaining(['valderrama', 'litmanen', 'morgan', 'shevchenko']));
    expect(getV8CalibrationSquad('dribbling_penalty').playerIds).toEqual(expect.arrayContaining(['duff', 'neymar', 'panenka']));
    expect(getV8CalibrationSquad('dribbling_penalty').playerIds).not.toContain('garrincha');
    expect(getV8CalibrationSquad('control_defence').playerIds).toEqual(expect.arrayContaining(['makelele', 'gentile', 'seedorf', 'baresi', 'schmeichel', 'bremner', 'iniesta', 'beckenbauer']));
    expect(getV8CalibrationSquad('long_shot_set_piece').playerIds).toEqual(expect.arrayContaining(['charlton', 'lloyd', 'eriksen', 'ramos']));
    expect(getV8CalibrationSquad('balanced_midrange').playerIds).toEqual(expect.arrayContaining(['schmeichel', 'beckenbauer', 'okocha', 'beckham', 'ronaldo', 'sinclair', 'charlton']));
  });

  it('keeps reference XI effective Costs within two Energy of each other', () => {
    const totals = V8_CALIBRATION_SQUAD_KEYS.map((key) => calibrationSquadCostProfile(key).totalCost);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(2);
  });

  it('has playable Cost curves under 2 / 4 / 6 / 8 Energy', () => {
    for (const key of V8_CALIBRATION_SQUAD_KEYS) {
      const profile = calibrationSquadCostProfile(key);
      expect(profile.totalCost).toBe(EXPECTED_TOTAL_COST[key]);
      expect(profile.effectiveCosts).toHaveLength(11);
      expect(profile.effectiveCosts.every((cost) => cost >= 1)).toBe(true);
      expect(profile.maxCardsByEnergy).toEqual({ 2: expect.any(Number), 4: expect.any(Number), 6: expect.any(Number), 8: expect.any(Number) });
      expect(profile.maxCardsByEnergy[2]).toBeGreaterThanOrEqual(1);
      expect(profile.maxCardsByEnergy[4]).toBeGreaterThanOrEqual(2);
      expect(profile.maxCardsByEnergy[6]).toBeGreaterThanOrEqual(3);
      expect(profile.maxCardsByEnergy[8]).toBeGreaterThanOrEqual(4);
    }
  });
});