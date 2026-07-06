/**
 * Kickoff Clash — Match Engine v5: Active Card Play
 *
 * The player assigns XI cards to attack or defend each increment.
 * Two scoring axes (attack/defence) replace a single score.
 * Chemistry fires contextually based on card placement.
 */

import type { Card, SlottedCard, PlayingStyle, Durability } from './scoring';
import { seededRandom, PLAYING_STYLES } from './scoring';
import type { Connection, CrossSynergy } from './chemistry';
import {
  findPositionalConnections,
  PERSONALITY_THEMES,
  THEME_RESONANCES,
} from './chemistry';
import type { Formation, FormationSlot } from './formations';
import type { JokerCard } from './jokers';
import { getExtraDiscards } from './jokers';
import type { TacticCard } from './tactics';
import { getTacticById } from './tactics';
import type { TeamIntent } from './run';
import type { SquadContext } from './squad-transforms';
import { squadTraits, tacticTraits } from './squad-transforms';
import {
  INCREMENT_MINUTES,
  generateGoalText,
  generateChanceText,
  generateInjuryText,
} from './hand';
import type { MatchEvent } from './hand';
import type { DispatchCard, ZoneName, TraitRecord, TraitLogLine } from './verbs';
import { dispatchTraits, ZONES } from './verbs';
import { laneOfCard, LANE_BAND, LEAD_SPREAD, DEF_LANE_OF_BAND, liveStats, deriveStats } from './funnel';
import { traitsForCard } from './role-transforms';
import type { Lane, Cell, Band } from './field';
import { CELLS, BANDS, LANES, cellOf, bandOf } from './field';
import {
  generateOpponentXI, opponentScaleTraits, counterPush, reactivityFor,
} from './opponent';
import type { CoAppearance } from './chem';
import { chemistryRecords } from './chem';
import type { PossessionSide, Shot } from './possession';
import { simulatePeriod } from './possession';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonalityBonus {
  attackMod: number;          // multiplier, e.g. 1.15
  defenceMod: number;         // multiplier, e.g. 1.20
  label: string | null;       // e.g. "Silk (3× Maestro)"
  perfectDressingRoom: boolean;
}

export interface MatchV5State {
  xi: Card[];
  bench: Card[];
  remainingDeck: Card[];
  attackerIds: Set<number>;   // card IDs committed to attack this increment
  attackerOrder: number[];    // ordered sequence for the attacking play; last card is the finisher
  subsRemaining: number;
  discardsRemaining: number;
  subsUsed: { outId: number; inId: number; minute: number }[];
  currentIncrement: number;   // 0–4 index
  isFirstHalf: boolean;
  scores: IncrementResult[];
  yourGoals: number;
  opponentGoals: number;
  formation: Formation;
  playingStyle: string;
  intent: TeamIntent;         // pre-match attacking/balanced/defensive lean
  personalityBonus: PersonalityBonus;
  opponentRound: number;      // 1–5 (for baseline lookup)
  opponentStyle: string;      // Passive | Balanced | Attacking | Counter | Adaptive
  opponentWeakness: string;   // archetype the opponent is weak to
  opponentXI: Card[];         // the opponent's positioned side (step 4)
  opponentFormation: Formation;
  chemistry: CoAppearance;    // run-accumulated pairwise co-appearances (CARDS §5)
  /** TACTICS BY CARDS: up to 3 tactic cards equipped before kick-off (ids). Their
   *  records run every increment through the squad source; conditions on the
   *  records (trailing, late-game) still gate situationally. */
  equippedTactics: string[];
  seed: number;
}

export interface CascadeLine {
  label: string;
  value: number;
  type: 'base' | 'synergy' | 'style' | 'dual-role' | 'personality' | 'manager' | 'tactic' | 'ability';
}

/** A defining trait that FIRED this increment — the hook the match screen animates.
 *  `moment` = a discrete event (cross/long-shot/tackle); `aura` = a persistent warp
 *  (leadership). Additive/read-side, deduped by (cardId, traitName). */
export interface TraitEvent {
  cardId: number;
  traitName: string;
  animation: 'moment' | 'aura';
  zone?: ZoneName;
}

export interface AttackDefenceSplit {
  /** Stage 1 attack: possession total — splits the period's possessions. */
  possession: number;
  /** Stage 1 counter: pressing total — cuts the OPPONENT's possession. */
  pressing: number;
  /** Stage 3 counter: defence total — suppresses the opponent's xG. */
  defenceScore: number;
  /** Stage 2 attack: creation total (per-pitch-lane detail in lanePush). */
  chanceCreation: number;
  /** Stage 3 attack: finishing total — the xG quality term. */
  shotQuality: number;
  playName: string;
  playSummary: string;
  finisherId: number | null;
  attackBreakdown: CascadeLine[];
  defenceBreakdown: CascadeLine[];
  attackSynergies: Connection[];
  defenceSynergies: Connection[];
  crossSynergies: CrossSynergy[];
  attackerCount: number;
  maxAttackers: number;
  /** Opponent goal-chance reduction produced by `deny` verbs (Volante). 0 = none. */
  opponentDenial: number;
  /** Lane-targeted denial applied to the OPPONENT's lane totals (antagonists). */
  zoneDenial: Partial<Record<ZoneName, number>>;
  /** Outcome-spread shaping for the xG step (dampen/amplify-variance). 0 = neutral. */
  varianceFactor: number;
  /** Per-lane attacking threat (zonal field, §4) — consumed by the coupled contest. */
  lanePush: Record<Lane, number>;
  /** Per-lane defensive cover (zonal field, §4). */
  laneCover: Record<Lane, number>;
  /** Attacking players deep → forward (the move sequence; last is the finisher). */
  attackingOrder: number[];
  /** The transformed 9×4 grid from the dispatcher (additive — read, never recomputed). */
  cells: Record<Cell, Record<ZoneName, number>>;
  /** Per-card pre-dispatch emission keyed by card id. The basis for the read-side
   *  per-player rating. Additive — never fed back into the resolution math. */
  cardEmit: Record<number, Record<ZoneName, number>>;
  /** LIVE per-card effective stats (display-only): fitness + band fit + every
   *  card-touching trait (role %, auras, flat buffs, manager amps, tactic zone
   *  amps by emission share) + the funnel cascade multipliers. `baseAtk/baseDef`
   *  are the printed card numbers, so the UI can colour buffed green / drained
   *  red. The player-facing feedback surface. */
  cardStats: Record<number, { atk: number; def: number; baseAtk: number; baseDef: number }>;
  /** Defining traits that FIRED this increment (animation-tagged) — the match-feel hook. */
  traitEvents: TraitEvent[];
  /** Per-card fitness deltas from drain-fitness records this spell (negative values;
   *  may include opponent card ids via enemy targeting). Applied in advanceIncrement. */
  fitnessDelta: Record<number, number>;
}

export interface IncrementResult {
  minute: number;
  split: AttackDefenceSplit;
  opponentAttack: number;
  opponentDefence: number;
  yourChanceVolume: number;
  yourChanceQuality: number;
  yourGoalChance: number;
  opponentChanceVolume: number;
  opponentChanceQuality: number;
  opponentGoalChance: number;
  yourScored: boolean;
  opponentScored: boolean;
  // Per-possession model (engine v1): goals per period can be 0..n.
  yourGoalCount: number;
  opponentGoalCount: number;
  yourXG: number;
  opponentXG: number;
  yourPossessions: number;
  opponentPossessions: number;
  yourShots: Shot[];
  opponentShots: Shot[];
  event: MatchEvent;
  // Per-shot commentary feed (additive, deterministic). One MatchBeat per shot, in
  // engine order: your shots first, then the opponent's. Pure display.
  beats: MatchBeat[];
  // Per-increment stats readout (additive, deterministic — display only).
  stats: MatchStats;
}

/** Per-increment match stats (additive, deterministic — never feeds match math).
 *  Possession is the 20-possession split; on-target mirrors the beats outcome
 *  (goal|save); a lane is "won" when that side's push beats the other's effective
 *  cover in the lane. */
export interface MatchStats {
  yourXG: number;
  opponentXG: number;
  yourPossessionPct: number;
  opponentPossessionPct: number;
  yourShots: number;
  opponentShots: number;
  yourShotsOnTarget: number;
  opponentShotsOnTarget: number;
  yourZonesWon: Record<Lane, boolean>;
  opponentZonesWon: Record<Lane, boolean>;
  /** Full 9-cell control grid (additive, display-only). `true` where that side's total
   *  presence in the cell strictly exceeds the other's in the mirrored same-lane cell.
   *  At most one side is `true` per cell; ties leave both `false`. */
  yourZoneGrid: Record<Cell, boolean>;
  opponentZoneGrid: Record<Cell, boolean>;
  /** Signed per-cell control margin = your presence − opponent presence (in the
   *  mirrored same-lane cell), rounded. Positive = you lead the cell, negative =
   *  the opponent leads, 0 = level. Additive, display-only. */
  zoneMargin: Record<Cell, number>;
}

/** One commentary line per resolved shot. Deterministic; never feeds match math.
 *  `outcome` mirrors PitchMatchView's buildTimeline split exactly so the feed and the
 *  on-pitch animation agree: goal if the shot scored, else save if xg >= SAVE_BEAT_XG,
 *  else miss. */
export interface MatchBeat {
  minute: number;
  /** Integer seconds into the match: a deterministic time inside this shot's 15' window. */
  clock: number;
  /** mm:ss zero-padded (e.g. "02:45"), derived from `clock`. */
  time: string;
  side: 'you' | 'opp';
  lane: Lane;
  xg: number;
  outcome: 'goal' | 'save' | 'miss';
  scorerId: number | null;
  scorerName: string | null;
  /** Assist attribution for a GOAL (null = unassisted, or a non-goal shot). Additive and
   *  deterministic (NEW salt on the same stateless hash — existing beats unchanged). */
  assisterId: number | null;
  assisterName: string | null;
  /** Set on a GOAL whose scoring lane was materially boosted by your called play
   *  (the play's name). Additive, display-only. */
  text: string;
}

export interface MatchV5Result {
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
  scores: IncrementResult[];
  matchState: MatchV5State;
  /** Why the match went the way it did — computed from the played increments
   *  (read-side, deterministic). Surfaced on the post-match and end screens. */
  verdict: MatchVerdict;
}

/** One contributing factor in the match verdict. `swing` is a rough normalized
 *  signed magnitude (+ favours you, − favours the opponent) used only to RANK
 *  factors — the player-facing content is the plain `label`/`detail` strings. */
export interface VerdictFactor {
  key: 'power' | 'chances' | 'conversion' | 'control' | 'plan';
  label: string;
  detail: string;
  swing: number;
}

/** The legible "why you won/lost" readout: one plain headline naming the
 *  decisive factor, plus the ranked factors behind it. All strings are dry and
 *  data-grounded (numbers from the match), never editorial. */
