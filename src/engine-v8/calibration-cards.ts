export * from './calibration-cards-base';

import {
  V8_CALIBRATION_PLAYERS as BASE_CALIBRATION_PLAYERS,
  type V8CalibrationPlayerCard,
} from './calibration-cards-base';

export const NEYMAR_RAINBOW_FLICK_TEXT = 'On Reveal: If an opposing defender is here, add a Penalty to your hand.';

function withV8CalibrationOverrides(player: V8CalibrationPlayerCard): V8CalibrationPlayerCard {
  if (player.id !== 'neymar') return player;
  return {
    ...player,
    actionText: NEYMAR_RAINBOW_FLICK_TEXT,
    actions: (player.actions ?? []).map((action) => (
      action.id === 'neymar_rainbow_flick'
        ? { ...action, text: NEYMAR_RAINBOW_FLICK_TEXT }
        : action
    )),
  };
}

/**
 * Calibration-only card overrides that have passed package-level sensitivity testing.
 * Source tracker / reconciliation values remain untouched.
 */
export const V8_CALIBRATION_PLAYERS: readonly V8CalibrationPlayerCard[] = BASE_CALIBRATION_PLAYERS.map(withV8CalibrationOverrides);

export const V8_CALIBRATION_PLAYER_BY_ID = new Map(V8_CALIBRATION_PLAYERS.map((player) => [player.id, player]));

export function getV8CalibrationPlayer(id: string): V8CalibrationPlayerCard {
  const found = V8_CALIBRATION_PLAYER_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 calibration player: ${id}`);
  return found;
}
