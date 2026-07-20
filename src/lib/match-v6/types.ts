/**
 * Kickoff Clash V6 — domain types (NW-140, the card-deployment direction).
 *
 * V6 is a card-deployment game rendered as a football match: the XI is the
 * board, the 7-card bench is the hand, and the live decisions are blind,
 * simultaneous substitutions at three breaks. See
 * `KICKOFF_CLASH_V6_CLAUDE_HANDOFF.md` + `docs/KC_V6_SPEC_DECISIONS.md`.
 *
 * Design constraints on these types:
 *  • Serializable — no `Set`, no functions in persisted state, so a whole match
 *    is snapshot/resume-able and a seed replays byte-identically.
 *  • Discriminated unions + pure dispatch — actions are DATA, resolved by pure
 *    functions (see `actions.ts`), never methods on the fixture object.
 *  • One currency — a card is `cost` + `attack`/`defence` + `sector` + actions.
 *    No fitness, no six-contest ratings, no overall power (V6 non-goals).
 */

// ── Primitives ──────────────────────────────────────────────────────────────

export type TeamSide = 'player' | 'opponent';
export type Sector = 'left' | 'centre' | 'right';
export const SECTORS: readonly Sector[] = ['left', 'centre', 'right'];

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** A single d6 face. */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Action triggers (handoff §"Action timing prefixes"). Player-facing labels:
 * Game Start · On Reveal · Ongoing · When Subbed Off · When Subbed On · On Bench.
 */
export type Trigger =
  | 'game_start'
  | 'on_reveal'
  | 'ongoing'
  | 'when_subbed_off'
  | 'when_subbed_on'
  | 'on_bench';

/**
 * How long a resolved effect lives (spec decision B3). `period` expires at the
 * end of the current period; `ongoing` is recomputed each period and vanishes
 * when its source card leaves the board/bench.
 */
export type EffectDuration = 'period' | 'ongoing';

// ── Action targeting ─────────────────────────────────────────────────────────

/** Where a stat modifier lands. Enemy-directed variants use the `modify_enemy_*` kinds. */
export type ActionTarget =
  | { scope: 'self' }
  | { scope: 'sector'; sector?: Sector } // default: the source card's current sector
  | { scope: 'team' }; // all of your active cards

/** A sector for chance add/cancel. Default: the source card's current sector. */
export interface SectorTarget {
  sector?: Sector;
}

/** Which chance(s) a die-modifying action touches. */
export type ChanceTarget =
  | { which: 'first_in_sector'; sector?: Sector }
  | { which: 'all_in_sector'; sector?: Sector }
  | { which: 'own' }; // a chance this card itself created

/** Filter for cost-discount effects. */
export interface CardFilter {
  sector?: Sector;
  rarity?: Rarity;
  minCost?: number;
  maxCost?: number;
}

/**
 * Minimal condition layer (handoff: "Implement only the variants required by
 * the fixture cards"). Kept as a discriminated union so more can be added
 * without touching call sites.
 */
export type ActionCondition =
  | { when: 'always' }
  | { when: 'period_is'; period: number }
  | { when: 'period_gte'; period: number }
  | { when: 'winning' } // your score > their score at resolve time
  | { when: 'losing' } // your score < their score
  | { when: 'level' }; // scores equal

// ── Actions (the DATA a card carries) ────────────────────────────────────────

export type V6Action =
  | { kind: 'modify_attack'; trigger: Trigger; amount: number; target: ActionTarget; duration: EffectDuration; condition?: ActionCondition }
  | { kind: 'modify_defence'; trigger: Trigger; amount: number; target: ActionTarget; duration: EffectDuration; condition?: ActionCondition }
  | { kind: 'modify_enemy_attack'; trigger: Trigger; amount: number; target: ActionTarget; duration: EffectDuration; condition?: ActionCondition }
  | { kind: 'modify_enemy_defence'; trigger: Trigger; amount: number; target: ActionTarget; duration: EffectDuration; condition?: ActionCondition }
  | { kind: 'improve_die_faces'; trigger: Trigger; faces: Die[]; target: ChanceTarget; duration: EffectDuration; condition?: ActionCondition }
  | { kind: 'reroll_die'; trigger: Trigger; target: ChanceTarget; count: number; condition?: ActionCondition }
  | { kind: 'add_chance'; trigger: Trigger; target: SectorTarget; count: number; condition?: ActionCondition }
  | { kind: 'cancel_chance'; trigger: Trigger; target: SectorTarget; count: number; condition?: ActionCondition }
  | { kind: 'discount_cost'; trigger: Trigger; amount: number; filter?: CardFilter; condition?: ActionCondition }
  | { kind: 'move_sector'; trigger: Trigger; target: Sector; condition?: ActionCondition };