export interface MatchVerdict {
  headline: string;
  factors: VerdictFactor[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Opponent attack/defence baselines by round (1-indexed). Legacy scalar curve —
 *  superseded by the generated opponent XI (opponent.ts) for the contest; retained
 *  for `getOpponentBaselines` callers/back-compat. */
const OPPONENT_BASELINES: { attack: number; defence: number }[] = [
  { attack: 400, defence: 450 },   // Match 1
  { attack: 550, defence: 600 },   // Match 2
  { attack: 700, defence: 750 },   // Match 3
  { attack: 850, defence: 900 },   // Match 4
  { attack: 1000, defence: 1050 }, // Match 5
];

// --- Funnel emission, two-stat model (docs/FUNNEL_MODEL_V1.md) ---
// A card's ATK feeds its skillset's ATTACKING lane, weighted by how well the band it
// stands in suits that lane (LANE_BAND); its DEF feeds the counter-lane of the band
// itself (ATT→pressing, MID→destruction, DEF+GK→defence). Commanders are the tech
// exception: both stats spread across all six lanes at LEAD_SPREAD each. Stats are
// Snap-scale integers (−1..20), fitness-scaled; a NEGATIVE stat is a real liability
// that subtracts from the team total.
const zeroEmit = (): Record<ZoneName, number> => ({
  possession: 0, creation: 0, finishing: 0, pressing: 0, destruction: 0, defence: 0,
});

/** The six-lane emission for one card standing in `band` (stats fitness-scaled). */
function emitForCard(card: Card, band: Band, fitness: number): Record<ZoneName, number> {
  const e = zeroEmit();
  const { atk, def } = liveStats(card, fitness);
  const lane = laneOfCard(card);
  if (lane === 'leadership') {
    for (const z of ZONES) e[z] = (atk + def) * LEAD_SPREAD;
  } else {
    e[lane] = atk * (atk > 0 ? LANE_BAND[lane][band] : 1);
    e[DEF_LANE_OF_BAND[band]] += def;
  }
  return e;
}

/** Opponent attacking-output multiplier — stands in for the synergy/style/personality
 *  cascade the lean opponent side path skips, AND for the player's own inflated
 *  defence it attacks into, so a comparably-powered opponent is a real threat.
 *  (DESIGN §7 difficulty dial; calibrated against the deck-strength sweep.) */
const OPP_COHESION = 1.05;

/** Cap on lane-targeted denial (the antagonist path): the opponent's named lane total
 *  can lose at most this fraction, however many antagonists stack. */
const ZONE_DENIAL_CAP = 0.35;

// --- Fitness (MATCH_ENGINE §3.1; §7 dials) ---
// Dynamic 1–6 condition. fitnessFactor scales emission: fresh (6) = full, spent (1) =
// half. Drain per increment = base (durability tier) × involvement (band: attacking /
// contested lanes burn faster). A titanium back is ~immune (90 minutes); a glass
// attacker fades fast — rest it in a cold zone or sub it.
const FITNESS_DRAIN: Record<Durability, number> = {
  glass: 0.70, fragile: 0.55, phoenix: 0.60, standard: 0.40, iron: 0.28, titanium: 0.06,
};
const BAND_INVOLVEMENT: Record<Band, number> = { ATT: 1.2, MID: 0.9, DEF: 0.5 };

export function fitnessFactor(fitness: number): number {
  return 0.52 + 0.08 * clamp(fitness, 1, 6); // 6 → 1.0, 1 → 0.6
}

/** Starting fitness for a card entering a match: fresh, or low if carrying an injury. */
export function fitnessOf(card: Card): number {
  return card.fitness ?? (card.injured ? 2 : 6);
}

/** A card's current on-pitch power: base power scaled by its live fitness — the number the
 *  match UI shows as "effective power". Convergent with team-select's effectiveStrength. */
export function effectivePower(card: Card): number {
  return Math.round(card.power * fitnessFactor(fitnessOf(card)));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Physical mirror of a band: your attacking third is contested by their defending third
 *  (same lane), MID maps to MID. Used to align the two sides' grids for the cell contest. */
function mirrorBand(band: Band): Band {
  return band === 'ATT' ? 'DEF' : band === 'DEF' ? 'ATT' : 'MID';
}

/** Total presence in a cell: sum over all four emission kinds. */
function cellPresence(cells: Record<Cell, Record<ZoneName, number>>, cell: Cell): number {
  const c = cells[cell];
  let sum = 0;
  for (const z of ZONES) sum += c[z];
  return sum;
}

function cardToSlotted(card: Card, formation: Formation): SlottedCard {
  // Find best matching slot for this card's position
  const slot = formation.slots.find((s: FormationSlot) => s.accepts.includes(card.position));
  return { card, slot: slot?.type ?? card.position };
}

function isWideCard(card: Card): boolean {
  return ['WF', 'WM', 'WD'].includes(card.position)
    || ['Winger', 'Inverted Winger', 'Extremo', 'Lateral', 'Fluidificante', 'Tornante'].includes(card.tacticalRole ?? '');
}

function isPlaymaker(card: Card): boolean {
  return ['Creator', 'Controller', 'Passer'].includes(card.archetype)
    || ['Regista', 'Enganche', 'Trequartista', 'Fantasista', 'Metodista'].includes(card.tacticalRole ?? '');
}

function isFinisher(card: Card): boolean {
  return ['Striker', 'Target', 'Dribbler', 'Powerhouse'].includes(card.archetype)
    || ['Poacher', 'Prima Punta', 'Seconda Punta'].includes(card.tacticalRole ?? '');
}

function inferPlayPattern(
  orderedAttackers: Card[],
  defenders: Card[],
  equippedTacticIds: string[],
  playingStyle: string,
): { name: string; summary: string; creationBonus: number; qualityBonus: number; attackBonus: number; defenceBonus: number } {
  if (orderedAttackers.length === 0) {
    return {
      name: 'Hold Shape',
      summary: 'Protect the structure and wait for the next opening.',
      creationBonus: 0,
      qualityBonus: 0,
      attackBonus: 0,
      defenceBonus: 3,
    };
  }

  const finisher = orderedAttackers[orderedAttackers.length - 1];
  const opener = orderedAttackers[0];
  const playmakers = orderedAttackers.filter(isPlaymaker).length;
  const wideCount = orderedAttackers.filter(isWideCard).length;
  const finishers = orderedAttackers.filter(isFinisher).length;
  const defendersHolding = defenders.length;

  if (
    orderedAttackers.length <= 2
    && opener.position === 'GK'
    && (finisher.archetype === 'Sprinter' || finisher.position === 'CF')
  ) {
    return {
      name: 'Route One',
      summary: `${opener.name} goes long early and ${finisher.name} attacks the space behind.`,
      creationBonus: 4 + (equippedTacticIds.includes('counter_attack') ? 2 : 0),
      qualityBonus: 5 + (equippedTacticIds.includes('set_piece') ? 1 : 0),
      attackBonus: 3,
      defenceBonus: -1,
    };
  }

  if (wideCount >= 2 && playmakers >= 1 && finishers >= 1) {
    return {
      name: 'Wing Overload',
      summary: `Stretch them wide, feed the flanks, and finish through ${finisher.name}.`,
      creationBonus: 5 + (equippedTacticIds.includes('wing_play') ? 2 : 0),
      qualityBonus: 3 + (orderedAttackers.some((c) => c.archetype === 'Engine') ? 1 : 0),
      attackBonus: 3,
      defenceBonus: defendersHolding >= 4 ? 1 : -1,
    };
  }

  if ((playingStyle === 'Tiki-Taka' || equippedTacticIds.includes('possession') || equippedTacticIds.includes('narrow')) && orderedAttackers.length >= 5 && playmakers >= 2) {
    return {
      name: 'Tiki-Taka',
      summary: `Short combinations pull them apart before ${finisher.name} gets the final touch.`,
      creationBonus: 6,
      qualityBonus: 3,
      attackBonus: 4,
      defenceBonus: defendersHolding >= 4 ? 2 : 1,
    };
  }

  if (orderedAttackers.length >= 6 && defendersHolding >= 4) {
    return {
      name: 'Death by a Thousand Cuts',
      summary: `Sustain pressure with runners everywhere while the rest hold the counter shape.`,
      creationBonus: 6,
      qualityBonus: 2,
      attackBonus: 4,
      defenceBonus: 2,
    };
  }

  if (equippedTacticIds.includes('counter_attack') && defendersHolding >= 5 && finishers >= 1) {
    return {
      name: 'Counter Trap',
      summary: `Absorb, spring out, and release ${finisher.name} into the break.`,
      creationBonus: 3,
      qualityBonus: 4,
      attackBonus: 2,
      defenceBonus: 3,
    };
  }

  return {
    name: 'Pattern Play',
    summary: `${opener.name} starts the move and ${finisher.name} is the intended end point.`,
    creationBonus: 2 + playmakers,
    qualityBonus: 2 + finishers,
    attackBonus: 2,
    defenceBonus: defendersHolding >= 4 ? 1 : 0,
  };
}

// The per-card creation/finishing chance-profile mix is gone: a card's funnel lane
// (funnel.ts laneOfCard) decides what its power feeds — docs/FUNNEL_MODEL_V1.md.

// ---------------------------------------------------------------------------
// Personality Bonus (calculated once at match start)
// ---------------------------------------------------------------------------

function calculatePersonalityBonus(xi: Card[], seed: number): PersonalityBonus {
  const themeCounts = new Map<string, number>();
  const themesPresent = new Set<string>();

  for (const card of xi) {
    if (!card.personalityTheme) continue;
    themesPresent.add(card.personalityTheme);
    themeCounts.set(card.personalityTheme, (themeCounts.get(card.personalityTheme) ?? 0) + 1);
  }

  let attackMod = 1.0;
  let defenceMod = 1.0;
  const labels: string[] = [];

  for (const theme of PERSONALITY_THEMES) {
    const count = themeCounts.get(theme) ?? 0;
    if (count < 3) continue;

    const resonance = THEME_RESONANCES[theme];
    switch (theme) {
      case 'General':
        attackMod += 0.10;
        defenceMod += 0.10;
        break;
      case 'Captain':
        defenceMod += 0.20;
        break;
      case 'Maestro':
        attackMod += 0.15;
        break;
      case 'Catalyst': {
        const rand = seededRandom(seed * 9301 + 49297);
        const factor = -0.20 + rand * 0.40;
        attackMod += factor;
        break;
      }
      case 'Professor':
        attackMod += 0.12;
        defenceMod += 0.12;
        break;
    }
    labels.push(`${resonance.name} (${count}× ${theme})`);
  }

  // Perfect Dressing Room: all 5 themes present — a real edge, but ADDITIVE (not the old
  // ×1.5 multiplier) so a great dressing room sharpens the XI rather than dwarfing it.
  const perfectDressingRoom = PERSONALITY_THEMES.every((t) => themesPresent.has(t));
  if (perfectDressingRoom) {
    attackMod += 0.15;
    defenceMod += 0.15;
    labels.push('Perfect Dressing Room');
  }

  // Cap the combined personality uplift (Phase 3 Foundation): the one-time, can't-change
  // personality roll must not dwarf the in-match decision layer. Themes are a top-up, not
  // the whole story. The downside (a bad Catalyst roll) is left uncapped — it's the gamble.
  const PERSONALITY_CAP = 1.30;
  attackMod = Math.min(attackMod, PERSONALITY_CAP);
  defenceMod = Math.min(defenceMod, PERSONALITY_CAP);

  return {
    attackMod,
    defenceMod,
    label: labels.length > 0 ? labels.join(' + ') : null,
    perfectDressingRoom,
  };
}

// ---------------------------------------------------------------------------
// 1. initMatch
// ---------------------------------------------------------------------------

export function initMatch(
  xi: Card[],
  bench: Card[],
  remainingDeck: Card[],
  formation: Formation,
  playingStyle: string,
  jokers: JokerCard[],
  seed: number,
  opponentRound: number,
  opponentStyle: string,
  opponentWeakness: string,
  chemistry: CoAppearance = {},
  intent: TeamIntent = 'balanced',
  opponentPower?: number,
  equippedTactics: string[] = [],
): MatchV5State {
  // The opponent is now a real positioned side (step 4), generated deterministically
  // from the round budget + style. opponentPower is the within-cup ramp (cupMatchPower);
  // without it the per-cup base is used. It plays through the same dispatcher as you do.
  const { xi: opponentXI, formation: opponentFormation } = generateOpponentXI(
    opponentRound,
    opponentStyle,
    seed,
    opponentPower,
  );
  return {
    // Each starter begins the match fresh (or low if carrying an injury); fitness
    // then depletes per increment (§3.1).
    xi: xi.map((c) => ({ ...c, fitness: fitnessOf(c) })),
    bench,
    remainingDeck,
    attackerIds: new Set(),
    attackerOrder: [],
    // Every player you named to the bench can come on — the substitution allowance is
    // the size of the bench you picked (was a flat 5, which stranded 2 of a 7-man bench).
    subsRemaining: bench.length,
    discardsRemaining: 3 + getExtraDiscards(jokers),
    subsUsed: [],
    currentIncrement: 0,
    isFirstHalf: true,
    scores: [],
    yourGoals: 0,
    opponentGoals: 0,
    formation,
    playingStyle,
    intent,
    personalityBonus: calculatePersonalityBonus(xi, seed),
    opponentRound,
    opponentStyle,
    opponentWeakness,
    opponentXI,
    opponentFormation,
    chemistry,
    equippedTactics,
    seed,
  };
}

// ---------------------------------------------------------------------------
// 1b. equipTactics — set the match's tactic cards (before kick-off)
// ---------------------------------------------------------------------------

/** Up to this many tactic cards can be equipped for a match. */
export const TACTIC_SLOTS = 3;

/**
 * Equip up to TACTIC_SLOTS owned tactic cards for this match. Only allowed before
 * kick-off (increment 0, nothing played) — after that the plan is committed.
 */
export function equipTactics(state: MatchV5State, tacticIds: string[]): MatchV5State {
  if (state.scores.length > 0) return state;
  const valid = tacticIds.filter((id) => getTacticById(id)).slice(0, TACTIC_SLOTS);
  return { ...state, equippedTactics: valid };
}

// ---------------------------------------------------------------------------
// 2. commitAttackers
// ---------------------------------------------------------------------------

export function commitAttackers(state: MatchV5State, cardIds: number[]): MatchV5State {
  const xiIds = new Set(state.xi.map((c) => c.id));
  const validOrder: number[] = [];

  for (const id of cardIds) {
    if (!xiIds.has(id)) continue;
    const card = state.xi.find((c) => c.id === id);
    if (card?.injured) continue; // injured cards cannot attack
    if (!validOrder.includes(id)) validOrder.push(id);
  }

  return { ...state, attackerIds: new Set(validOrder), attackerOrder: validOrder };
}

// ---------------------------------------------------------------------------
// Shared side-field core (used for the opponent; mirrors evaluateSplit's field
// build without the player-only cascade — synergies/style/personality/playPattern).
// ---------------------------------------------------------------------------

export interface SideField {
  lanePush: Record<Lane, number>;
  laneCover: Record<Lane, number>;
  possession: number;
  pressing: number;
  defenceScore: number;
  chanceCreation: number;
  shotQuality: number;
  denial: number;       // conversion suppression this side applies to the other
  zoneDenial: Partial<Record<ZoneName, number>>; // lane-targeted denial (antagonists)
  variance: number;
  /** The transformed 9×6 grid from the dispatcher (additive — read, never recomputed). */
  cells: Record<Cell, Record<ZoneName, number>>;
}

/**
 * Build a side's field-derived quantities: place each card in its formation cell,
 * emit its power into its ONE funnel lane (band-weighted), dispatch its role + squad
 * records, and read the six lane totals. The same path both XIs run through.
 */
export function computeSideField(
  xi: Card[],
  formation: Formation,
  seed: number,
  increment: number,
  squadTraits?: TraitRecord[],
  // The faceless generated opponent opts OUT of the defining-trait suite (its difficulty
  // is already carried by ROUND_POWER + opponentScaleTraits; stacking generates/denies on
  // top double-counts it). The player path leaves this true and keeps the full suite.
  includeDefiningTraits = true,
): SideField {
  const dispatchCards: DispatchCard[] = xi.map((card, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    const cell = cellOf(slot.x, slot.y);
    const band = bandOf(cell);
    const stats = deriveStats(card);
    return {
      id: card.id,
      power: card.power,
      atk: stats.atk,
      def: stats.def,
      archetype: card.archetype,
      tacticalRole: card.tacticalRole,
      position: card.position,
      team: 'player',
      side: band === 'DEF' ? 'defence' : 'attack',
      isWide: isWideCard(card),
      cell,
      emit: emitForCard(card, band, fitnessFactor(fitnessOf(card))),
      traits: traitsForCard(card, includeDefiningTraits),
    };
  });

  const dispatched = dispatchTraits(
    dispatchCards,
    seed,
    increment,
    squadTraits && squadTraits.length ? { playerSquadTraits: squadTraits } : undefined,
  );

  return {
    lanePush: dispatched.lanePush,
    laneCover: dispatched.laneCover,
    possession: Math.max(0, Math.round(dispatched.zones.possession)),
    pressing: Math.max(0, Math.round(dispatched.zones.pressing)),
    defenceScore: Math.max(0, Math.round(dispatched.zones.defence)),
    chanceCreation: Math.max(0, Math.round(dispatched.zones.creation)),
    shotQuality: Math.max(0, Math.round(dispatched.zones.finishing)),
    denial: dispatched.opponentDenial,
    zoneDenial: dispatched.opponentZoneDenial,
    variance: dispatched.variance,
    cells: dispatched.cells,
  };
}

// ---------------------------------------------------------------------------
// 3. evaluateSplit — the core scoring function
// ---------------------------------------------------------------------------

export function evaluateSplit(
  state: MatchV5State,
  jokers: JokerCard[],
): AttackDefenceSplit {
  // TACTICS BY CARDS: every equipped tactic's records run every increment; their
  // own conditions (trailing, late-game, archetype counts) gate them situationally.
  const equipped = state.equippedTactics
    .map((id) => getTacticById(id))
    .filter((t): t is TacticCard => !!t);
  const { xi, formation, playingStyle, personalityBonus, opponentWeakness } = state;
  const maxAtk = formation.maxAttackers;

  const attackBreakdown: CascadeLine[] = [];
  const defenceBreakdown: CascadeLine[] = [];

  // --- Funnel emission (docs/FUNNEL_MODEL_V1.md) ---
  // Each card's power feeds its ONE lane, weighted by how well the band of the
  // formation slot it occupies (xi[i] ↔ slots[i]) suits that lane. The allocation
  // decision is the shape itself: bands decide how much of each lane you can field.
  const emit = new Map<number, Record<ZoneName, number>>();
  const cardCell = new Map<number, Cell>();
  const cardY = new Map<number, number>();
  const attackers: Card[] = [];
  const defenders: Card[] = [];
  let baseAttackLanes = 0;   // possession + creation + finishing
  let baseDefenceLanes = 0;  // pressing + destruction + defence

  xi.forEach((card, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    const cell = cellOf(slot.x, slot.y);
    const band = bandOf(cell);
    cardCell.set(card.id, cell);
    cardY.set(card.id, slot.y);
    const e = emitForCard(card, band, fitnessFactor(fitnessOf(card)));
    emit.set(card.id, e);
    baseAttackLanes += e.possession + e.creation + e.finishing;
    baseDefenceLanes += e.pressing + e.destruction + e.defence;
    if (band === 'ATT' || band === 'MID') attackers.push(card);
    if (band === 'DEF' || band === 'MID') defenders.push(card);
  });

  // The move flows deep → forward; the most advanced attacker is the finisher.
  const orderedAttackers = [...attackers].sort((a, b) => (cardY.get(b.id) ?? 0) - (cardY.get(a.id) ?? 0));
  const playPattern = inferPlayPattern(orderedAttackers, defenders, state.equippedTactics, playingStyle);

  attackBreakdown.push({ label: 'Attacking lanes', value: baseAttackLanes, type: 'base' });
  defenceBreakdown.push({ label: 'Defensive lanes', value: baseDefenceLanes, type: 'base' });

  // Positional synergies are computed up front: the Manager (Chemistry Set) reads
  // the connection count, so the squad records depend on them before we dispatch.
  const attackerSlotted = attackers.map((c) => cardToSlotted(c, formation));
  const defenderSlotted = defenders.map((c) => cardToSlotted(c, formation));
  const { attackSynergies, defenceSynergies, crossSynergies } =
    findPositionalConnections(attackerSlotted, defenderSlotted);
  const allConnections: Connection[] = [...attackSynergies, ...defenceSynergies, ...crossSynergies];

  // The CALLED play (this spell only) + Manager → squad-wide records over the same
  // verb palette, plus run-accumulated chemistry: connecting pairs emit a zonal bonus
  // scaling with how settled the partnership is (CARDS §5). All ride the squad source.
  const playerSquadTraits = [
    ...squadTraits(equipped, jokers, {
      xi,
      increment: state.currentIncrement,
      opponentGoals: state.opponentGoals,
      yourGoals: state.yourGoals,
      connections: allConnections,
      intent: state.intent,
    }),
    ...chemistryRecords(xi, formation, state.chemistry ?? {}),
  ];

  // --- Verb dispatcher: migrated roles + squad records reshape the field ---
  const dispatchCards: DispatchCard[] = xi.map((card) => {
    const stats = deriveStats(card);
    return {
      id: card.id,
      power: card.power,
      atk: stats.atk,
      def: stats.def,
      archetype: card.archetype,
      tacticalRole: card.tacticalRole,
      position: card.position,
      team: 'player' as const,
      side: bandOf(cardCell.get(card.id) ?? 'MID_C') === 'DEF' ? 'defence' as const : 'attack' as const,
      isWide: isWideCard(card),
      cell: cardCell.get(card.id) ?? 'MID_C',
      emit: emit.get(card.id) ?? zeroEmit(),
      traits: traitsForCard(card),
    };
  });

  // ZERO-EMIT opponent shadows: the opponent XI enters the dispatch with empty
  // emission and no traits, so it adds NOTHING to any accumulator — it exists only
  // as a target pool for enemy-targeted STATE effects (Dark Arts' drain-fitness on
  // their best player). Field math is byte-identical with or without them for any
  // record that doesn't target an enemy card.
  const lastOppSlot = state.opponentFormation.slots[state.opponentFormation.slots.length - 1];
  const opponentShadows: DispatchCard[] = state.opponentXI.map((card, i) => {
    const slot = state.opponentFormation.slots[i] ?? lastOppSlot;
    const cell = cellOf(slot.x, slot.y);
    const stats = deriveStats(card);
    return {
      id: card.id,
      power: card.power,
      atk: stats.atk,
      def: stats.def,
      archetype: card.archetype,
      tacticalRole: card.tacticalRole,
      position: card.position,
      team: 'opponent' as const,
      side: bandOf(cell) === 'DEF' ? 'defence' as const : 'attack' as const,
      isWide: isWideCard(card),
      cell,
      emit: zeroEmit(),
      traits: [],
    };
  });

  const dispatched = dispatchTraits(
    [...dispatchCards, ...opponentShadows],
    state.seed,
    state.currentIncrement,
    { playerSquadTraits },
  );

  // Adopt the transformed field: the six lane totals, straight from the dispatcher.
  const ATTACK_LANES: ZoneName[] = ['possession', 'creation', 'finishing'];
  const DEFENCE_LANES: ZoneName[] = ['pressing', 'destruction', 'defence'];
  const zPossession = Math.max(0, Math.round(dispatched.zones.possession));
  const zCreation = Math.max(0, Math.round(dispatched.zones.creation));
  const zFinishing = Math.max(0, Math.round(dispatched.zones.finishing));
  const zPressing = Math.max(0, Math.round(dispatched.zones.pressing));
  const zDestruction = Math.max(0, Math.round(dispatched.zones.destruction));
  const zDefence = Math.max(0, Math.round(dispatched.zones.defence));
  const attackLaneBase = zPossession + zCreation + zFinishing;
  const defenceLaneBase = zPressing + zDestruction + zDefence;

  // Squad-source records (deployed tactics + manager + intent) ride the synthetic
  // owner (cardId −1). Attribute their lane deltas as NAMED cascade lines — type
  // 'manager' when the record name is the manager's, else 'tactic' — grouped by
  // which funnel side (attacking / defensive lanes) the record touched.
  const managerNames = new Set(jokers.map((j) => j.name));
  const squadAttack = new Map<string, number>();
  const squadDefence = new Map<string, number>();
  for (const line of dispatched.log) {
    if (line.cardId !== -1 || !line.value || !line.zone) continue;
    if (ATTACK_LANES.includes(line.zone)) squadAttack.set(line.trait, (squadAttack.get(line.trait) ?? 0) + line.value);
    if (DEFENCE_LANES.includes(line.zone)) squadDefence.set(line.trait, (squadDefence.get(line.trait) ?? 0) + line.value);
  }

  const attackLabels = new Set<string>();
  const defenceLabels = new Set<string>();
  for (const line of dispatched.log) {
    // Squad records get their own named lines; keep them out of the ability label.
    if (!line.zone || line.cardId === -1) continue;
    if (ATTACK_LANES.includes(line.zone)) attackLabels.add(line.trait);
    if (DEFENCE_LANES.includes(line.zone)) defenceLabels.add(line.trait);
  }

  const attackDelta = attackLaneBase - baseAttackLanes;
  const defenceDelta = defenceLaneBase - baseDefenceLanes;

  // Named plan lines first (tactics / manager / intent), then the residual
  // player-trait delta as the ability aggregate. The split is display-only —
  // the lines still sum to the same lane-group deltas.
  let squadAttackTotal = 0;
  for (const [name, value] of squadAttack) {
    const v = Math.round(value);
    if (v === 0) continue;
    squadAttackTotal += v;
    attackBreakdown.push({ label: name, value: v, type: managerNames.has(name) ? 'manager' : 'tactic' });
  }
  let squadDefenceTotal = 0;
  for (const [name, value] of squadDefence) {
    const v = Math.round(value);
    if (v === 0) continue;
    squadDefenceTotal += v;
    defenceBreakdown.push({ label: name, value: v, type: managerNames.has(name) ? 'manager' : 'tactic' });
  }
  if (attackDelta - squadAttackTotal !== 0) {
    attackBreakdown.push({ label: `${[...attackLabels].join(' + ') || 'Verb dispatcher'}`, value: attackDelta - squadAttackTotal, type: 'ability' });
  }
  if (defenceDelta - squadDefenceTotal !== 0) {
    defenceBreakdown.push({ label: `${[...defenceLabels].join(' + ') || 'Verb dispatcher'}`, value: defenceDelta - squadDefenceTotal, type: 'ability' });
  }

  // --- Zonal field (§4): the coupled lane contest reads the transformed grid ---
  // directly from the dispatcher (per-lane attack push & defensive cover). It runs
  // downstream in resolveIncrement.
  const lanePush = dispatched.lanePush;
  const laneCover = dispatched.laneCover;

  // Midfield dual-contribution is already captured by the band split, so there is
  // no separate dual-role layer in the positioning model.
  const dualAttack = 0;
  const dualDefence = 0;

  // --- Positional synergies (computed above; folded into the cascade here) ---
  let synergyAttack = 0;
  for (const syn of attackSynergies) {
    synergyAttack += syn.bonus;
    attackBreakdown.push({ label: `${syn.name} combo`, value: syn.bonus, type: 'synergy' });
  }

  let synergyDefence = 0;
  for (const syn of defenceSynergies) {
    synergyDefence += syn.bonus;
    defenceBreakdown.push({ label: `${syn.name} screen`, value: syn.bonus, type: 'synergy' });
  }

  let crossAttack = 0;
  let crossDefence = 0;
  for (const syn of crossSynergies) {
    crossAttack += syn.attackBonus;
    crossDefence += syn.defenceBonus;
    if (syn.attackBonus > 0) {
      attackBreakdown.push({ label: `${syn.name} release`, value: syn.attackBonus, type: 'synergy' });
    }
    if (syn.defenceBonus > 0) {
      defenceBreakdown.push({ label: `${syn.name} cover`, value: syn.defenceBonus, type: 'synergy' });
    }
  }

  // --- Style bonus (attackers only) ---
  const style = PLAYING_STYLES[playingStyle];
  let styleAttack = 0;
  if (style) {
    const isTotal = style.bonusArchetypes.length === 0; // Total Football
    const matchingCount = isTotal
      ? attackers.length
      : attackers.filter((c) => style.bonusArchetypes.includes(c.archetype)).length;
    styleAttack = Math.round(attackLaneBase * style.multiplier * matchingCount);
    if (styleAttack > 0) {
      attackBreakdown.push({ label: `${style.name} pattern`, value: styleAttack, type: 'style' });
    }
  }

  // --- Weakness exploitation ---
  let weaknessBonus = 0;
  if (opponentWeakness) {
    const weaknessCount = attackers.filter((c) => c.archetype === opponentWeakness).length;
    if (weaknessCount >= 2) {
      weaknessBonus = Math.round(attackLaneBase * 0.15);
      attackBreakdown.push({ label: 'Picked on their weak side', value: weaknessBonus, type: 'ability' });
    }
  }

  if (playPattern.attackBonus !== 0) {
    attackBreakdown.push({ label: playPattern.name, value: playPattern.attackBonus, type: 'tactic' });
  }
  if (playPattern.defenceBonus > 0) {
    defenceBreakdown.push({ label: `${playPattern.name} rest defence`, value: playPattern.defenceBonus, type: 'tactic' });
  }

  // --- The cascade under the funnel (FUNNEL_MODEL_V1 §cascade) ---
  // Synergy/style/weakness/play-pattern bonuses no longer add to a blended score:
  // the attack-side cascade total becomes ONE multiplier over the three attacking
  // lanes, the defence-side total one over the three counter lanes. A chemistry
  // combo lifts your whole attacking funnel; it never smuggles creation into
  // possession. Personality multiplies on top, as before.
  const attackCascade = synergyAttack + crossAttack + styleAttack + weaknessBonus
    + playPattern.attackBonus + playPattern.creationBonus + playPattern.qualityBonus
    + dualAttack;
  const defenceCascade = synergyDefence + crossDefence + playPattern.defenceBonus + dualDefence;

  const attackerPowerPool = attackers.reduce((sum, card) => sum + card.power, 0);
  const chemistryDensity = attackerPowerPool > 0
    ? (synergyAttack + crossAttack) / attackerPowerPool
    : 0;
  const compactAttackMultiplier = attackers.length > 0 && attackers.length <= 3
    ? 1 + Math.min(0.55, chemistryDensity * 1.4 + attackSynergies.length * 0.10 + crossSynergies.length * 0.06)
    : 1 + Math.min(0.18, chemistryDensity * 0.45);

  // The three stages MULTIPLY downstream (possessions × shots-per-possession ×
  // xG-per-shot), so the side-wide multiplier is distributed as its cube root per
  // stage — the aggregate effect on goals stays ≈ the multiplier itself, instead
  // of compounding to its cube.
  const attackMult = Math.cbrt(
    (1 + attackCascade / Math.max(1, attackLaneBase))
      * compactAttackMultiplier * personalityBonus.attackMod,
  );
  const defenceMult = Math.cbrt(
    (1 + defenceCascade / Math.max(1, defenceLaneBase))
      * personalityBonus.defenceMod,
  );

  if (personalityBonus.label && personalityBonus.attackMod !== 1) {
    attackBreakdown.push({
      label: `Dressing room edge`,
      value: Math.round(attackLaneBase * (personalityBonus.attackMod - 1)),
      type: 'personality',
    });
  }
  if (personalityBonus.label && personalityBonus.defenceMod !== 1) {
    defenceBreakdown.push({
      label: `Dressing room edge`,
      value: Math.round(defenceLaneBase * (personalityBonus.defenceMod - 1)),
      type: 'personality',
    });
  }

  const possession = Math.round(zPossession * attackMult);
  const chanceCreation = Math.round(zCreation * attackMult);
  const shotQuality = Math.round(zFinishing * attackMult);
  const pressing = Math.round(zPressing * defenceMult);
  const defenceTotal = Math.round(zDefence * defenceMult);
  // The stage-2 pitch-lane vectors carry the same funnel multipliers, so the lane
  // contest sees the cascade too (destruction is spatial; defence is the last line).
  const scaledPush: Record<Lane, number> = {
    L: lanePush.L * attackMult, C: lanePush.C * attackMult, R: lanePush.R * attackMult,
  };
  const scaledCover: Record<Lane, number> = {
    L: laneCover.L * defenceMult, C: laneCover.C * defenceMult, R: laneCover.R * defenceMult,
  };

  // Surface the per-card pre-dispatch emission for the read-side player rating (additive;
  // never re-enters the resolution math, so the scoreline is unaffected).
  const cardEmit: Record<number, Record<ZoneName, number>> = {};
  emit.forEach((v, k) => { cardEmit[k] = v; });

  // LIVE per-card effective stats (display-only): base emission + attributed trait
  // deltas per lane, cascade multipliers on top — the number a pitch card shows.
  const cardStats: Record<number, { atk: number; def: number; baseAtk: number; baseDef: number }> = {};
  xi.forEach((card) => {
    const e = emit.get(card.id) ?? zeroEmit();
    const d = dispatched.cardDelta.get(card.id) ?? {};
    const sum = (lanes: ZoneName[]) => lanes.reduce((s2, z) => s2 + (e[z] ?? 0) + (d[z] ?? 0), 0);
    const base = deriveStats(card);
    cardStats[card.id] = {
      atk: Math.round(sum(ATTACK_LANES) * attackMult),
      def: Math.round(sum(DEFENCE_LANES) * defenceMult),
      baseAtk: base.atk,
      baseDef: base.def,
    };
  });

  // Defining-trait firings this increment (animation-tagged), for the match-feel layer.
  const traitEvents = collectTraitEvents(dispatched.log);

  // Per-card fitness deltas from drain-fitness records (Press High's press cost;
  // Dark Arts' knock on their star via the shadows). Applied in advanceIncrement.
  const fitnessDelta: Record<number, number> = {};
  dispatched.fitness.forEach((v, id) => { if (v !== 0) fitnessDelta[id] = v; });

  return {
    possession: Math.max(0, possession),
    pressing: Math.max(0, pressing),
    defenceScore: Math.max(0, defenceTotal),
    chanceCreation: Math.max(0, chanceCreation),
    shotQuality: Math.max(0, shotQuality),
    playName: playPattern.name,
    playSummary: playPattern.summary,
    finisherId: orderedAttackers.at(-1)?.id ?? null,
    attackBreakdown,
    defenceBreakdown,
    attackSynergies,
    defenceSynergies,
    crossSynergies,
    attackerCount: attackers.length,
    maxAttackers: maxAtk,
    opponentDenial: dispatched.opponentDenial,
    zoneDenial: dispatched.opponentZoneDenial,
    varianceFactor: dispatched.variance,
    lanePush: scaledPush,
    laneCover: scaledCover,
    attackingOrder: orderedAttackers.map((c) => c.id),
    cells: dispatched.cells,
    cardEmit,
    cardStats,
    traitEvents,
    fitnessDelta,
  };
}

/** Filter the dispatcher log to the defining-trait firings (animation-tagged), deduped by
 *  (cardId, traitName) — an `amplify` over many teammates logs once per card, but the
 *  animation should fire once. Read-side; never feeds the match math. */
function collectTraitEvents(log: TraitLogLine[]): TraitEvent[] {
  const seen = new Set<string>();
  const out: TraitEvent[] = [];
  for (const l of log) {
    if (!l.animation) continue;
    const key = `${l.cardId}:${l.trait}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cardId: l.cardId, traitName: l.trait, animation: l.animation, zone: l.zone });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-shot commentary beats (additive, deterministic)
//
// One MatchBeat per resolved shot. Pure display — never feeds match math. All
// randomness uses NEW salts on the stateless seededRandom hash, so existing
// scorelines are byte-identical.
// ---------------------------------------------------------------------------

/** Save/miss split for non-goal shots. MUST equal PitchMatchView buildTimeline's
 *  SAVE_XG so the feed and the on-pitch animation classify identically. */
const SAVE_BEAT_XG = 0.22;

/** Attacking-band positions that can plausibly be a shot's scorer. */
const ATTACKING_POSITIONS = new Set(['CF', 'WF', 'AM', 'WM', 'CM']);

function laneOfX(x: number): Lane {
  if (x < 42) return 'L';
  if (x > 58) return 'R';
  return 'C';
}

/** A stateless-hash roll keyed on (seed, inc, side, shotIndex) under a caller salt. */
function beatRng(seed: number, inc: number, side: number, shotIdx: number, salt: number): number {
  const m =
    (((seed * 73856093) ^ (inc * 19349663) ^ (side * 83492791) ^ (shotIdx * 2654435761) ^ (salt * 40503)) >>> 0);
  return seededRandom(m);
}

/**
 * Deterministically pick the shooter for one shot from `xi`, positioned by `formation`.
 * Candidates = attacking-band cards whose formation slot sits in the shot's lane; the
 * pick index is seeded on (seed, inc, side, shotIdx) with a NEW salt (varies shot-to-
 * shot, reproducible). Fallbacks: any attacking card → any outfield card → null.
 */
function pickShooter(
  xi: Card[],
  formation: Formation,
  lane: Lane,
  seed: number,
  inc: number,
  side: number,
  shotIdx: number,
  committedIds: Set<number> | null,
): Card | null {
  // Map each card to its formation slot's lane via index (xi[i] fills slots[i]).
  const laneCandidates: Card[] = [];
  const attackingAny: Card[] = [];
  const outfieldAny: Card[] = [];
  for (let i = 0; i < xi.length; i++) {
    const card = xi[i];
    if (!card) continue;
    // If a committed-attacker set is supplied, prefer it for the scorer (the players
    // actually pushed forward this increment); slot/lane mapping still uses the full XI.
    if (committedIds && committedIds.size > 0 && !committedIds.has(card.id)) continue;
    const slot = formation.slots[i];
    const isGK = card.position === 'GK' || slot?.type === 'GK';
    if (isGK) continue;
    outfieldAny.push(card);
    const band = slot ? bandOf(cellOf(slot.x, slot.y)) : null;
    const attacking = ATTACKING_POSITIONS.has(card.position) || band === 'ATT';
    if (!attacking) continue;
    attackingAny.push(card);
    const slotLane = slot ? laneOfX(slot.x) : 'C';
    if (slotLane === lane) laneCandidates.push(card);
  }
  const pool = laneCandidates.length ? laneCandidates
    : attackingAny.length ? attackingAny
    : outfieldAny.length ? outfieldAny
    : null;
  if (!pool) return null;
  const idx = Math.floor(beatRng(seed, inc, side, shotIdx, 12) * pool.length);
  return pool[Math.min(pool.length - 1, idx)];
}

/** Same lane, or centre↔wing (adjacent). The two wings are NOT adjacent to each other. */
function laneAdjacent(a: Lane, b: Lane): boolean {
  return a === b || a === 'C' || b === 'C';
}

/**
 * Deterministically pick the assister for a GOAL, or null for a solo/unassisted goal.
 * Modeled on pickShooter: excludes the scorer, prefers playmakers in the same/adjacent
 * lane, then any playmaker, then any attacking outfielder. Uses a NEW salt (15) on the
 * stateless hash, so every existing seeded draw (scorer 12, text 13, clock 14) is
 * byte-identical and the scoreline never moves.
 */
function pickAssister(
  xi: Card[],
  formation: Formation,
  lane: Lane,
  scorerId: number | null,
  seed: number,
  inc: number,
  side: number,
  shotIdx: number,
  committedIds: Set<number> | null,
): Card | null {
  const laneMakers: Card[] = [];
  const anyMakers: Card[] = [];
  const attackingAny: Card[] = [];
  for (let i = 0; i < xi.length; i++) {
    const card = xi[i];
    if (!card) continue;
    if (card.id === scorerId) continue; // a player can't assist his own goal
    if (committedIds && committedIds.size > 0 && !committedIds.has(card.id)) continue;
    const slot = formation.slots[i];
    const isGK = card.position === 'GK' || slot?.type === 'GK';
    if (isGK) continue;
    const band = slot ? bandOf(cellOf(slot.x, slot.y)) : null;
    const attacking = ATTACKING_POSITIONS.has(card.position) || band === 'ATT' || band === 'MID';
    if (!attacking) continue;
    attackingAny.push(card);
    if (isPlaymaker(card)) {
      anyMakers.push(card);
      const slotLane = slot ? laneOfX(slot.x) : 'C';
      if (laneAdjacent(slotLane, lane)) laneMakers.push(card);
    }
  }
  const pool = laneMakers.length ? laneMakers
    : anyMakers.length ? anyMakers
    : attackingAny.length ? attackingAny
    : null;
  if (!pool) return null;
  // Reserve a fraction of goals as solo (unassisted); otherwise index into the pool.
  const r = beatRng(seed, inc, side, shotIdx, 15);
  const SOLO = 0.18;
  if (r < SOLO) return null;
  const idx = Math.floor(((r - SOLO) / (1 - SOLO)) * pool.length);
  return pool[Math.min(pool.length - 1, idx)];
}

const LANE_WORD: Record<Lane, string> = { L: 'left', C: 'middle', R: 'right' };

/** Terse one-liner for a beat, with NEW-salt seeded phrasing variety. */
function beatText(
  outcome: 'goal' | 'save' | 'miss',
  lane: Lane,
  scorerName: string | null,
  seed: number,
  inc: number,
  side: number,
  shotIdx: number,
): string {
  const subject = scorerName ?? 'The attack';
  const laneWord = LANE_WORD[lane];
  const variety = beatRng(seed, inc, side, shotIdx, 13);
  if (outcome === 'goal') {
    const pool = [
      `${subject} finishes from the ${laneWord} — GOAL!`,
      `${subject} buries it from the ${laneWord} — GOAL!`,
      `${subject} strikes from the ${laneWord} — GOAL!`,
    ];
    return pool[Math.floor(variety * pool.length)];
  }
  if (outcome === 'save') {
    const pool = [
      `${subject} is denied — saved`,
      `${subject} stopped — saved`,
      `${subject} thwarted — saved`,
    ];
    return pool[Math.floor(variety * pool.length)];
  }
  // miss
  const offWord = laneWord === 'middle' ? 'over' : 'wide';
  const pool = [
    `${subject} drags it ${offWord}`,
    `${subject} skews it ${offWord}`,
    `${subject} fires it ${offWord}`,
  ];
  return pool[Math.floor(variety * pool.length)];
}

/**
 * Build the per-shot commentary beats for one side, in shot order. `side` is 0 (you)
 * or 1 (opp), matching the possession RNG side index so beats stay aligned with the
 * shots they describe.
 */
function buildBeats(
  shots: Shot[],
  xi: Card[],
  formation: Formation,
  sideLabel: 'you' | 'opp',
  side: number,
  minute: number,
  seed: number,
  inc: number,
  committedIds: Set<number> | null,
  // Called-play attribution: a GOAL in a lane the called play materially boosted
  // carries the play's name (display-only, deterministic — no new RNG draws).
): MatchBeat[] {
  // Each increment owns a 15-minute match-minute window ending at INCREMENT_MINUTES[inc]
  // (inc 0 -> 0..15; the increment ending at 60 -> 45..60, leaving the natural half-time
  // gap). A shot lands at a deterministic fraction inside its window, keyed on
  // (seed, inc, side, shotIdx) under a NEW salt (14) so existing seeded calls are untouched.
  const windowStart = INCREMENT_MINUTES[inc] - 15;
  return shots.map((shot, shotIdx) => {
    const outcome: 'goal' | 'save' | 'miss' = shot.goal
      ? 'goal'
      : shot.xg >= SAVE_BEAT_XG ? 'save' : 'miss';
    const scorer = pickShooter(xi, formation, shot.lane, seed, inc, side, shotIdx, committedIds);
    const scorerId = scorer?.id ?? null;
    const scorerName = scorer?.name ?? null;
    // Assist exists only for a goal; deterministic (NEW salt 15), never the scorer himself.
    const assister = outcome === 'goal'
      ? pickAssister(xi, formation, shot.lane, scorerId, seed, inc, side, shotIdx, committedIds)
      : null;
    const assisterId = assister?.id ?? null;
    const assisterName = assister?.name ?? null;
    const f = beatRng(seed, inc, side, shotIdx, 14); // fraction in [0,1) within the window
    const clock = Math.round(windowStart * 60 + f * 15 * 60);
    const mm = Math.floor(clock / 60).toString().padStart(2, '0');
    const ss = (clock % 60).toString().padStart(2, '0');
    return {
      minute,
      clock,
      time: `${mm}:${ss}`,
      side: sideLabel,
      lane: shot.lane,
      xg: shot.xg,
      outcome,
      scorerId,
      scorerName,
      assisterId,
      assisterName,
      text: beatText(outcome, shot.lane, scorerName, seed, inc, side, shotIdx),
    };
  });
}

// ---------------------------------------------------------------------------
// 4. resolveIncrement
// ---------------------------------------------------------------------------

/**
 * Build both PossessionSides for the period contest from your resolved split and
 * the opponent's resolved field. Pure — extracted so the play-impact counterfactuals
 * can re-run the SAME construction with an alternative split / opponent field.
 *
 * The opponent runs the lean side path (no synergy/style/personality cascade). Its
 * raw lane push/cover are already power-comparable to a player side, so the lane
 * contest (shot volume) uses them straight — only the offensive counter biases its
 * push toward your thinnest cover lane. OPP_COHESION compensates ONLY for the skipped
 * cascade on the QUALITY/CONTROL dimensions (creation, finishing, possession), where a
 * player deck's synergy+style+personality stack genuinely lifts it above raw power.
 */
function buildContestSides(
  split: AttackDefenceSplit,
  opp: SideField,
  reactivity: number,
): { youSide: PossessionSide; oppSide: PossessionSide; oppPush: Record<Lane, number>; oppEffCover: Record<Lane, number> } {
  const oppPush = counterPush(opp.lanePush, split.laneCover, reactivity);
  const oppFinishing = opp.shotQuality * OPP_COHESION;

  // Defensive counter: the opponent shifts mobile cover onto your loaded lanes in
  // proportion to its reactivity; you committed your shape, so yours stays put.
  const yourPushSum = (split.lanePush.L + split.lanePush.C + split.lanePush.R) || 1;
  const oppCoverSum = opp.laneCover.L + opp.laneCover.C + opp.laneCover.R;
  const oppEffCover: Record<Lane, number> = {
    L: opp.laneCover.L * (1 - reactivity) + oppCoverSum * reactivity * (split.lanePush.L / yourPushSum),
    C: opp.laneCover.C * (1 - reactivity) + oppCoverSum * reactivity * (split.lanePush.C / yourPushSum),
    R: opp.laneCover.R * (1 - reactivity) + oppCoverSum * reactivity * (split.lanePush.R / yourPushSum),
  };

  // Cross denial: each side's `deny` verbs suppress the OTHER's conversion (capped).
  const yourDenial = clamp(split.opponentDenial ?? 0, 0, 0.5);   // you → them
  const theirDenial = clamp(opp.denial ?? 0, 0, 0.5);            // them → you

  // Lane-targeted denial (antagonists): a fraction knocked off the OTHER side's named
  // lane total, capped however many antagonists stack.
  const dampen = (value: number, denial: number | undefined) =>
    value * (1 - clamp(denial ?? 0, 0, ZONE_DENIAL_CAP));

  // No blends (FUNNEL_MODEL_V1): control IS possession, shot quality IS finishing.
  // Pressing is carried on each side and applied to the OTHER's control inside
  // simulatePeriod — stage 1's counter.
  const youSide: PossessionSide = {
    lanePush: split.lanePush,
    laneCover: split.laneCover,
    shotQuality: dampen(split.shotQuality, opp.zoneDenial?.finishing),
    defenceScore: dampen(split.defenceScore, opp.zoneDenial?.defence),
    control: dampen(split.possession, opp.zoneDenial?.possession),
    pressing: dampen(split.pressing, opp.zoneDenial?.pressing),
    denial: yourDenial,
  };
  const oppSide: PossessionSide = {
    lanePush: oppPush,
    laneCover: oppEffCover,
    shotQuality: dampen(opp.shotQuality * OPP_COHESION, split.zoneDenial?.finishing),
    defenceScore: dampen(opp.defenceScore, split.zoneDenial?.defence),
    control: dampen(opp.possession * OPP_COHESION, split.zoneDenial?.possession),
    pressing: dampen(opp.pressing * OPP_COHESION, split.zoneDenial?.pressing),
    denial: theirDenial,
  };
  return { youSide, oppSide, oppPush, oppEffCover };
}

export function resolveIncrement(
  state: MatchV5State,
  split: AttackDefenceSplit,
  seed: number,
): IncrementResult {
  const minute = INCREMENT_MINUTES[state.currentIncrement];

  // The opponent is a real positioned side (step 4): its field runs through the same
  // path, so the contest is a symmetric mirror (§4) — your push vs their cover, and
  // theirs vs yours — and counters emerge from the verbs both sides emit. Its
  // PRIMARY objective scales its own points (play-to-strengths + build-up, as squad
  // records); the reactivity-weighted lane shift is its only counter.
  const reactivity = reactivityFor(state.opponentStyle);
  const oppScale = opponentScaleTraits(state.opponentXI, state.currentIncrement);
  const opp = computeSideField(
    state.opponentXI,
    state.opponentFormation,
    state.seed + 7777,
    state.currentIncrement,
    oppScale,
    false, // opponent opts out of the defining-trait suite (difficulty already in ROUND_POWER)
  );

  // --- Per-possession resolution: the period is a pool of possessions split by
  // control; each becomes a shot (push vs cover) carrying an xG that is itself a dice
  // roll. Goals are the sum, so a period yields 0..n. The zonal contest feeds it.
  const drama = state.currentIncrement === 4 ? 1.3 : 1.0;
  const { youSide, oppSide, oppPush, oppEffCover } = buildContestSides(split, opp, reactivity);

  const period = simulatePeriod(youSide, oppSide, seed, state.currentIncrement, drama);

  // Fold the opponent's lane-targeted denial (their Antagonist) into YOUR displayed
  // per-card stats: cards whose DEF lands in a denied lane show the reduced number.
  // Display-only — the math already applied it at team level (buildContestSides).
  const oppDenied = opp.zoneDenial ?? {};
  if (Object.keys(oppDenied).length > 0) {
    const adjusted: typeof split.cardStats = {};
    state.xi.forEach((card, i) => {
      const st = split.cardStats[card.id];
      if (!st) return;
      const slot = state.formation.slots[i] ?? state.formation.slots[state.formation.slots.length - 1];
      const defLane = DEF_LANE_OF_BAND[bandOf(cellOf(slot.x, slot.y))];
      const denial = Math.min(ZONE_DENIAL_CAP, oppDenied[defLane] ?? 0);
      adjusted[card.id] = denial > 0 && st.def > 0
        ? { ...st, def: Math.round(st.def * (1 - denial)) }
        : st;
    });
    split = { ...split, cardStats: adjusted };
  }

  const yourGoalCount = period.you.goals;
  const opponentGoalCount = period.opp.goals;
  const yourScored = yourGoalCount > 0;
  const opponentScored = opponentGoalCount > 0;

  // Display fields (probability of ≥1 goal + shot-volume/quality readouts).
  const yourGoalChance = clamp(1 - Math.exp(-period.you.xg), 0, 1);
  const opponentGoalChance = clamp(1 - Math.exp(-period.opp.xg), 0, 1);
  const yourChanceVolume = clamp(period.you.shots.length / 6, 0, 1);
  const opponentChanceVolume = clamp(period.opp.shots.length / 6, 0, 1);
  const yourChanceQuality = period.you.shots.length ? clamp(period.you.xg / period.you.shots.length, 0, 1) : 0;
  const opponentChanceQuality = period.opp.shots.length ? clamp(period.opp.xg / period.opp.shots.length, 0, 1) : 0;

  // Generate commentary
  const allConnections = [...split.attackSynergies, ...split.defenceSynergies, ...split.crossSynergies];
  let eventText: string;
  let eventType: MatchEvent['type'];

  if (yourScored && opponentScored) {
    eventText = `${minute}' — GOAL! ${generateGoalText(allConnections, seed + state.currentIncrement)} But the opponent strikes back!`;
    eventType = 'goal-yours';
  } else if (yourScored) {
    eventText = `${minute}' — GOAL! ${generateGoalText(allConnections, seed + state.currentIncrement)}`;
    eventType = 'goal-yours';
  } else if (opponentScored) {
    eventText = `${minute}' — Opponent scores. ${generateChanceText(seed + state.currentIncrement + 100)}`;
    eventType = 'goal-opponent';
  } else {
    eventText = `${minute}' — ${generateChanceText(seed + state.currentIncrement + 200)}`;
    eventType = 'chance';
  }

  // Per-shot commentary beats (additive, deterministic): your shots then the
  // opponent's, in engine order. side index matches the possession RNG (0=you, 1=opp).
  // YOUR scorer pool prefers the committed attackers; OPP uses its full positioned XI.
  const committedIds = state.attackerIds && state.attackerIds.size > 0 ? state.attackerIds : null;
  const beats: MatchBeat[] = [
    ...buildBeats(
      period.you.shots, state.xi, state.formation, 'you', 0, minute, seed, state.currentIncrement, committedIds,
    ),
    ...buildBeats(period.opp.shots, state.opponentXI, state.opponentFormation, 'opp', 1, minute, seed, state.currentIncrement, null),
  ];

  // Per-increment stats (additive, display-only): xG/shots come straight from the
  // resolved period; possession is the 20-possession split; on-target mirrors the beat
  // outcome; a lane is "won" when that side out-pushes the other's effective cover.
  const possTotal = (period.you.possessions + period.opp.possessions) || 1;
  const yourPossessionPct = Math.round((period.you.possessions / possTotal) * 100);
  const onTargetFor = (s: 'you' | 'opp') =>
    beats.filter((b) => b.side === s && (b.outcome === 'goal' || b.outcome === 'save')).length;

  // Full 9-cell control grid (display-only, deterministic, no RNG): for each cell, your
  // total presence (sum over all emission kinds) vs the opponent's in the mirrored same-
  // lane cell (your ATT third is physically contested by their DEF third). A side "wins"
  // a cell only on a strict majority; ties leave both false. (CHANGE 2)
  const yourZoneGrid = {} as Record<Cell, boolean>;
  const opponentZoneGrid = {} as Record<Cell, boolean>;
  const zoneMargin = {} as Record<Cell, number>;
  for (const band of BANDS) {
    for (const lane of LANES) {
      const cell = `${band}_${lane}` as Cell;
      const oppCell = `${mirrorBand(band)}_${lane}` as Cell;
      const yourPresence = cellPresence(split.cells, cell);
      const oppPresence = cellPresence(opp.cells, oppCell);
      yourZoneGrid[cell] = yourPresence > oppPresence;
      opponentZoneGrid[cell] = oppPresence > yourPresence;
      zoneMargin[cell] = Math.round(yourPresence - oppPresence);
    }
  }

  const stats: MatchStats = {
    yourXG: period.you.xg,
    opponentXG: period.opp.xg,
    yourPossessionPct,
    opponentPossessionPct: 100 - yourPossessionPct,
    yourShots: period.you.shots.length,
    opponentShots: period.opp.shots.length,
    yourShotsOnTarget: onTargetFor('you'),
    opponentShotsOnTarget: onTargetFor('opp'),
    yourZonesWon: {
      L: split.lanePush.L > oppEffCover.L,
      C: split.lanePush.C > oppEffCover.C,
      R: split.lanePush.R > oppEffCover.R,
    },
    opponentZonesWon: {
      L: oppPush.L > split.laneCover.L,
      C: oppPush.C > split.laneCover.C,
      R: oppPush.R > split.laneCover.R,
    },
    yourZoneGrid,
    opponentZoneGrid,
    zoneMargin,
  };

  return {
    minute,
    split,
    opponentAttack: opp.possession + opp.chanceCreation + opp.shotQuality,
    opponentDefence: opp.pressing + Math.round(opp.laneCover.L + opp.laneCover.C + opp.laneCover.R) + opp.defenceScore,
    yourChanceVolume,
    yourChanceQuality,
    yourGoalChance,
    opponentChanceVolume,
    opponentChanceQuality,
    opponentGoalChance,
    yourScored,
    opponentScored,
    yourGoalCount,
    opponentGoalCount,
    yourXG: period.you.xg,
    opponentXG: period.opp.xg,
    yourPossessions: period.you.possessions,
    opponentPossessions: period.opp.possessions,
    yourShots: period.you.shots,
    opponentShots: period.opp.shots,
    event: { minute, text: eventText, type: eventType },
    beats,
    stats,
  };
}

// ---------------------------------------------------------------------------
// 5. getOpponentBaselines (private)
// ---------------------------------------------------------------------------

export function getOpponentBaselines(
  round: number,
  style: string,
  increment: number,
  state: MatchV5State,
): { attack: number; defence: number } {
  const idx = clamp(round - 1, 0, OPPONENT_BASELINES.length - 1);
  let { attack, defence } = OPPONENT_BASELINES[idx];

  switch (style) {
    case 'Passive':
      // Flat baselines
      break;
    case 'Balanced':
      // Slight increase in attack if losing
      if (state.opponentGoals < state.yourGoals) {
        attack = Math.round(attack * 1.10);
      }
      break;
    case 'Attacking':
      attack = Math.round(attack * 1.20);
      defence = Math.round(defence * 0.90);
      break;
    case 'Counter':
      // +30% attack after conceding
      if (state.scores.length > 0 && state.scores[state.scores.length - 1].yourScored) {
        attack = Math.round(attack * 1.30);
      }
      break;
    case 'Adaptive': {
      // Mirror player's split ratio
      const atkCount = state.attackerOrder.length;
      const totalCards = state.xi.length;
      const atkRatio = totalCards > 0 ? atkCount / totalCards : 0.5;
      // Opponent attacks heavier when player defends heavier
      attack = Math.round(attack * (0.5 + (1 - atkRatio)));
      defence = Math.round(defence * (0.5 + atkRatio));
      break;
    }
  }

  return { attack, defence };
}

// ---------------------------------------------------------------------------
// 6. advanceIncrement
// ---------------------------------------------------------------------------

export function advanceIncrement(state: MatchV5State, result: IncrementResult): MatchV5State {
  const newScores = [...state.scores, result];
  const newYourGoals = state.yourGoals + result.yourGoalCount;
  const newOpponentGoals = state.opponentGoals + result.opponentGoalCount;
  const nextIncrement = state.currentIncrement + 1;
  const isFirstHalf = nextIncrement <= 1;

  // Trait-driven fitness deltas this spell (drain-fitness records: Press High's
  // press cost on your own pressers; Dark Arts' knock on their star). Negative values.
  const traitDrain = result.split.fitnessDelta ?? {};

  // Fitness drain (§3.1): every starter loses condition each increment — base by
  // durability × involvement by band (attacking lanes burn faster). A genuinely spent,
  // fragile card risks an injury. Cards rested in a cold (DEF) zone fade slower.
  const newXi = [...state.xi];
  const fatigueSeed = state.seed * 97 + state.currentIncrement * 31;
  const lastSlot = state.formation.slots[state.formation.slots.length - 1];

  for (let i = 0; i < newXi.length; i++) {
    const card = newXi[i];
    const slot = state.formation.slots[i] ?? lastSlot;
    const band = bandOf(cellOf(slot.x, slot.y));
    const drain = (FITNESS_DRAIN[card.durability] ?? 0.5) * BAND_INVOLVEMENT[band];
    const fitness = clamp((card.fitness ?? 6) - drain + (traitDrain[card.id] ?? 0), 1, 6);

    let injured = card.injured;
    if (!injured && fitness < 2.5) {
      // tired + fragile → injury risk this increment
      let risk = 0;
      if (card.durability === 'glass') risk = 0.15;
      else if (card.durability === 'phoenix') risk = 0.12;
      else if (card.durability === 'fragile') risk = 0.10;
      if (risk > 0 && seededRandom(fatigueSeed + card.id) < risk) injured = true;
    }

    newXi[i] = { ...card, fitness, injured };
  }

  // Enemy-targeted drains (Dark Arts) land on the opponent XI: the drained card
  // emits less in every later spell (computeSideField reads its live fitness).
  let newOpponentXI = state.opponentXI;
  if (state.opponentXI.some((c) => traitDrain[c.id])) {
    newOpponentXI = state.opponentXI.map((c) =>
      traitDrain[c.id] ? { ...c, fitness: clamp(fitnessOf(c) + traitDrain[c.id], 1, 6) } : c,
    );
  }

  return {
    ...state,
    xi: newXi,
    opponentXI: newOpponentXI,
    scores: newScores,
    yourGoals: newYourGoals,
    opponentGoals: newOpponentGoals,
    currentIncrement: nextIncrement,
    isFirstHalf,
    attackerIds: new Set(), // clear for next increment
    attackerOrder: [],
  };
}

// ---------------------------------------------------------------------------
// 7. makeSub
// ---------------------------------------------------------------------------

/**
 * Why a substitution would be rejected, or null if it is legal. Lets the UI explain a
 * blocked sub (a toast) instead of the engine silently returning the unchanged state —
 * the "subs don't always work" feel. Subs are allowed at any point in the match (capped
 * at `subsRemaining`); there is no first-half restriction.
 */
export function subBlockReason(
  state: MatchV5State,
  xiCardId: number,
  benchCardId: number,
): string | null {
  if (state.subsRemaining <= 0) return 'No substitutions left';
  if (!state.xi.some((c) => c.id === xiCardId)) return 'That player is not on the pitch';
  if (!state.bench.some((c) => c.id === benchCardId)) return 'That player is not on the bench';
  return null;
}

export function makeSub(state: MatchV5State, xiCardId: number, benchCardId: number): MatchV5State {
  if (subBlockReason(state, xiCardId, benchCardId) !== null) return state;

  const xiCard = state.xi.find((c) => c.id === xiCardId)!;
  const benchCard = state.bench.find((c) => c.id === benchCardId)!;

  const minute = INCREMENT_MINUTES[state.currentIncrement] ?? 90;
  const newXi = state.xi.map((c) => (c.id === xiCardId ? benchCard : c));
  const newBench = state.bench.filter((c) => c.id !== benchCardId);
  const newAttackerOrder = state.attackerOrder.filter((id) => id !== xiCardId);

  return {
    ...state,
    xi: newXi,
    bench: newBench,
    attackerIds: new Set(newAttackerOrder),
    attackerOrder: newAttackerOrder,
    subsRemaining: state.subsRemaining - 1,
    subsUsed: [...state.subsUsed, { outId: xiCardId, inId: benchCardId, minute }],
  };
}

// ---------------------------------------------------------------------------
// 8. discardFromBench
// ---------------------------------------------------------------------------

export function discardFromBench(state: MatchV5State, benchCardIds: number[]): MatchV5State {
  if (state.discardsRemaining <= 0) return state;
  if (benchCardIds.length === 0) return state;

  const discardSet = new Set(benchCardIds);
  const keptBench = state.bench.filter((c) => !discardSet.has(c.id));
  const discardCount = state.bench.length - keptBench.length;

  if (discardCount === 0) return state;

  // Draw replacements from remaining deck
  const drawCount = Math.min(discardCount, state.remainingDeck.length);
  const drawn = state.remainingDeck.slice(0, drawCount);
  const newRemainingDeck = state.remainingDeck.slice(drawCount);

  return {
    ...state,
    bench: [...keptBench, ...drawn],
    remainingDeck: newRemainingDeck,
    discardsRemaining: state.discardsRemaining - 1,
  };
}

// ---------------------------------------------------------------------------
// 9. getMatchResult + the match verdict (why you won/lost)
// ---------------------------------------------------------------------------

const nf1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * Compute the legible "why" from the played increments. Read-side and
 * deterministic — every number quoted comes from the match data:
 *   power      — your XI's average power vs the opponent XI's
 *   chances    — total xG for vs against
 *   conversion — goals relative to xG on both sides (who took their chances)
 *   control    — average possession share + lane contests won
 *   plan       — attack added per spell by tactics + manager + chemistry
 * The headline names the DECISIVE factor via a small result-aware tree; the
 * factors list carries the rest, ranked by magnitude. Copy stays dry and
 * numeric — the data is the sentence.
 */
export function computeMatchVerdict(state: MatchV5State): MatchVerdict {
  const inc = Math.max(1, state.scores.length);
  const { yourGoals, opponentGoals } = state;
  const result: 'win' | 'draw' | 'loss' =
    yourGoals > opponentGoals ? 'win' : yourGoals < opponentGoals ? 'loss' : 'draw';

  // --- Raw axes -------------------------------------------------------------
  const yourAvgPower = state.xi.length
    ? state.xi.reduce((a, c) => a + c.power, 0) / state.xi.length : 0;
  const oppAvgPower = state.opponentXI.length
    ? state.opponentXI.reduce((a, c) => a + c.power, 0) / state.opponentXI.length : 0;
  const powerGap = yourAvgPower - oppAvgPower;

  let yourXG = 0, oppXG = 0, poss = 0, yourLanes = 0, oppLanes = 0;
  let planPts = 0, basePts = 0;
  for (const r of state.scores) {
    yourXG += r.yourXG;
    oppXG += r.opponentXG;
    poss += r.stats.yourPossessionPct;
    yourLanes += (['L', 'C', 'R'] as Lane[]).filter((l) => r.stats.yourZonesWon[l]).length;
    oppLanes += (['L', 'C', 'R'] as Lane[]).filter((l) => r.stats.opponentZonesWon[l]).length;
    for (const line of r.split.attackBreakdown) {
      if (line.type === 'tactic' || line.type === 'manager' || line.type === 'synergy') planPts += line.value;
      if (line.type === 'base') basePts += line.value;
    }
  }
  poss /= inc;
  const laneShare = yourLanes + oppLanes > 0 ? yourLanes / (yourLanes + oppLanes) : 0.5;
  const planPerSpell = planPts / inc;
  const planShare = basePts > 0 ? planPts / basePts : 0;
  // Finishing swing: who out-scored their chances (goals − xG), you minus them.
  const convSwing = (yourGoals - yourXG) - (opponentGoals - oppXG);

  // --- Factors (swing normalizes each axis to roughly ±1 for RANKING only) ---
  const rawFactors: VerdictFactor[] = [
    {
      key: 'power',
      label: 'Squad power',
      detail: `Your XI averaged ${Math.round(yourAvgPower)} power to their ${Math.round(oppAvgPower)}.`,
      swing: Math.max(-1, Math.min(1, powerGap / 10)),
    },
    {
      key: 'chances',
      label: 'Chances created',
      detail: `Expected goals ${nf1(yourXG)} to ${nf1(oppXG)}.`,
      swing: Math.max(-1, Math.min(1, (yourXG - oppXG) / 2.5)),
    },
    {
      key: 'conversion',
      label: 'Finishing',
      detail: `You scored ${yourGoals} from ${nf1(yourXG)} xG; they scored ${opponentGoals} from ${nf1(oppXG)}.`,
      swing: Math.max(-1, Math.min(1, convSwing / 2)),
    },
    {
      key: 'control',
      label: 'Control',
      detail: `${Math.round(poss)}% possession; lane contests won ${yourLanes} to ${oppLanes}.`,
      swing: Math.max(-1, Math.min(1, ((poss - 50) / 25 + (laneShare - 0.5) * 2) / 2)),
    },
    {
      key: 'plan',
      label: 'Your plan',
      detail: `Tactics, manager and chemistry added ${Math.round(planPerSpell)} attack per spell (+${Math.round(planShare * 100)}% on the base).`,
      swing: Math.max(0, Math.min(1, planShare / 0.35)),
    },
  ];
  const factors = rawFactors.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing));

  // --- Headline: a small result-aware tree, decisive factor first ------------
  let headline: string;
  const xgGap = yourXG - oppXG;
  if (Math.abs(powerGap) >= 6) {
    headline = powerGap < 0
      ? `Outgunned: their XI averaged ${Math.round(oppAvgPower)} power to your ${Math.round(yourAvgPower)}.`
      : `Overpowered them: your XI averaged ${Math.round(yourAvgPower)} power to their ${Math.round(oppAvgPower)}.`;
  } else if (result === 'loss' && xgGap >= 0.8) {
    headline = `Created enough — xG ${nf1(yourXG)} to ${nf1(oppXG)} — but they took their chances and you didn't.`;
  } else if (result === 'win' && xgGap <= -0.8) {
    headline = `Won on finishing: ${yourGoals} goal${yourGoals === 1 ? '' : 's'} from ${nf1(yourXG)} xG against the run of play.`;
  } else if (Math.abs(xgGap) >= 0.8) {
    headline = xgGap > 0
      ? `Out-created them: xG ${nf1(yourXG)} to ${nf1(oppXG)}.`
      : `Out-created: they made xG ${nf1(oppXG)} to your ${nf1(yourXG)}.`;
  } else if (Math.abs(poss - 50) >= 8 || Math.abs(laneShare - 0.5) >= 0.2) {
    const yours = poss >= 50;
    headline = yours
      ? `Controlled it: ${Math.round(poss)}% possession and ${yourLanes}–${oppLanes} on the lanes.`
      : `Control lost: ${Math.round(poss)}% possession and ${yourLanes}–${oppLanes} on the lanes.`;
  } else if (result !== 'draw' && planShare >= 0.25) {
    headline = `Your plan made the difference: tactics, manager and chemistry added +${Math.round(planShare * 100)}% attack.`;
  } else {
    headline = `Fine margins: xG ${nf1(yourXG)} to ${nf1(oppXG)}.`;
  }

  return { headline, factors };
}

export function getMatchResult(state: MatchV5State): MatchV5Result {
  const { yourGoals, opponentGoals } = state;
  let result: 'win' | 'draw' | 'loss';
  if (yourGoals > opponentGoals) result = 'win';
  else if (yourGoals < opponentGoals) result = 'loss';
  else result = 'draw';

  return {
    yourGoals,
    opponentGoals,
    result,
    scores: state.scores,
    matchState: state,
    verdict: computeMatchVerdict(state),
  };
}

// ---------------------------------------------------------------------------
// Cumulative match stats — running totals across all played increments.
// The per-increment `stats` block is for THIS 15' window only; the team-talk break
// wants the match-to-date totals too. Pure aggregation over `scores` (display-only).
// ---------------------------------------------------------------------------

export interface CumulativeStats {
  periodsPlayed: number;
  yourGoals: number;
  opponentGoals: number;
  yourXG: number;
  opponentXG: number;
  yourShots: number;
  opponentShots: number;
  yourShotsOnTarget: number;
  opponentShotsOnTarget: number;
  yourPossessionPct: number;   // share of total possessions across the match
  opponentPossessionPct: number;
  yourZonesWon: number;        // lane-wins tallied across every period (max 3 × periods)
  opponentZonesWon: number;
  zoneMargin: Record<Cell, number>; // signed per-cell control margin, summed over periods
}

export function cumulativeStats(scores: IncrementResult[]): CumulativeStats {
  const zoneMargin = Object.fromEntries(CELLS.map((c) => [c, 0])) as Record<Cell, number>;
  let yX = 0, oX = 0, yS = 0, oS = 0, ySoT = 0, oSoT = 0, yPoss = 0, oPoss = 0;
  let yGoals = 0, oGoals = 0, yZW = 0, oZW = 0;

  for (const s of scores) {
    yGoals += s.yourGoalCount; oGoals += s.opponentGoalCount;
    yX += s.yourXG; oX += s.opponentXG;
    yS += s.yourShots.length; oS += s.opponentShots.length;
    ySoT += s.stats.yourShotsOnTarget; oSoT += s.stats.opponentShotsOnTarget;
    yPoss += s.yourPossessions; oPoss += s.opponentPossessions;
    for (const lane of LANES) {
      if (s.stats.yourZonesWon[lane]) yZW++;
      if (s.stats.opponentZonesWon[lane]) oZW++;
    }
    for (const cell of CELLS) zoneMargin[cell] += s.stats.zoneMargin[cell] ?? 0;
  }

  const totPoss = yPoss + oPoss;
  return {
    periodsPlayed: scores.length,
    yourGoals: yGoals,
    opponentGoals: oGoals,
    yourXG: Math.round(yX * 100) / 100,
    opponentXG: Math.round(oX * 100) / 100,
    yourShots: yS,
    opponentShots: oS,
    yourShotsOnTarget: ySoT,
    opponentShotsOnTarget: oSoT,
    yourPossessionPct: totPoss ? Math.round((yPoss / totPoss) * 100) : 50,
    opponentPossessionPct: totPoss ? Math.round((oPoss / totPoss) * 100) : 50,
    yourZonesWon: yZW,
    opponentZonesWon: oZW,
    zoneMargin,
  };
}

// ---------------------------------------------------------------------------
// Per-player match stats + rating — read-side only.
// Derived entirely from IncrementResult data (per-card emission share + the goal/assist
// ledger + live fitness). No RNG, never feeds the match math — the scoreline is unaffected.
// ---------------------------------------------------------------------------

export interface PlayerMatchStat {
  cardId: number;
  name: string;
  position: string;
  goals: number;
  assists: number;
  /** Base power scaled by current fitness — the number shown on the pitch card. */
  effectivePower: number;
  /** Current condition, 1–6. */
  fitness: number;
  /** Does the card's position fit its formation slot? false → a "wrong position" flag. */
  posFit: boolean;
  /** 0–10 match rating (one decimal): 6.0 base ± contribution share + goals/assists. */
  rating: number;
}

/**
 * Aggregate per-player in-match stats + a 0–10 rating over the played increments, keyed to
 * the current XI. Pure read-side reduction (mirrors cumulativeStats). Rating = 6.0 base +
 * contribution-share lift (each card's emission vs the XI average) + goals (×1.0) / assists
 * (×0.7) + a small fitness nudge, with a positional-misfit ding; clamped to [0,10].
 */
export function playerMatchStats(
  scores: IncrementResult[],
  xi: Card[],
  formation: Formation,
): Record<number, PlayerMatchStat> {
  const out: Record<number, PlayerMatchStat> = {};
  xi.forEach((card, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    out[card.id] = {
      cardId: card.id,
      name: card.name,
      position: card.position,
      goals: 0,
      assists: 0,
      effectivePower: effectivePower(card),
      fitness: fitnessOf(card),
      posFit: slot ? slot.accepts.includes(card.position) : true,
      rating: 6.0,
    };
  });

  // Contribution (per-card emission, summed) + the goal/assist ledger from your beats.
  const contrib: Record<number, number> = {};
  for (const s of scores) {
    const emit = s.split.cardEmit ?? {};
    for (const idStr of Object.keys(emit)) {
      const id = Number(idStr);
      const e = emit[id];
      contrib[id] = (contrib[id] ?? 0) + ZONES.reduce((sum, z) => sum + (e[z] ?? 0), 0);
    }
    for (const b of s.beats) {
      if (b.side !== 'you' || b.outcome !== 'goal') continue;
      if (b.scorerId != null && out[b.scorerId]) out[b.scorerId].goals += 1;
      if (b.assisterId != null && out[b.assisterId]) out[b.assisterId].assists += 1;
    }
  }

  const ids = Object.keys(out).map(Number);
  const n = ids.length || 1;
  let sumContrib = 0;
  for (const id of ids) sumContrib += contrib[id] ?? 0;
  const avgContrib = sumContrib / n;

  for (const id of ids) {
    const st = out[id];
    const rel = avgContrib > 0 ? ((contrib[id] ?? 0) - avgContrib) / avgContrib : 0;
    let rating = 6.0 + clamp(rel, -1, 2) * 0.8;
    rating += st.goals * 1.0 + st.assists * 0.7;
    rating += (fitnessFactor(st.fitness) - 0.9) * 1.5; // spent players underperform their output
    if (!st.posFit) rating -= 0.5;
    st.rating = Math.round(clamp(rating, 0, 10) * 10) / 10;
  }

  return out;
}
