import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  calibrationTeamTotals,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  moveCalibrationPlayer,
  playCalibrationTactical,
  revealCalibrationPlayer,
  type V8CalibrationSide,
  type V8CalibrationState,
} from '../index';
import {
  V8_EXPANSION_BLOCKED_IDS,
  V8_EXPANSION_INTEGRATION_SQUAD_KEYS,
  V8_EXPANSION_INTEGRATION_SQUADS,
  V8_EXPANSION_PRIMITIVE_REQUIRED_IDS,
  V8_EXPANSION_RUNTIME_READY_IDS,
  V8_EXPANSION_STATS_BLOCKED_IDS,
  type V8ExpansionIntegrationSquadKey,
} from '../calibration-expansion-integration';

function deployMixedMatch(
  homeKey: V8ExpansionIntegrationSquadKey,
  awayKey: V8ExpansionIntegrationSquadKey,
): V8CalibrationState {
  let state = createV8CalibrationState({ homeEnergy: 50, awayEnergy: 50 });
  const home = V8_EXPANSION_INTEGRATION_SQUADS[homeKey].placements;
  const away = V8_EXPANSION_INTEGRATION_SQUADS[awayKey].placements;
  const count = Math.max(home.length, away.length);

  for (let index = 0; index < count; index += 1) {
    const homePlay = home[index];
    if (homePlay) state = revealCalibrationPlayer(state, 'home', homePlay.cardId, homePlay.zone);
    const awayPlay = away[index];
    if (awayPlay) state = revealCalibrationPlayer(state, 'away', awayPlay.cardId, awayPlay.zone);
  }
  return state;
}

function zoneCount(state: V8CalibrationState, side: V8CalibrationSide): number {
  return (['DEF', 'MID', 'ATT'] as const)
    .reduce((sum, zone) => sum + calibrationPlayersInZone(state, side, zone).length, 0);
}

describe('V8 larger-roster mixed expansion integration', () => {
  it('has 42 runtime-ready cards, two source-stat blockers and four explicit Batch 06 primitive/design blockers', () => {
    expect(V8_EXPANSION_RUNTIME_READY_IDS).toHaveLength(42);
    expect([...V8_EXPANSION_STATS_BLOCKED_IDS].sort()).toEqual(['kante', 'ozil']);
    expect(V8_EXPANSION_BLOCKED_IDS).toEqual(V8_EXPANSION_STATS_BLOCKED_IDS);
    expect([...V8_EXPANSION_PRIMITIVE_REQUIRED_IDS].sort()).toEqual([
      'arjen-robben',
      'caroline-graham-hansen',
      'keira-walsh',
      'rory-delap',
    ]);

    const covered = new Set(
      V8_EXPANSION_INTEGRATION_SQUAD_KEYS
        .flatMap((key) => V8_EXPANSION_INTEGRATION_SQUADS[key].placements.map((placement) => placement.cardId)),
    );
    expect([...V8_EXPANSION_RUNTIME_READY_IDS].every((cardId) => covered.has(cardId))).toBe(true);
    expect([...V8_EXPANSION_STATS_BLOCKED_IDS].some((cardId) => covered.has(cardId))).toBe(false);
    expect([...V8_EXPANSION_PRIMITIVE_REQUIRED_IDS].some((cardId) => covered.has(cardId))).toBe(false);
  });

  it('builds four coherent 11-player integration XIs without changing the six balance squads', () => {
    expect(V8_EXPANSION_INTEGRATION_SQUAD_KEYS).toHaveLength(4);
    for (const key of V8_EXPANSION_INTEGRATION_SQUAD_KEYS) {
      const squad = V8_EXPANSION_INTEGRATION_SQUADS[key];
      expect(squad.placements).toHaveLength(11);
      expect(new Set(squad.placements.map((placement) => placement.cardId)).size).toBe(11);
      expect(squad.placements.some((placement) => getV8CalibrationPlayer(placement.cardId).position === 'GK')).toBe(true);

      for (const zone of ['DEF', 'MID', 'ATT'] as const) {
        expect(squad.placements.filter((placement) => placement.zone === zone).length).toBeLessThanOrEqual(4);
      }
      for (const placement of squad.placements) expect(() => getV8CalibrationPlayer(placement.cardId)).not.toThrow();
    }
  });

  it('deploys full mixed XIs through the real high-level reveal / ongoing-effect path', () => {
    for (const [homeKey, awayKey] of [
      ['mix_alpha', 'mix_beta'],
      ['mix_delta', 'mix_gamma'],
    ] as const) {
      const state = deployMixedMatch(homeKey, awayKey);
      expect(zoneCount(state, 'home')).toBe(11);
      expect(zoneCount(state, 'away')).toBe(11);

      const home = calibrationTeamTotals(state, 'home');
      const away = calibrationTeamTotals(state, 'away');
      for (const value of [home.attack, home.defence, away.attack, away.defence]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('composes Waddle + Shearer power with the opposing Banks cancellation layer', () => {
    let state = deployMixedMatch('mix_alpha', 'mix_beta');
    const puyolId = calibrationRuntimeId('away', 'puyol');
    const banksId = calibrationRuntimeId('away', 'gordon-banks');
    const cavaniId = calibrationRuntimeId('home', 'cavani');

    state.matchCounters[`puyol-body-on-the-line:${puyolId}`] = 1;
    state = moveCalibrationPlayer(state, 'home', 'chris-waddle', 'ATT');

    const chance = addCalibrationTacticalToHand(state, 'home', 'through_ball', { costModifier: 2 });
    state = playCalibrationTactical(chance.state, 'home', chance.card.id, 'ATT');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === chance.card.id);

    expect(resolution?.type).toBe('cross');
    expect(resolution?.cost).toBe(3);
    expect(resolution?.cancelled).toBe(true);
    expect(resolution?.attack).toBe(0);
    expect(state.matchCounters[`banks-impossible-save:${banksId}`]).toBe(1);
    expect(state.periodCounters[`cavani-get-across-him:${cavaniId}`] ?? 0).toBe(0);
  });

  it('composes Ellen White transformation, Bergkamp enhancement and Yashin suppression', () => {
    let state = deployMixedMatch('mix_beta', 'mix_alpha');
    const chance = addCalibrationTacticalToHand(state, 'home', 'through_ball');
    state = playCalibrationTactical(chance.state, 'home', chance.card.id, 'ATT');
    const resolution = state.tacticalResolutions.find((item) => item.cardId === chance.card.id);

    expect(resolution?.type).toBe('long_shot');
    expect(resolution?.cancelled).toBe(false);
    expect(resolution?.attack).toBe(5);
    expect(state.events.some((event) => event.text.includes('FIRST-TIME LOB'))).toBe(true);
    expect(state.events.some((event) => event.text.includes('BLACK SPIDER reduces'))).toBe(true);
  });

  it('carries CAPTAIN MARVEL through a real mixed-XI period end with banked score context', () => {
    let state = deployMixedMatch('mix_gamma', 'mix_beta');
    const robsonId = calibrationRuntimeId('home', 'bryan-robson');
    const printed = getV8CalibrationPlayer('bryan-robson');

    state = endV8CalibrationPeriod(state, { home: 0, away: 1 });

    expect(currentCalibrationAttack(state, robsonId)).toBe(printed.printedAttack + 2);
    expect(currentCalibrationDefence(state, robsonId)).toBe(printed.printedDefence + 2);
    expect(state.events.some((event) => event.text.includes('CAPTAIN MARVEL'))).toBe(true);
  });
});