export type V6ActionKind = V6Action['kind'];

// ── Cards ────────────────────────────────────────────────────────────────────

/** Optional avatar palette (UI only; mirrors the mockups' CSS-avatar system). */
export interface CardArt {
  av1?: string;
  av2?: string;
  shirt?: string;
  skin?: string;
  hair?: '' | 'spike' | 'mohawk';
}

/**
 * A printed V6 card — immutable fixture data, shared by reference. `sector` is
 * the card's NATURAL sector; playing it elsewhere costs the out-of-position
 * penalty (spec A3). `position`/`role` are cosmetic flavour only.
 */
export interface V6Card {
  id: string;
  name: string;
  shortName?: string; // e.g. "N. Vale" for the bench variant
  position: string; // cosmetic (e.g. 'CF')
  role?: string; // cosmetic (e.g. 'Finisher')
  sector: Sector;
  cost: number; // 1..6
  attack: number;
  defence: number;
  rarity: Rarity;
  actions: V6Action[]; // 0..2 (legendaries may have 2)
  art?: CardArt;
}

// ── In-play placement ────────────────────────────────────────────────────────

/** Where a card sits. `used` = subbed off; it can never return (handoff). */
export type CardZone = 'active' | 'bench' | 'used';

/**
 * A card's live placement in a match. References a `V6Card` by id and carries
 * only the mutable-over-time bits (zone + current sector). Serializable.
 */
export interface CardInPlay {
  cardId: string;
  zone: CardZone;
  sector: Sector; // current sector (may differ from the card's natural sector)
}

// ── Resolved effects (the ledger board.ts reads) ─────────────────────────────

/**
 * A resolved, applied effect on a team's ledger. Produced by `actions.ts` from
 * a `V6Action` at trigger time, with its target resolved to concrete card ids /
 * a sector / the team. board.ts reads the `stat` effects; the resolver reads the
 * `faces`/`reroll` effects when rolling chances. Every effect names its source
 * card so the board receipt can show which card created each number.
 */
export interface ActiveEffect {
  id: string; // instance id (loop-guard + dedupe)
  sourceCardId: string;
  sourceLabel: string; // e.g. "Niko Vale · On Reveal"
  kind: 'stat' | 'faces' | 'reroll';
  onEnemy: boolean; // targets the OTHER team's board

  // kind === 'stat'
  attack?: number;
  defence?: number;

  // resolved targeting for stat effects
  targetCardIds?: string[]; // specific cards (self)
  targetSector?: Sector; // a whole sector
  targetTeam?: boolean; // all active cards

  // kind === 'faces' | 'reroll' (chance-directed)
  faces?: Die[];
  rerollCount?: number;
  chanceSelector?: ChanceTarget;

  duration: EffectDuration;
  createdPeriod: number; // for `period` expiry
}

// ── Board receipts (board.ts output) ─────────────────────────────────────────

/** One line of a card's effective-stat receipt (printed → penalty → mods → total). */
export interface StatModLine {
  label: string;
  attack: number;
  defence: number;
}

/** A card's effective stats with the full receipt behind them. */
export interface CardStatReceipt {
  cardId: string;
  name: string;
  sector: Sector;
  naturalSector: Sector;
  outOfPosition: boolean;
  printedAttack: number;
  printedDefence: number;
  mods: StatModLine[]; // penalty + applied effects, in order
  attack: number; // effective (may be < 0; threshold math floors at 0)
  defence: number;
}

