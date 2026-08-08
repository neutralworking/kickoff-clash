export * from './calibration-cards-base';

import {
  V8_CALIBRATION_PLAYERS as BASE_CALIBRATION_PLAYERS,
  type V8CalibrationPlayerCard,
} from './calibration-cards-base';

export const NEYMAR_RAINBOW_FLICK_TEXT = 'On Reveal: If an opposing defender is here, add a Penalty to your hand.';
export const GARRINCHA_JOY_OF_THE_PEOPLE_TEXT = 'On Reveal: Give the highest-DEF opposing defender here −2 DEF. If you reduce them, gain +2 ATT this period. If they were already reduced, gain +4 instead.';
export const OKOCHA_STEPOVER_TEXT = 'On Reveal: Give the lowest-DEF opposing defender here −2 DEF and gain +2 ATT this period. If they were already reduced, add a Penalty to your hand.';
export const RONALDO_FLIP_FLAP_TEXT = 'On Reveal: Give the highest-DEF opposing defender here −3 DEF this period.';
export const MAKELELE_ACTION_NAME = 'THE MAKÉLÉLÉ ROLE';

function withV8CalibrationOverrides(player: V8CalibrationPlayerCard): V8CalibrationPlayerCard {
  let actionText: string | undefined;
  let actionName: string | undefined;
  if (player.id === 'neymar') actionText = NEYMAR_RAINBOW_FLICK_TEXT;
  if (player.id === 'garrincha') actionText = GARRINCHA_JOY_OF_THE_PEOPLE_TEXT;
  if (player.id === 'okocha') actionText = OKOCHA_STEPOVER_TEXT;
  if (player.id === 'ronaldo') actionText = RONALDO_FLIP_FLAP_TEXT;
  if (player.id === 'makelele') actionName = MAKELELE_ACTION_NAME;
  if (!actionText && !actionName) return player;

  const resolvedActionText = actionText ?? player.actionText;
  const resolvedActionName = actionName ?? player.actionName;
  return {
    ...player,
    actionName: resolvedActionName,
    actionText: resolvedActionText,
    actions: (player.actions ?? []).map((action) => (
      action.id === player.actionKey
        ? { ...action, name: resolvedActionName, text: resolvedActionText }
        : action
    )),
  };
}

/**
 * Calibration-only card overrides that have passed or are undergoing focused card-quality validation.
 * Source tracker / reconciliation values remain untouched.
 */
export const V8_CALIBRATION_PLAYERS: readonly V8CalibrationPlayerCard[] = BASE_CALIBRATION_PLAYERS.map(withV8CalibrationOverrides);

export const V8_CALIBRATION_PLAYER_BY_ID = new Map(V8_CALIBRATION_PLAYERS.map((player) => [player.id, player]));

export function getV8CalibrationPlayer(id: string): V8CalibrationPlayerCard {
  const found = V8_CALIBRATION_PLAYER_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 calibration player: ${id}`);
  return found;
}
