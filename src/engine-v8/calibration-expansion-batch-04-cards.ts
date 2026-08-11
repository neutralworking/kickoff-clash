import {
  V8_CALIBRATION_PLAYERS,
  V8_CALIBRATION_PLAYER_BY_ID,
  type V8CalibrationPlayerCard,
} from './calibration-cards';

function batch04Card(args: {
  id: string;
  realName: string;
  matchName: string;
  trackerRow: number;
  position: string;
  naturalZones: V8CalibrationPlayerCard['naturalZones'];
  cost: number;
  attack: number;
  defence: number;
  actionKey: string;
  actionName: string;
  actionText: string;
  timing?: 'on_reveal' | 'ongoing' | 'triggered' | 'end_of_period';
  moveable?: boolean;
}): V8CalibrationPlayerCard {
  const actionKey = args.actionKey as V8CalibrationPlayerCard['actionKey'];
  return {
    id: args.id,
    realName: args.realName,
    matchName: args.matchName,
    fullCardName: args.matchName,
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
    actions: [{ id: args.actionKey, name: args.actionName, timing: args.timing ?? 'triggered', text: args.actionText }],
    statuses: args.moveable ? ['moveable'] : undefined,
    statSource: 'kc_reconciliation',
    costSource: 'kc_reconciliation',
    usesCalibrationStatFallback: false,
    usesCalibrationCostFallback: false,
  };
}

/**
 * Batch 04 keeps Tracker Action identity/text while using existing reconciliation values for
 * calibration-only ATT/DEF/Cost. No source-of-truth database values are changed here.
 */
export const V8_BATCH_04_PLAYERS: readonly V8CalibrationPlayerCard[] = [
  batch04Card({
    id: 'gordon-banks', realName: 'Gordon Banks', matchName: 'Gordon Banko', trackerRow: 112,
    position: 'GK', naturalZones: ['DEF'], cost: 4, attack: 0, defence: 11,
    actionKey: 'banks_impossible_save', actionName: 'IMPOSSIBLE SAVE',
    actionText: 'Once per match, the first opposing Chance in ATT with 4 or more ATT is cancelled.',
  }),
  batch04Card({
    id: 'john-terry', realName: 'John Terry', matchName: 'John Tery', trackerRow: 143,
    position: 'CB', naturalZones: ['DEF'], cost: 3, attack: 1, defence: 10,
    actionKey: 'terry_head_where_it_hurts', actionName: 'HEAD WHERE IT HURTS',
    actionText: 'Once per match, when a second opposing Chance in ATT would resolve in the same period, cancel it; then this loses 3 DEF.',
  }),
  batch04Card({
    id: 'bryan-robson', realName: 'Bryan Robson', matchName: 'Bryan Robsen', trackerRow: 36,
    position: 'CM', naturalZones: ['MID'], cost: 3, attack: 5, defence: 5,
    actionKey: 'robson_captain_marvel', actionName: 'CAPTAIN MARVEL', timing: 'end_of_period',
    actionText: 'End of Period: If you are losing the match, gain +2 ATT and +2 DEF for the rest of the match.',
  }),
  batch04Card({
    id: 'chris-waddle', realName: 'Chris Waddle', matchName: 'Chris Waddlen', trackerRow: 44,
    position: 'WF / AM', naturalZones: ['MID', 'ATT'], cost: 4, attack: 10, defence: 1,
    actionKey: 'waddle_drop_the_shoulder', actionName: 'DROP THE SHOULDER', moveable: true,
    actionText: 'Moveable once per period between MID and ATT. After this moves, your next Chance in the destination this period becomes a Cross before it resolves.',
  }),
  batch04Card({
    id: 'alan-shearer', realName: 'Alan Shearer', matchName: 'Alan Sheareo', trackerRow: 10,
    position: 'CF', naturalZones: ['ATT'], cost: 4, attack: 11, defence: 1,
    actionKey: 'shearer_laces_through_it', actionName: 'LACES THROUGH IT',
    actionText: 'Your first Chance in ATT each period has +3 ATT, but it cannot be made uncancellable.',
  }),
  batch04Card({
    id: 'alexandra-popp', realName: 'Alexandra Popp', matchName: 'Alexandra Popo', trackerRow: 14,
    position: 'CF / AM', naturalZones: ['MID', 'ATT'], cost: 3, attack: 10, defence: 1,
    actionKey: 'popp_crash_the_box', actionName: 'CRASH THE BOX',
    actionText: 'After your first Cross is played in ATT each period, this gains +3 ATT this period.',
  }),
  batch04Card({
    id: 'ali-daei', realName: 'Ali Daei', matchName: 'Ali Daein', trackerRow: 17,
    position: 'CF', naturalZones: ['ATT'], cost: 4, attack: 11, defence: 1,
    actionKey: 'daei_power_header', actionName: 'POWER HEADER',
    actionText: 'Your first Cross played here each period has +2 ATT and its ATT cannot be reduced.',
  }),
  batch04Card({
    id: 'ellen-white', realName: 'Ellen White', matchName: 'Ellen Whiten', trackerRow: 75,
    position: 'CF', naturalZones: ['ATT'], cost: 4, attack: 11, defence: 1,
    actionKey: 'white_first_time_lob', actionName: 'FIRST-TIME LOB',
    actionText: 'Once per match, your first Through Ball played here becomes a Long Shot and gains +3 ATT before it resolves.',
  }),
] as const;

/** Backwards-compatible slice alias retained for the first Batch 04 handoff. */
export const V8_BATCH_04_SLICE_A_PLAYERS = V8_BATCH_04_PLAYERS.filter((player) =>
  ['gordon-banks', 'john-terry', 'alexandra-popp', 'ali-daei', 'ellen-white'].includes(player.id)
);

// The expansion registry is intentionally mutable at runtime: earlier slices are declared in
// calibration-cards.ts, while this isolated slice can be loaded without rewriting that large file.
const mutablePlayers = V8_CALIBRATION_PLAYERS as V8CalibrationPlayerCard[];
for (const player of V8_BATCH_04_PLAYERS) {
  if (V8_CALIBRATION_PLAYER_BY_ID.has(player.id)) continue;
  mutablePlayers.push(player);
  V8_CALIBRATION_PLAYER_BY_ID.set(player.id, player);
}
