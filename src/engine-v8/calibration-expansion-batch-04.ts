import type {
  V8ExpansionCardContract,
  V8ExpansionImplementationState,
  V8ExpansionPrimitive,
} from './calibration-expansion-batch-01';

export type V8Batch04AuditDecision = 'keep_translate' | 'rename_repair' | 'mechanic_design';

export type V8ExpansionBatch04Primitive = V8ExpansionPrimitive
  | 'high_value_chance_cancellation'
  | 'repeat_chance_interception_with_self_cost'
  | 'period_end_comeback_scaling'
  | 'move_chance_transform'
  | 'first_chance_power_with_protection_lock'
  | 'cross_trigger_self_buff'
  | 'cross_attack_suppression_immunity'
  | 'once_match_chance_transform';

export interface V8ExpansionBatch04CardContract extends Omit<V8ExpansionCardContract, 'primitives' | 'implementationState'> {
  auditDecision: V8Batch04AuditDecision;
  primitives: readonly V8ExpansionBatch04Primitive[];
  implementationState: V8ExpansionImplementationState;
}

/**
 * Fourth mixed Action audit. Tracker identity is authoritative; old dice/Box/sector consequences
 * are translated into the established V8 zone + Tactical grammar before runtime implementation.
 */
export const V8_EXPANSION_BATCH_04: readonly V8ExpansionBatch04CardContract[] = [
  {
    id: 'gordon-banks',
    realName: 'Gordon Banks',
    trackerRow: 112,
    position: 'GK',
    naturalZones: ['DEF'],
    actionName: 'IMPOSSIBLE SAVE',
    actionText: 'Once per match, the first opposing Chance in ATT with 4 or more ATT is cancelled.',
    timing: 'triggered',
    auditDecision: 'mechanic_design',
    primitives: ['high_value_chance_cancellation'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'john-terry',
    realName: 'John Terry',
    trackerRow: 143,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'HEAD WHERE IT HURTS',
    actionText: 'Once per match, when a second opposing Chance in ATT would resolve in the same period, cancel it; then this loses 3 DEF.',
    timing: 'triggered',
    auditDecision: 'rename_repair',
    primitives: ['repeat_chance_interception_with_self_cost'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'bryan-robson',
    realName: 'Bryan Robson',
    trackerRow: 36,
    position: 'CM',
    naturalZones: ['MID'],
    actionName: 'CAPTAIN MARVEL',
    actionText: 'End of Period: If you are losing the match, gain +2 ATT and +2 DEF for the rest of the match.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['period_end_comeback_scaling'],
    implementationState: 'primitive_required',
  },
  {
    id: 'chris-waddle',
    realName: 'Chris Waddle',
    trackerRow: 44,
    position: 'WF / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'DROP THE SHOULDER',
    actionText: 'Moveable once per period between MID and ATT. After this moves, your next Chance in the destination this period becomes a Cross before it resolves.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['reactive_move', 'move_chance_transform'],
    implementationState: 'primitive_required',
  },
  {
    id: 'alan-shearer',
    realName: 'Alan Shearer',
    trackerRow: 10,
    position: 'CF',
    naturalZones: ['ATT'],
    actionName: 'LACES THROUGH IT',
    actionText: 'Your first Chance in ATT each period has +3 ATT, but it cannot be made uncancellable.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['first_chance_power_with_protection_lock'],
    implementationState: 'primitive_required',
  },
  {
    id: 'alexandra-popp',
    realName: 'Alexandra Popp',
    trackerRow: 14,
    position: 'CF / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'CRASH THE BOX',
    actionText: 'After your first Cross is played in ATT each period, this gains +3 ATT this period.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['cross_trigger_self_buff'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'ali-daei',
    realName: 'Ali Daei',
    trackerRow: 17,
    position: 'CF',
    naturalZones: ['ATT'],
    actionName: 'POWER HEADER',
    actionText: 'Your first Cross played here each period has +2 ATT and its ATT cannot be reduced.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['cross_attack_suppression_immunity'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'ellen-white',
    realName: 'Ellen White',
    trackerRow: 75,
    position: 'CF',
    naturalZones: ['ATT'],
    actionName: 'FIRST-TIME LOB',
    actionText: 'Once per match, your first Through Ball played here becomes a Long Shot and gains +3 ATT before it resolves.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['once_match_chance_transform'],
    implementationState: 'runtime_ready',
  },
] as const;

export const V8_EXPANSION_BATCH_04_BY_ID = new Map(V8_EXPANSION_BATCH_04.map((card) => [card.id, card]));

export function getV8ExpansionBatch04Card(id: string): V8ExpansionBatch04CardContract {
  const found = V8_EXPANSION_BATCH_04_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 expansion Batch 04 card: ${id}`);
  return found;
}
