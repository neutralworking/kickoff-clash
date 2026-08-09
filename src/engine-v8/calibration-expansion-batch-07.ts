import type {
  V8ExpansionImplementationState,
  V8ExpansionPrimitive,
} from './calibration-expansion-batch-01';

export type V8Batch07AuditDecision = 'keep_translate' | 'mechanic_design';

export type V8ExpansionBatch07Primitive = V8ExpansionPrimitive
  | 'losing_open_play_to_cross_transform'
  | 'defensive_through_ball_to_cross_transform'
  | 'partner_presence_stat_aura'
  | 'zone_defence_with_wide_tradeoff'
  | 'forward_hierarchy_aura'
  | 'bound_attacker_debuff_with_recovery'
  | 'goalkeeper_save_momentum';

export interface V8ExpansionBatch07CardContract {
  id: string;
  realName: string;
  trackerRow: number;
  position: string;
  naturalZones: readonly ('DEF' | 'MID' | 'ATT')[];
  actionName: string;
  actionText: string;
  timing: 'on_reveal' | 'ongoing' | 'triggered';
  auditDecision: V8Batch07AuditDecision;
  primitives: readonly V8ExpansionBatch07Primitive[];
  implementationState: V8ExpansionImplementationState;
  auditNote: string;
}

/**
 * Batch 07 keeps the Batch 06 source-first rule: tracker Action identity is authoritative and KC
 * reconciliation supplies ATT / DEF / Cost. Removed Box/sector/threshold language is translated
 * only where V8 has an honest football-shaped equivalent; otherwise the card remains blocked.
 */
export const V8_EXPANSION_BATCH_07: readonly V8ExpansionBatch07CardContract[] = [
  {
    id: 'achraf-hakimi',
    realName: 'Achraf Hakimi',
    trackerRow: 7,
    position: 'FB / WB',
    naturalZones: ['DEF', 'MID'],
    actionName: 'BOMB ON',
    actionText: 'Ongoing: While this is in MID and you are losing the match, your first Through Ball or Long Shot played in ATT each period becomes a Cross before it resolves.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['losing_open_play_to_cross_transform'],
    implementationState: 'runtime_ready',
    auditNote: 'The tracker identity is the full-back bombing forward to provide width while chasing the game. V8 removes Box/side-sector geometry but preserves the football decision by requiring Hakimi in MID and converting the first open-play ATT Chance into a Cross only while trailing. No ATT is invented.',
  },
  {
    id: 'annike-krahn',
    realName: 'Annike Krahn',
    trackerRow: 25,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'STEP ACROSS',
    actionText: 'The first opposing Through Ball played in ATT each period becomes a Cross before it resolves.',
    timing: 'triggered',
    auditDecision: 'keep_translate',
    primitives: ['defensive_through_ball_to_cross_transform'],
    implementationState: 'runtime_ready',
    auditNote: 'STEP ACROSS remains a defender changing the attacker’s route rather than simply cancelling the Chance. Through Ball → Cross is the three-zone equivalent of forcing the attack away from the direct lane and preserves all paid Cost/modifiers.',
  },
  {
    id: 'nemanja-vidic',
    realName: 'Nemanja Vidić',
    trackerRow: 190,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'PARTNERSHIP',
    actionText: 'Ongoing: +2 DEF. +5 instead while Rio Ferdinand is deployed.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['partner_presence_stat_aura'],
    implementationState: 'runtime_ready',
    auditNote: 'Functional alone, stronger with the recognisable Ferdinand partnership. “Starts” becomes deployed presence in the persistent V8 board; the partner’s own Action does not need to be enabled for the relationship to exist.',
  },
  {
    id: 'rio-ferdinand',
    realName: 'Rio Ferdinand',
    trackerRow: 221,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'PARTNERSHIP',
    actionText: 'Ongoing: +2 ATT. +5 instead while Nemanja Vidić is deployed.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['partner_presence_stat_aura'],
    implementationState: 'runtime_ready',
    auditNote: 'The pair remains asymmetric: Ferdinand supplies progression/ATT while Vidić supplies DEF. That gives the same partnership two distinct football functions rather than duplicating a generic centre-back aura.',
  },
  {
    id: 'sol-campbell',
    realName: 'Sol Campbell',
    trackerRow: 251,
    position: 'CB',
    naturalZones: ['DEF'],
    actionName: 'MARSHAL',
    actionText: 'Ongoing: +3 DEF to this zone. Your other wide players have −2 ATT.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['zone_defence_with_wide_tradeoff'],
    implementationState: 'runtime_ready',
    auditNote: 'The +3 is a zone-contribution rule, not hidden Campbell DEF, so stat targeting continues to read real stats. The −2 ATT is a real modifier on friendly WF/WM/LW/RW/LM/RM cards and represents the compact defensive trade-off.',
  },
  {
    id: 'zlatan-ibrahimovic',
    realName: 'Zlatan Ibrahimović',
    trackerRow: 278,
    position: 'CF',
    naturalZones: ['ATT'],
    actionName: 'ALPHA',
    actionText: 'Ongoing: +6 ATT. Your other forwards have −2 ATT.',
    timing: 'ongoing',
    auditDecision: 'keep_translate',
    primitives: ['forward_hierarchy_aura'],
    implementationState: 'runtime_ready',
    auditNote: 'The tracker mechanic itself is the on-pitch identity: the attack is built around Zlatan at the expense of the other forwards. Both sides of the trade-off are real ATT modifiers and disappear when ALPHA is suppressed.',
  },
  {
    id: 'roy-keane',
    realName: 'Roy Keane',
    trackerRow: 235,
    position: 'DM / CM',
    naturalZones: ['DEF', 'MID'],
    actionName: 'REDUCER',
    actionText: 'On Reveal: Give the highest-ATT opposing forward −5 ATT for the match. End of Period: 50% chance they recover 2 ATT.',
    timing: 'on_reveal',
    auditDecision: 'keep_translate',
    primitives: ['bound_attacker_debuff_with_recovery'],
    implementationState: 'runtime_ready',
    auditNote: 'The tracker Game Start effect is translated to On Reveal because the calibration board is progressively revealed. The −5 binds to the selected forward and later deterministic Action RNG can recover up to 2 ATT after each non-final period without overshooting the original stat.',
  },
  {
    id: 'nadine-angerer',
    realName: 'Nadine Angerer',
    trackerRow: 188,
    position: 'GK',
    naturalZones: ['DEF'],
    actionName: 'UNBEATEN',
    actionText: 'The first time she saves a Chance each period, all remaining opposing Chances that period become harder to finish.',
    timing: 'triggered',
    auditDecision: 'mechanic_design',
    primitives: ['goalkeeper_save_momentum'],
    implementationState: 'primitive_required',
    auditNote: 'Do not equate a generic Chance cancellation with a goalkeeper save. V8 currently has no save-event primitive and the old threshold +1 grammar is gone. UNBEATEN is also achievement-like rather than an on-pitch action name, so both the save primitive and the final name should be designed together before runtime promotion.',
  },
] as const;

export const V8_EXPANSION_BATCH_07_BY_ID = new Map(V8_EXPANSION_BATCH_07.map((card) => [card.id, card]));

export function getV8ExpansionBatch07Card(id: string): V8ExpansionBatch07CardContract {
  const card = V8_EXPANSION_BATCH_07_BY_ID.get(id);
  if (!card) throw new Error(`Unknown V8 expansion Batch 07 card: ${id}`);
  return card;
}
