/**
 * Kickoff Clash — Defining Traits (SCORING_V2: point-native actions)
 *
 * One currency (docs/SCORING_V2.md): every trait is either a FLAT stat effect
 * (±N ATK/DEF on cards, ledgered and visible) or a BEAT effect (inject a chance
 * for your side / stop one of theirs, played out as a named moment in the round).
 * Nothing here is a percentage of anything — a +2 is a +2.
 *
 *   - `buff`   — flat ±N to teammates picked by a rule. The interaction layer:
 *                thresholds (Marshal/Mentor/Star Service), the back line
 *                (Leadership), pitch geometry (Overlap's man-ahead, Screen's
 *                line-behind), self (Engine Room).
 *   - `debuff` — flat −N on OPPOSING cards (Antagonist: the sanctioned exception —
 *                the only way a card touches the opponent's numbers directly).
 *   - `chance` — a seeded shot at manufacturing an extra possession beat each
 *                round (Postman's cross, the Poacher's tap-in). `asShooter`
 *                puts the owner on the end of it; otherwise the owner creates it.
 *   - `stop`   — a seeded shot at cancelling ONE opposing chance beat this round
 *                (Stopper's tackle, Offside Trap's flag; `save` flavours it as a
 *                keeper's stop).
 *
 * Rarity = trait depth (CARDS_V1 §4): Common 1 / Rare 2 / Epic 3 / Legendary 4,
 * assigned deterministically by card.id. Display copy lives in `trait-copy.ts`,
 * keyed by the exact trait names below.
 */

import type { Card } from './scoring';
import { seededRandom } from './scoring';

// ---------------------------------------------------------------------------
// The point-trait model
// ---------------------------------------------------------------------------

/** Who a flat buff lands on. Geometry rules read the formation (points.ts). */
export type BuffWho =
  | 'self'
  | 'teammates'      // everyone else on the pitch
  | 'backline'       // the DEF band (keeper included)
  | 'lane-ahead'     // the nearest teammate ahead in the same pitch lane (Overlap)
  | 'band-behind'    // every teammate one band behind the owner (Screen)
  | 'atk-below' | 'atk-atLeast' | 'def-below' | 'def-atLeast'; // stat thresholds

export interface StatBuff {
  name: string;
  kind: 'buff';
  who: BuffWho;
  /** Threshold for the stat rules (read on the pre-trait snapshot). */
  value?: number;
  atk?: number;
  def?: number;
  /** Only from the hour mark (round 4 of 5). */
  late?: boolean;
}

export interface EnemyDebuff {
  name: string;
  kind: 'debuff';
  who: 'backline';
  atk?: number;
  def?: number;
  late?: boolean;
}

export interface ChanceTrait {
  name: string;
  kind: 'chance';
  quality: 'half' | 'big';
  /** Seeded probability of firing each round. */
  p: number;
  /** The owner takes the shot himself (else he creates it for a drawn shooter). */
  asShooter?: boolean;
  late?: boolean;
}

export interface StopTrait {
  name: string;
  kind: 'stop';
  /** Seeded probability of being armed each round (cancels one opposing chance). */
  p: number;
  /** Keeper flavour: the cancel animates as a save. */
  save?: boolean;
  late?: boolean;
}

export type PointTrait = StatBuff | EnemyDebuff | ChanceTrait | StopTrait;

// ---------------------------------------------------------------------------
// The trait library (names are trait-copy.ts keys — do not rename casually)
// ---------------------------------------------------------------------------

