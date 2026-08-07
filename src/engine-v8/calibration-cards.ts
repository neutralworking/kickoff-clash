import { type V8ActionDefinition, type V8PlayerCard, type V8Zone } from './core';

export type V8CalibrationActionKey =
  | 'wambach_diving_header'
  | 'hegerberg_front_post_dart'
  | 'di_maria_rabona'
  | 'cafu_pendolino'
  | 'beckham_bend_it'
  | 'dzajic_left_foot_whip'
  | 'morgan_curved_run'
  | 'shevchenko_runs_in_behind'
  | 'valderrama_pause_and_slip'
  | 'litmanen_killer_pass'
  | 'charlton_thunderball'
  | 'lloyd_halfway_hit'
  | 'eriksen_whipped_delivery'
  | 'ramos_93rd_minute'
  | 'duff_knock_and_run'
  | 'garrincha_joy_of_the_people'
  | 'okocha_stepover'
  | 'neymar_rainbow_flick'
  | 'ronaldo_flip_flap'
  | 'panenka_chipped_penalty'
  | 'iniesta_la_croqueta'
  | 'bremner_crunching_tackle'
  | 'seedorf_ride_the_tackle'
  | 'makelele_water_carrier'
  | 'gentile_man_marker'
  | 'baresi_step_up'
  | 'park_three_lungs'
  | 'schmeichel_starfish'
  | 'sinclair_arrive_unmarked'
  | 'beckenbauer_der_kaiser';

export type V8CalibrationValueSource = 'tracker' | 'kc_reconciliation' | 'calibration_fallback';

export interface V8CalibrationPlayerCard extends V8PlayerCard {
  realName: string;
  matchName: string;
  fullCardName: string;
  trackerRow: number;
  sourceCardId?: string;
  actionKey: V8CalibrationActionKey;
  actionName: string;
  actionText: string;
  statSource: V8CalibrationValueSource;
  costSource: V8CalibrationValueSource;
  usesCalibrationStatFallback: boolean;
  usesCalibrationCostFallback: boolean;
}

function action(id: string, name: string, timing: V8ActionDefinition['timing'], text: string): V8ActionDefinition {
  return { id, name, timing, text };
}

function card(args: {
  id: string;
  realName: string;
  matchName: string;
  fullCardName: string;
  trackerRow: number;
  sourceCardId?: string;
  position: string;
  naturalZones: readonly V8Zone[];
  cost: number;
  costSource: V8CalibrationValueSource;
  attack: number;
  defence: number;
  statSource?: V8CalibrationValueSource;
  actionKey: V8CalibrationActionKey;
  actionName: string;
  timing: V8ActionDefinition['timing'];
  actionText: string;
  moveable?: boolean;
}): V8CalibrationPlayerCard {
  const statSource = args.statSource ?? 'kc_reconciliation';
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
    actionKey: args.actionKey,
    actionName: args.actionName,
    actionText: args.actionText,
    actions: [action(args.actionKey, args.actionName, args.timing, args.actionText)],
    statuses: args.moveable ? ['moveable'] : undefined,
    statSource,
    costSource: args.costSource,
    usesCalibrationStatFallback: statSource === 'calibration_fallback',
    usesCalibrationCostFallback: args.costSource === 'calibration_fallback',
  };
}

/**
 * Data policy for this 30-card calibration batch:
 * - Card Design Tracker is authoritative for identity, position, Action text and any populated Cost.
 * - The tracker ATT/DEF cells are blank for these rows as of 2026-08-07, so established values from
 *   kc_player_roster_reconciliation_view are used where a player can be reconciled.
 * - Blank tracker Costs likewise use the established KC reconciliation Cost where available.
 * - Makélélé and Gentile have no reconciled KC value yet and remain explicit calibration fallbacks.
 *
 * This is mechanics calibration, not a global balance rewrite. Nothing here writes back to either source.
 */
