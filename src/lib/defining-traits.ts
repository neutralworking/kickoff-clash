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
  name: 'Postman', verb: 'generate', params: { amount: 4 },
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
  name: 'Deadeye', verb: 'generate', params: { amount: 3 },
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
  scope: 'zone', target: { kind: 'zone', zone: 'creation' }, denyZone: 'creation',
  animation: 'moment',
};

/** Offside Trap — springs only when the line is set (≥3 at the back). Catches the
 *  run at the moment of the finish: knocks the opponent's finishing lane. */
const OFFSIDE_TRAP: TraitRecord = {
  name: 'Offside Trap', verb: 'deny', params: { amount: 0.15 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, denyZone: 'finishing',
  condition: { kind: 'backline-count', min: 3 }, animation: 'moment',
};

/** Poacher's Instinct — guaranteed tap-in chance into the box while attacking. */
const POACHERS_INSTINCT: TraitRecord = {
  name: "Poacher's Instinct", verb: 'generate', params: { amount: 3 },
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
  name: 'Overlap Run', verb: 'generate', params: { amount: 4 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

// ---------------------------------------------------------------------------
// GK action-traits (the keeper identity, palette-only). Keepers ALWAYS defend
// (their cell is DEF, side 'defence'), so `is-defending` is the natural gate and
// no new condition is needed. Magnitudes sit at the LOW end of the deny band
// (0.10–0.12, below Stopper's 0.14) because these are player-ONLY — the opponent
// opts out of defining traits, so a keeper trait is a one-sided "concede less"
// buff whose owner (the GK) is one card and whose denial STACKS on top of the
// back line's Stopper/Offside Trap under the shared DENIAL_CAP (0.5).
// ---------------------------------------------------------------------------

/** Shot Stopper — the keeper's bread and butter: a reliable, gated save that
 *  suppresses the opponent's conversion. The keeper is always defending, so the
 *  gate just documents intent; the chance keeps it a "moment", not a flat wall. */
const SHOT_STOPPER: TraitRecord = {
  name: 'Shot Stopper', verb: 'deny', params: { amount: 0.11, chance: 0.7 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' },
  condition: { kind: 'is-defending' }, animation: 'moment',
};

/** Sweeper Keeper — rushes off the line to snuff a through-ball, but only when the
 *  line is pushed up (≥3 at the back) so there's space behind to sweep. Reuses the
 *  Offside Trap structure gate — a keeper's sweep and an offside line are the same bet. */
const SWEEPER_KEEPER: TraitRecord = {
  name: 'Sweeper Keeper', verb: 'deny', params: { amount: 0.12 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' },
  condition: { kind: 'backline-count', min: 3 }, animation: 'moment',
};

/** Commander of the Box — an ongoing aura that organises the defence, lifting the
 *  weakest defender most (like Leadership, a shade gentler). A vocal keeper marshals. */
const COMMANDER_OF_BOX: TraitRecord = {
  name: 'Commander of the Box', verb: 'amplify-inverse-power', params: { amount: 0.18 },
  scope: 'global', target: { kind: 'criterion', criterion: 'all-teammates', zone: 'defence' },
  animation: 'aura',
};

/** Distribution — a ball-playing keeper who launches attacks from the back:
 *  manufactures a creation chance (control = creation + attack), so the keeper's
 *  distribution actually starts moves rather than just clearing his lines. */
const DISTRIBUTION: TraitRecord = {
  name: 'Distribution', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' },
  animation: 'moment',
};

/** Big-Game Keeper — turns up when it matters: a late, clutch save that only
 *  switches on from the hour mark. The keeper who wins you the tight ones at the death. */
const BIG_GAME_KEEPER: TraitRecord = {
  name: 'Big-Game Keeper', verb: 'deny', params: { amount: 0.12 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' },
  condition: { kind: 'late-game', fromIncrement: 3 }, animation: 'moment',
};

// ---------------------------------------------------------------------------
// Thin outfield-pool fillers (palette-only) — each keeps its archetype's identity.
// ---------------------------------------------------------------------------

/** Take-On — the dribbler beats his man and manufactures the opening: a chance
 *  into CREATION while attacking (beating a defender opens the pass, not the shot). */
const TAKE_ON: TraitRecord = {
  name: 'Take-On', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Mazy Run — the dribbler carries it all the way into the box: a manufactured
 *  finishing chance central while attacking (the solo run that ends in a shot). */
const MAZY_RUN: TraitRecord = {
  name: 'Mazy Run', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Interceptor — the ball-winner reads the pass and snuffs the attack out (a gated
 *  deny while defending). Sits just under Stopper: it's a lighter, more frequent read. */
const INTERCEPTOR: TraitRecord = {
  name: 'Interceptor', verb: 'deny', params: { amount: 0.12, chance: 0.6 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' }, denyZone: 'creation',
  condition: { kind: 'is-defending' }, animation: 'moment',
};

/** Last-Ditch — the destroyer throws himself in front of the shot: a chance-gated
 *  block that knocks the quality off the opponent's finishing. */
const LAST_DITCH: TraitRecord = {
  name: 'Last-Ditch', verb: 'deny', params: { amount: 0.13, chance: 0.5 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, denyZone: 'finishing',
  animation: 'moment',
};

/** Aerial Threat — the big man wins the header in the box: a manufactured finishing
 *  chance central while attacking. Shared by Powerhouse and Target (the box aerials). */
const AERIAL_THREAT: TraitRecord = {
  name: 'Aerial Threat', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Hold-Up Play — the target man holds it up and brings runners in: a creation
 *  chance while attacking (control = creation + attack). Shared by Powerhouse/Target. */
const HOLD_UP: TraitRecord = {
  name: 'Hold-Up Play', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Deep Distributor — the controller dictates from deep: a creation chance while
 *  attacking (feeds possession the same way Regista's Metronome scales it). */
const DEEP_DISTRIBUTOR: TraitRecord = {
  name: 'Deep Distributor', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Screen — the controller shields the back four: a gated deny while defending
 *  (a dual-role Controller protects the line as well as builds play). */
const SCREEN: TraitRecord = {
  name: 'Screen', verb: 'deny', params: { amount: 0.11, chance: 0.6 },
  scope: 'zone', target: { kind: 'zone', zone: 'creation' }, denyZone: 'creation',
  condition: { kind: 'is-defending' }, animation: 'moment',
};

/** Runner in Behind — the sprinter runs onto the through ball: a manufactured
 *  finishing chance central while attacking (pace in behind, not build-up). */
const RUNNER_IN_BEHIND: TraitRecord = {
  name: 'Runner in Behind', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' },
  condition: { kind: 'is-attacking' }, animation: 'moment',
};

/** Late Run — the box-to-box engine arrives late in the area: a manufactured
 *  finishing chance that only switches on from the hour mark (the ghosting run). */
const LATE_RUN: TraitRecord = {
  name: 'Late Run', verb: 'generate', params: { amount: 3 },
  scope: 'zone', target: { kind: 'zone', zone: 'finishing' }, to: { band: 'ATT', lane: 'C' },
  condition: { kind: 'late-game', fromIncrement: 3 }, animation: 'moment',
};

/** Marshal — the owner's canonical interaction: organises the stragglers. Every
 *  teammate with DEF below 5 defends at +2 while he's on the pitch. Its value DECAYS
 *  as your squad's DEF scales — upgrading your defenders obsoletes the buff. */
const MARSHAL: TraitRecord = {
  name: 'Marshal', verb: 'amplify', params: { flatDef: 2 },
  scope: 'global', target: { kind: 'criterion', criterion: 'stat-below', stat: 'def', value: 5 },
  animation: 'aura',
};

/** Mentor — coaches the passengers: teammates with ATK below 5 attack at +2. */
const MENTOR: TraitRecord = {
  name: 'Mentor', verb: 'amplify', params: { flatAtk: 2 },
  scope: 'global', target: { kind: 'criterion', criterion: 'stat-below', stat: 'atk', value: 5 },
  animation: 'aura',
};

/** Star Service — feeds the front line: teammates with ATK 12 or more get +2.
 *  The build-around inverse of Mentor — worth more the more stars you field. */
const STAR_SERVICE: TraitRecord = {
  name: 'Star Service', verb: 'amplify', params: { flatAtk: 2 },
  scope: 'global', target: { kind: 'criterion', criterion: 'stat-atLeast', stat: 'atk', value: 12 },
  condition: { kind: 'is-attacking' }, animation: 'aura',
};

/** Antagonist — the sanctioned exception (FUNNEL_MODEL_V1): winds up the opposing
 *  back line, so their DEFENCE lane is reduced while he's on the pitch and attacking.
 *  The only way a card touches the opponent's numbers directly. Forwards' pools only. */
const ANTAGONIST: TraitRecord = {
  name: 'Antagonist', verb: 'deny', params: { amount: 0.12 },
  scope: 'zone', target: { kind: 'zone', zone: 'defence' }, denyZone: 'defence',
  condition: { kind: 'is-attacking' }, animation: 'aura',
};

// ---------------------------------------------------------------------------
// Library — ordered candidate list per archetype (most-identifying first)
// ---------------------------------------------------------------------------

const DEFINING_TRAITS: Record<string, TraitRecord[]> = {
  Creator: [POSTMAN, DEADEYE, STAR_SERVICE, SNIPER],
  Passer: [POSTMAN, STAR_SERVICE, DEADEYE, MENTOR],
  Striker: [POACHERS_INSTINCT, ANTAGONIST, SNIPER, DEADEYE],
  Target: [POACHERS_INSTINCT, AERIAL_THREAT, HOLD_UP, ANTAGONIST, DEADEYE],
  Dribbler: [TAKE_ON, MAZY_RUN, SNIPER, POSTMAN],
  Sprinter: [OVERLAP_RUN, RUNNER_IN_BEHIND, ENGINE_ROOM, STOPPER],
  Engine: [OVERLAP_RUN, ENGINE_ROOM, LATE_RUN, STOPPER],
  Destroyer: [STOPPER, INTERCEPTOR, OFFSIDE_TRAP, LAST_DITCH],
  Cover: [OFFSIDE_TRAP, MARSHAL, STOPPER, LEADERSHIP],
  Commander: [LEADERSHIP, MARSHAL, MENTOR, STOPPER],
  Controller: [ENGINE_ROOM, DEEP_DISTRIBUTOR, MENTOR, SCREEN],
  Powerhouse: [AERIAL_THREAT, STOPPER, HOLD_UP, ANTAGONIST, POACHERS_INSTINCT],
  // Keeper identity over the palette (shot-stopping body stays in the role baseline);
  // 5 candidates so Rare/Epic/Legendary keepers all fill their rarity count.
  GK: [SHOT_STOPPER, SWEEPER_KEEPER, COMMANDER_OF_BOX, DISTRIBUTION, BIG_GAME_KEEPER],
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
