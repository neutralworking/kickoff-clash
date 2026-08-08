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

function expansionCard(args: {
  id: string;
  realName: string;
  matchName: string;
  fullCardName: string;
  trackerRow: number;
  sourceCardId?: string;
  position: string;
  naturalZones: V8CalibrationPlayerCard['naturalZones'];
  cost: number;
  costSource: V8CalibrationPlayerCard['costSource'];
  attack: number;
  defence: number;
  actionKey: string;
  actionName: string;
  timing: NonNullable<V8CalibrationPlayerCard['actions']>[number]['timing'];
  actionText: string;
  moveable?: boolean;
}): V8CalibrationPlayerCard {
  const actionKey = args.actionKey as V8CalibrationPlayerCard['actionKey'];
  return {
    id: args.id,
    realName: args.realName,
    matchName: args.matchName,
    fullCardName: args.fullCardName,
    trackerRow: args.trackerRow,
    sourceCardId: args.sourceCardId,
    name: args.realName,
    position: args.position,
    naturalZones: args.naturalZones,
    cost: args.cost,
    printedAttack: args.attack,
    printedDefence: args.defence,
    actionKey,
    actionName: args.actionName,
    actionText: args.actionText,
    actions: [{ id: args.actionKey, name: args.actionName, timing: args.timing, text: args.actionText }],
    statuses: args.moveable ? ['moveable'] : undefined,
    statSource: 'kc_reconciliation',
    costSource: args.costSource,
    usesCalibrationStatFallback: false,
    usesCalibrationCostFallback: false,
  };
}

/** First playable slice from the 40-card expansion audit. */
const V8_EXPANSION_PLAYERS: readonly V8CalibrationPlayerCard[] = [
  expansionCard({
    id: 'abedi-pele', realName: 'Abedi Pelé', matchName: 'Pelo', fullCardName: 'Abedi Pelo', trackerRow: 6,
    position: 'AM / WF', naturalZones: ['MID', 'ATT'], cost: 3, costSource: 'tracker', attack: 9, defence: 2,
    actionKey: 'abedi_jinking_run', actionName: 'JINKING RUN', timing: 'triggered',
    actionText: 'Moveable once per match. When this moves from MID to ATT, it gains +4 ATT.', moveable: true,
  }),
  expansionCard({
    id: 'di-stefano', realName: 'Alfredo Di Stéfano', matchName: 'De Stefani', fullCardName: 'Alfredo De Stefani', trackerRow: 16,
    position: 'CF / AM', naturalZones: ['MID', 'ATT'], cost: 6, costSource: 'tracker', attack: 10, defence: 1,
    actionKey: 'di_stefano_end_to_end_run', actionName: 'END-TO-END RUN', timing: 'ongoing',
    actionText: 'Ongoing: While losing, +3 ATT. While winning, +3 DEF. While level, +1 ATT and +1 DEF.',
  }),
  expansionCard({
    id: 'puyol', realName: 'Carles Puyol', matchName: 'Poya', fullCardName: 'Carles Poya', trackerRow: 39, sourceCardId: 'KC-038',
    position: 'CB / RB', naturalZones: ['DEF'], cost: 3, costSource: 'kc_reconciliation', attack: 2, defence: 9,
    actionKey: 'puyol_body_on_the_line', actionName: 'BODY ON THE LINE', timing: 'triggered',
    actionText: 'The first time this match an opposing Chance would resolve here, cancel it; then this loses 3 DEF.',
  }),
  expansionCard({
    id: 'dempsey', realName: 'Clint Dempsey', matchName: 'Dampsy', fullCardName: 'Clint Dampsy', trackerRow: 51,
    position: 'SS / AM', naturalZones: ['MID', 'ATT'], cost: 3, costSource: 'kc_reconciliation', attack: 10, defence: 1,
    actionKey: 'dempsey_cheeky_chip', actionName: 'CHEEKY CHIP', timing: 'on_reveal',
    actionText: 'On Reveal: If you are losing here, gain +5 ATT this period.',
  }),
] as const;

/**
 * Calibration-only card overrides that have passed or are undergoing focused card-quality validation.
 * Source tracker / reconciliation values remain untouched.
 */
export const V8_CALIBRATION_PLAYERS: readonly V8CalibrationPlayerCard[] = [
  ...BASE_CALIBRATION_PLAYERS.map(withV8CalibrationOverrides),
  ...V8_EXPANSION_PLAYERS,
];

export const V8_CALIBRATION_PLAYER_BY_ID = new Map(V8_CALIBRATION_PLAYERS.map((player) => [player.id, player]));

export function getV8CalibrationPlayer(id: string): V8CalibrationPlayerCard {
  const found = V8_CALIBRATION_PLAYER_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 calibration player: ${id}`);
  return found;
}
