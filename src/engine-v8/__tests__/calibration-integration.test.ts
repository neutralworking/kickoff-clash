import { describe, expect, it } from 'vitest';
import {
  addCalibrationTacticalToHand,
  applyCalibrationModifier,
  calibrationHandTacticals,
  calibrationRuntimeId,
  calibrationZoneTotals,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  hasReducedDefence,
  isCalibrationActionEnabled,
  moveCalibrationPlayer,
  playCalibrationTactical,
  previewCalibrationTacticalCost,
  refreshCalibrationSuppression,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
} from '../calibration-engine';
import {
  V8_CALIBRATION_EXCLUDED_REAL_NAMES,
  V8_CALIBRATION_PLAYERS,
  getV8CalibrationPlayer,
} from '../calibration-cards';
import { V8_TACTICAL_DEFINITIONS } from '../tactical';

function tactical(state: ReturnType<typeof createV8CalibrationState>, side: 'home' | 'away', type: string) {
  const found = calibrationHandTacticals(state, side).find((card) => card.type === type);
  if (!found) throw new Error(`Missing ${type} in ${side} hand`);
  return found;
}

function highEnergy(period = 1) {
  return createV8CalibrationState({ period, homeEnergy: 99, awayEnergy: 99 });
}

describe('V8 calibration catalogue', () => {
  it('contains exactly the requested 30 players and seven Tactical definitions', () => {
    expect(V8_CALIBRATION_PLAYERS).toHaveLength(30);
    expect(Object.keys(V8_TACTICAL_DEFINITIONS)).toEqual([
      'cross',
      'through_ball',
      'long_shot',
      'corner',
      'penalty',
      'offside_trap',
      'trigger_press',
    ]);
    for (const excluded of V8_CALIBRATION_EXCLUDED_REAL_NAMES) {
      expect(V8_CALIBRATION_PLAYERS.some((player) => player.realName === excluded)).toBe(false);
    }
  });
});

