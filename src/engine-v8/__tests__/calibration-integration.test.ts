import { describe, expect, it } from 'vitest';
import {
  V8_TACTICAL_DEFINITIONS,
  addCalibrationTacticalToHand,
  applyCalibrationModifier,
  calibrationHandTacticals,
  calibrationPlayersInZone,
  calibrationRuntimeId,
  calibrationTacticalAvailableFromPeriod,
  calibrationZoneTotals,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriod,
  getV8CalibrationPlayer,
  isCalibrationActionEnabled,
  isCalibrationTacticalAvailable,
  moveCalibrationPlayer,
  playCalibrationTactical,
  previewCalibrationTacticalCost,
  refreshCalibrationSuppression,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
  type V8CalibrationState,
  type V8TacticalType,
} from '../index';

function highEnergy(): V8CalibrationState {
  const state = createV8CalibrationState();
  state.teams.home.energy = 99;
  state.teams.away.energy = 99;
  return state;
}

function advance(state: V8CalibrationState): V8CalibrationState {
  const next = endV8CalibrationPeriod(state);
  next.teams.home.energy = 99;
  next.teams.away.energy = 99;
  return next;
}

function tactical(state: V8CalibrationState, side: 'home' | 'away', type: V8TacticalType) {
  const card = calibrationHandTacticals(state, side).find((candidate) => candidate.type === type);
  if (!card) throw new Error(`Missing ${type}`);
  return card;
}

