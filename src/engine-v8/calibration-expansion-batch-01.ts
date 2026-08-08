import type { V8Zone } from './core';

export type V8ExpansionPrimitive =
  | 'move_once'
  | 'delayed_player_cost'
  | 'score_state_modifier'
  | 'zone_state_modifier'
  | 'dynamic_opponent_target'
  | 'chance_cancellation_with_self_cost'
  | 'multi_zone_presence'
  | 'action_target_interception'
  | 'reactive_move';

export type V8ExpansionImplementationState =
  | 'runtime_ready'
  | 'primitive_required'
  | 'semantics_required';

export interface V8ExpansionCardContract {
  id: string;
  realName: string;
  trackerRow: number;
  position: string;
  naturalZones: readonly V8Zone[];
  actionName: string;
  actionText: string;
  timing: 'on_reveal' | 'ongoing' | 'triggered';
  primitives: readonly V8ExpansionPrimitive[];
  implementationState: V8ExpansionImplementationState;
}

/**
 * First mixed-XI expansion batch after the original 30-card calibration pool.
 *
 * These contracts intentionally contain no V7 dice target, reroll or left/centre/right-sector
 * language. Tracker identity is preserved while obsolete consequences are translated to the V8
 * DEF/MID/ATT + generated-Tactical grammar.
 */
export const V8_EXPANSION_BATCH_01: readonly V8ExpansionCardContract[] = [
  {
    id: 'abedi-pele',
    realName: 'Abedi Pelé',
    trackerRow: 6,
    position: 'AM / WF',
    naturalZones: ['MID', 'ATT'],
    actionName: 'JINKING RUN',
    actionText: 'Moveable once per match. When this moves from MID to ATT, it gains +4 ATT.',
    timing: 'triggered',
    primitives: ['move_once'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'aitana-bonmati',
    realName: 'Aitana Bonmatí',
    trackerRow: 9,
    position: 'CM / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'ESCAPE THE PRESS',
    actionText: 'On Reveal: Your first MID player next period costs 1 less.',
    timing: 'on_reveal',
    primitives: ['delayed_player_cost'],
    implementationState: 'primitive_required',
  },
  {
    id: 'di-stefano',
    realName: 'Alfredo Di Stéfano',
    trackerRow: 16,
    position: 'CF / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'END-TO-END RUN',
    actionText: 'Ongoing: While losing, +3 ATT. While winning, +3 DEF. While level, +1 ATT and +1 DEF.',
    timing: 'ongoing',
    primitives: ['score_state_modifier'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'ashley-cole',
    realName: 'Ashley Cole',
    trackerRow: 28,
    position: 'LB / LWB',
    naturalZones: ['DEF', 'MID'],
    actionName: 'SHOW HIM OUTSIDE',
    actionText: 'Ongoing: The highest-ATT opposing attacker here has −5 ATT.',
    timing: 'ongoing',
    primitives: ['dynamic_opponent_target'],
    implementationState: 'primitive_required',
  },
  {
    id: 'puyol',
    realName: 'Carles Puyol',
    trackerRow: 39,
    position: 'CB / RB',
    naturalZones: ['DEF'],
    actionName: 'BODY ON THE LINE',
    actionText: 'The first time this match an opposing Chance would resolve here, cancel it; then this loses 3 DEF.',
    timing: 'triggered',
    primitives: ['chance_cancellation_with_self_cost'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'dempsey',
    realName: 'Clint Dempsey',
    trackerRow: 51,
    position: 'SS / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'CHEEKY CHIP',
    actionText: 'On Reveal: If you are losing here, +5 ATT this period.',
    timing: 'on_reveal',
    primitives: ['zone_state_modifier'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'kante',
    realName: 'N’Golo Kanté',
    trackerRow: 186,
    position: 'DM / CM',
    naturalZones: ['DEF', 'MID'],
    actionName: 'EVERYWHERE',
    actionText: 'Ongoing: This counts as present in all three zones.',
    timing: 'ongoing',
    primitives: ['multi_zone_presence'],
    implementationState: 'semantics_required',
  },
  {
    id: 'berbatov',
    realName: 'Dimitar Berbatov',
    trackerRow: 66,
    position: 'CF / SS',
    naturalZones: ['ATT'],
    actionName: 'BERBA SPIN',
    actionText: 'The first opposing defender Action each period that targets this is ignored; then move this to an adjacent zone.',
    timing: 'triggered',
    primitives: ['action_target_interception', 'reactive_move'],
    implementationState: 'primitive_required',
  },
] as const;

export const V8_EXPANSION_BATCH_01_BY_ID = new Map(V8_EXPANSION_BATCH_01.map((card) => [card.id, card]));

export function getV8ExpansionBatch01Card(id: string): V8ExpansionCardContract {
  const found = V8_EXPANSION_BATCH_01_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 expansion Batch 01 card: ${id}`);
  return found;
}
