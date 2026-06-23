/**
 * Kickoff Clash — ROLE_TRANSFORMS (engine v1)
 *
 * The migration target for `applyRoleAbilities` (scoring.ts), per MATCH_ENGINE_V1
 * §9. Every tactical role is expressed purely as data: a list of `TraitRecord`s
 * over the closed verb palette (verbs.ts). There is no role/identity object —
 * `traitsForCard` just looks a card's `tacticalRole` up in this table.
 *
 * The first five (Regista / Volante / Anchor + inside-forward / False 9) are the
 * §9 starting set. The rest are the remaining `applyRoleAbilities` roles, ported
 * to palette verbs — `amplify` (self / a criterion set), `relocate`, `deny`, with
 * a seeded `chance` gate for the random ones. Magnitudes follow the legacy values
 * where there was one; squad-scaled or pair-based legacy effects are approximated
 * with a flat record and noted (pairing is chemistry's job — ROLE_COMBOS). All of
 * it is tuning-deferred (DESIGN §7).
 *
 * Step-1 zone projection: the full 3×3 cell field is step 2 (MATCH_ENGINE §4).
 * Here zones are the four scoring axes `evaluateSplit` produces, with the band
 * intuition ATT≈finishing, MID≈creation.
 */

import type { Card } from './scoring';
import type { TraitRecord } from './verbs';