describe('high-priority calibration interactions', () => {
  it('A. Beckham + Wambach resolves the enhanced Cross for +8 ATT', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    const cross = tactical(state, 'home', 'cross');

    state = playCalibrationTactical(state, 'home', cross.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)?.attack).toBe(8);
    expect(state.tacticalAttack.home.ATT).toBe(8);
  });

  it('B. Beckham + Wambach + Ada stacks to +12 and ignores cancellation', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    state = seedCalibrationPlayer(state, 'home', 'hegerberg', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'schmeichel', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    const cross = tactical(state, 'home', 'cross');

    state = playCalibrationTactical(state, 'home', cross.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ attack: 12, cancelled: false, uncancellable: true });
  });

  it('C. Valderrama + Shevchenko resolves the first Through Ball for +8 ATT', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'shevchenko', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'valderrama', 'MID');
    const ball = tactical(state, 'home', 'through_ball');

    state = playCalibrationTactical(state, 'home', ball.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)?.attack).toBe(8);
  });

  it('D. Duff → Neymar → Panenka produces an +8 uncancellable Penalty', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'away', 'baresi', 'DEF');
    state = seedCalibrationPlayer(state, 'home', 'panenka', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'duff', 'ATT');
    expect(hasReducedDefence(state, calibrationRuntimeId('away', 'baresi'))).toBe(true);
    state = revealCalibrationPlayer(state, 'home', 'neymar', 'ATT');
    const penalty = tactical(state, 'home', 'penalty');

    state = playCalibrationTactical(state, 'home', penalty.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ attack: 8, cancelled: false, uncancellable: true });
  });

  it('E. Okocha only generates a Penalty when the defender was reduced before STEPOVER', () => {
    let fresh = highEnergy();
    fresh = seedCalibrationPlayer(fresh, 'away', 'baresi', 'DEF');
    fresh = revealCalibrationPlayer(fresh, 'home', 'okocha', 'ATT');
    expect(calibrationHandTacticals(fresh, 'home').filter((card) => card.type === 'penalty')).toHaveLength(0);

    let primed = highEnergy();
    primed = seedCalibrationPlayer(primed, 'away', 'baresi', 'DEF');
    primed = revealCalibrationPlayer(primed, 'home', 'duff', 'ATT');
    primed = revealCalibrationPlayer(primed, 'home', 'okocha', 'ATT');
    expect(calibrationHandTacticals(primed, 'home').filter((card) => card.type === 'penalty')).toHaveLength(1);
  });

  it('F. Ronaldo requires the defender to be at least 3 DEF below base', () => {
    let twoDown = highEnergy();
    twoDown = seedCalibrationPlayer(twoDown, 'away', 'baresi', 'DEF');
    twoDown = applyCalibrationModifier(twoDown, calibrationRuntimeId('away', 'baresi'), { defence: -2, lifetime: 'period', source: 'test' });
    twoDown = revealCalibrationPlayer(twoDown, 'home', 'ronaldo', 'ATT');
    expect(calibrationHandTacticals(twoDown, 'home').some((card) => card.type === 'penalty')).toBe(false);

    let threeDown = highEnergy();
    threeDown = seedCalibrationPlayer(threeDown, 'away', 'baresi', 'DEF');
    threeDown = applyCalibrationModifier(threeDown, calibrationRuntimeId('away', 'baresi'), { defence: -3, lifetime: 'period', source: 'test' });
    threeDown = revealCalibrationPlayer(threeDown, 'home', 'ronaldo', 'ATT');
    const penalty = tactical(threeDown, 'home', 'penalty');
    expect(penalty.attModifier).toBe(2);
  });

  it('G. Baresi Offside Trap cancels an opposing ATT Through Ball and gives +2 DEF in his DEF zone', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'baresi', 'DEF');
    const trap = tactical(state, 'home', 'offside_trap');
    state = playCalibrationTactical(state, 'home', trap.id, 'DEF', { ignoreEnergy: true });
    const added = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = added.state;

    state = playCalibrationTactical(state, 'away', added.card.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'through_ball', cancelled: true, attack: 0 });
    expect(state.zoneDefenceBonus.home.DEF).toBe(2);
  });

  it('H. Park generates a 0-cost Trigger Press this period and DEF also counts toward ATT', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    const before = calibrationZoneTotals(state, 'home', 'ATT').attack;
    state = revealCalibrationPlayer(state, 'home', 'park', 'MID');
    const press = tactical(state, 'home', 'trigger_press');
    expect(previewCalibrationTacticalCost(state, 'home', press, 'ATT')).toBe(0);

    state = playCalibrationTactical(state, 'home', press.id, 'ATT');

    expect(calibrationZoneTotals(state, 'home', 'ATT').attack).toBe(before + getV8CalibrationPlayer('wambach').printedDefence);
  });

  it('I. Gentile dynamically retargets the current highest-ATT opposing player and restores the old Action', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'gentile', 'DEF');
    state = seedCalibrationPlayer(state, 'away', 'wambach', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'hegerberg', 'ATT');
    state = refreshCalibrationSuppression(state);

    expect(isCalibrationActionEnabled(state, calibrationRuntimeId('away', 'hegerberg'))).toBe(false);
    expect(isCalibrationActionEnabled(state, calibrationRuntimeId('away', 'wambach'))).toBe(true);

    state = applyCalibrationModifier(state, calibrationRuntimeId('away', 'wambach'), { attack: 3, lifetime: 'period', source: 'test' });

    expect(isCalibrationActionEnabled(state, calibrationRuntimeId('away', 'wambach'))).toBe(false);
    expect(isCalibrationActionEnabled(state, calibrationRuntimeId('away', 'hegerberg'))).toBe(true);
  });

  it('J. period reset expires temporary state, resets movement/first-card counters and preserves once-per-match state', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'cafu', 'DEF');
    state = seedCalibrationPlayer(state, 'home', 'lloyd', 'MID');
    state = seedCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'park', 'MID');
    state = applyCalibrationModifier(state, calibrationRuntimeId('home', 'wambach'), { attack: 2, lifetime: 'period', source: 'temporary-test' });
    const boostedAttack = currentCalibrationAttack(state, calibrationRuntimeId('home', 'wambach'));
    state = moveCalibrationPlayer(state, 'home', 'cafu', 'MID');

    let added = addCalibrationTacticalToHand(state, 'home', 'long_shot');
    state = added.state;
    expect(previewCalibrationTacticalCost(state, 'home', added.card, 'MID')).toBe(0);
    state = playCalibrationTactical(state, 'home', added.card.id, 'MID');

    state = endV8CalibrationPeriod(state);

    expect(state.period).toBe(2);
    expect(currentCalibrationAttack(state, calibrationRuntimeId('home', 'wambach'))).toBe(boostedAttack - 2);
    state = moveCalibrationPlayer(state, 'home', 'cafu', 'ATT');
    expect(state.players[calibrationRuntimeId('home', 'cafu')]?.zone).toBe('ATT');

    added = addCalibrationTacticalToHand(state, 'home', 'long_shot');
    state = added.state;
    expect(previewCalibrationTacticalCost(state, 'home', added.card, 'MID')).toBe(1);

    const heldPress = calibrationHandTacticals(state, 'home').find((card) => card.type === 'trigger_press');
    expect(heldPress).toBeDefined();
    expect(previewCalibrationTacticalCost(state, 'home', heldPress!, 'ATT')).toBe(1);
  });
});

