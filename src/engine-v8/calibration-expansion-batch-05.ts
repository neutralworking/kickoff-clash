import type {
  V8ExpansionImplementationState,
  V8ExpansionPrimitive,
} from './calibration-expansion-batch-01';

export type V8Batch05AuditDecision = 'keep_translate' | 'mechanic_design';

export type V8ExpansionBatch05Primitive = V8ExpansionPrimitive
  | 'typed_chance_attack_suppression'
  | 'mid_reveal_long_shot_tradeoff'
  | 'late_losing_reveal_payoff'
  | 'global_defender_aura'
  | 'deterministic_action_rng'
  | 'mid_reveal_free_cross'
  | 'set_piece_choice_generation';

export interface V8ExpansionBatch05CardContract {
  id: string;
  realName: string;
  trackerRow: number;
  position: string;
  naturalZones: readonly ('DEF' | 'MID' | 'ATT')[];
  actionName: string;
  actionText: string;
  timing: 'on_reveal' | 'ongoing' | 'triggered';
  auditDecision: V8Batch05AuditDecision;
  primitives: readonly V8ExpansionBatch05Primitive[];
  implementationState: V8ExpansionImplementationState;
  auditNote: string;
}

/**
 * Batch 05 is deliberately source-first. Every selected card has authoritative reconciliation
 * ATT/DEF/Cost available. All eight contracts now have focused runtime coverage; Nakamura's
 * consequence is V8-specific mechanic design because the tracker provides the identity but no
 * source effect.
 */
export const V8_EXPANSION_BATCH_05: readonly V8ExpansionBatch05CardContract[] = [
  {
    id: 'peter-shilton',
    realName: 'Peter Shilton',
    trackerRow: 213,
    position: 'GK',
    naturalZones: ['DEF'],
    actionName: 'SHUT THE ANGLE',
    actionText: 'Ongoing: The first opposing Through Ball played in ATT each period has −3 ATT.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['typed_chance_attack_suppression'],
    implementationState: 'runtime_ready',
    auditNote: 'Replaces the old non-football RECORD CAP direction with a visible goalkeeping action. The source Through Ball threshold becomes typed Chance ATT suppression rather than a dice threshold.',
  },
  {
    id: 'paul-mcgrath',
    realName: 'Paul McGrath',
    trackerRow: 206,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'AERIAL COMMAND',
    actionText: 'Ongoing: The first opposing Cross played in ATT each period has −3 ATT.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['typed_chance_attack_suppression'],
    implementationState: 'runtime_ready',
    auditNote: 'The old Cross conversion-floor wording maps cleanly onto the same typed suppression primitive as Shilton while remaining football-readable and source-appropriate.',
  },
  {
    id: 'roberto-carlos',
    realName: 'Roberto Carlos',
    trackerRow: 228,
    position: 'LB / LWB',
    naturalZones: ['DEF', 'MID'],
    actionName: 'THUNDERBOLT',
    actionText: 'On Reveal: If played in MID, add a Long Shot to your hand with +3 ATT; this loses 3 DEF this period.',
    timing: 'on_reveal',
    auditDecision: 'keep_translate',
    primitives: ['mid_reveal_long_shot_tradeoff'],
    implementationState: 'runtime_ready',
    auditNote: 'Keeps the iconic shot and the source card’s attack/defence trade-off without relying on obsolete wide-slot geometry.',
  },
  {
    id: 'ole-gunnar-solskjaer',
    realName: 'Ole Gunnar Solskjær',
    trackerRow: 196,
    position: 'CF',
    naturalZones: ['ATT'],
    actionName: 'SUPERSUB',
    actionText: 'On Reveal: If played in P3 or P4 while losing, gain +4 ATT this period and add a Through Ball to your hand.',
    timing: 'on_reveal',
    auditDecision: 'keep_translate',
    primitives: ['late_losing_reveal_payoff'],
    implementationState: 'runtime_ready',
    auditNote: 'Late deployment is the V8 equivalent of the source Subbed On trigger. Banked match score is persisted at period end and read at reveal, so this never infers losing state from board strength.',
  },
  {
    id: 'tony-adams',
    realName: 'Tony Adams',
    trackerRow: 264,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'SKIPPER',
    actionText: 'Ongoing: Your other defenders have +2 DEF.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['global_defender_aura'],
    implementationState: 'runtime_ready',
    auditNote: 'The source effect already describes an on-pitch captain organising the back line; V8 only needs defender classification and non-self aura refresh.',
  },
  {
    id: 'ronaldinho',
    realName: 'Ronaldinho',
    trackerRow: 232,
    position: 'LW / AM',
    naturalZones: ['MID', 'ATT'],
    actionName: 'SHOWBOAT',
    actionText: 'On Reveal: 50%: +6 ATT this period. Otherwise −2 ATT this period.',
    timing: 'on_reveal',
    auditDecision: 'keep_translate',
    primitives: ['deterministic_action_rng'],
    implementationState: 'runtime_ready',
    auditNote: 'Uses namespaced deterministic Action RNG stored in match context. Replays are stable and unrelated future random Actions cannot perturb SHOWBOAT’s sequence.',
  },
  {
    id: 'paul-scholes',
    realName: 'Paul Scholes',
    trackerRow: 207,
    position: 'CM',
    naturalZones: ['MID'],
    actionName: 'HOLLYWOOD BALL',
    actionText: 'On Reveal: If played in MID, add a Cross to your hand. It costs 0 this period.',
    timing: 'on_reveal',
    auditDecision: 'keep_translate',
    primitives: ['mid_reveal_free_cross'],
    implementationState: 'runtime_ready',
    auditNote: 'The first transform/relocate proposal collided with Pirlo DIAGONAL SWITCH. The accepted design creates a new Cross instead, making Scholes a tempo-efficient long distributor without copying Pirlo’s Chance transformation.',
  },
  {
    id: 'shunsuke-nakamura',
    realName: 'Shunsuke Nakamura',
    trackerRow: 249,
    position: 'AM / CM',
    naturalZones: ['MID'],
    actionName: 'DEAD BALL ARTIST',
    actionText: 'On Reveal: Add a Long Shot and a Corner to your hand. The first of those you play this period has +2 ATT.',
    timing: 'on_reveal',
    auditDecision: 'mechanic_design',
    primitives: ['set_piece_choice_generation'],
    implementationState: 'runtime_ready',
    auditNote: 'The tracker provides the strong source identity but no effect. The accepted V8-specific consequence expresses dead-ball versatility as a Long Shot / Corner choice with one shared first-play ATT bonus; it is not claimed as source-authored card text.',
  },
] as const;

export const V8_EXPANSION_BATCH_05_BY_ID = new Map(V8_EXPANSION_BATCH_05.map((card) => [card.id, card]));

export function getV8ExpansionBatch05Card(id: string): V8ExpansionBatch05CardContract {
  const card = V8_EXPANSION_BATCH_05_BY_ID.get(id);
  if (!card) throw new Error(`Unknown V8 expansion Batch 05 card: ${id}`);
  return card;
}
