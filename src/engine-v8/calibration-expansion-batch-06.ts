import type {
  V8ExpansionImplementationState,
  V8ExpansionPrimitive,
} from './calibration-expansion-batch-01';

export type V8Batch06AuditDecision = 'keep_translate' | 'mechanic_design';

export type V8ExpansionBatch06Primitive = V8ExpansionPrimitive
  | 'local_long_shot_specialist'
  | 'board_conditioned_through_ball_generation'
  | 'attacking_cb_corner_scaling'
  | 'targeted_defender_action_evasion'
  | 'mid_win_delayed_through_ball'
  | 'width_to_centre_chance_relocation'
  | 'long_throw_tactical_generation'
  | 'press_resistance_design';

export interface V8ExpansionBatch06CardContract {
  id: string;
  realName: string;
  trackerRow: number;
  position: string;
  naturalZones: readonly ('DEF' | 'MID' | 'ATT')[];
  actionName: string;
  actionText: string;
  timing: 'on_reveal' | 'ongoing' | 'triggered';
  auditDecision: V8Batch06AuditDecision;
  primitives: readonly V8ExpansionBatch06Primitive[];
  implementationState: V8ExpansionImplementationState;
  auditNote: string;
}

/**
 * Batch 06 continues the source-first expansion. Tracker action identity is authoritative; KC
 * reconciliation supplies ATT / DEF / Cost only. Generic database Action names do not overwrite
 * the tracker design. Runtime promotion requires a real V8 primitive plus focused coverage.
 */
export const V8_EXPANSION_BATCH_06: readonly V8ExpansionBatch06CardContract[] = [
  {
    id: 'carli-lloyd',
    realName: 'Carli Lloyd',
    trackerRow: 40,
    position: 'CM / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'HALFWAY HIT',
    actionText: 'Ongoing: Long Shots played here have +4 ATT. Your first Long Shot here each match costs 0.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['local_long_shot_specialist'],
    implementationState: 'runtime_ready',
    auditNote: 'The 2015 halfway-line strike is an immediately recognisable on-pitch identity. V8 already has the same-zone Long Shot bonus and first-per-match local cost override primitive; only card registration was missing.',
  },
  {
    id: 'carlos-valderrama',
    realName: 'Carlos Valderrama',
    trackerRow: 41,
    position: 'AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'PAUSE AND SLIP',
    actionText: 'On Reveal: Add a Through Ball to your hand. If you already have a player in ATT, give it +2 ATT.',
    timing: 'on_reveal',
    auditDecision: 'keep_translate',
    primitives: ['board_conditioned_through_ball_generation'],
    implementationState: 'runtime_ready',
    auditNote: 'A recognisable tempo-change and final-pass action. The board-conditioned Through Ball generator already exists in the V8 reveal path.',
  },
  {
    id: 'christian-eriksen',
    realName: 'Christian Eriksen',
    trackerRow: 45,
    position: 'AM / CM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'WHIPPED DELIVERY',
    actionText: 'On Reveal: Add a Corner to your hand. Give it +1 ATT for each CB you have in ATT.',
    timing: 'on_reveal',
    auditDecision: 'keep_translate',
    primitives: ['attacking_cb_corner_scaling'],
    implementationState: 'runtime_ready',
    auditNote: 'Set-piece delivery is strongly source-readable and the ATT-CB scaling creates a football-shaped trade-off without introducing a new Tactical type.',
  },
  {
    id: 'caroline-graham-hansen',
    realName: 'Caroline Graham Hansen',
    trackerRow: 42,
    position: 'WF / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'ONE ON ONE',
    actionText: 'The first opposing defender Action each period that targets this player is ignored; gain +2 ATT this period.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['targeted_defender_action_evasion'],
    implementationState: 'runtime_ready',
    auditNote: 'Uses the shared defender-target interception layer also used by BERBA SPIN. It classifies the Action source as a defender, ignores the first qualifying target each period, and applies the +2 ATT as Hansen’s own period modifier rather than reversing the defender effect afterward.',
  },
  {
    id: 'jari-litmanen',
    realName: 'Jari Litmanen',
    trackerRow: 135,
    position: 'AM / SS',
    naturalZones: ['MID', 'ATT'],
    actionName: 'KILLER PASS',
    actionText: 'End of Period: If you won MID, add a Through Ball to your hand. Give it +1 ATT.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['mid_win_delayed_through_ball'],
    implementationState: 'runtime_ready',
    auditNote: 'Uses the existing period-end zone-winner hook and delayed Through Ball generation. It rewards winning the playmaking battle rather than adding raw MID stats.',
  },
  {
    id: 'arjen-robben',
    realName: 'Arjen Robben',
    trackerRow: 27,
    position: 'RW',
    naturalZones: ['ATT'],
    actionName: 'CUT INSIDE',
    actionText: 'Your first chance in his wide sector each period moves to the centre.',
    timing: 'triggered',
    auditDecision: 'mechanic_design',
    primitives: ['width_to_centre_chance_relocation'],
    implementationState: 'primitive_required',
    auditNote: 'The identity is excellent but the source consequence depends on wide-versus-centre geometry that V8 deliberately removed. Do not fake this with MID→ATT movement; redesign the consequence around the current three-zone grammar.',
  },
  {
    id: 'rory-delap',
    realName: 'Rory Delap',
    trackerRow: 234,
    position: 'CM / WM',
    naturalZones: ['MID'],
    actionName: 'HURLER',
    actionText: 'Design pending: represent the long throw without silently treating it as a Cross or Corner.',
    timing: 'triggered',
    auditDecision: 'mechanic_design',
    primitives: ['long_throw_tactical_generation'],
    implementationState: 'primitive_required',
    auditNote: 'The tracker has the strong HURLER identity but no effect; KC reconciliation says one extra set piece per period. A long throw is not automatically a Cross or Corner, so the Tactical representation must be chosen explicitly before runtime promotion.',
  },
  {
    id: 'keira-walsh',
    realName: 'Keira Walsh',
    trackerRow: 151,
    position: 'DM / CM',
    naturalZones: ['DEF', 'MID'],
    actionName: 'BEAT THE PRESS',
    actionText: 'Design pending: create a press-resistance consequence distinct from ESCAPE THE PRESS and LA CROQUETA.',
    timing: 'triggered',
    auditDecision: 'mechanic_design',
    primitives: ['press_resistance_design'],
    implementationState: 'primitive_required',
    auditNote: 'The tracker supplies a strong on-pitch name but no consequence. Do not inherit the generic reconciliation Tempo Breaker action or clone Aitana/Iniesta just to make the card playable.',
  },
] as const;

export const V8_EXPANSION_BATCH_06_BY_ID = new Map(V8_EXPANSION_BATCH_06.map((card) => [card.id, card]));

export function getV8ExpansionBatch06Card(id: string): V8ExpansionBatch06CardContract {
  const card = V8_EXPANSION_BATCH_06_BY_ID.get(id);
  if (!card) throw new Error(`Unknown V8 expansion Batch 06 card: ${id}`);
  return card;
}
