import {
  V8_CALIBRATION_PLAYERS,
  V8_CALIBRATION_PLAYER_BY_ID,
  type V8CalibrationPlayerCard,
} from './calibration-cards';

function batch05Card(args: {
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
 * Batch 05 playable cards. Values are read from the existing KC reconciliation view; the Card
 * Design Tracker/source database is not mutated by calibration implementation.
 */
export const V8_BATCH_05_PLAYERS: readonly V8CalibrationPlayerCard[] = [
  batch05Card({
    id: 'peter-shilton', realName: 'Peter Shilton', matchName: 'Sheldon', fullCardName: 'Peter Sheldon', trackerRow: 213,
    position: 'GK', naturalZones: ['DEF'], cost: 4, attack: 0, defence: 11,
    actionKey: 'shilton_shut_the_angle', actionName: 'SHUT THE ANGLE', timing: 'ongoing',
    actionText: 'Ongoing: The first opposing Through Ball played in ATT each period has −3 ATT.',
  }),
  batch05Card({
    id: 'paul-mcgrath', realName: 'Paul McGrath', matchName: 'MacGraw', fullCardName: 'Paul MacGraw', trackerRow: 206,
    position: 'CB', naturalZones: ['DEF'], cost: 3, attack: 1, defence: 10,
    actionKey: 'mcgrath_aerial_command', actionName: 'AERIAL COMMAND', timing: 'ongoing',
    actionText: 'Ongoing: The first opposing Cross played in ATT each period has −3 ATT.',
  }),
  batch05Card({
    id: 'roberto-carlos', realName: 'Roberto Carlos', matchName: 'Curler', fullCardName: 'Ruberto Curler', trackerRow: 228,
    position: 'LB / LWB', naturalZones: ['DEF', 'MID'], cost: 3, attack: 4, defence: 6,
    actionKey: 'roberto_carlos_thunderbolt', actionName: 'THUNDERBOLT', timing: 'on_reveal',
    actionText: 'On Reveal: If played in MID, add a Long Shot to your hand with +3 ATT; this loses 3 DEF this period.',
  }),
  batch05Card({
    id: 'tony-adams', realName: 'Tony Adams', matchName: 'Addams', fullCardName: 'Tom Addams', trackerRow: 264,
    position: 'CB', naturalZones: ['DEF'], cost: 3, attack: 1, defence: 10,
    actionKey: 'adams_skipper', actionName: 'SKIPPER', timing: 'ongoing',
    actionText: 'Ongoing: Your other defenders have +2 DEF.',
  }),
  batch05Card({
    id: 'ole-gunnar-solskjaer', realName: 'Ole Gunnar Solskjær', matchName: 'Solskjæo', fullCardName: 'Ole Gunnar Solskjæo', trackerRow: 196,
    position: 'CF', naturalZones: ['ATT'], cost: 4, attack: 11, defence: 1,
    actionKey: 'solskjaer_supersub', actionName: 'SUPERSUB', timing: 'on_reveal',
    actionText: 'On Reveal: If played in P3 or P4 while losing, gain +4 ATT this period and add a Through Ball to your hand.',
  }),
  batch05Card({
    id: 'ronaldinho', realName: 'Ronaldinho', matchName: 'Reinaldinho', fullCardName: 'Reinaldinho', trackerRow: 232,
    position: 'WF / AM', naturalZones: ['MID', 'ATT'], cost: 4, attack: 10, defence: 1,
    actionKey: 'ronaldinho_showboat', actionName: 'SHOWBOAT', timing: 'on_reveal',
    actionText: 'On Reveal: 50%: +6 ATT this period. Otherwise −2 ATT this period.',
  }),
  batch05Card({
    id: 'paul-scholes', realName: 'Paul Scholes', matchName: 'Ssholes', fullCardName: 'Paul Ssholes', trackerRow: 207,
    position: 'CM', naturalZones: ['MID'], cost: 3, attack: 5, defence: 5,
    actionKey: 'scholes_hollywood_ball', actionName: 'HOLLYWOOD BALL', timing: 'on_reveal',
    actionText: 'On Reveal: If played in MID, add a Cross to your hand. It costs 0 this period.',
  }),
  batch05Card({
    id: 'shunsuke-nakamura', realName: 'Shunsuke Nakamura', matchName: 'Nakamuran', fullCardName: 'Shunsuke Nakamuran', trackerRow: 249,
    position: 'AM / CM', naturalZones: ['MID'], cost: 4, attack: 8, defence: 3,
    actionKey: 'nakamura_dead_ball_artist', actionName: 'DEAD BALL ARTIST', timing: 'on_reveal',
    actionText: 'On Reveal: Add a Long Shot and a Corner to your hand. The first of those you play this period has +2 ATT.',
  }),
] as const;

/** Compatibility alias for the original first Batch 05 runtime slice. */
export const V8_BATCH_05_SLICE_A_PLAYERS = V8_BATCH_05_PLAYERS.slice(0, 4);

const mutablePlayers = V8_CALIBRATION_PLAYERS as V8CalibrationPlayerCard[];
for (const player of V8_BATCH_05_PLAYERS) {
  if (V8_CALIBRATION_PLAYER_BY_ID.has(player.id)) continue;
  mutablePlayers.push(player);
  V8_CALIBRATION_PLAYER_BY_ID.set(player.id, player);
}
