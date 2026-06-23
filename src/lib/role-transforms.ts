/**
 * Kickoff Clash — ROLE_TRANSFORMS (engine v1 spine)
 *
 * The migration target for `applyRoleAbilities` (scoring.ts), per
 * MATCH_ENGINE_V1 §9. Each tactical role is expressed purely as data: a list of
 * `TraitRecord`s over the closed verb palette (verbs.ts). There is no role/
 * identity object — `traitsForCard` simply looks a card's `tacticalRole` up in
 * this table.
 *
 * First set (§9): Regista / Volante / Anchor migrated (`M`), plus inside-forward
 * and False 9 as new records (`N`). Magnitudes are the §9 starting numbers;
 * tuning is deferred to playtest (DESIGN §7).
 *
 * Step-1 zone projection: the full 3×3 cell field is step 2 (MATCH_ENGINE §4).
 * Here zones are the four scoring axes `evaluateSplit` produces, with the band
 * intuition ATT≈finishing, MID≈creation. So the §9 lane/band relocations read
 * as: inside-forward trades wide build-up (creation) for central box threat
 * (finishing); False 9 drops off the front (finishing → creation) and vacates
 * the box (a flat attack debuff).
 */

import type { Card } from './scoring';
import type { TraitRecord } from './verbs';

export const ROLE_TRANSFORMS: Record<string, TraitRecord[]> = {
  // M — Regista @ MID, "Metronome": +5% creation across your cells.
  Regista: [
    {
      name: 'Metronome',
      verb: 'amplify',
      params: { amount: 0.05 },
      scope: 'global',
      target: { kind: 'zone', zone: 'creation' },
    },
  ],

  // M — Volante @ MID, "Tackle & Go": −5% opponent attack (denies their push).
  Volante: [
    {
      name: 'Tackle & Go',
      verb: 'deny',
      params: { amount: 0.05 },
      scope: 'zone',
      target: { kind: 'zone', zone: 'attack' },
    },
  ],

  // M — Anchor @ DEF, "The Shield": +30% to the lowest-power card's defence.
  Anchor: [
    {
      name: 'The Shield',
      verb: 'amplify',
      params: { amount: 0.30 },
      scope: 'global',
      target: { kind: 'criterion', criterion: 'lowest-power', zone: 'defence' },
    },
  ],

  // N — Inside forward @ ATT_L/R, "Cut Inside": relocate wide build-up into the box.
  // Keyed on the existing "Inverted Winger" role (the cut-inside identity).
  'Inverted Winger': [
    {
      name: 'Cut Inside',
      verb: 'relocate',
      params: { fraction: 0.40 },
      scope: 'slot',
      from: 'creation',
      target: { kind: 'zone', zone: 'finishing' },
      condition: { kind: 'is-attacking' },
    },
  ],

  // N — False 9 @ ATT_C, "Drop Deep": drop off the front (finishing → creation)
  // and vacate the box (flat attack debuff). Keyed on the existing "Falso Nove" role.
  'Falso Nove': [
    {
      name: 'Drop Deep',
      verb: 'relocate',
      params: { fraction: 0.50 },
      scope: 'slot',
      from: 'finishing',
      target: { kind: 'zone', zone: 'creation' },
      condition: { kind: 'is-attacking' },
    },
    {
      name: 'Vacate the Box',
      verb: 'amplify',
      params: { amount: -0.20 },
      scope: 'slot',
      target: { kind: 'zone', zone: 'attack' },
      condition: { kind: 'is-attacking' },
    },
  ],
};

/** Resolve a card's TraitRecords from its tactical role (empty if none). */
export function traitsForCard(card: Card): TraitRecord[] {
  return card.tacticalRole ? (ROLE_TRANSFORMS[card.tacticalRole] ?? []) : [];
}
