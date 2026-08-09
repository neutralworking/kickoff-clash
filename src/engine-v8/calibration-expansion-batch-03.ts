import type { V8ExpansionCardContract, V8ExpansionPrimitive } from './calibration-expansion-batch-01';

export type V8ExpansionBatch03Primitive = V8ExpansionPrimitive
  | 'first_chance_attack_suppression'
  | 'chance_cancellation_interception'
  | 'dynamic_friendly_target'
  | 'generated_tactical_transformation'
  | 'first_chance_enhancement';

export interface V8ExpansionBatch03CardContract extends Omit<V8ExpansionCardContract, 'primitives'> {
  primitives: readonly V8ExpansionBatch03Primitive[];
}

/**
 * Third mixed-XI expansion slice from the live Card Design Tracker.
 *
 * Tracker Action/name concepts are authoritative. V7 sector/dice/Box wording is translated to the
 * existing V8 DEF/MID/ATT + generated-Tactical grammar rather than reintroducing removed systems.
 */
export const V8_EXPANSION_BATCH_03: readonly V8ExpansionBatch03CardContract[] = [
  {
    id: 'cannavaro',
    realName: 'Fabio Cannavaro',
    trackerRow: 82,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'READS IT EARLY',
    actionText: 'Ongoing: If the opposing ATT facing this zone is greater than your DEF here without this effect, +4 DEF.',
    timing: 'ongoing',
    primitives: ['zone_advantage_modifier'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'maradona',
    realName: 'Diego Maradona',
    trackerRow: 65,
    position: 'AM / LF',
    naturalZones: ['MID', 'ATT'],
    actionName: 'SLALOM RUN',
    actionText: 'Moveable once per match. When this moves from MID to ATT, gain +4 ATT this period and your first Chance in ATT this period cannot be cancelled.',
    timing: 'triggered',
    primitives: ['move_once', 'move_chance_protection'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'yashin',
    realName: 'Lev Yashin',
    trackerRow: 160,
    position: 'GK',
    naturalZones: ['DEF'],
    actionName: 'BLACK SPIDER',
    actionText: 'The first opposing Chance played in ATT each period has −2 ATT, to a minimum of 0.',
    timing: 'triggered',
    primitives: ['first_chance_attack_suppression'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'cavani',
    realName: 'Edinson Cavani',
    trackerRow: 74,
    position: 'CF',
    naturalZones: ['ATT'],
    actionName: 'GET ACROSS HIM',
    actionText: 'The first time each period a Cross played here would be cancelled, prevent that cancellation.',
    timing: 'triggered',
    primitives: ['chance_cancellation_interception'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'lucy-bronze',
    realName: 'Lucy Bronze',
    trackerRow: 164,
    position: 'RB / RWB',
    naturalZones: ['DEF', 'MID'],
    actionName: 'OVERLAP',
    actionText: 'Ongoing: While this is in MID and you have a friendly WF in ATT, this and your highest-ATT friendly WF in ATT have +2 ATT.',
    timing: 'ongoing',
    primitives: ['dynamic_friendly_target'],
    implementationState: 'runtime_ready',
  },
  {
    id: 'alexia-putellas',
    realName: 'Alexia Putellas',
    trackerRow: 15,
    position: 'CM / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'THROUGH THE GAP',
    actionText: 'The first non-Through-Ball Chance played here each period becomes a Through Ball before it resolves.',
    timing: 'triggered',
    primitives: ['generated_tactical_transformation'],
    implementationState: 'primitive_required',
  },
  {
    id: 'pirlo',
    realName: 'Andrea Pirlo',
    trackerRow: 19,
    position: 'CM / DM',
    naturalZones: ['DEF', 'MID'],
    actionName: 'DIAGONAL SWITCH',
    actionText: 'Your first Chance played in MID each period resolves in ATT instead; if it was not a Cross, it becomes a Cross before it resolves.',
    timing: 'triggered',
    primitives: ['generated_tactical_transformation'],
    implementationState: 'primitive_required',
  },
  {
    id: 'bergkamp',
    realName: 'Dennis Bergkamp',
    trackerRow: 61,
    position: 'CF / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'FIRST TOUCH',
    actionText: 'Your first Chance each period has +2 ATT.',
    timing: 'triggered',
    primitives: ['first_chance_enhancement'],
    implementationState: 'runtime_ready',
  },
] as const;

export const V8_EXPANSION_BATCH_03_BY_ID = new Map(V8_EXPANSION_BATCH_03.map((card) => [card.id, card]));

export function getV8ExpansionBatch03Card(id: string): V8ExpansionBatch03CardContract {
  const found = V8_EXPANSION_BATCH_03_BY_ID.get(id);
  if (!found) throw new Error(`Unknown V8 expansion Batch 03 card: ${id}`);
  return found;
}