export const V8_CALIBRATION_PLAYERS: readonly V8CalibrationPlayerCard[] = [
  card({ id: 'wambach', realName: 'Abby Wambach', matchName: 'Whompish', fullCardName: 'Abby Whompish', trackerRow: 5, sourceCardId: 'KC-068', position: 'CF', naturalZones: ['ATT'], cost: 3, costSource: 'tracker', attack: 11, defence: 1, actionKey: 'wambach_diving_header', actionName: 'DIVING HEADER', timing: 'ongoing', actionText: 'Ongoing: Crosses played here have +3 ATT. If this is ATT, +4 instead.' }),
  card({ id: 'hegerberg', realName: 'Ada Hegerberg', matchName: 'Headerbag', fullCardName: 'Ada Headerbag', trackerRow: 8, position: 'CF', naturalZones: ['ATT'], cost: 5, costSource: 'tracker', attack: 11, defence: 1, actionKey: 'hegerberg_front_post_dart', actionName: 'FRONT-POST DART', timing: 'triggered', actionText: 'The first Cross you play here each period has +4 ATT and cannot be cancelled.' }),
  card({ id: 'di-maria', realName: 'Ángel Di María', matchName: 'De Mario', fullCardName: 'Ángel De Mario', trackerRow: 24, position: 'WF / AM', naturalZones: ['MID', 'ATT'], cost: 3, costSource: 'tracker', attack: 10, defence: 1, actionKey: 'di_maria_rabona', actionName: 'RABONA', timing: 'on_reveal', actionText: 'On Reveal: If you have a Cross in your hand, give it +3 ATT. Otherwise, add a Cross to your hand.' }),
  card({ id: 'cafu', realName: 'Cafu', matchName: 'Caffo', fullCardName: 'Caffo', trackerRow: 37, sourceCardId: 'KC-008', position: 'RB / RWB', naturalZones: ['DEF', 'MID'], cost: 3, costSource: 'kc_reconciliation', attack: 4, defence: 6, actionKey: 'cafu_pendolino', actionName: 'PENDOLINO', timing: 'triggered', actionText: 'Moveable once per period. After this moves to a more attacking zone, add a Cross to your hand.', moveable: true }),
  card({ id: 'beckham', realName: 'David Beckham', matchName: 'Backman', fullCardName: 'David Backman', trackerRow: 56, sourceCardId: 'KC-056', position: 'RM / CM', naturalZones: ['MID'], cost: 3, costSource: 'kc_reconciliation', attack: 6, defence: 4, actionKey: 'beckham_bend_it', actionName: 'BEND IT', timing: 'on_reveal', actionText: 'On Reveal: Add a Cross to your hand. Give it +2 ATT.' }),
  card({ id: 'dzajic', realName: 'Dragan Džajić', matchName: 'Dakal', fullCardName: 'Dragan Dakal', trackerRow: 68, position: 'WF', naturalZones: ['ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 10, defence: 1, actionKey: 'dzajic_left_foot_whip', actionName: 'LEFT-FOOT WHIP', timing: 'on_reveal', actionText: 'On Reveal: Add 2 Crosses to your hand.' }),

  card({ id: 'morgan', realName: 'Alex Morgan', matchName: 'Megan', fullCardName: 'Alexa Megan', trackerRow: 13, position: 'CF', naturalZones: ['ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 11, defence: 1, actionKey: 'morgan_curved_run', actionName: 'CURVED RUN', timing: 'ongoing', actionText: 'Ongoing: Through Balls played here cannot be cancelled. The first each period has +1 ATT.' }),
  card({ id: 'shevchenko', realName: 'Andriy Shevchenko', matchName: 'Slavshinka', fullCardName: 'Andriy Slavshinka', trackerRow: 21, sourceCardId: 'KC-079', position: 'CF', naturalZones: ['ATT'], cost: 4, costSource: 'tracker', attack: 11, defence: 1, actionKey: 'shevchenko_runs_in_behind', actionName: 'RUNS IN BEHIND', timing: 'triggered', actionText: 'The first Through Ball you play here each period has +4 ATT.' }),
  card({ id: 'valderrama', realName: 'Carlos Valderrama', matchName: 'Walderini', fullCardName: 'Carlos Walderini', trackerRow: 41, position: 'AM', naturalZones: ['MID'], cost: 4, costSource: 'kc_reconciliation', attack: 9, defence: 2, actionKey: 'valderrama_pause_and_slip', actionName: 'PAUSE AND SLIP', timing: 'on_reveal', actionText: 'On Reveal: Add a Through Ball to your hand. If you already have a player in ATT, give it +2 ATT.' }),
  card({ id: 'litmanen', realName: 'Jari Litmanen', matchName: 'Latinen', fullCardName: 'Jari Latinen', trackerRow: 135, position: 'AM / SS', naturalZones: ['MID', 'ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 9, defence: 2, actionKey: 'litmanen_killer_pass', actionName: 'KILLER PASS', timing: 'end_of_period', actionText: 'End of Period: If you won MID, add a Through Ball to your hand. Give it +1 ATT.' }),

  card({ id: 'charlton', realName: 'Bobby Charlton', matchName: 'Carlton', fullCardName: 'Bobby Carlton', trackerRow: 32, position: 'AM / CM', naturalZones: ['MID'], cost: 4, costSource: 'tracker', attack: 8, defence: 3, actionKey: 'charlton_thunderball', actionName: 'THUNDERBALL', timing: 'on_reveal', actionText: 'On Reveal: Add a Long Shot to your hand. It has +2 ATT if played from MID.' }),
  card({ id: 'lloyd', realName: 'Carli Lloyd', matchName: 'Loud', fullCardName: 'Carli Loud', trackerRow: 40, position: 'CM / AM', naturalZones: ['MID'], cost: 3, costSource: 'kc_reconciliation', attack: 6, defence: 4, actionKey: 'lloyd_halfway_hit', actionName: 'HALFWAY HIT', timing: 'ongoing', actionText: 'Ongoing: Long Shots played here have +4 ATT. Your first Long Shot here each match costs 0.' }),

  card({ id: 'eriksen', realName: 'Christian Eriksen', matchName: 'Erakson', fullCardName: 'Christian Erakson', trackerRow: 45, position: 'AM / CM', naturalZones: ['MID'], cost: 4, costSource: 'kc_reconciliation', attack: 8, defence: 3, actionKey: 'eriksen_whipped_delivery', actionName: 'WHIPPED DELIVERY', timing: 'on_reveal', actionText: 'On Reveal: Add a Corner to your hand. Give it +1 ATT for each CB you have in ATT.' }),
  card({ id: 'ramos', realName: 'Sergio Ramos', matchName: 'Remos', fullCardName: 'Sergio Remos', trackerRow: 248, sourceCardId: 'KC-039', position: 'CB / RB', naturalZones: ['DEF'], cost: 3, costSource: 'kc_reconciliation', attack: 2, defence: 9, actionKey: 'ramos_93rd_minute', actionName: '93RD MINUTE', timing: 'ongoing', actionText: 'Ongoing: Corners played here have +3 ATT. In the final period, +5 instead.' }),

  card({ id: 'duff', realName: 'Damien Duff', matchName: 'Doff', fullCardName: 'Damien Doff', trackerRow: 53, position: 'WF / WM', naturalZones: ['MID', 'ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 9, defence: 2, actionKey: 'duff_knock_and_run', actionName: 'KNOCK AND RUN', timing: 'on_reveal', actionText: 'On Reveal: Give the highest-DEF opposing player here −2 DEF and this player +2 ATT until period end.' }),
  card({ id: 'garrincha', realName: 'Garrincha', matchName: 'Gallinga', fullCardName: 'Gallinga', trackerRow: 98, position: 'WF', naturalZones: ['ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 10, defence: 1, actionKey: 'garrincha_joy_of_the_people', actionName: 'JOY OF THE PEOPLE', timing: 'on_reveal', actionText: 'On Reveal: Give the highest-DEF opposing defender here −2 DEF. If they were already reduced, this gains +4 ATT this period.' }),
  card({ id: 'okocha', realName: 'Jay-Jay Okocha', matchName: 'Okosha', fullCardName: 'Jay-Jay Okosha', trackerRow: 137, position: 'AM / WF', naturalZones: ['MID', 'ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 9, defence: 2, actionKey: 'okocha_stepover', actionName: 'STEPOVER', timing: 'on_reveal', actionText: 'On Reveal: Give the lowest-DEF opposing defender here −2 DEF. If they were already reduced, add a Penalty to your hand.' }),
  card({ id: 'neymar', realName: 'Neymar', matchName: 'Nomer', fullCardName: 'Nomer', trackerRow: 192, position: 'WF / AM', naturalZones: ['MID', 'ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 10, defence: 1, actionKey: 'neymar_rainbow_flick', actionName: 'RAINBOW FLICK', timing: 'on_reveal', actionText: 'On Reveal: If an opposing defender here has reduced DEF, add a Penalty to your hand.' }),
  card({ id: 'ronaldo', realName: 'Ronaldo Nazário', matchName: 'Nazerino', fullCardName: 'Ronaldo Nazerino', trackerRow: 233, sourceCardId: 'KC-062', position: 'CF', naturalZones: ['ATT'], cost: 4, costSource: 'kc_reconciliation', attack: 11, defence: 1, actionKey: 'ronaldo_flip_flap', actionName: 'FLIP FLAP', timing: 'on_reveal', actionText: 'On Reveal: If an opposing defender here is at least 3 DEF below base, add a Penalty to your hand. Give it +2 ATT.' }),
  card({ id: 'panenka', realName: 'Antonín Panenka', matchName: 'Polevka', fullCardName: 'Antonín Polevka', trackerRow: 26, position: 'AM / CM', naturalZones: ['MID'], cost: 2, costSource: 'tracker', attack: 8, defence: 3, actionKey: 'panenka_chipped_penalty', actionName: 'CHIPPED PENALTY', timing: 'ongoing', actionText: 'Ongoing: Penalties played here have +3 ATT and cannot be cancelled.' }),

  card({ id: 'iniesta', realName: 'Andrés Iniesta', matchName: 'Inostar', fullCardName: 'Andrés Inostar', trackerRow: 20, sourceCardId: 'KC-045', position: 'CM / AM', naturalZones: ['MID'], cost: 5, costSource: 'tracker', attack: 6, defence: 4, actionKey: 'iniesta_la_croqueta', actionName: 'LA CROQUETA', timing: 'triggered', actionText: 'The first time each period an opposing Action targets this player, ignore it.' }),
  card({ id: 'bremner', realName: 'Billy Bremner', matchName: 'Brahma', fullCardName: 'Billy Brahma', trackerRow: 30, position: 'CM', naturalZones: ['MID'], cost: 1, costSource: 'tracker', attack: 5, defence: 5, actionKey: 'bremner_crunching_tackle', actionName: 'CRUNCHING TACKLE', timing: 'on_reveal', actionText: 'On Reveal: Give the highest-ATT opposing player here −3 ATT until period end.' }),
  card({ id: 'seedorf', realName: 'Clarence Seedorf', matchName: 'Sandoff', fullCardName: 'Clarence Sandoff', trackerRow: 48, position: 'CM / AM', naturalZones: ['MID'], cost: 3, costSource: 'kc_reconciliation', attack: 6, defence: 4, actionKey: 'seedorf_ride_the_tackle', actionName: 'RIDE THE TACKLE', timing: 'ongoing', actionText: 'Ongoing: This player’s ATT and DEF cannot be reduced.' }),
  card({ id: 'makelele', realName: 'Claude Makélélé', matchName: 'Makula', fullCardName: 'Claude Makula', trackerRow: 49, sourceCardId: 'KC-051', position: 'DM / CM', naturalZones: ['DEF', 'MID'], cost: 4, costSource: 'calibration_fallback', attack: 3, defence: 6, statSource: 'calibration_fallback', actionKey: 'makelele_water_carrier', actionName: 'WATER-CARRIER', timing: 'ongoing', actionText: 'Ongoing: Your other players here have +2 DEF.' }),
  card({ id: 'gentile', realName: 'Claudio Gentile', matchName: 'Jostle', fullCardName: 'Claudio Jostle', trackerRow: 50, sourceCardId: 'KC-075', position: 'CB / DM', naturalZones: ['DEF', 'MID'], cost: 3, costSource: 'calibration_fallback', attack: 2, defence: 7, statSource: 'calibration_fallback', actionKey: 'gentile_man_marker', actionName: 'MAN MARKER', timing: 'ongoing', actionText: 'Ongoing: The highest-ATT opposing player here has no Action.' }),
  card({ id: 'baresi', realName: 'Franco Baresi', matchName: 'Borisi', fullCardName: 'Franco Borisi', trackerRow: 89, sourceCardId: 'KC-081', position: 'SW / CD', naturalZones: ['DEF'], cost: 4, costSource: 'kc_reconciliation', attack: 2, defence: 9, actionKey: 'baresi_step_up', actionName: 'STEP UP', timing: 'on_reveal', actionText: 'On Reveal: Add an Offside Trap to your hand. If it cancels a Through Ball, +2 DEF here this period.' }),
  card({ id: 'park', realName: 'Park Ji-sung', matchName: 'Jun-Kim', fullCardName: 'Park Jun-Kim', trackerRow: 200, position: 'CM / WM', naturalZones: ['MID'], cost: 3, costSource: 'kc_reconciliation', attack: 5, defence: 5, actionKey: 'park_three_lungs', actionName: 'THREE LUNGS', timing: 'on_reveal', actionText: 'On Reveal: Add a Trigger Press to your hand. It costs 0 this period.' }),
  card({ id: 'schmeichel', realName: 'Peter Schmeichel', matchName: 'Smikal', fullCardName: 'Peter Smikal', trackerRow: 212, sourceCardId: 'KC-020', position: 'GK', naturalZones: ['DEF'], cost: 4, costSource: 'kc_reconciliation', attack: 0, defence: 11, actionKey: 'schmeichel_starfish', actionName: 'STARFISH', timing: 'ongoing', actionText: 'Ongoing: The first Chance your opponent plays here each period is cancelled.' }),

  card({ id: 'sinclair', realName: 'Christine Sinclair', matchName: 'St Claire', fullCardName: 'Christina St Claire', trackerRow: 47, position: 'CF / AM', naturalZones: ['MID', 'ATT'], cost: 3, costSource: 'kc_reconciliation', attack: 10, defence: 1, actionKey: 'sinclair_arrive_unmarked', actionName: 'ARRIVE UNMARKED', timing: 'on_reveal', actionText: 'On Reveal: If this is your first player here, she gains +4 ATT.' }),
  card({ id: 'beckenbauer', realName: 'Franz Beckenbauer', matchName: 'Bochelbomb', fullCardName: 'Franz Bochelbomb', trackerRow: 92, sourceCardId: 'KC-013', position: 'CB / DM', naturalZones: ['DEF', 'MID'], cost: 4, costSource: 'kc_reconciliation', attack: 2, defence: 9, actionKey: 'beckenbauer_der_kaiser', actionName: 'DER KAISER', timing: 'triggered', actionText: 'Moveable once per period. After this moves, it gains +2 ATT and +2 DEF until period end.', moveable: true }),
] as const;

export const V8_CALIBRATION_PLAYER_BY_ID = new Map(V8_CALIBRATION_PLAYERS.map((player) => [player.id, player]));

export const V8_CALIBRATION_EXCLUDED_REAL_NAMES = [
  'Abedi Pelé',
  'Aitana Bonmatí',
  'Bryan Robson',
  'Clint Dempsey',
  'Fabian Barthez',
  'Ronaldinho',
] as const;

export function getV8CalibrationPlayer(id: string): V8CalibrationPlayerCard {
  const found = V8_CALIBRATION_PLAYER_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 calibration player: ${id}`);
  return found;
}
