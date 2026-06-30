/**
 * Kickoff Clash — Defining Traits (the action-buff layer, CARDS_V1 §4)
 *
 * On TOP of a card's role-baseline (% body, role-transforms.ts) each card carries
 * N DEFINING traits, where N = rarity (Common 1 / Rare 2 / Epic 3 / Legendary 4).
 * A defining trait is a Marvel-Snap-style ACTION over the closed verb palette —
 * a conditional `generate` (a manufactured chance), a `deny` (stop the opponent),
 * or a persistent `amplify` aura — NEVER a flat % body buff. Each carries an
 * `animation` kind (`moment` discrete vs `aura` persistent) so a firing surfaces
 * as match-screen juice (see match-v5 `traitEvents`).
 *
 * Magnitudes here are STARTING values flagged for balance-lab (sweep them); the
 * mechanism is the deliverable, not the calibration. Assignment is deterministic
 * (seeded by card.id) so a card's loadout is stable across runs.
 */

import type { TraitRecord } from './verbs';
import type { Card } from './scoring';
import { seededRandom } from './scoring';

// ---------------------------------------------------------------------------
// The signature action-traits (palette-only; no new verbs)
// ---------------------------------------------------------------------------

/** Postman — guaranteed key-pass cross into the box when a target's up top. */
const POSTMAN: TraitRecord = {
  name: 'Postman', verb: 'generate', params: { amount: 22 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' },
  condition: { kind: 'box-target-present' }, animation: 'moment',
};

/** Sniper — speculative long shot: a gated boost to the owner's own finishing. */
const SNIPER: TraitRecord = {
  name: 'Sniper', verb: 'amplify', params: { amount: 0.45, chance: 0.5 },
  scope: 'slot', target: { kind: 'zone', zone: 'finishing' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Deadeye — set-piece threat: a guaranteed finishing chance every 15'. */
const DEADEYE: TraitRecord = {
  name: 'Deadeye', verb: 'generate', params: { amount: 16 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Leadership — ongoing aura: lifts the whole back line, the weakest most. */
const LEADERSHIP: TraitRecord = {
  name: 'Leadership', verb: 'amplify-inverse-power', params: { amount: 0.24 },
  scope: 'global', target: { kind: 'criterion', criterion: 'all-teammates', zone: 'defence' },
  animation: 'aura',
};

/** Stopper — the big tackle / the high press: a gated denial of the opponent's attack.
 *  Fires REGARDLESS of which third the carrier plays in (a pressing forward or a
 *  box-to-box Engine wins the ball high, not only a last-ditch CB tackle). The old
 *  `is-defending` gate silently nullified Stopper on forward-cell carriers (Powerhouse/
 *  Engine/Sprinter), so a Rare deck's defensive 2nd trait did nothing on defence — the
 *  S3-mid concede dip (balance-lab: its yourDenial was ~0.07 vs S2's 0.22 despite four
 *  Stopper carriers). Denial is still capped (DENIAL_CAP 0.5) and chance-gated. */
const STOPPER: TraitRecord = {
  name: 'Stopper', verb: 'deny', params: { amount: 0.14, chance: 0.6 },
  scope: 'zone', target: { kind: 'zone', zone: 'attack' },
  animation: 'moment',
};

/** Offside Trap — springs only when the line is set (≥3 at the back). */
const OFFSIDE_TRAP: TraitRecord = {
  name: 'Offside Trap', verb: 'deny', params: { amount: 0.15 },
  scope: 'zone', target: { kind: 'zone', zone: 'attack' },
  condition: { kind: 'backline-count', min: 3 }, animation: 'moment',
};

/** Poacher's Instinct — guaranteed tap-in chance into the box while attacking. */
const POACHERS_INSTINCT: TraitRecord = {
  name: "Poacher's Instinct", verb: 'generate', params: { amount: 14 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Engine Room — switches on late: a self lift from the 60' onward. */
const ENGINE_ROOM: TraitRecord = {
  name: 'Engine Room', verb: 'amplify', params: { amount: 0.20 },
  scope: 'slot', target: { kind: 'self' },
  condition: { kind: 'late-game', fromIncrement: 3 }, animation: 'aura',
};

/** Overlap Run — the pacey runner stretches the pitch and manufactures a chance for
 *  others. Lands in CREATION (not finishing): the runner-heavy archetypes (Sprinter/
 *  Engine) are finisher-rich but creation-STARVED, and creation gates possession
 *  (control = creation + attack), so a higher-power runner deck was out-possessed by a
 *  lower-power creative one — the S3-mid monotonicity dip (balance-lab). Feeding their
 *  thin dimension restores the curve without touching the strong tiers' already-rich
 *  creation. */
const OVERLAP_RUN: TraitRecord = {
  name: 'Overlap Run', verb: 'generate', params: { amount: 22 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

// ---------------------------------------------------------------------------
// Library — ordered candidate list per archetype (most-identifying first)
// ---------------------------------------------------------------------------

const DEFINING_TRAITS: Record<string, TraitRecord[]> = {
  Creator: [POSTMAN, DEADEYE, SNIPER, ENGINE_ROOM],
  Passer: [POSTMAN, DEADEYE, ENGINE_ROOM],
  Striker: [POACHERS_INSTINCT, SNIPER, DEADEYE],
  Target: [POACHERS_INSTINCT, DEADEYE],
  Dribbler: [SNIPER, POSTMAN],
  Sprinter: [OVERLAP_RUN, ENGINE_ROOM, STOPPER],
  Engine: [OVERLAP_RUN, ENGINE_ROOM, STOPPER],
  Destroyer: [STOPPER, OFFSIDE_TRAP],
  Cover: [OFFSIDE_TRAP, STOPPER, LEADERSHIP],
  Commander: [LEADERSHIP, OFFSIDE_TRAP, STOPPER],
  Controller: [ENGINE_ROOM, DEADEYE],
  Powerhouse: [POACHERS_INSTINCT, STOPPER],
  GK: [LEADERSHIP], // keeper's shot-stopping body stays in the role baseline
};

const RARITY_TRAIT_COUNT: Record<string, number> = { Common: 1, Rare: 2, Epic: 3, Legendary: 4 };

/**
 * Deterministic, seeded ROTATION of an archetype's candidate list keyed on card.id,
 * then take N = rarity count (clamped to the pool). Same id ⇒ same loadout forever
 * (no Math.random — uses the engine's seeded hash), distinct picks within a card.
 */
export function pickDefiningTraits(card: Card): TraitRecord[] {
  const pool = DEFINING_TRAITS[card.archetype] ?? [];
  if (pool.length === 0) return [];
  const n = Math.min(RARITY_TRAIT_COUNT[card.rarity] ?? 1, pool.length);
  const offset = Math.floor(seededRandom((card.id * 2654435761) >>> 0) * pool.length);
  const picked: TraitRecord[] = [];
  for (let i = 0; i < n; i++) picked.push(pool[(offset + i) % pool.length]);
  return picked;
}

// ---------------------------------------------------------------------------
// Bespoke showcase legends — hand-authored dense loadouts, keyed by card id.
// (Consulted before the procedural picker, so these override the rarity count.)
// ---------------------------------------------------------------------------

export const SIGNATURE_OVERRIDES: Record<number, TraitRecord[]> = {
  // 466 Florian Drobny (Creator / WF / Legendary, BRS 95) — the wide-creation maestro.
  466: [
    POSTMAN,
    SNIPER,
    { ...DEADEYE, to: { band: 'ATT', lane: 'C' } },
    { name: 'Right Flank', verb: 'amplify', params: { amount: 0.18 }, scope: 'slot', target: { kind: 'self' }, condition: { kind: 'in-wide-slot' }, animation: 'aura' },
  ],
  // 422 Mateo Belmonte (Striker / Legendary, BRS 92) — the fox in the box.
  422: [
    POACHERS_INSTINCT,
    { ...POACHERS_INSTINCT, name: 'Box Presence', params: { amount: 20 } },
    SNIPER,
    { name: 'Big Game', verb: 'amplify', params: { amount: 0.22 }, scope: 'slot', target: { kind: 'zone', zone: 'finishing' }, condition: { kind: 'late-game', fromIncrement: 3 }, animation: 'aura' },
  ],
  // 314 Theo Roux (Cover / CD, BRS 80) — the marshal. Bespoke showcase: a dense
  // defender identity (the rarity count is intentionally overridden here).
  314: [
    LEADERSHIP,
    { ...STOPPER, params: { amount: 0.16, chance: 0.7 } },
    OFFSIDE_TRAP,
    { name: 'Organiser', verb: 'amplify', params: { amount: 0.10 }, scope: 'global', target: { kind: 'criterion', criterion: 'defenders', zone: 'defence' }, condition: { kind: 'is-defending' }, animation: 'aura' },
  ],
};