const POSTMAN: PointTrait = { name: 'Postman', kind: 'chance', quality: 'half', p: 0.3 };
const SNIPER: PointTrait = { name: 'Sniper', kind: 'chance', quality: 'half', p: 0.25, asShooter: true };
const DEADEYE: PointTrait = { name: 'Deadeye', kind: 'chance', quality: 'half', p: 0.3, asShooter: true };
const LEADERSHIP: PointTrait = { name: 'Leadership', kind: 'buff', who: 'backline', def: 1 };
const STOPPER: PointTrait = { name: 'Stopper', kind: 'stop', p: 0.3 };
const OFFSIDE_TRAP: PointTrait = { name: 'Offside Trap', kind: 'stop', p: 0.25 };
const POACHERS_INSTINCT: PointTrait = { name: "Poacher's Instinct", kind: 'chance', quality: 'big', p: 0.2, asShooter: true };
const ENGINE_ROOM: PointTrait = { name: 'Engine Room', kind: 'buff', who: 'self', atk: 2, def: 2, late: true };
/** The owner feeds the man AHEAD of him in the same lane — the fullback's overlap
 *  (the design-owner example: a WD's Overlap adds ATK to the WM in front of him). */
const OVERLAP_RUN: PointTrait = { name: 'Overlap Run', kind: 'buff', who: 'lane-ahead', atk: 2 };

// --- GK action-traits (player-only, like all defining traits) ---
const SHOT_STOPPER: PointTrait = { name: 'Shot Stopper', kind: 'stop', p: 0.3, save: true };
const SWEEPER_KEEPER: PointTrait = { name: 'Sweeper Keeper', kind: 'stop', p: 0.25, save: true };
const COMMANDER_OF_BOX: PointTrait = { name: 'Commander of the Box', kind: 'buff', who: 'backline', def: 1 };
const DISTRIBUTION: PointTrait = { name: 'Distribution', kind: 'chance', quality: 'half', p: 0.2 };
const BIG_GAME_KEEPER: PointTrait = { name: 'Big-Game Keeper', kind: 'stop', p: 0.5, save: true, late: true };

// --- thin-pool outfield fillers ---
const TAKE_ON: PointTrait = { name: 'Take-On', kind: 'chance', quality: 'half', p: 0.25 };
const MAZY_RUN: PointTrait = { name: 'Mazy Run', kind: 'chance', quality: 'big', p: 0.15, asShooter: true };
const INTERCEPTOR: PointTrait = { name: 'Interceptor', kind: 'stop', p: 0.25 };
const LAST_DITCH: PointTrait = { name: 'Last-Ditch', kind: 'stop', p: 0.2 };
const AERIAL_THREAT: PointTrait = { name: 'Aerial Threat', kind: 'chance', quality: 'half', p: 0.25, asShooter: true };
const HOLD_UP: PointTrait = { name: 'Hold-Up Play', kind: 'chance', quality: 'half', p: 0.2 };
const DEEP_DISTRIBUTOR: PointTrait = { name: 'Deep Distributor', kind: 'chance', quality: 'half', p: 0.2 };
/** The DM steps across for the line behind him — the design-owner's Screen. */
const SCREEN: PointTrait = { name: 'Screen', kind: 'buff', who: 'band-behind', def: 2 };
const RUNNER_IN_BEHIND: PointTrait = { name: 'Runner in Behind', kind: 'chance', quality: 'big', p: 0.15, asShooter: true };
const LATE_RUN: PointTrait = { name: 'Late Run', kind: 'chance', quality: 'half', p: 0.35, late: true, asShooter: true };

// --- The flagship interaction trio (owner spec: thresholds on the Snap scale) ---
const MARSHAL: PointTrait = { name: 'Marshal', kind: 'buff', who: 'def-below', value: 5, def: 2 };
const MENTOR: PointTrait = { name: 'Mentor', kind: 'buff', who: 'atk-below', value: 5, atk: 2 };
const STAR_SERVICE: PointTrait = { name: 'Star Service', kind: 'buff', who: 'atk-atLeast', value: 12, atk: 2 };

/** The sanctioned exception: winds up the opposing back line (−2 DEF each). */
const ANTAGONIST: PointTrait = { name: 'Antagonist', kind: 'debuff', who: 'backline', def: -2 };

// ---------------------------------------------------------------------------
// Library — ordered candidate list per archetype (most-identifying first)
// ---------------------------------------------------------------------------

