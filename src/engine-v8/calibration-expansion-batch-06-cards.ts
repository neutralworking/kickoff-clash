import {
  V8_CALIBRATION_PLAYERS,
  V8_CALIBRATION_PLAYER_BY_ID,
  type V8CalibrationPlayerCard,
} from './calibration-cards';

function batch06Card(args: {
  id: string;
  realName: string;
  matchName: string;
  fullCardName: string;
  trackerRow: number;
  position: string;
  naturalZones: V8CalibrationPlayerCard['naturalZones'];
  cost: number;
  attack: number;
  defence: number;
  actionKey: string;
  actionName: string;
  actionText: string;
  timing: 'on_reveal' | 'ongoing' | 'triggered';
}): V8CalibrationPlayerCard {
  const actionKey = args.actionKey as V8CalibrationPlayerCard['actionKey'];
  return {
    id: args.id,
    realName: args.realName,
    matchName: args.matchName,
    fullCardName: args.fullCardName,
    trackerRow: args.trackerRow,
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
    statSource: 'kc_reconciliation',
    costSource: 'kc_reconciliation',
    usesCalibrationStatFallback: false,
    usesCalibrationCostFallback: false,
  };
}

/**
 * Batch 06 runtime cards. ATT / DEF / Cost come from the KC reconciliation view; tracker names and
 * Action identity remain authoritative when the older database Action text differs.
 */
export const V8_BATCH_06_PLAYERS: readonly V8CalibrationPlayerCard[] = [
  batch06Card({
    id: 'carli-lloyd', realName: 'Carli Lloyd', matchName: 'Loud', fullCardName: 'Carli Loud', trackerRow: 40,
    position: 'CM / AM', naturalZones: ['MID', 'ATT'], cost: 3, attack: 6, defence: 4,
    actionKey: 'lloyd_halfway_hit', actionName: 'HALFWAY HIT', timing: 'ongoing',
    actionText: 'Ongoing: Long Shots played here have +4 ATT. Your first Long Shot here each match costs 0.',
  }),
  batch06Card({
    id: 'carlos-valderrama', realName: 'Carlos Valderrama', matchName: 'Walderini', fullCardName: 'Carlos Walderini', trackerRow: 41,
    position: 'AM', naturalZones: ['MID', 'ATT'], cost: 4, attack: 9, defence: 2,
    actionKey: 'valderrama_pause_and_slip', actionName: 'PAUSE AND SLIP', timing: 'on_reveal',
    actionText: 'On Reveal: Add a Through Ball to your hand. If you already have a player in ATT, give it +2 ATT.',
  }),
  batch06Card({
    id: 'christian-eriksen', realName: 'Christian Eriksen', matchName: 'Erakson', fullCardName: 'Christian Erakson', trackerRow: 45,
    position: 'AM / CM', naturalZones: ['MID', 'ATT'], cost: 4, attack: 8, defence: 3,
    actionKey: 'eriksen_whipped_delivery', actionName: 'WHIPPED DELIVERY', timing: 'on_reveal',
    actionText: 'On Reveal: Add a Corner to your hand. Give it +1 ATT for each CB you have in ATT.',
  }),
  batch06Card({
    id: 'caroline-graham-hansen', realName: 'Caroline Graham Hansen', matchName: 'Gram Hyland', fullCardName: 'Caroline Gram Hyland', trackerRow: 42,
    position: 'WF / AM', naturalZones: ['MID', 'ATT'], cost: 4, attack: 10, defence: 1,
    actionKey: 'hansen_one_on_one', actionName: 'ONE ON ONE', timing: 'ongoing',
    actionText: 'The first opposing defender Action each period that targets this player is ignored; gain +2 ATT this period.',
  }),
  batch06Card({
    id: 'jari-litmanen', realName: 'Jari Litmanen', matchName: 'Latinen', fullCardName: 'Jari Latinen', trackerRow: 135,
    position: 'AM / SS', naturalZones: ['MID', 'ATT'], cost: 4, attack: 9, defence: 2,
    actionKey: 'litmanen_killer_pass', actionName: 'KILLER PASS', timing: 'triggered',
    actionText: 'End of Period: If you won MID, add a Through Ball to your hand. Give it +1 ATT.',
  }),
  batch06Card({
    id: 'keira-walsh', realName: 'Keira Walsh', matchName: 'Walsh', fullCardName: 'Keira Walsh', trackerRow: 151,
    position: 'DM / CM', naturalZones: ['DEF', 'MID'], cost: 3, attack: 4, defence: 7,
    actionKey: 'walsh_beat_the_press', actionName: 'BEAT THE PRESS', timing: 'ongoing',
    actionText: 'Ongoing: The first opposing Trigger Press each period adds a Through Ball to your hand with +2 ATT.',
  }),
  batch06Card({
    id: 'rory-delap', realName: 'Rory Delap', matchName: 'Duloop', fullCardName: 'Ronnie Duloop', trackerRow: 234,
    position: 'CM / WM', naturalZones: ['MID'], cost: 3, attack: 5, defence: 5,
    actionKey: 'delap_hurler', actionName: 'HURLER', timing: 'triggered',
    actionText: 'End of Period (P1–P3): Add a Long Throw to your hand.',
  }),
  batch06Card({
    id: 'arjen-robben', realName: 'Arjen Robben', matchName: 'Robbeo', fullCardName: 'Arjen Robbeo', trackerRow: 27,
    position: 'WF', naturalZones: ['ATT'], cost: 4, attack: 10, defence: 1,
    actionKey: 'robben_cut_inside', actionName: 'CUT INSIDE', timing: 'ongoing',
    actionText: 'Ongoing: Your first Cross played in ATT each period becomes a Long Shot before it resolves.',
  }),
] as const;

/** Compatibility alias for the original Batch 06 Slice A registration cohort. */
export const V8_BATCH_06_SLICE_A_PLAYERS = V8_BATCH_06_PLAYERS.slice(0, 5);

const mutablePlayers = V8_CALIBRATION_PLAYERS as V8CalibrationPlayerCard[];
for (const player of V8_BATCH_06_PLAYERS) {
  if (V8_CALIBRATION_PLAYER_BY_ID.has(player.id)) continue;
  mutablePlayers.push(player);
  V8_CALIBRATION_PLAYER_BY_ID.set(player.id, player);
}
