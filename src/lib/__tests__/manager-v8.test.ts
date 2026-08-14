import { describe, expect, it } from 'vitest';
import {
  calibrationRuntimeId,
  calibrationTeamTotals,
  createV8CalibrationMatch,
  currentCalibrationAttack,
  currentCalibrationDefence,
  seedCalibrationPlayer,
} from '@/engine-v8/calibration-runtime-base';
import { getV8CalibrationSquad } from '@/engine-v8/calibration-squads';
import { getFormation } from '../formations';
import { ALL_JOKERS } from '../jokers';
import { managerV8Profile, resolveManagerV8Action } from '../manager-v8';

const EXPECTED_ROSTER = [
  ['pomo', 'Sam Allardyce', 'Dean Prowse', 'Direct Play', ['4-4-2', '4-2-3-1', '5-4-1']],
  ['anti_football', 'Helenio Herrera', 'Vittorio Scudieri', 'Catenaccio', ['5-3-2', '5-4-1', '3-5-2']],
  ['tiki_taka', 'Pep Guardiola', 'Oriol Casals', 'Positional Play', ['4-3-3', '4-2-3-1', '3-4-3']],
  ['gegenpress', 'Jürgen Klopp', 'Falko Rehberg', 'Counter-Press', ['4-3-3', '4-2-3-1']],
  ['box_office', 'José Mourinho', 'Duarte Vilaça', 'Park the Bus', ['4-2-3-1', '4-3-3', '3-5-2']],
  ['tinkerman', 'Claudio Ranieri', 'Aurelio Benti', 'Rotation', ['4-4-2', '4-2-3-1']],
  ['cholismo', 'Diego Simeone', 'Emiliano Roldán', 'Low Block', ['4-4-2', '3-5-2', '5-3-2']],
  ['murderball', 'Marcelo Bielsa', 'Aníbal Cornejo', 'Murderball', ['3-4-3', '4-3-3', '3-5-2']],
  ['fergie_time', 'Alex Ferguson', 'Alistair Craddock', 'Fergie Time', ['4-4-2', '4-2-3-1']],
  ['entertainers', 'Kevin Keegan', 'Ronnie Fairweather', 'All-Out Attack', ['4-4-2', '4-3-3']],
  ['total_football', 'Rinus Michels', 'Maarten Roos', 'Total Football', ['3-4-3', '4-3-3', '3-5-2']],
  ['set_pieces_fc', 'Tony Pulis', 'Gordon Blackwood', 'Aerial Bombardment', ['5-4-1', '4-4-2', '5-3-2']],
  ['wheeler_dealer', 'Harry Redknapp', 'Les Hornby', 'Arm Around the Shoulder', ['4-4-2', '4-2-3-1']],
  ['joga_bonito', 'Telê Santana', 'Otávio Bragança', 'Joga Bonito', ['4-3-3', '4-2-3-1']],
] as const;

function managerState() {
  const deck = getV8CalibrationSquad('cross').playerIds;
  let state = createV8CalibrationMatch(deck, deck);
  state = seedCalibrationPlayer(state, 'home', 'bremner', 'MID');
  state = seedCalibrationPlayer(state, 'home', 'iniesta', 'MID');
  state = seedCalibrationPlayer(state, 'away', 'seedorf', 'MID');
  state = seedCalibrationPlayer(state, 'away', 'beckham', 'MID');
  return state;
}

describe('authored V8 managers', () => {
  it('mirrors the 14-row manager sheet roster and legal formation pools', () => {
    const roster = ALL_JOKERS.map((manager) => {
      const profile = managerV8Profile(manager);
      return [profile.id, profile.realManagerSource, profile.name, profile.actionName, profile.formations];
    });

    expect(roster).toEqual(EXPECTED_ROSTER);
    for (const manager of ALL_JOKERS) {
      const profile = managerV8Profile(manager);
      expect(profile.cost).toBe(3);
      expect(profile.formations.length).toBeGreaterThanOrEqual(1);
      expect(profile.formations.length).toBeLessThanOrEqual(3);
      expect(profile.formations.map((formation) => getFormation(formation).id)).toEqual(profile.formations);
      expect(profile.actionText).not.toMatch(/fitness|contest|adherence|commitment gate|starting.?xi cost/i);
    }
  });

  it('resolves every authored Action and records its printed name', () => {
    for (const manager of ALL_JOKERS) {
      const profile = managerV8Profile(manager);
      const result = resolveManagerV8Action(managerState(), profile, 'home', 'MID');

      expect(result.events.at(-1)?.text).toContain(profile.actionName.toUpperCase());
    }
  });

  it('makes Catenaccio strongest in DEF', () => {
    const profile = managerV8Profile(ALL_JOKERS.find((manager) => manager.id === 'anti_football')!);
    const deck = getV8CalibrationSquad('cross').playerIds;
    let state = createV8CalibrationMatch(deck, deck);
    state = seedCalibrationPlayer(state, 'home', 'bremner', 'DEF');
    state = seedCalibrationPlayer(state, 'home', 'iniesta', 'DEF');
    const before = calibrationTeamTotals(state, 'home');
    const result = resolveManagerV8Action(state, profile, 'home', 'DEF');

    expect(calibrationTeamTotals(result, 'home').defence - before.defence).toBe(6);
  });

  it('triples Fergie Time output in the final period', () => {
    const profile = managerV8Profile(ALL_JOKERS.find((manager) => manager.id === 'fergie_time')!);
    const state = managerState();
    const early = resolveManagerV8Action(state, profile, 'home', 'MID');
    const late = resolveManagerV8Action({ ...state, period: 4 }, profile, 'home', 'MID');
    const before = calibrationTeamTotals(state, 'home').attack;

    expect(calibrationTeamTotals(early, 'home').attack - before).toBe(2);
    expect(calibrationTeamTotals(late, 'home').attack - before).toBe(6);
  });

  it('applies Arm Around the Shoulder to the highest-Cost player here', () => {
    const profile = managerV8Profile(ALL_JOKERS.find((manager) => manager.id === 'wheeler_dealer')!);
    const state = managerState();
    const targetId = calibrationRuntimeId('home', 'iniesta');
    const otherId = calibrationRuntimeId('home', 'bremner');
    const targetBefore = [currentCalibrationAttack(state, targetId), currentCalibrationDefence(state, targetId)];
    const otherBefore = [currentCalibrationAttack(state, otherId), currentCalibrationDefence(state, otherId)];
    const result = resolveManagerV8Action(state, profile, 'home', 'MID');

    expect([currentCalibrationAttack(result, targetId), currentCalibrationDefence(result, targetId)])
      .toEqual(targetBefore.map((stat) => stat + 3));
    expect([currentCalibrationAttack(result, otherId), currentCalibrationDefence(result, otherId)])
      .toEqual(otherBefore);
  });
});
