import { describe, expect, it } from 'vitest';
import {
  calibrationHandTacticals,
  calibrationZoneTotals,
  captureV8CalibrationPeriodTelemetry,
  createV8CalibrationState,
  endV8CalibrationPeriod,
  isCalibrationTacticalAvailable,
  planV8CalibrationWindow,
  playCalibrationTactical,
  previewCalibrationTacticalCost,
  resolveGeneratedTacticalWindow,
  revealCalibrationPlayer,
  seedCalibrationPlayer,
  windowEligibleCalibrationTacticals,
  type V8CalibrationState,
  type V8TacticalType,
} from '../index';

function withEnergy(energy: number, period = 1): V8CalibrationState {
  const state = createV8CalibrationState({ period });
  state.teams.home.energy = energy;
  state.teams.away.energy = energy;
  return state;
}

function advance(state: V8CalibrationState, energy = 9): V8CalibrationState {
  const next = endV8CalibrationPeriod(state);
  next.teams.home.energy = energy;
  next.teams.away.energy = energy;
  return next;
}

function tactical(state: V8CalibrationState, side: 'home' | 'away', type: V8TacticalType) {
  const card = calibrationHandTacticals(state, side).find((candidate) => candidate.type === type);
  if (!card) throw new Error(`Missing ${type}`);
  return card;
}

