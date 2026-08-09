import {
  V8_CALIBRATION_PLAYERS,
  V8_CALIBRATION_PLAYER_BY_ID,
  type V8CalibrationPlayerCard,
} from './calibration-cards';

function batch07Card(args: {
  id: string;
  realName: string;
  matchName: string;
  fullCardName: string;
  trackerRow: number;
  sourceCardId?: string;
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
    statSource: 'kc_reconciliation',
    costSource: 'kc_reconciliation',
    usesCalibrationStatFallback: false,
    usesCalibrationCostFallback: false,
  };
}

/** Batch 07 runtime cards. Nadine Angerer remains audit-only until V8 has a real save event. */
export const V8_BATCH_07_PLAYERS: readonly V8CalibrationPlayerCard[] = [
  batch07Card({
    id: 'achraf-hakimi', realName: 'Achraf Hakimi', matchName: 'Hockami', fullCardName: 'Achraf Hockami', trackerRow: 7,
    position: 'FB / WB', naturalZones: ['DEF', 'MID'], cost: 3, attack: 4, defence: 6,
    actionKey: 'hakimi_bomb_on', actionName: 'BOMB ON', timing: 'ongoing',
    actionText: 'Ongoing: While this is in MID and you are losing the match, your first Through Ball or Long Shot played in ATT each period becomes a Cross before it resolves.',
  }),
  batch07Card({
    id: 'annike-krahn', realName: 'Annike Krahn', matchName: 'Krin', fullCardName: 'Annike Krin', trackerRow: 25,
    position: 'CB', naturalZones: ['DEF'], cost: 3, attack: 1, defence: 10,
    actionKey: 'krahn_step_across', actionName: 'STEP ACROSS', timing: 'triggered',
    actionText: 'The first opposing Through Ball played in ATT each period becomes a Cross before it resolves.',
  }),
  batch07Card({
    id: 'nemanja-vidic', realName: 'Nemanja Vidić', matchName: 'Vedik', fullCardName: 'Nemanja Vedik', trackerRow: 190, sourceCardId: 'KC-030',
    position: 'CB', naturalZones: ['DEF'], cost: 3, attack: 1, defence: 10,
    actionKey: 'vidic_partnership', actionName: 'PARTNERSHIP', timing: 'ongoing',
    actionText: 'Ongoing: +2 DEF. +5 instead while Rio Ferdinand is deployed.',
  }),
  batch07Card({
    id: 'rio-ferdinand', realName: 'Rio Ferdinand', matchName: 'Ferndale', fullCardName: 'Rio Ferndale', trackerRow: 221, sourceCardId: 'KC-031',
    position: 'CB', naturalZones: ['DEF'], cost: 3, attack: 1, defence: 10,
    actionKey: 'ferdinand_partnership', actionName: 'PARTNERSHIP', timing: 'ongoing',
    actionText: 'Ongoing: +2 ATT. +5 instead while Nemanja Vidić is deployed.',
  }),
  batch07Card({
    id: 'sol-campbell', realName: 'Sol Campbell', matchName: 'Crumble', fullCardName: 'Sal Crumble', trackerRow: 251, sourceCardId: 'KC-029',
    position: 'CB', naturalZones: ['DEF'], cost: 3, attack: 1, defence: 10,
    actionKey: 'campbell_marshal', actionName: 'MARSHAL', timing: 'ongoing',
    actionText: 'Ongoing: +3 DEF to this zone. Your other wide players have −2 ATT.',
  }),
  batch07Card({
    id: 'zlatan-ibrahimovic', realName: 'Zlatan Ibrahimović', matchName: 'Abrahamic', fullCardName: 'Zlatan Abrahamic', trackerRow: 278, sourceCardId: 'KC-027',
    position: 'CF', naturalZones: ['ATT'], cost: 4, attack: 11, defence: 1,
    actionKey: 'zlatan_alpha', actionName: 'ALPHA', timing: 'ongoing',
    actionText: 'Ongoing: +6 ATT. Your other forwards have −2 ATT.',
  }),
  batch07Card({
    id: 'roy-keane', realName: 'Roy Keane', matchName: 'Kane', fullCardName: 'Ray Kane', trackerRow: 235, sourceCardId: 'KC-001',
    position: 'DM / CM', naturalZones: ['DEF', 'MID'], cost: 3, attack: 4, defence: 6,
    actionKey: 'keane_reducer', actionName: 'REDUCER', timing: 'on_reveal',
    actionText: 'On Reveal: Give the highest-ATT opposing forward −5 ATT for the match. End of Period: 50% chance they recover 2 ATT.',
  }),
] as const;

const mutablePlayers = V8_CALIBRATION_PLAYERS as V8CalibrationPlayerCard[];
for (const player of V8_BATCH_07_PLAYERS) {
  if (V8_CALIBRATION_PLAYER_BY_ID.has(player.id)) continue;
  mutablePlayers.push(player);
  V8_CALIBRATION_PLAYER_BY_ID.set(player.id, player);
}
