import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  calibrationContributionRules,
  calibrationEffectiveStats,
  calibrationRuntimeId,
  calibrationZoneTotals,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  moveCalibrationPlayer,
  playCalibrationTactical,
  refreshCalibrationScoreState,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
} from '../index';

describe('V8 expansion Batch 02 runtime primitives', () => {
  it('STEP IN dynamically binds −3 ATT to the strongest opposing midfielder in MID', () => {
    let state = createV8CalibrationState();
    state = revealCalibrationPlayer(state, 'home', 'tymoshchuk', 'MID');
    state = revealCalibrationPlayer(state, 'away', 'seedorf', 'MID');
    const seedorfId = calibrationRuntimeId('away', 'seedorf');
    expect(currentCalibrationAttack(state, seedorfId)).toBe(getV8CalibrationPlayer('seedorf').printedAttack - 3);

    state = revealCalibrationPlayer(state, 'away', 'di-stefano', 'MID');
    const diStefanoId = calibrationRuntimeId('away', 'di-stefano');
    expect(currentCalibrationAttack(state, seedorfId)).toBe(getV8CalibrationPlayer('seedorf').printedAttack);
    expect(currentCalibrationAttack(state, diStefanoId)).toBe(getV8CalibrationPlayer('di-stefano').printedAttack - 2);
  });

  it('READ THE RUN mirrors the first real central-attacker ATT gain each period', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'bobby-moore', 'DEF');
    const mooreId = calibrationRuntimeId('home', 'bobby-moore');

    state = revealCalibrationPlayer(state, 'away', 'di-stefano', 'ATT');
    expect(currentCalibrationDefence(state, mooreId)).toBe(getV8CalibrationPlayer('bobby-moore').printedDefence + 1);

    state = refreshCalibrationScoreState(state, { home: 1, away: 0 });
    expect(currentCalibrationDefence(state, mooreId)).toBe(getV8CalibrationPlayer('bobby-moore').printedDefence + 1);

    state = endV8CalibrationPeriod(state);
    expect(currentCalibrationDefence(state, mooreId)).toBe(getV8CalibrationPlayer('bobby-moore').printedDefence);

    state = refreshCalibrationScoreState(state, { home: 2, away: 0 });
    expect(currentCalibrationDefence(state, mooreId)).toBe(getV8CalibrationPlayer('bobby-moore').printedDefence);

    state = refreshCalibrationScoreState(state, { home: 2, away: 1 });
    expect(currentCalibrationDefence(state, mooreId)).toBe(getV8CalibrationPlayer('bobby-moore').printedDefence);

    state = refreshCalibrationScoreState(state, { home: 3, away: 1 });
    expect(currentCalibrationDefence(state, mooreId)).toBe(getV8CalibrationPlayer('bobby-moore').printedDefence);
  });

  it('READ THE RUN ignores ATT restored only because SHOW HIM OUTSIDE retargeted', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'bobby-moore', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'ashley-cole', 'DEF');
    state = revealCalibrationPlayer(state, 'away', 'dempsey', 'ATT');
    const mooreId = calibrationRuntimeId('home', 'bobby-moore');
    const dempseyId = calibrationRuntimeId('away', 'dempsey');

    expect(currentCalibrationAttack(state, dempseyId)).toBe(getV8CalibrationPlayer('dempsey').printedAttack - 5);
    state = revealCalibrationPlayer(state, 'away', 'ronaldo', 'ATT');
    expect(currentCalibrationAttack(state, dempseyId)).toBe(getV8CalibrationPlayer('dempsey').printedAttack);
    expect(currentCalibrationDefence(state, mooreId)).toBe(getV8CalibrationPlayer('bobby-moore').printedDefence);
  });

  it('RECOVERY RUN mirrors JINKING RUN when a wide attacker enters Robertson confrontation', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'andy-robertson', 'DEF');
    state = seedCalibrationPlayer(state, 'away', 'abedi-pele', 'MID');
    const robertsonId = calibrationRuntimeId('home', 'andy-robertson');

    state = moveCalibrationPlayer(state, 'away', 'abedi-pele', 'ATT');
    expect(currentCalibrationDefence(state, robertsonId)).toBe(getV8CalibrationPlayer('andy-robertson').printedDefence + 4);

    state = endV8CalibrationPeriod(state);
    expect(currentCalibrationDefence(state, robertsonId)).toBe(getV8CalibrationPlayer('andy-robertson').printedDefence);
  });

  it('TIMED SLIDE cancels only the first otherwise-resolving Through Ball each period', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'nesta', 'DEF');

    const first = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(first.state, 'away', first.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === first.card.id)?.cancelled).toBe(true);

    const second = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(second.state, 'away', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.cancelled).toBe(false);

    state = endV8CalibrationPeriod(state);
    state.teams.away.energy = 20;
    const third = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(third.state, 'away', third.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === third.card.id)?.cancelled).toBe(true);
  });

  it('TIMED SLIDE does not consume itself on an uncancellable Through Ball', () => {
    let state = createV8CalibrationState({ awayEnergy: 20 });
    state = seedCalibrationPlayer(state, 'home', 'nesta', 'DEF');
    const protectedBall = addCalibrationTacticalToHand(state, 'away', 'through_ball', { cancellable: false });
    state = playCalibrationTactical(protectedBall.state, 'away', protectedBall.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === protectedBall.card.id)?.cancelled).toBe(false);

    const ordinary = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = playCalibrationTactical(ordinary.state, 'away', ordinary.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === ordinary.card.id)?.cancelled).toBe(true);
  });

  it('GLIDING RUN moves once per period and protects the first Chance in its destination', () => {
    let state = createV8CalibrationState({ homeEnergy: 20 });
    state = revealCalibrationPlayer(state, 'home', 'brian-laudrup', 'MID');
    state = moveCalibrationPlayer(state, 'home', 'brian-laudrup', 'ATT');
    expect(state.players[calibrationRuntimeId('home', 'brian-laudrup')]?.zone).toBe('ATT');
    expect(() => moveCalibrationPlayer(state, 'home', 'brian-laudrup', 'MID')).toThrow('already moved this period');

    const first = addCalibrationTacticalToHand(state, 'home', 'through_ball');
    state = playCalibrationTactical(first.state, 'home', first.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === first.card.id)?.uncancellable).toBe(true);

    const second = addCalibrationTacticalToHand(state, 'home', 'through_ball');
    state = playCalibrationTactical(second.state, 'home', second.card.id, 'ATT');
    expect(state.tacticalResolutions.find((item) => item.cardId === second.card.id)?.uncancellable).toBe(false);

    state = endV8CalibrationPeriod(state);
    expect(() => moveCalibrationPlayer(state, 'home', 'brian-laudrup', 'MID')).not.toThrow();
  });

  it('PITBULL follows the first opposing midfielder movement and gives that mover −2 ATT', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'davids', 'MID');
    state = seedCalibrationPlayer(state, 'away', 'abedi-pele', 'MID');
    const abediId = calibrationRuntimeId('away', 'abedi-pele');

    state = moveCalibrationPlayer(state, 'away', 'abedi-pele', 'ATT');
    expect(state.players[calibrationRuntimeId('home', 'davids')]?.zone).toBe('ATT');
    expect(currentCalibrationAttack(state, abediId)).toBe(getV8CalibrationPlayer('abedi-pele').printedAttack + 2);

    state = endV8CalibrationPeriod(state);
    expect(currentCalibrationAttack(state, abediId)).toBe(getV8CalibrationPlayer('abedi-pele').printedAttack + 4);
  });

  it('TOTAL FOOTBALL removes OOP penalties at contribution time without changing raw stats', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'davids', 'ATT');
    state = seedCalibrationPlayer(state, 'home', 'bobby-moore', 'MID');
    state = seedCalibrationPlayer(state, 'home', 'dempsey', 'DEF');

    const davidsId = calibrationRuntimeId('home', 'davids');
    const mooreId = calibrationRuntimeId('home', 'bobby-moore');
    const dempseyId = calibrationRuntimeId('home', 'dempsey');

    expect(calibrationEffectiveStats(state, state.players[davidsId]!).penalty).toBe(2);
    expect(calibrationEffectiveStats(state, state.players[mooreId]!).penalty).toBe(2);
    expect(calibrationEffectiveStats(state, state.players[dempseyId]!).penalty).toBe(2);

    state = seedCalibrationPlayer(state, 'home', 'cruyff', 'ATT');
    expect(calibrationContributionRules(state, 'home').ignoreOutOfPositionPenalty).toBe(true);

    expect(calibrationEffectiveStats(state, state.players[davidsId]!)).toEqual({ attack: 4, defence: 6, penalty: 0 });
    expect(calibrationEffectiveStats(state, state.players[mooreId]!)).toEqual({ attack: 1, defence: 10, penalty: 0 });
    expect(calibrationEffectiveStats(state, state.players[dempseyId]!)).toEqual({ attack: 10, defence: 1, penalty: 0 });

    expect(currentCalibrationAttack(state, davidsId)).toBe(4);
    expect(currentCalibrationDefence(state, mooreId)).toBe(10);
    expect(state.players[davidsId]?.modifiers.some((modifier) => modifier.source === 'TOTAL FOOTBALL')).toBe(false);
  });

  it('TOTAL FOOTBALL immediately switches off when Cruyff is suppressed', () => {
    let state = createV8CalibrationState();
    state = seedCalibrationPlayer(state, 'home', 'davids', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'cruyff', 'MID');
    const cruyffId = calibrationRuntimeId('home', 'cruyff');
    const davidsId = calibrationRuntimeId('home', 'davids');

    expect(calibrationEffectiveStats(state, state.players[davidsId]!).penalty).toBe(0);
    expect(calibrationZoneTotals(state, 'home', 'ATT').attack).toBe(4);

    state = revealCalibrationPlayer(state, 'away', 'gentile', 'MID');
    expect(state.suppressedActions[cruyffId]).toBe(calibrationRuntimeId('away', 'gentile'));
    expect(calibrationContributionRules(state, 'home').ignoreOutOfPositionPenalty).toBe(false);
    expect(calibrationEffectiveStats(state, state.players[davidsId]!).penalty).toBe(2);
    expect(calibrationZoneTotals(state, 'home', 'ATT').attack).toBe(2);
    expect(currentCalibrationAttack(state, davidsId)).toBe(4);
  });
});