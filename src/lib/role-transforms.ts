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
 * `scale`/`deny` records name an emission kind (attack/defence/creation/finishing);
 * `relocate` records name a destination cell relative to the owner's (`to.lane` /
 * `to.band`), moving real emission across the 3×3 field (MATCH_ENGINE §4). The band
 * intuition ATT≈finishing, MID≈creation is applied when cells project to the scalar
 * chance model, so a drop-deep shift trades finishing for creation on its own.
 */

import type { Card } from './scoring';
import type { TraitRecord } from './verbs';
import { pickDefiningTraits, SIGNATURE_OVERRIDES } from './defining-traits';

export const ROLE_TRANSFORMS: Record<string, TraitRecord[]> = {
  // ---- §9 starting set ----------------------------------------------------

  // Regista @ MID, "Metronome": +5% creation across your cells.
  Regista: [
    { name: 'Metronome', verb: 'amplify', params: { amount: 0.05 }, scope: 'global', target: { kind: 'zone', zone: 'creation' } },
  ],

  // Volante @ MID, "Tackle & Go": −5% opponent possession (wins the ball back).
  Volante: [
    { name: 'Tackle & Go', verb: 'deny', params: { amount: 0.05 }, scope: 'zone', target: { kind: 'zone', zone: 'possession' }, denyZone: 'possession' },
  ],

  // Anchor @ DEF, "The Shield": +30% to the lowest-power card's defence.
  Anchor: [
    { name: 'The Shield', verb: 'amplify', params: { amount: 0.30 }, scope: 'global', target: { kind: 'criterion', criterion: 'lowest-power', zone: 'defence' } },
  ],

  // Inside forward @ ATT_L/R, "Cut Inside": carry the wide threat into the central
  // lane (ATT_L/R → ATT_C). Loads the middle and thins the flank — a real lane shift.
  'Inverted Winger': [
    { name: 'Cut Inside', verb: 'relocate', params: { fraction: 0.40 }, scope: 'slot', target: { kind: 'self' }, to: { lane: 'C' }, condition: { kind: 'is-attacking' } },
  ],

  // False 9 @ ATT_C, "Drop Deep": drop off the front into midfield (ATT_C → MID_C).
  // The band shift trades finishing for creation (§4 ATT≈finishing, MID≈creation) and
  // empties the box on its own — no separate "vacate" record needed.
  'Falso Nove': [
    { name: 'Drop Deep', verb: 'relocate', params: { fraction: 0.50 }, scope: 'slot', target: { kind: 'self' }, to: { band: 'MID' }, condition: { kind: 'is-attacking' } },
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

/**
 * Role aliases (data port D.4). The V3.1 Chief Scout pool emits authentic `best_role`
 * names that don't all map 1:1 onto the §9 role vocabulary above. Rather than overwrite
 * the evocative role on the card (it's shown to the player), we alias each new role to the
 * closest existing trait set so the dispatcher still fires. Without this ~44% of the pool
 * (Playmaker, Wide Playmaker, Distributor, Fullback, Sweeper, …) would emit no role traits.
 */
const ROLE_ALIASES: Record<string, string> = {
  Playmaker: 'Regista',            // deep tempo creator → Metronome (+creation)
  'Wide Playmaker': 'Fantasista',  // creative wide mid → Half-Space Magic (Creators)
  Distributor: 'Ball-Playing GK',  // sweeper-keeper distribution → starts attacks
  Fullback: 'Lateral',             // overlapping fullback → Overlap
  'Wing-back': 'Fluidificante',    // attacking wing-back → Surge + Underlap
  Sweeper: 'Libero',               // sweeping CB → Surgical Pass (releases forwards)
  'Vertical Forward': 'Poacher',   // direct runner → Box Presence (finishing)
  Colossus: 'Stopper',             // dominant CB → Front Foot
  Centrale: 'Zagueiro',            // central defender → Commander
  'Auxiliary CB': 'Zagueiro',      // makeshift CB → Commander
  'Segundo Volante': 'Volante',    // ball-winning mid → Tackle & Go
  Pivote: 'Anchor',                // holding pivot → The Shield
  Mediapunta: 'Trequartista',      // central #10 → Moment of Genius
  'Half-Space Creator': 'Mezzala', // half-space runner → Half-Space Run
};

/** Just the role-% baseline (the invisible body) — no defining action-traits on top. */
function roleBaselineFor(card: Card): TraitRecord[] {
  const role = card.tacticalRole;
  return role ? (ROLE_TRANSFORMS[role] ?? ROLE_TRANSFORMS[ROLE_ALIASES[role] ?? ''] ?? []) : [];
}

/**
 * Resolve a card's TraitRecords: the role-% BASELINE (the invisible body) + the card's
 * N rarity-scaled DEFINING action-traits on top (CARDS_V1 §4). The role baseline falls
 * back through `ROLE_ALIASES` so the V3.1 pool's authentic role names still drive the
 * dispatcher; the defining layer is a bespoke showcase override (by card id) or the
 * deterministic per-archetype picker.
 *
 * `includeDefining = false` returns ONLY the role baseline — used for the faceless
 * generated opponent XI (ids 9000+), whose difficulty is already carried by the
 * calibrated ROUND_POWER/opponentScaleTraits budget. Stacking the player-facing
 * defining suite (Marvel-Snap generates/denies) on top of that pre-defining baseline
 * double-counted the difficulty (balance-lab: ga→4.7, top deck 33% vs R5). The player
 * keeps the full punchy suite; only the nameless opponent opts out (it has no trait
 * pills/animations on screen, so nothing is lost visually).
 */
export function traitsForCard(card: Card, includeDefining = true): TraitRecord[] {
  const baseline = roleBaselineFor(card);
  if (!includeDefining) return baseline;
  const defining = SIGNATURE_OVERRIDES[card.id] ?? pickDefiningTraits(card);
  return [...baseline, ...defining];
}
