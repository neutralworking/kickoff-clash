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
    actionText: 'Ongoing: Your first Cross played in ATT each period becomes a Long Shot before it resolves.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['width_to_centre_chance_relocation'],
    implementationState: 'runtime_ready',
    auditNote: 'V8 translates the lost wide-to-centre geometry as a Chance-identity pivot: the first Cross in ATT each period becomes a Long Shot with no ATT bonus and the original paid Cost/modifiers preserved. Pending Waddle movement transformation has priority; otherwise CUT INSIDE locks the generic Alexia/Pirlo transform layer for that resolution.',
  },
  {
    id: 'rory-delap',
    realName: 'Rory Delap',
    trackerRow: 234,
    position: 'CM / WM',
    naturalZones: ['MID'],
    actionName: 'HURLER',
    actionText: 'End of Period (P1–P3): Add a Long Throw to your hand.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['long_throw_tactical_generation'],
    implementationState: 'runtime_ready',
    auditNote: 'Long Throw is now an explicit typed Chance rather than pretending the throw is a Cross or Corner. It uses the neutral Cross/Through Ball baseline (Cost 1, +2 ATT), is ATT-only, and is generated after each non-final period while HURLER is active. Specialist tuning is deliberately deferred.',
  },
  {
    id: 'keira-walsh',
    realName: 'Keira Walsh',
    trackerRow: 151,
    position: 'DM / CM',
    naturalZones: ['DEF', 'MID'],
    actionName: 'BEAT THE PRESS',
    actionText: 'Ongoing: The first opposing Trigger Press each period adds a Through Ball to your hand with +2 ATT.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['press_resistance_design'],
    implementationState: 'runtime_ready',
    auditNote: 'The press itself still resolves. Walsh turns the first opposing Trigger Press each period into progression behind it by generating a +2 Through Ball. This is counterplay through progression, not immunity, and stays distinct from ESCAPE THE PRESS, LA CROQUETA and ONE ON ONE.',
  },
] as const;

export const V8_EXPANSION_BATCH_06_BY_ID = new Map(V8_EXPANSION_BATCH_06.map((card) => [card.id, card]));

export function getV8ExpansionBatch06Card(id: string): V8ExpansionBatch06CardContract {
  const card = V8_EXPANSION_BATCH_06_BY_ID.get(id);
  if (!card) throw new Error(`Unknown V8 expansion Batch 06 card: ${id}`);
  return card;
}