describe('remaining 30-card mechanics', () => {
  it('RABONA modifies the first Cross in hand and otherwise generates one', () => {
    let state = highEnergy();
    const added = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = added.state;
    state = revealCalibrationPlayer(state, 'home', 'di-maria', 'MID');
    expect(tactical(state, 'home', 'cross').attModifier).toBe(3);

    let fallback = highEnergy();
    fallback = revealCalibrationPlayer(fallback, 'home', 'di-maria', 'MID');
    expect(calibrationHandTacticals(fallback, 'home').filter((card) => card.type === 'cross')).toHaveLength(1);
  });

  it('PENDOLINO only generates a Cross after forward movement', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'cafu', 'DEF');
    state = moveCalibrationPlayer(state, 'home', 'cafu', 'MID');
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.type === 'cross')).toHaveLength(1);

    state = endV8CalibrationPeriod(state);
    state = moveCalibrationPlayer(state, 'home', 'cafu', 'DEF');
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.type === 'cross')).toHaveLength(1);
  });

  it('LEFT-FOOT WHIP generates two independent Cross instances', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'dzajic', 'ATT');
    const crosses = calibrationHandTacticals(state, 'home').filter((card) => card.type === 'cross');
    expect(crosses).toHaveLength(2);
    expect(crosses[0]?.id).not.toBe(crosses[1]?.id);
  });

  it('THUNDERBALL carries its MID rider and HALFWAY HIT amplifies Long Shots with a once-match zero cost', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'lloyd', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'charlton', 'MID');
    const shot = tactical(state, 'home', 'long_shot');
    expect(previewCalibrationTacticalCost(state, 'home', shot, 'MID')).toBe(0);
    state = playCalibrationTactical(state, 'home', shot.id, 'MID');
    expect(state.tacticalResolutions.at(-1)?.attack).toBe(7); // 1 base +2 Charlton MID rider +4 Lloyd
  });

  it('WHIPPED DELIVERY snapshots attacking CBs and 93RD MINUTE escalates Corners in period four', () => {
    let state = highEnergy(4);
    state = seedCalibrationPlayer(state, 'home', 'ramos', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'eriksen', 'MID');
    const corner = tactical(state, 'home', 'corner');
    expect(corner.attModifier).toBe(1);
    state = playCalibrationTactical(state, 'home', corner.id, 'ATT', { ignoreEnergy: true });
    expect(state.tacticalResolutions.at(-1)?.attack).toBe(9); // 3 base +1 stored CB +5 Ramos final-period
  });

  it('JOY OF THE PEOPLE checks reduced DEF before its own debuff', () => {
    let fresh = highEnergy();
    fresh = seedCalibrationPlayer(fresh, 'away', 'baresi', 'DEF');
    fresh = revealCalibrationPlayer(fresh, 'home', 'garrincha', 'ATT');
    expect(currentCalibrationAttack(fresh, calibrationRuntimeId('home', 'garrincha'))).toBe(getV8CalibrationPlayer('garrincha').printedAttack);

    let reduced = highEnergy();
    reduced = seedCalibrationPlayer(reduced, 'away', 'baresi', 'DEF');
    reduced = applyCalibrationModifier(reduced, calibrationRuntimeId('away', 'baresi'), { defence: -1, lifetime: 'period', source: 'setup' });
    reduced = revealCalibrationPlayer(reduced, 'home', 'garrincha', 'ATT');
    expect(currentCalibrationAttack(reduced, calibrationRuntimeId('home', 'garrincha'))).toBe(getV8CalibrationPlayer('garrincha').printedAttack + 4);
  });

  it('LA CROQUETA ignores the first opposing Action each period and RIDE THE TACKLE blocks reductions', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'away', 'iniesta', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'bremner', 'MID');
    expect(currentCalibrationAttack(state, calibrationRuntimeId('away', 'iniesta'))).toBe(getV8CalibrationPlayer('iniesta').printedAttack);

    state = endV8CalibrationPeriod(state);
    state = applyCalibrationModifier(state, calibrationRuntimeId('away', 'iniesta'), {
      attack: -2,
      lifetime: 'period',
      source: 'CRUNCHING TACKLE',
      sourceRuntimeId: calibrationRuntimeId('home', 'bremner'),
    });
    expect(currentCalibrationAttack(state, calibrationRuntimeId('away', 'iniesta'))).toBe(getV8CalibrationPlayer('iniesta').printedAttack);

    let seedorf = highEnergy();
    seedorf = seedCalibrationPlayer(seedorf, 'away', 'seedorf', 'MID');
    seedorf = applyCalibrationModifier(seedorf, calibrationRuntimeId('away', 'seedorf'), { defence: -3, lifetime: 'period', source: 'test' });
    expect(currentCalibrationDefence(seedorf, calibrationRuntimeId('away', 'seedorf'))).toBe(getV8CalibrationPlayer('seedorf').printedDefence);
  });

  it('WATER-CARRIER is a dynamic local aura that excludes Makélélé himself', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'makelele', 'MID');
    state = seedCalibrationPlayer(state, 'home', 'iniesta', 'MID');
    expect(currentCalibrationDefence(state, calibrationRuntimeId('home', 'makelele'))).toBe(getV8CalibrationPlayer('makelele').printedDefence);
    expect(currentCalibrationDefence(state, calibrationRuntimeId('home', 'iniesta'))).toBe(getV8CalibrationPlayer('iniesta').printedDefence + 2);
  });

  it('KILLER PASS generates an enhanced Through Ball after winning MID', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'litmanen', 'ATT');
    state = seedCalibrationPlayer(state, 'home', 'iniesta', 'MID');
    state = endV8CalibrationPeriod(state);
    const ball = tactical(state, 'home', 'through_ball');
    expect(ball.attModifier).toBe(1);
  });

  it('ARRIVE UNMARKED is a permanent first-player placement gain', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'sinclair', 'ATT');
    const runtimeId = calibrationRuntimeId('home', 'sinclair');
    expect(currentCalibrationAttack(state, runtimeId)).toBe(getV8CalibrationPlayer('sinclair').printedAttack + 4);
    state = endV8CalibrationPeriod(state);
    expect(currentCalibrationAttack(state, runtimeId)).toBe(getV8CalibrationPlayer('sinclair').printedAttack + 4);
  });

  it('DER KAISER moves either direction and gains temporary +2/+2', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'beckenbauer', 'DEF');
    state = moveCalibrationPlayer(state, 'home', 'beckenbauer', 'MID');
    const runtimeId = calibrationRuntimeId('home', 'beckenbauer');
    expect(currentCalibrationAttack(state, runtimeId)).toBe(getV8CalibrationPlayer('beckenbauer').printedAttack + 2);
    expect(currentCalibrationDefence(state, runtimeId)).toBe(getV8CalibrationPlayer('beckenbauer').printedDefence + 2);
  });
});