describe('high-priority calibration interactions', () => {
  it('contains exactly the requested 30 players and seven Tactical definitions', () => {
    expect(Object.keys(V8_TACTICAL_DEFINITIONS)).toHaveLength(7);
    const ids = [
      'wambach', 'hegerberg', 'di-maria', 'cafu', 'beckham', 'dzajic', 'morgan', 'shevchenko', 'valderrama', 'litmanen',
      'charlton', 'lloyd', 'eriksen', 'ramos', 'duff', 'garrincha', 'okocha', 'neymar', 'ronaldo', 'panenka',
      'iniesta', 'bremner', 'seedorf', 'makelele', 'gentile', 'baresi', 'park', 'schmeichel', 'sinclair', 'beckenbauer',
    ];
    expect(ids.map((id) => getV8CalibrationPlayer(id).id)).toEqual(ids);
  });

  it('A. Beckham + Wambach banks the enhanced Cross, then resolves it for +8 ATT next period', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    let cross = tactical(state, 'home', 'cross');

    expect(calibrationTacticalAvailableFromPeriod(cross)).toBe(2);
    expect(isCalibrationTacticalAvailable(state, cross)).toBe(false);
    expect(() => playCalibrationTactical(state, 'home', cross.id, 'ATT', { ignoreEnergy: true })).toThrow('banked until Period 2');

    state = advance(state);
    cross = tactical(state, 'home', 'cross');
    state = playCalibrationTactical(state, 'home', cross.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'cross', attack: 8, cancelled: false });
  });

  it('B. Beckham + Wambach + Ada stacks to +12 and ignores cancellation when the banked Cross is played', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'away', 'schmeichel', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'hegerberg', 'ATT');
    state = advance(state);
    const cross = tactical(state, 'home', 'cross');

    state = playCalibrationTactical(state, 'home', cross.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'cross', attack: 12, cancelled: false, uncancellable: true });
  });

  it('C. Valderrama + Shevchenko resolves the banked first Through Ball for +8 ATT', () => {
    let state = highEnergy();
    // PAUSE AND SLIP only adds +2 when ATT is already occupied, so establish the runner first.
    state = revealCalibrationPlayer(state, 'home', 'shevchenko', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'valderrama', 'MID');
    state = advance(state);
    const throughBall = tactical(state, 'home', 'through_ball');

    state = playCalibrationTactical(state, 'home', throughBall.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'through_ball', attack: 8, cancelled: false });
  });

  it('D. Duff → Neymar → Panenka banks an +8 uncancellable Penalty for the next period', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'duff', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'neymar', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'panenka', 'ATT');
    state = advance(state);
    const penalty = tactical(state, 'home', 'penalty');

    state = playCalibrationTactical(state, 'home', penalty.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'penalty', attack: 8, cancelled: false, uncancellable: true });
  });

  it('E. Okocha only generates a Penalty when the defender was reduced before STEPOVER', () => {
    let fresh = highEnergy();
    fresh = seedCalibrationPlayer(fresh, 'away', 'ramos', 'DEF');
    fresh = revealCalibrationPlayer(fresh, 'home', 'okocha', 'ATT');
    expect(calibrationHandTacticals(fresh, 'home').filter((card) => card.type === 'penalty')).toHaveLength(0);

    let reduced = highEnergy();
    reduced = seedCalibrationPlayer(reduced, 'away', 'ramos', 'DEF');
    reduced = applyCalibrationModifier(reduced, calibrationRuntimeId('away', 'ramos'), { defence: -2, lifetime: 'period', source: 'test' });
    reduced = revealCalibrationPlayer(reduced, 'home', 'okocha', 'ATT');
    const penalty = calibrationHandTacticals(reduced, 'home').find((card) => card.type === 'penalty');
    expect(penalty).toBeDefined();
    expect(calibrationTacticalAvailableFromPeriod(penalty!)).toBe(2);
  });

  it('F. Ronaldo requires the defender to be at least 3 DEF below base', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    state = applyCalibrationModifier(state, calibrationRuntimeId('away', 'ramos'), { defence: -2, lifetime: 'period', source: 'test' });
    state = revealCalibrationPlayer(state, 'home', 'ronaldo', 'ATT');
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.type === 'penalty')).toHaveLength(0);

    state = applyCalibrationModifier(state, calibrationRuntimeId('away', 'ramos'), { defence: -1, lifetime: 'period', source: 'test' });
    const reloaded = addCalibrationTacticalToHand(state, 'home', 'penalty');
    expect(currentCalibrationDefence(reloaded.state, calibrationRuntimeId('away', 'ramos'))).toBe(getV8CalibrationPlayer('ramos').printedDefence - 3);
  });

  it('G. Baresi banks Offside Trap, then cancels an opposing ATT Through Ball next period and gains +2 DEF', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'baresi', 'DEF');
    state = advance(state);
    const trap = tactical(state, 'home', 'offside_trap');
    state = playCalibrationTactical(state, 'home', trap.id, 'DEF', { ignoreEnergy: true });
    const added = addCalibrationTacticalToHand(state, 'away', 'through_ball');
    state = added.state;

    state = playCalibrationTactical(state, 'away', added.card.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'through_ball', cancelled: true, attack: 0 });
    expect(state.zoneDefenceBonus.home.DEF).toBe(2);
  });

  it('H. Park’s Trigger Press is free in its own period’s window and printed cost when held', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'park', 'MID');
    let press = tactical(state, 'home', 'trigger_press');

    // The commitment path stays gated to the next period; the discount lives in THIS period.
    expect(calibrationTacticalAvailableFromPeriod(press)).toBe(2);
    expect(previewCalibrationTacticalCost(state, 'home', press, 'ATT')).toBe(0);
    expect(() => playCalibrationTactical(state, 'home', press.id, 'ATT')).toThrow('banked until Period 2');

    const before = calibrationZoneTotals(state, 'home', 'ATT').attack;
    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: press.id, zone: 'ATT' }]);
    expect(window.plays[0]?.cost).toBe(0);
    expect(calibrationZoneTotals(window.state, 'home', 'ATT').attack).toBe(before + getV8CalibrationPlayer('wambach').printedDefence);

    // Held instead of window-played: the discount expired, printed cost applies next period.
    state = advance(state);
    press = tactical(state, 'home', 'trigger_press');
    expect(previewCalibrationTacticalCost(state, 'home', press, 'ATT')).toBe(1);
    const heldBefore = calibrationZoneTotals(state, 'home', 'ATT').attack;
    state = playCalibrationTactical(state, 'home', press.id, 'ATT');
    expect(calibrationZoneTotals(state, 'home', 'ATT').attack).toBe(heldBefore + getV8CalibrationPlayer('wambach').printedDefence);
  });

  it('I. Gentile dynamically retargets the current highest-ATT opposing player and restores the old Action', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'gentile', 'DEF');
    // Wambach and Hegerberg are both currently 11 ATT, so seed Hegerberg first to make the
    // deterministic deployed-order tiebreak explicit before Wambach is boosted above her.
    state = seedCalibrationPlayer(state, 'away', 'hegerberg', 'ATT');
    state = seedCalibrationPlayer(state, 'away', 'wambach', 'ATT');
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
    expect(boostedAttack).toBe(getV8CalibrationPlayer('wambach').printedAttack + 2);

    const longShot = addCalibrationTacticalToHand(state, 'home', 'long_shot');
    state = longShot.state;
    expect(previewCalibrationTacticalCost(state, 'home', longShot.card, 'MID')).toBe(0);
    state = playCalibrationTactical(state, 'home', longShot.card.id, 'MID', { ignoreEnergy: true });

    state = moveCalibrationPlayer(state, 'home', 'cafu', 'MID');
    expect(calibrationHandTacticals(state, 'home').some((card) => card.type === 'cross')).toBe(true);

    state = advance(state);

    expect(state.period).toBe(2);
    expect(currentCalibrationAttack(state, calibrationRuntimeId('home', 'wambach'))).toBe(getV8CalibrationPlayer('wambach').printedAttack);
    expect(previewCalibrationTacticalCost(state, 'home', longShot.card, 'MID')).toBe(1);
    expect(() => moveCalibrationPlayer(state, 'home', 'cafu', 'ATT')).not.toThrow();
  });

  it('RABONA modifies the first Cross in hand and otherwise banks one for next period', () => {
    let state = highEnergy();
    const added = addCalibrationTacticalToHand(state, 'home', 'cross');
    state = revealCalibrationPlayer(added.state, 'home', 'di-maria', 'MID');
    expect(tactical(state, 'home', 'cross').attModifier).toBe(3);

    let empty = highEnergy();
    empty = revealCalibrationPlayer(empty, 'home', 'di-maria', 'MID');
    const generated = tactical(empty, 'home', 'cross');
    expect(generated.attModifier).toBe(0);
    expect(calibrationTacticalAvailableFromPeriod(generated)).toBe(2);
  });

  it('PENDOLINO generates an immediately playable Cross after forward movement', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'cafu', 'DEF');
    expect(calibrationHandTacticals(state, 'home').filter((card) => card.type === 'cross')).toHaveLength(0);

    state = moveCalibrationPlayer(state, 'home', 'cafu', 'MID');
    const cross = tactical(state, 'home', 'cross');
    expect(isCalibrationTacticalAvailable(state, cross)).toBe(true);
    expect(() => playCalibrationTactical(state, 'home', cross.id, 'ATT', { ignoreEnergy: true })).not.toThrow();
  });

  it('LEFT-FOOT WHIP banks two independent Cross instances for the next period', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'dzajic', 'ATT');
    const crosses = calibrationHandTacticals(state, 'home').filter((card) => card.type === 'cross');
    expect(crosses).toHaveLength(2);
    expect(crosses[0]?.id).not.toBe(crosses[1]?.id);
    expect(crosses.every((card) => calibrationTacticalAvailableFromPeriod(card) === 2)).toBe(true);
  });

  it('THUNDERBALL carries its MID rider and HALFWAY HIT amplifies it with a once-match zero cost', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'charlton', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'lloyd', 'MID');
    state = advance(state);
    const longShot = tactical(state, 'home', 'long_shot');
    expect(previewCalibrationTacticalCost(state, 'home', longShot, 'MID')).toBe(0);

    state = playCalibrationTactical(state, 'home', longShot.id, 'MID', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'long_shot', attack: 8, cancelled: false });
    const second = addCalibrationTacticalToHand(state, 'home', 'long_shot');
    expect(previewCalibrationTacticalCost(second.state, 'home', second.card, 'MID')).toBe(1);
  });

  it('WHIPPED DELIVERY snapshots attacking CBs in P3 and 93RD MINUTE escalates the banked Corner in P4', () => {
    let state = highEnergy();
    state.period = 3;
    state = seedCalibrationPlayer(state, 'home', 'ramos', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'eriksen', 'MID');
    state = advance(state);
    const corner = tactical(state, 'home', 'corner');

    state = playCalibrationTactical(state, 'home', corner.id, 'ATT', { ignoreEnergy: true });

    expect(state.tacticalResolutions.at(-1)).toMatchObject({ type: 'corner', attack: 9, cancelled: false });
  });

  it('P4 reveal generation is live through the window while end-of-period generation still fizzles at FT', () => {
    let revealState = highEnergy();
    revealState.period = 4;
    revealState = revealCalibrationPlayer(revealState, 'home', 'beckham', 'MID');
    const cross = tactical(revealState, 'home', 'cross');
    // No commitment window remains, but the P4 Generated-Tactical Window is open.
    expect(isCalibrationTacticalAvailable(revealState, cross)).toBe(false);
    const window = resolveGeneratedTacticalWindow(revealState, [{ side: 'home', cardId: cross.id, zone: 'ATT' }]);
    expect(window.state.tacticalResolutions.at(-1)).toMatchObject({ type: 'cross', attack: 4, cancelled: false, window: true });

    let endState = highEnergy();
    endState.period = 4;
    endState = seedCalibrationPlayer(endState, 'home', 'litmanen', 'MID');
    endState = seedCalibrationPlayer(endState, 'home', 'makelele', 'MID');
    endState = seedCalibrationPlayer(endState, 'away', 'panenka', 'MID');
    endState = endV8CalibrationPeriod(endState);
    expect(calibrationHandTacticals(endState, 'home').filter((card) => card.type === 'through_ball')).toHaveLength(0);
    expect(endState.events.some((event) => event.period === 4 && event.text.includes('no commitment window remains'))).toBe(true);
  });

  it('JOY OF THE PEOPLE checks reduced DEF before its own debuff', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'away', 'ramos', 'DEF');
    state = revealCalibrationPlayer(state, 'home', 'garrincha', 'ATT');
    expect(currentCalibrationAttack(state, calibrationRuntimeId('home', 'garrincha'))).toBe(getV8CalibrationPlayer('garrincha').printedAttack);

    let primed = highEnergy();
    primed = seedCalibrationPlayer(primed, 'away', 'ramos', 'DEF');
    primed = applyCalibrationModifier(primed, calibrationRuntimeId('away', 'ramos'), { defence: -1, lifetime: 'period', source: 'test' });
    primed = revealCalibrationPlayer(primed, 'home', 'garrincha', 'ATT');
    expect(currentCalibrationAttack(primed, calibrationRuntimeId('home', 'garrincha'))).toBe(getV8CalibrationPlayer('garrincha').printedAttack + 4);
  });

  it('LA CROQUETA ignores the first opposing Action each period and RIDE THE TACKLE blocks reductions', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'away', 'iniesta', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'bremner', 'MID');
    expect(currentCalibrationAttack(state, calibrationRuntimeId('away', 'iniesta'))).toBe(getV8CalibrationPlayer('iniesta').printedAttack);

    state = applyCalibrationModifier(state, calibrationRuntimeId('away', 'iniesta'), {
      attack: -1,
      lifetime: 'period',
      source: 'second-action',
      sourceRuntimeId: calibrationRuntimeId('home', 'bremner'),
    });
    expect(currentCalibrationAttack(state, calibrationRuntimeId('away', 'iniesta'))).toBe(getV8CalibrationPlayer('iniesta').printedAttack - 1);

    let seedorfState = highEnergy();
    seedorfState = seedCalibrationPlayer(seedorfState, 'away', 'seedorf', 'MID');
    seedorfState = revealCalibrationPlayer(seedorfState, 'home', 'bremner', 'MID');
    expect(currentCalibrationAttack(seedorfState, calibrationRuntimeId('away', 'seedorf'))).toBe(getV8CalibrationPlayer('seedorf').printedAttack);
  });

  it('WATER-CARRIER is a dynamic local aura that excludes Makélélé himself', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'makelele', 'MID');
    state = seedCalibrationPlayer(state, 'home', 'seedorf', 'MID');
    expect(currentCalibrationDefence(state, calibrationRuntimeId('home', 'seedorf'))).toBe(getV8CalibrationPlayer('seedorf').printedDefence + 2);
    expect(currentCalibrationDefence(state, calibrationRuntimeId('home', 'makelele'))).toBe(getV8CalibrationPlayer('makelele').printedDefence);
  });

  it('KILLER PASS generates an enhanced Through Ball after winning MID for the next commitment window', () => {
    let state = highEnergy();
    state = seedCalibrationPlayer(state, 'home', 'litmanen', 'MID');
    state = seedCalibrationPlayer(state, 'home', 'makelele', 'MID');
    state = seedCalibrationPlayer(state, 'away', 'panenka', 'MID');

    state = advance(state);

    const throughBall = tactical(state, 'home', 'through_ball');
    expect(throughBall.attModifier).toBe(1);
    expect(calibrationTacticalAvailableFromPeriod(throughBall)).toBe(2);
    expect(isCalibrationTacticalAvailable(state, throughBall)).toBe(true);
  });

  it('ARRIVE UNMARKED is a permanent first-player placement gain', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'sinclair', 'ATT');
    expect(currentCalibrationAttack(state, calibrationRuntimeId('home', 'sinclair'))).toBe(getV8CalibrationPlayer('sinclair').printedAttack + 4);
  });

  it('DER KAISER moves either direction and gains temporary +2/+2', () => {
    let state = highEnergy();
    state = revealCalibrationPlayer(state, 'home', 'beckenbauer', 'DEF');
    state = moveCalibrationPlayer(state, 'home', 'beckenbauer', 'MID');
    expect(currentCalibrationAttack(state, calibrationRuntimeId('home', 'beckenbauer'))).toBe(getV8CalibrationPlayer('beckenbauer').printedAttack + 2);
    expect(currentCalibrationDefence(state, calibrationRuntimeId('home', 'beckenbauer'))).toBe(getV8CalibrationPlayer('beckenbauer').printedDefence + 2);
  });
});