/** A sector's aggregate for one side. */
export interface SectorReceipt {
  sector: Sector;
  attack: number; // Σ effective attack (raw; may exceed threshold caps)
  defence: number; // Σ effective defence
  cards: CardStatReceipt[];
}

/** A full one-side board: the three sectors, always present. */
export type BoardReceipt = Record<Sector, SectorReceipt>;

// ── Chances & rolls ──────────────────────────────────────────────────────────

/** A chance token, created by ATT thresholds or an action. */
export interface ChanceToken {
  id: string;
  side: TeamSide;
  sector: Sector;
  origin: 'natural' | 'action';
  faces: Die[]; // scoring faces (default from balance.naturalGoalFaces)
  rerolls: number; // available rerolls before the die is final
  attackerCardId?: string; // ATT-weighted attribution (presentation only)
  sourceCardId?: string; // for action-created/modified chances
}

/** The result of rolling one chance token. */
export interface ChanceRoll {
  tokenId: string;
  side: TeamSide;
  sector: Sector;
  rolls: Die[]; // [initial, ...rerolls]
  scored: boolean;
  attackerCardId?: string;
  saverCardId?: string; // DEF-weighted attribution when it does NOT score
}

// ── Match state (grown in later commits; kept lean + serializable) ───────────

/** Per-team live state. */
export interface V6TeamState {
  side: TeamSide;
  managerId: string;
  name: string;
  cards: CardInPlay[]; // every card this team owns (active + bench + used)
  effects: ActiveEffect[];
  score: number;
}

/** Which break we are at (0 = before P1 kickoff, then breaks 1..3 before P2..P4). */
export type BreakIndex = 0 | 1 | 2 | 3;

/** The whole match. */
export interface V6MatchState {
  seed: number;
  period: number; // 1..4 (0 during pre-kickoff selection)
  breakIndex: BreakIndex;
  priority: TeamSide; // who reveals first at the next break
  energy: number; // shared energy available this break
  player: V6TeamState;
  opponent: V6TeamState;
  cardPool: Record<string, V6Card>; // id → printed card (shared, immutable)
  log: MatchLogEvent[];
}

/** One ordered substitution: card `out` (active) → card `in` (bench). */
export interface SubPair {
  outCardId: string;
  inCardId: string;
}

/** A blind substitution plan for one break (spec A4 — an explicit ordered list). */
export interface SubstitutionPlan {
  side: TeamSide;
  pairs: SubPair[]; // resolution order == array order
}

/** A single reveal-sequence step (drives the reveal animation from engine events). */
export interface RevealEvent {
  side: TeamSide;
  order: number;
  kind: 'sub_off' | 'move' | 'reveal' | 'action';
  cardId: string;
  text: string;
}

/** A resolved period's receipt. */
export interface PeriodResult {
  period: number;
  chances: ChanceToken[];
  rolls: ChanceRoll[];
  playerGoals: number;
  opponentGoals: number;
  nextPriority: TeamSide;
  log: MatchLogEvent[];
}

// ── The typed event log (source of truth for UI + records) ───────────────────

export type MatchLogEvent =
  | { type: 'kickoff'; seed: number; priority: TeamSide }
  | { type: 'break_open'; breakIndex: BreakIndex; energy: number; priority: TeamSide }
  | { type: 'plan_locked'; side: TeamSide; pairs: SubPair[] }
  | { type: 'reveal'; event: RevealEvent }
  | { type: 'sector_totals'; period: number; side: TeamSide; sector: Sector; attack: number; defence: number }
  | { type: 'chance_created'; token: ChanceToken }
  | { type: 'chance_cancelled'; side: TeamSide; sector: Sector; byDefence: number }
  | { type: 'chance_rolled'; roll: ChanceRoll }
  | { type: 'goal'; side: TeamSide; sector: Sector; scorerCardId?: string; roll: Die[]; note?: string }
  | { type: 'period_end'; period: number; playerGoals: number; opponentGoals: number; nextPriority: TeamSide }
  | { type: 'full_time'; playerScore: number; opponentScore: number };
