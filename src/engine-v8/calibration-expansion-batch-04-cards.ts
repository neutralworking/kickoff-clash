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
    actions: [{ id: args.actionKey, name: args.actionName, timing: 'triggered', text: args.actionText }],
    statSource: 'kc_reconciliation',
    costSource: 'kc_reconciliation',
    usesCalibrationStatFallback: false,
    usesCalibrationCostFallback: false,
  };
}

/**
 * Batch 04 slice A keeps Tracker Action identity/text while using existing reconciliation values
 * for calibration-only ATT/DEF/Cost. No source-of-truth database values are changed here.
 */
export const V8_BATCH_04_SLICE_A_PLAYERS: readonly V8CalibrationPlayerCard[] = [
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

// The expansion registry is intentionally mutable at runtime: earlier slices are declared in
// calibration-cards.ts, while this isolated slice can be loaded without rewriting that large file.
const mutablePlayers = V8_CALIBRATION_PLAYERS as V8CalibrationPlayerCard[];
for (const player of V8_BATCH_04_SLICE_A_PLAYERS) {
  if (V8_CALIBRATION_PLAYER_BY_ID.has(player.id)) continue;
  mutablePlayers.push(player);
  V8_CALIBRATION_PLAYER_BY_ID.set(player.id, player);
}
