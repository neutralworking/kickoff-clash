import type { V8ExpansionCardContract } from './calibration-expansion-batch-01';

/**
 * Batch 02 deliberately reuses the primitive vocabulary proven in Batch 01 before introducing
 * more bespoke mechanics. Tracker Action/name text is authoritative; reconciliation may supply
 * frozen ATT/DEF/Cost for lab-only cards where tracker stat cells remain blank.
 */
export const V8_EXPANSION_BATCH_02: readonly V8ExpansionCardContract[] = [
  {
    id: 'tymoshchuk',
    realName: 'Anatoliy Tymoshchuk',
    trackerRow: 18,
    position: 'DM / CM',
    naturalZones: ['DEF', 'MID'],
    actionName: 'STEP IN',
    actionText: 'Ongoing: While played in MID, the highest-ATT opposing midfielder here has −3 ATT.',
    timing: 'ongoing',
    primitives: ['dynamic_opponent_target'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'ozil',
    realName: 'Mesut Özil',
    trackerRow: 178,
    position: 'AM / CM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'INVISIBLE',
    actionText: 'Ongoing: If your side already out-attacks theirs here without this effect, +5 ATT; otherwise −3 ATT.',
    timing: 'ongoing',
    primitives: ['zone_advantage_modifier'],
    implementationState: 'stats_required',
  },
  {
    id: 'bobby-moore',
    realName: 'Bobby Moore',
    trackerRow: 33,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'READ THE RUN',
    actionText: 'The first time each period an opposing central attacker here gains ATT, gain the same DEF this period.',
    timing: 'triggered',
    primitives: ['opponent_attack_gain_listener'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'andy-robertson',
    realName: 'Andy Robertson',
    trackerRow: 23,
    position: 'FB / WB',
    naturalZones: ['DEF', 'MID'],
    actionName: 'RECOVERY RUN',
    actionText: 'The first time each period an opposing wide attacker here gains ATT, gain the same DEF this period.',
    timing: 'triggered',
    primitives: ['opponent_attack_gain_listener'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'nesta',
    realName: 'Alessandro Nesta',
    trackerRow: 12,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'TIMED SLIDE',
    actionText: 'Cancel the first opposing Through Ball here each period.',
    timing: 'triggered',
    primitives: ['typed_chance_cancellation'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'brian-laudrup',
    realName: 'Brian Laudrup',
    trackerRow: 35,
    position: 'WF / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'GLIDING RUN',
    actionText: 'Moveable once per period to an adjacent zone. Your first Chance in the destination this period cannot be cancelled.',
    timing: 'triggered',
    primitives: ['reactive_move', 'move_chance_protection'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'davids',
    realName: 'Edgar Davids',
    trackerRow: 72,
    position: 'CM / DM',
    naturalZones: ['DEF', 'MID'],
    actionName: 'PITBULL',
    actionText: 'The first time each period an opposing midfielder moves out of this zone, follow them and give them −2 ATT this period.',
    timing: 'triggered',
    primitives: ['opponent_move_follow', 'reactive_move'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'cruyff',
    realName: 'Johan Cruyff',
    trackerRow: 140,
    position: 'CF / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'TOTAL FOOTBALL',
    actionText: 'Ongoing: Your players ignore out-of-position penalties while this Action is active.',
    timing: 'ongoing',
    primitives: ['oop_override'],
    implementationState: 'runtime_ready',
  },
] as const;

export const V8_EXPANSION_BATCH_02_BY_ID = new Map(V8_EXPANSION_BATCH_02.map((card) => [card.id, card]));

export function getV8ExpansionBatch02Card(id: string): V8ExpansionCardContract {
  const found = V8_EXPANSION_BATCH_02_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 expansion Batch 02 card: ${id}`);
  return found;
}