export const ROLE_TRANSFORMS: Record<string, TraitRecord[]> = {
  // ---- §9 starting set ----------------------------------------------------

  // Regista @ MID, "Metronome": +5% creation across your cells.
  Regista: [
    { name: 'Metronome', verb: 'amplify', params: { amount: 0.05 }, scope: 'global', target: { kind: 'zone', zone: 'creation' } },
  ],

  // Volante @ MID, "Tackle & Go": −5% opponent attack (denies their push).
  Volante: [
    { name: 'Tackle & Go', verb: 'deny', params: { amount: 0.05 }, scope: 'zone', target: { kind: 'zone', zone: 'attack' } },
  ],

  // Anchor @ DEF, "The Shield": +30% to the lowest-power card's defence.
  Anchor: [
    { name: 'The Shield', verb: 'amplify', params: { amount: 0.30 }, scope: 'global', target: { kind: 'criterion', criterion: 'lowest-power', zone: 'defence' } },
  ],

  // Inside forward @ ATT_L/R, "Cut Inside": relocate wide build-up into the box.
  'Inverted Winger': [
    { name: 'Cut Inside', verb: 'relocate', params: { fraction: 0.40 }, scope: 'slot', from: 'creation', target: { kind: 'zone', zone: 'finishing' }, condition: { kind: 'is-attacking' } },
  ],

  // False 9 @ ATT_C, "Drop Deep": drop off the front (finishing → creation) and vacate the box.
  'Falso Nove': [
    { name: 'Drop Deep', verb: 'relocate', params: { fraction: 0.50 }, scope: 'slot', from: 'finishing', target: { kind: 'zone', zone: 'creation' }, condition: { kind: 'is-attacking' } },
    { name: 'Vacate the Box', verb: 'amplify', params: { amount: -0.20 }, scope: 'slot', target: { kind: 'zone', zone: 'attack' }, condition: { kind: 'is-attacking' } },
  ],

  // ---- Remaining migrated roles ------------------------------------------

  // Trequartista, "Moment of Genius": 30% chance to double its own output.
  Trequartista: [
    { name: 'Moment of Genius', verb: 'amplify', params: { amount: 1.0, chance: 0.30 }, scope: 'slot', target: { kind: 'self' } },
  ],

  // Poacher, "Box Presence": sharper in front of goal.
  Poacher: [
    { name: 'Box Presence', verb: 'amplify', params: { amount: 0.15 }, scope: 'slot', target: { kind: 'zone', zone: 'finishing' }, condition: { kind: 'is-attacking' } },
  ],

  // Tuttocampista, "Box to Box": all-round lift. (Legacy scaled with squad archetype
  // variety; flat here pending the chemistry-driven version.)
  Tuttocampista: [
    { name: 'Box to Box', verb: 'amplify', params: { amount: 0.12 }, scope: 'slot', target: { kind: 'self' } },
  ],

  // Lateral, "Overlap": pushes on. (Legacy paired with a winger; pairing is chemistry's job.)
  Lateral: [
    { name: 'Overlap', verb: 'amplify', params: { amount: 0.10 }, scope: 'slot', target: { kind: 'self' } },
  ],

  // Enganche, "The Hook": feeds the star (+25% highest-power) at its own expense (−10%).
  Enganche: [
    { name: 'The Hook', verb: 'amplify', params: { amount: 0.25 }, scope: 'global', target: { kind: 'criterion', criterion: 'highest-power' } },
    { name: 'Selfless', verb: 'amplify', params: { amount: -0.10 }, scope: 'slot', target: { kind: 'self' } },
  ],

  // Libero, "Surgical Pass": releases the forwards (+10% to attackers).
  Libero: [
    { name: 'Surgical Pass', verb: 'amplify', params: { amount: 0.10 }, scope: 'global', target: { kind: 'criterion', criterion: 'attackers' } },
  ],

  // Torwart, "Command": organises the back line (+5% to defenders).
  Torwart: [
    { name: 'Command', verb: 'amplify', params: { amount: 0.05 }, scope: 'global', target: { kind: 'criterion', criterion: 'defenders' } },
  ],

  // Sweeper keeper, "Sweeper": covers behind (+10% to Cover cards).
  'Sweeper Keeper': [
    { name: 'Sweeper', verb: 'amplify', params: { amount: 0.10 }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype: 'Cover' } },
  ],

  // Metodista, "Tempo": sets the rhythm (+10% to Controllers).
  Metodista: [
    { name: 'Tempo', verb: 'amplify', params: { amount: 0.10 }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype: 'Controller' } },
  ],

  // Winger, "Touchline": dangerous out wide.
  Winger: [
    { name: 'Touchline', verb: 'amplify', params: { amount: 0.20 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'in-wide-slot' } },
  ],

  // Extremo, "Jet Heels": pace down the line (Sprinters).
  Extremo: [
    { name: 'Jet Heels', verb: 'amplify', params: { amount: 0.20 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'archetype', archetype: 'Sprinter' } },
  ],

  // Stopper, "Front Foot": aggressive defending (Destroyers).
  Stopper: [
    { name: 'Front Foot', verb: 'amplify', params: { amount: 0.15 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'archetype', archetype: 'Destroyer' } },
  ],

  // Zagueiro, "Commander": marshals leaders (+10% to Commanders).
  Zagueiro: [
    { name: 'Commander', verb: 'amplify', params: { amount: 0.10 }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype: 'Commander' } },
  ],

  // Mezzala, "Half-Space Run": late runs from central midfield.
  Mezzala: [
    { name: 'Half-Space Run', verb: 'amplify', params: { amount: 0.15 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'in-position', positions: ['CM'] } },
  ],

  // Fantasista, "Half-Space Magic": creative spark (Creators).
  Fantasista: [
    { name: 'Half-Space Magic', verb: 'amplify', params: { amount: 0.15 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'archetype', archetype: 'Creator' } },
  ],

  // Invertido, "Tuck Inside": narrows in to combine (Controllers / Passers).
  Invertido: [
    { name: 'Tuck Inside', verb: 'amplify', params: { amount: 0.15 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'archetype', anyOf: ['Controller', 'Passer'] } },
  ],

  // Relayeur, "Relay": keeps the engine room moving (+5% to Engines).
  Relayeur: [
    { name: 'Relay', verb: 'amplify', params: { amount: 0.05 }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype: 'Engine' } },
  ],

  // Prima Punta, "Target Man": holds it up (+20% self if Target) and brings in support (+10% Passers).
  'Prima Punta': [
    { name: 'Target Man', verb: 'amplify', params: { amount: 0.20 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'archetype', archetype: 'Target' } },
    { name: 'Lay-Off', verb: 'amplify', params: { amount: 0.10 }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype: 'Passer' } },
  ],

  // Seconda Punta, "Between Lines": second striker drifting off the front.
  'Seconda Punta': [
    { name: 'Between Lines', verb: 'amplify', params: { amount: 0.10 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'in-position', positions: ['CF'] } },
  ],

  // Tornante, "Full Flank": tireless wide engine.
  Tornante: [
    { name: 'Full Flank', verb: 'amplify', params: { amount: 0.10 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'archetype', archetype: 'Engine' } },
  ],

  // Fluidificante, "Surge": overlaps and lifts the line (self + attackers).
  Fluidificante: [
    { name: 'Surge', verb: 'amplify', params: { amount: 0.10 }, scope: 'slot', target: { kind: 'self' } },
    { name: 'Underlap', verb: 'amplify', params: { amount: 0.05 }, scope: 'global', target: { kind: 'criterion', criterion: 'attackers' } },
  ],

  // Inventor, "From Nothing": conjures chances (Creators).
  Inventor: [
    { name: 'From Nothing', verb: 'amplify', params: { amount: 0.20 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'archetype', archetype: 'Creator' } },
  ],

  // Ball-playing keeper, "Distribution": starts attacks (+5% to Passers).
  'Ball-Playing GK': [
    { name: 'Distribution', verb: 'amplify', params: { amount: 0.05 }, scope: 'global', target: { kind: 'criterion', criterion: 'archetype', archetype: 'Passer' } },
  ],
};

/** Resolve a card's TraitRecords from its tactical role (empty if none). */
export function traitsForCard(card: Card): TraitRecord[] {
  return card.tacticalRole ? (ROLE_TRANSFORMS[card.tacticalRole] ?? []) : [];
}