const DEFINING_TRAITS: Record<string, PointTrait[]> = {
  Creator: [POSTMAN, DEADEYE, STAR_SERVICE, SNIPER],
  Passer: [POSTMAN, STAR_SERVICE, DEADEYE, MENTOR],
  Striker: [POACHERS_INSTINCT, ANTAGONIST, SNIPER, DEADEYE],
  Target: [POACHERS_INSTINCT, AERIAL_THREAT, HOLD_UP, ANTAGONIST, DEADEYE],
  Dribbler: [TAKE_ON, MAZY_RUN, SNIPER, POSTMAN],
  Sprinter: [OVERLAP_RUN, RUNNER_IN_BEHIND, ENGINE_ROOM, STOPPER],
  Engine: [OVERLAP_RUN, ENGINE_ROOM, LATE_RUN, STOPPER],
  Destroyer: [STOPPER, INTERCEPTOR, OFFSIDE_TRAP, LAST_DITCH],
  Cover: [OFFSIDE_TRAP, MARSHAL, OVERLAP_RUN, LEADERSHIP],
  Commander: [LEADERSHIP, MARSHAL, MENTOR, STOPPER],
  Controller: [SCREEN, DEEP_DISTRIBUTOR, MENTOR, ENGINE_ROOM],
  Powerhouse: [AERIAL_THREAT, STOPPER, HOLD_UP, ANTAGONIST, POACHERS_INSTINCT],
  GK: [SHOT_STOPPER, SWEEPER_KEEPER, COMMANDER_OF_BOX, DISTRIBUTION, BIG_GAME_KEEPER],
};

const RARITY_TRAIT_COUNT: Record<string, number> = { Common: 1, Rare: 2, Epic: 3, Legendary: 4 };

/**
 * Deterministic, seeded ROTATION of an archetype's candidate list keyed on card.id,
 * then take N = rarity count (clamped to the pool). Same id ⇒ same loadout forever.
 */
export function pickDefiningTraits(card: Card): PointTrait[] {
  const pool = DEFINING_TRAITS[card.archetype] ?? [];
  if (pool.length === 0) return [];
  const n = Math.min(RARITY_TRAIT_COUNT[card.rarity] ?? 1, pool.length);
  const offset = Math.floor(seededRandom((card.id * 2654435761) >>> 0) * pool.length);
  const picked: PointTrait[] = [];
  for (let i = 0; i < n; i++) picked.push(pool[(offset + i) % pool.length]);
  return picked;
}

// ---------------------------------------------------------------------------
// Bespoke showcase legends — hand-authored dense loadouts, keyed by card id.
// ---------------------------------------------------------------------------

export const SIGNATURE_OVERRIDES: Record<number, PointTrait[]> = {
  // 466 Florian Drobny (Creator / WF / Legendary, BRS 95) — the wide-creation maestro.
  466: [
    POSTMAN,
    SNIPER,
    DEADEYE,
    { name: 'Right Flank', kind: 'buff', who: 'self', atk: 2 },
  ],
  // 422 Mateo Belmonte (Striker / Legendary, BRS 92) — the fox in the box.
  422: [
    POACHERS_INSTINCT,
    { name: 'Box Presence', kind: 'chance', quality: 'big', p: 0.35, asShooter: true },
    SNIPER,
    { name: 'Big Game', kind: 'buff', who: 'self', atk: 3, late: true },
  ],
  // 314 Theo Roux (Cover / CD, BRS 80) — the marshal (dense bespoke defender).
  314: [
    LEADERSHIP,
    { name: 'Stopper', kind: 'stop', p: 0.4 },
    OFFSIDE_TRAP,
    { name: 'Organiser', kind: 'buff', who: 'backline', def: 1 },
  ],
};

/** A card's full defining loadout: bespoke showcase override, else the seeded picker. */
export function definingTraitsFor(card: Card): PointTrait[] {
  return SIGNATURE_OVERRIDES[card.id] ?? pickDefiningTraits(card);
}