describe('the Generated-Tactical Window', () => {
  it('1. plays a P1-generated Cross in the P1 window from remaining Energy, into ATT, before scoring', () => {
    let state = withEnergy(3);
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    const cross = tactical(state, 'home', 'cross');
    const attackBefore = calibrationZoneTotals(state, 'home', 'ATT').attack;

    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: cross.id, zone: 'ATT' }]);

    expect(window.state.tacticalResolutions.at(-1)).toMatchObject({ type: 'cross', zone: 'ATT', attack: 4, cancelled: false, window: true });
    expect(calibrationZoneTotals(window.state, 'home', 'ATT').attack).toBe(attackBefore + 4);
    expect(window.state.teams.home.energy).toBe(2);
    expect(calibrationHandTacticals(window.state, 'home')).toHaveLength(0);
  });

  it('2. keeps P4 generation live: a creator revealing in P4 produces a Tactical playable in the P4 window', () => {
    let state = withEnergy(3, 4);
    state = seedCalibrationPlayer(state, 'home', 'shevchenko', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'valderrama', 'MID');
    const throughBall = tactical(state, 'home', 'through_ball');
    const attackBefore = calibrationZoneTotals(state, 'home', 'ATT').attack;

    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: throughBall.id, zone: 'ATT' }]);

    expect(window.state.period).toBe(4);
    expect(window.state.tacticalResolutions.at(-1)).toMatchObject({ type: 'through_ball', window: true, cancelled: false });
    expect(calibrationZoneTotals(window.state, 'home', 'ATT').attack).toBeGreaterThan(attackBefore);
  });

  it('3. honours the THREE LUNGS contract: the Trigger Press costs 0 in its window, printed cost if held', () => {
    let state = withEnergy(0);
    state = seedCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    state = revealCalibrationPlayer(state, 'home', 'park', 'MID');
    const press = tactical(state, 'home', 'trigger_press');

    expect(previewCalibrationTacticalCost(state, 'home', press, 'ATT')).toBe(0);
    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: press.id, zone: 'ATT' }]);
    expect(window.plays[0]?.cost).toBe(0);
    expect(window.state.teams.home.energy).toBe(0);
    expect(window.state.triggerPress.home.ATT).toBe(true);

    let held = advance(state);
    const heldPress = tactical(held, 'home', 'trigger_press');
    expect(previewCalibrationTacticalCost(held, 'home', heldPress, 'ATT')).toBe(1);
    held = playCalibrationTactical(held, 'home', heldPress.id, 'ATT');
    expect(held.teams.home.energy).toBe(8);
  });

  it('4. expires a "this period" discount at period end', () => {
    let state = withEnergy(9);
    state = revealCalibrationPlayer(state, 'home', 'park', 'MID');
    const press = tactical(state, 'home', 'trigger_press');
    expect(press.metadata.freeThroughPeriod).toBe(1);
    expect(previewCalibrationTacticalCost(state, 'home', press, 'ATT')).toBe(0);

    const nextPeriod = advance(state);
    const heldPress = tactical(nextPeriod, 'home', 'trigger_press');
    expect(previewCalibrationTacticalCost(nextPeriod, 'home', heldPress, 'ATT')).toBe(1);
  });

  it('5. lets an unplayed generated Tactical carry over to a later commitment phase at printed cost', () => {
    let state = withEnergy(9);
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    const cross = tactical(state, 'home', 'cross');
    expect(isCalibrationTacticalAvailable(state, cross)).toBe(false);

    state = advance(state);
    const held = tactical(state, 'home', 'cross');
    expect(held.id).toBe(cross.id);
    expect(isCalibrationTacticalAvailable(state, held)).toBe(true);
    expect(previewCalibrationTacticalCost(state, 'home', held, 'ATT')).toBe(1);
    const played = playCalibrationTactical(state, 'home', held.id, 'ATT');
    expect(played.teams.home.energy).toBe(8);
    expect(played.tacticalResolutions.at(-1)).toMatchObject({ type: 'cross', window: false, cancelled: false });
  });

  it('6. refuses a window play whose cost exceeds remaining Energy without losing the card', () => {
    let state = withEnergy(0);
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    const cross = tactical(state, 'home', 'cross');

    expect(() => resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: cross.id, zone: 'ATT' }])).toThrow('Not enough energy');
    expect(calibrationHandTacticals(state, 'home').some((card) => card.id === cross.id)).toBe(true);
    expect(planV8CalibrationWindow(state, 'home')).toHaveLength(0);

    // The card is not lost: it carries over and is commitment-playable next period.
    const next = advance(state);
    expect(isCalibrationTacticalAvailable(next, tactical(next, 'home', 'cross'))).toBe(true);
  });

  it('7. resolves the whole window simultaneously: a window Offside Trap cancels a window Through Ball in either order', () => {
    let base = withEnergy(9);
    base = revealCalibrationPlayer(base, 'home', 'baresi', 'DEF');
    base = revealCalibrationPlayer(base, 'away', 'valderrama', 'MID');
    const trap = tactical(base, 'home', 'offside_trap');
    const throughBall = tactical(base, 'away', 'through_ball');
    const trapFirst = [
      { side: 'home' as const, cardId: trap.id, zone: 'DEF' as const },
      { side: 'away' as const, cardId: throughBall.id, zone: 'ATT' as const },
    ];
    const trapLast = [...trapFirst].reverse();

    for (const plays of [trapFirst, trapLast]) {
      const window = resolveGeneratedTacticalWindow(base, plays);
      const resolution = window.state.tacticalResolutions.find((item) => item.type === 'through_ball');
      expect(resolution).toMatchObject({ cancelled: true, attack: 0, window: true });
      // Cancellation lands before any margin is read: the Through Ball adds no zone attack,
      // and Baresi's successful-trap rider is credited.
      expect(window.state.tacticalAttack.away.ATT).toBe(0);
      expect(window.state.zoneDefenceBonus.home.DEF).toBe(2);
    }
  });

  it('8. lets a same-period specialist modify a same-period generated Tactical, with window-flagged chain attribution', () => {
    let state = withEnergy(9);
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    state = revealCalibrationPlayer(state, 'home', 'di-maria', 'MID');
    const cross = tactical(state, 'home', 'cross');
    expect(cross.attModifier).toBe(5); // BEND IT +2, then RABONA +3 on the in-hand Cross

    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: cross.id, zone: 'ATT' }]);
    expect(window.state.tacticalResolutions.at(-1)).toMatchObject({ type: 'cross', attack: 7, window: true });

    const telemetry = captureV8CalibrationPeriodTelemetry({
      state: window.state,
      homeGoals: 0,
      awayGoals: 0,
      homeAttack: 0,
      homeDefence: 0,
      awayAttack: 0,
      awayDefence: 0,
      plays: window.plays.map((play) => ({ kind: 'tactical' as const, side: play.side, card: play.card, window: true, cost: play.cost })),
    });
    expect(telemetry.home.majorChains).toContain('BEND IT → Cross = +7 ATT [window]');
    expect(telemetry.home.windowTacticalsPlayed).toBe(1);
    expect(telemetry.home.windowEnergySpent).toBe(1);
    expect(telemetry.home.windowTacticalAtt).toBe(7);
    expect(telemetry.home.windowCancellations).toBe(0);
  });

  it('9. keeps a Tactical generated in Pn out of the Pn+1 window', () => {
    let state = withEnergy(9);
    state = revealCalibrationPlayer(state, 'home', 'beckham', 'MID');
    expect(windowEligibleCalibrationTacticals(state, 'home')).toHaveLength(1);

    state = advance(state);
    const held = tactical(state, 'home', 'cross');
    expect(windowEligibleCalibrationTacticals(state, 'home')).toHaveLength(0);
    expect(() => resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: held.id, zone: 'ATT' }]))
      .toThrow('not window-eligible');
  });

  it('10. reports window plays as their own labelled recap step', () => {
    let state = withEnergy(9);
    state = revealCalibrationPlayer(state, 'home', 'park', 'MID');
    const press = tactical(state, 'home', 'trigger_press');

    const window = resolveGeneratedTacticalWindow(state, [{ side: 'home', cardId: press.id, zone: 'ATT' }]);

    const event = window.state.events.find((item) => item.type === 'window_tactical_played');
    expect(event?.text).toBe('HOME Post-reveal: Trigger Press (0, THREE LUNGS) → ATT.');
    expect(event?.period).toBe(1);
  });
});
