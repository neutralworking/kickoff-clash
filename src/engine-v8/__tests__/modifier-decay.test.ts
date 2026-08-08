import { describe, expect, it } from 'vitest';
import {
  applyCalibrationDecayModifier,
  calibrationActionText,
  calibrationHandPlayersWithDecayText,
  calibrationModifierBadges,
  calibrationRuntimeId,
  createV8CalibrationState,
  currentCalibrationAttack,
  currentCalibrationDefence,
  endV8CalibrationPeriodWithDecay,
  revealCalibrationPlayerWithDecay,
  seedCalibrationPlayer,
} from '../calibration-engine';
import { getV8CalibrationPlayer } from '../calibration-cards';

describe('V8 action decay', () => {
  it('Sinclair ARRIVE UNMARKED decays +4 → +3 → +2 after scoring windows', () => {
    let state = createV8CalibrationState({ homeEnergy: 99, awayEnergy: 99 });
    state = revealCalibrationPlayerWithDecay(state, 'home', 'sinclair', 'ATT');
    const runtimeId = calibrationRuntimeId('home', 'sinclair');
    const baseAttack = getV8CalibrationPlayer('sinclair').printedAttack;

    expect(currentCalibrationAttack(state, runtimeId)).toBe(baseAttack + 4);
    expect(calibrationModifierBadges(state, runtimeId)).toContain('+4 ATT ↓1 ATT/P');

    state = endV8CalibrationPeriodWithDecay(state);
    expect(currentCalibrationAttack(state, runtimeId)).toBe(baseAttack + 3);
    expect(calibrationModifierBadges(state, runtimeId)).toContain('+3 ATT ↓1 ATT/P');
    expect(state.events.some((event) => event.text.includes('ARRIVE UNMARKED fades: +4 ATT → +3 ATT'))).toBe(true);

    state = endV8CalibrationPeriodWithDecay(state);
    expect(currentCalibrationAttack(state, runtimeId)).toBe(baseAttack + 2);
  });

  it('fixed-duration modifiers remain at full strength, then expire', () => {
    let state = createV8CalibrationState({ homeEnergy: 99, awayEnergy: 99 });
    state = seedCalibrationPlayer(state, 'home', 'wambach', 'ATT');
    const runtimeId = calibrationRuntimeId('home', 'wambach');
    const baseDefence = getV8CalibrationPlayer('wambach').printedDefence;

    state = applyCalibrationDecayModifier(state, runtimeId, {
      defence: 3,
      lifetime: 'duration',
      durationPeriods: 2,
      source: 'CALIBRATION SHIELD',
    });

    expect(currentCalibrationDefence(state, runtimeId)).toBe(baseDefence + 3);
    expect(calibrationModifierBadges(state, runtimeId)).toContain('+3 DEF · 2P');

    state = endV8CalibrationPeriodWithDecay(state);
    expect(currentCalibrationDefence(state, runtimeId)).toBe(baseDefence + 3);
    expect(calibrationModifierBadges(state, runtimeId)).toContain('+3 DEF · 1P');

    state = endV8CalibrationPeriodWithDecay(state);
    expect(currentCalibrationDefence(state, runtimeId)).toBe(baseDefence);
    expect(state.events.some((event) => event.text.includes('CALIBRATION SHIELD expires'))).toBe(true);
  });

  it('shows the decay experiment in Sinclair hand text without mutating tracker-backed card data', () => {
    const card = getV8CalibrationPlayer('sinclair');
    expect(card.actionText).toBe('On Reveal: If this is your first player here, she gains +4 ATT.');
    expect(calibrationActionText(card)).toContain('loses 1 ATT at the end of each period');

    const state = createV8CalibrationState({ homeDeck: ['sinclair'] });
    expect(calibrationHandPlayersWithDecayText(state, 'home')[0]?.actionText).toContain('loses 1 ATT at the end of each period');
  });
});
