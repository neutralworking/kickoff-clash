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
import type { TacticSlots } from './tactics';
import type { TeamIntent } from './run';
import { squadTraits } from './squad-transforms';
import {
  INCREMENT_MINUTES,
  generateGoalText,
  generateChanceText,
  generateInjuryText,
} from './hand';
import type { MatchEvent } from './hand';
import type { DispatchCard, ZoneName, TraitRecord } from './verbs';
import { dispatchTraits, ZONES } from './verbs';
import { traitsForCard } from './role-transforms';
import type { Lane, Cell, Band } from './field';
import { CELLS, BANDS, LANES, cellOf, bandOf } from './field';
import { generateOpponentXI, opponentScaleTraits, counterPush, reactivityFor } from './opponent';
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
  seed: number;
}

export interface CascadeLine {
  label: string;
  value: number;
  type: 'base' | 'synergy' | 'style' | 'dual-role' | 'personality' | 'manager' | 'tactic' | 'ability';
}

export interface AttackDefenceSplit {
  attackScore: number;
  defenceScore: number;
  chanceCreation: number;
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
  text: string;
}

export interface MatchV5Result {
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
  scores: IncrementResult[];
  matchState: MatchV5State;
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

// --- Positioning-model band weights (DESIGN §1/§4; §7 dials) ---
// Attack/defence emission split by band (a midfielder contributes to both);
// creation/finishing chance-mix projected by band (§4: ATT≈finishing, MID≈creation).
const BAND_ATK: Record<Band, number> = { ATT: 1.0, MID: 0.55, DEF: 0.18 };
const BAND_DEF: Record<Band, number> = { ATT: 0.12, MID: 0.55, DEF: 1.0 };
const CREATION_BAND: Record<Band, number> = { ATT: 0.7, MID: 1.0, DEF: 0.4 };
const FINISHING_BAND: Record<Band, number> = { ATT: 1.0, MID: 0.5, DEF: 0.1 };
const zeroEmit = (): Record<ZoneName, number> => ({ attack: 0, defence: 0, creation: 0, finishing: 0 });

/** Opponent attacking-output multiplier — stands in for the synergy/style/personality
 *  cascade the lean opponent side path skips, AND for the player's own inflated
 *  defence it attacks into, so a comparably-powered opponent is a real threat.
 *  (DESIGN §7 difficulty dial; calibrated against the deck-strength sweep.) */
const OPP_COHESION = 1.3;

// --- Fitness (MATCH_ENGINE §3.1; §7 dials) ---
// Dynamic 1–6 condition. fitnessFactor scales emission: fresh (6) = full, spent (1) =
// half. Drain per increment = base (durability tier) × involvement (band: attacking /
// contested lanes burn faster). A titanium back is ~immune (90 minutes); a glass
// attacker fades fast — rest it in a cold zone or sub it.
const FITNESS_DRAIN: Record<Durability, number> = {
  glass: 0.70, fragile: 0.55, phoenix: 0.60, standard: 0.40, iron: 0.28, titanium: 0.06,
};
const BAND_INVOLVEMENT: Record<Band, number> = { ATT: 1.2, MID: 0.9, DEF: 0.5 };

function fitnessFactor(fitness: number): number {
  return 0.52 + 0.08 * clamp(fitness, 1, 6); // 6 → 1.0, 1 → 0.6
}

/** Starting fitness for a card entering a match: fresh, or low if carrying an injury. */
function fitnessOf(card: Card): number {
  return card.fitness ?? (card.injured ? 2 : 6);
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
  tacticSlots: TacticSlots,
  playingStyle: string,
): { name: string; summary: string; creationBonus: number; qualityBonus: number; attackBonus: number; defenceBonus: number } {
  if (orderedAttackers.length === 0) {
    return {
      name: 'Hold Shape',
      summary: 'Protect the structure and wait for the next opening.',
      creationBonus: 0,
      qualityBonus: 0,
      attackBonus: 0,
      defenceBonus: 24,
    };
  }

  const tacticIds = tacticSlots.slots.filter(Boolean).map((t) => t!.id);
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
      creationBonus: 42 + (tacticIds.includes('counter_attack') ? 18 : 0),
      qualityBonus: 50 + (tacticIds.includes('set_piece') ? 10 : 0),
      attackBonus: 34,
      defenceBonus: -12,
    };
  }

  if (wideCount >= 2 && playmakers >= 1 && finishers >= 1) {
    return {
      name: 'Wing Overload',
      summary: `Stretch them wide, feed the flanks, and finish through ${finisher.name}.`,
      creationBonus: 46 + (tacticIds.includes('wing_play') ? 22 : 0),
      qualityBonus: 34 + (orderedAttackers.some((c) => c.archetype === 'Engine') ? 12 : 0),
      attackBonus: 30,
      defenceBonus: defendersHolding >= 4 ? 10 : -10,
    };
  }

  if ((playingStyle === 'Tiki-Taka' || tacticIds.includes('possession') || tacticIds.includes('narrow')) && orderedAttackers.length >= 5 && playmakers >= 2) {
    return {
      name: 'Tiki-Taka',
      summary: `Short combinations pull them apart before ${finisher.name} gets the final touch.`,
      creationBonus: 58,
      qualityBonus: 28,
      attackBonus: 36,
      defenceBonus: defendersHolding >= 4 ? 18 : 6,
    };
  }

  if (orderedAttackers.length >= 6 && defendersHolding >= 4) {
    return {
      name: 'Death by a Thousand Cuts',
      summary: `Sustain pressure with runners everywhere while the rest hold the counter shape.`,
      creationBonus: 62,
      qualityBonus: 24,
      attackBonus: 38,
      defenceBonus: 16,
    };
  }

  if (tacticIds.includes('counter_attack') && defendersHolding >= 5 && finishers >= 1) {
    return {
      name: 'Counter Trap',
      summary: `Absorb, spring out, and release ${finisher.name} into the break.`,
      creationBonus: 34,
      qualityBonus: 40,
      attackBonus: 24,
      defenceBonus: 26,
    };
  }

  return {
    name: 'Pattern Play',
    summary: `${opener.name} starts the move and ${finisher.name} is the intended end point.`,
    creationBonus: 18 + playmakers * 10,
    qualityBonus: 18 + finishers * 10,
    attackBonus: 18,
    defenceBonus: defendersHolding >= 4 ? 8 : 0,
  };
}

function getChanceProfile(card: Card): { creation: number; finishing: number } {
  let creation = 0.28;
  let finishing = 0.28;

  switch (card.archetype) {
    case 'Creator':
      creation = 0.85;
      finishing = 0.38;
      break;
    case 'Controller':
      creation = 0.78;
      finishing = 0.22;
      break;
    case 'Passer':
      creation = 0.72;
      finishing = 0.24;
      break;
    case 'Dribbler':
      creation = 0.60;
      finishing = 0.58;
      break;
    case 'Sprinter':
      creation = 0.42;
      finishing = 0.52;
      break;
    case 'Striker':
      creation = 0.34;
      finishing = 0.86;
      break;
    case 'Target':
      creation = 0.26;
      finishing = 0.78;
      break;
    case 'Powerhouse':
      creation = 0.24;
      finishing = 0.66;
      break;
    case 'Engine':
      creation = 0.48;
      finishing = 0.30;
      break;
    case 'Commander':
      creation = 0.34;
      finishing = 0.34;
      break;
  }

  switch (card.tacticalRole) {
    case 'Regista':
    case 'Enganche':
    case 'Trequartista':
    case 'Fantasista':
      creation += 0.12;
      break;
    case 'Winger':
    case 'Inverted Winger':
    case 'Extremo':
      creation += 0.08;
      finishing += 0.08;
      break;
    case 'Poacher':
    case 'Prima Punta':
    case 'Seconda Punta':
      finishing += 0.12;
      break;
  }

  return {
    creation: clamp(creation, 0.12, 1.0),
    finishing: clamp(finishing, 0.12, 1.0),
  };
}

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
): MatchV5State {
  // The opponent is now a real positioned side (step 4), generated deterministically
  // from the round budget + style. It plays through the same dispatcher as you do.
  const { xi: opponentXI, formation: opponentFormation } = generateOpponentXI(
    opponentRound,
    opponentStyle,
    seed,
  );
  return {
    // Each starter begins the match fresh (or low if carrying an injury); fitness
    // then depletes per increment (§3.1).
    xi: xi.map((c) => ({ ...c, fitness: fitnessOf(c) })),
    bench,
    remainingDeck,
    attackerIds: new Set(),
    attackerOrder: [],
    subsRemaining: 5,
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
    seed,
  };
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
  attackScore: number;
  defenceScore: number;
  chanceCreation: number;
  shotQuality: number;
  denial: number;       // conversion suppression this side applies to the other
  variance: number;
  /** The transformed 9×4 grid from the dispatcher (additive — read, never recomputed). */
  cells: Record<Cell, Record<ZoneName, number>>;
}

/**
 * Build a side's field-derived quantities: place each card in its formation cell,
 * emit by band, dispatch its role + squad records, project the chance mix by band,
 * and read the per-lane vectors. The same path both XIs run through (§4).
 */
export function computeSideField(
  xi: Card[],
  formation: Formation,
  seed: number,
  increment: number,
  squadTraits?: TraitRecord[],
): SideField {
  const dispatchCards: DispatchCard[] = xi.map((card, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    const cell = cellOf(slot.x, slot.y);
    const band = bandOf(cell);
    const power = Math.round(card.power * fitnessFactor(fitnessOf(card)));
    const profile = getChanceProfile(card);
    const a = Math.round(power * BAND_ATK[band]);
    const d = Math.round(power * BAND_DEF[band]);
    const e: Record<ZoneName, number> = {
      attack: a, defence: d,
      creation: Math.round(power * profile.creation),
      finishing: Math.round(power * profile.finishing),
    };
    return {
      id: card.id,
      power: card.power,
      archetype: card.archetype,
      tacticalRole: card.tacticalRole,
      position: card.position,
      team: 'player',
      side: band === 'DEF' ? 'defence' : 'attack',
      isWide: isWideCard(card),
      cell,
      emit: e,
      traits: traitsForCard(card),
    };
  });

  const dispatched = dispatchTraits(
    dispatchCards,
    seed,
    increment,
    squadTraits && squadTraits.length ? { playerSquadTraits: squadTraits } : undefined,
  );

  let creationProj = 0;
  let finishingProj = 0;
  for (const cell of CELLS) {
    creationProj += dispatched.cells[cell].creation * CREATION_BAND[bandOf(cell)];
    finishingProj += dispatched.cells[cell].finishing * FINISHING_BAND[bandOf(cell)];
  }

  return {
    lanePush: dispatched.lanePush,
    laneCover: dispatched.laneCover,
    attackScore: Math.max(0, Math.round(dispatched.zones.attack)),
    defenceScore: Math.max(0, Math.round(dispatched.zones.defence)),
    chanceCreation: Math.max(0, Math.round(creationProj)),
    shotQuality: Math.max(0, Math.round(finishingProj)),
    denial: dispatched.opponentDenial,
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
  tacticSlots: TacticSlots,
): AttackDefenceSplit {
  const { xi, formation, playingStyle, personalityBonus, opponentWeakness } = state;
  const maxAtk = formation.maxAttackers;

  const attackBreakdown: CascadeLine[] = [];
  const defenceBreakdown: CascadeLine[] = [];

  // --- Positioning model (DESIGN §1, MATCH_ENGINE §2/§4) ---
  // No per-increment commit. Each player's attack/defence emission is set by the
  // band (ATT/MID/DEF) of the formation slot they occupy (xi[i] ↔ slots[i]); the
  // allocation decision is the shape itself. Midfielders contribute to both.
  const emit = new Map<number, Record<ZoneName, number>>();
  const cardCell = new Map<number, Cell>();
  const cardY = new Map<number, number>();
  const attackers: Card[] = [];
  const defenders: Card[] = [];
  let baseAttack = 0;
  let baseDefence = 0;
  let baseCreationProj = 0;
  let baseFinishingProj = 0;

  xi.forEach((card, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    const cell = cellOf(slot.x, slot.y);
    const band = bandOf(cell);
    cardCell.set(card.id, cell);
    cardY.set(card.id, slot.y);
    const power = Math.round(card.power * fitnessFactor(fitnessOf(card)));
    const profile = getChanceProfile(card);
    const a = Math.round(power * BAND_ATK[band]);
    const d = Math.round(power * BAND_DEF[band]);
    const cr = Math.round(power * profile.creation);
    const fn = Math.round(power * profile.finishing);
    emit.set(card.id, { attack: a, defence: d, creation: cr, finishing: fn });
    baseAttack += a;
    baseDefence += d;
    baseCreationProj += cr * CREATION_BAND[band];
    baseFinishingProj += fn * FINISHING_BAND[band];
    if (band === 'ATT' || band === 'MID') attackers.push(card);
    if (band === 'DEF' || band === 'MID') defenders.push(card);
  });

  // The move flows deep → forward; the most advanced attacker is the finisher.
  const orderedAttackers = [...attackers].sort((a, b) => (cardY.get(b.id) ?? 0) - (cardY.get(a.id) ?? 0));
  const playPattern = inferPlayPattern(orderedAttackers, defenders, tacticSlots, playingStyle);

  attackBreakdown.push({ label: 'Forward shape', value: baseAttack, type: 'base' });
  defenceBreakdown.push({ label: 'Back-line shape', value: baseDefence, type: 'base' });

  // Positional synergies are computed up front: the Manager (Chemistry Set) reads
  // the connection count, so the squad records depend on them before we dispatch.
  const attackerSlotted = attackers.map((c) => cardToSlotted(c, formation));
  const defenderSlotted = defenders.map((c) => cardToSlotted(c, formation));
  const { attackSynergies, defenceSynergies, crossSynergies } =
    findPositionalConnections(attackerSlotted, defenderSlotted);
  const allConnections: Connection[] = [...attackSynergies, ...defenceSynergies, ...crossSynergies];

  // Tactical cards + Manager → squad-wide records over the same verb palette, plus
  // run-accumulated chemistry: connecting pairs emit a zonal bonus scaling with how
  // settled the partnership is (CARDS §5). Both ride the same squad source.
  const playerSquadTraits = [
    ...squadTraits(tacticSlots, jokers, {
      xi,
      increment: state.currentIncrement,
      opponentGoals: state.opponentGoals,
      connections: allConnections,
      intent: state.intent,
    }),
    ...chemistryRecords(xi, formation, state.chemistry ?? {}),
  ];

  // --- Verb dispatcher: migrated roles + squad records reshape the field ---
  const dispatchCards: DispatchCard[] = xi.map((card) => ({
    id: card.id,
    power: card.power,
    archetype: card.archetype,
    tacticalRole: card.tacticalRole,
    position: card.position,
    team: 'player',
    side: bandOf(cardCell.get(card.id) ?? 'MID_C') === 'DEF' ? 'defence' : 'attack',
    isWide: isWideCard(card),
    cell: cardCell.get(card.id) ?? 'MID_C',
    emit: emit.get(card.id) ?? zeroEmit(),
    traits: traitsForCard(card),
  }));

  const dispatched = dispatchTraits(dispatchCards, state.seed, state.currentIncrement, { playerSquadTraits });

  // Adopt the transformed field. attack/defence are the raw aggregate; creation &
  // finishing are a band-weighted projection of the transformed cells (§4), so a
  // relocate that moves a card to a new band re-mixes the chance profile.
  let finalCreationProj = 0;
  let finalFinishingProj = 0;
  for (const cell of CELLS) {
    finalCreationProj += dispatched.cells[cell].creation * CREATION_BAND[bandOf(cell)];
    finalFinishingProj += dispatched.cells[cell].finishing * FINISHING_BAND[bandOf(cell)];
  }

  const transformLabels: Record<ZoneName, Set<string>> = {
    attack: new Set(), defence: new Set(), creation: new Set(), finishing: new Set(),
  };
  for (const line of dispatched.log) {
    if (line.zone) transformLabels[line.zone].add(line.trait);
  }

  const newAttack = Math.max(0, Math.round(dispatched.zones.attack));
  const newDefence = Math.max(0, Math.round(dispatched.zones.defence));
  const attackDelta = newAttack - baseAttack;
  const defenceDelta = newDefence - baseDefence;
  const creationDelta = Math.round(finalCreationProj - baseCreationProj);
  const finishingDelta = Math.round(finalFinishingProj - baseFinishingProj);
  baseAttack = newAttack;
  baseDefence = newDefence;
  const baseCreation = Math.max(0, Math.round(finalCreationProj));
  const baseFinishing = Math.max(0, Math.round(finalFinishingProj));

  if (attackDelta !== 0) {
    attackBreakdown.push({ label: `${[...transformLabels.attack].join(' + ') || 'Verb dispatcher'}`, value: attackDelta, type: 'ability' });
  }
  if (defenceDelta !== 0) {
    defenceBreakdown.push({ label: `${[...transformLabels.defence].join(' + ') || 'Verb dispatcher'}`, value: defenceDelta, type: 'ability' });
  }
  if (creationDelta !== 0) {
    attackBreakdown.push({ label: `${[...transformLabels.creation].join(' + ') || 'Movement'} (creation)`, value: creationDelta, type: 'ability' });
  }
  if (finishingDelta !== 0) {
    attackBreakdown.push({ label: `${[...transformLabels.finishing].join(' + ') || 'Movement'} (finishing)`, value: finishingDelta, type: 'ability' });
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
    styleAttack = Math.round(baseAttack * style.multiplier * matchingCount);
    if (styleAttack > 0) {
      attackBreakdown.push({ label: `${style.name} pattern`, value: styleAttack, type: 'style' });
    }
  }

  // --- Weakness exploitation ---
  let weaknessBonus = 0;
  if (opponentWeakness) {
    const weaknessCount = attackers.filter((c) => c.archetype === opponentWeakness).length;
    if (weaknessCount >= 2) {
      weaknessBonus = Math.round(baseAttack * 0.15);
      attackBreakdown.push({ label: 'Picked on their weak side', value: weaknessBonus, type: 'ability' });
    }
  }

  // Tactical cards + Manager are no longer flat bonuses here — they ran through the
  // dispatcher (squad records) and are already folded into baseAttack / the chance
  // mix above, attributed by name in the dispatcher cascade lines.

  // --- Subtotals before personality ---
  let attackTotal = baseAttack + dualAttack + synergyAttack + crossAttack + styleAttack + weaknessBonus;
  let defenceTotal = baseDefence + dualDefence + synergyDefence + crossDefence + playPattern.defenceBonus;
  const attackerPowerPool = attackers.reduce((sum, card) => sum + card.power, 0);
  const chemistryDensity = attackerPowerPool > 0
    ? (synergyAttack + crossAttack) / attackerPowerPool
    : 0;
  const compactAttackMultiplier = attackers.length > 0 && attackers.length <= 3
    ? 1 + Math.min(0.55, chemistryDensity * 1.4 + attackSynergies.length * 0.10 + crossSynergies.length * 0.06)
    : 1 + Math.min(0.18, chemistryDensity * 0.45);

  let chanceCreation = Math.round(
    (baseCreation + Math.round(dualAttack * 0.75) + Math.round(styleAttack * 0.45))
      * compactAttackMultiplier,
  );
  let shotQuality = Math.round(
    (baseFinishing + Math.round(synergyAttack * 0.95) + Math.round(crossAttack * 0.55) + Math.round(weaknessBonus * 0.90))
      * compactAttackMultiplier,
  );
  attackTotal += playPattern.attackBonus;
  chanceCreation += playPattern.creationBonus;
  shotQuality += playPattern.qualityBonus;

  if (playPattern.attackBonus !== 0) {
    attackBreakdown.push({ label: playPattern.name, value: playPattern.attackBonus, type: 'tactic' });
  }
  if (playPattern.defenceBonus > 0) {
    defenceBreakdown.push({ label: `${playPattern.name} rest defence`, value: playPattern.defenceBonus, type: 'tactic' });
  }

  if (chanceCreation > 0) {
    attackBreakdown.push({
      label: attackers.length <= 3 && compactAttackMultiplier > 1.08 ? 'Compact move clicked' : 'Chance patterns',
      value: chanceCreation,
      type: 'ability',
    });
  }
  if (shotQuality > 0) {
    attackBreakdown.push({ label: 'Final-ball threat', value: shotQuality, type: 'ability' });
  }

  // --- Personality multipliers (applied last) ---
  const personalityAttackBonus = Math.round(attackTotal * (personalityBonus.attackMod - 1));
  const personalityDefenceBonus = Math.round(defenceTotal * (personalityBonus.defenceMod - 1));
  const personalityCreationBonus = Math.round(chanceCreation * (personalityBonus.attackMod - 1));
  const personalityFinishingBonus = Math.round(shotQuality * (personalityBonus.attackMod - 1));

  if (personalityAttackBonus !== 0 && personalityBonus.label) {
    attackBreakdown.push({ label: `Dressing room edge`, value: personalityAttackBonus, type: 'personality' });
  }
  if (personalityDefenceBonus !== 0 && personalityBonus.label) {
    defenceBreakdown.push({ label: `Dressing room edge`, value: personalityDefenceBonus, type: 'personality' });
  }

  attackTotal += personalityAttackBonus;
  defenceTotal += personalityDefenceBonus;
  chanceCreation += personalityCreationBonus;
  shotQuality += personalityFinishingBonus;

  return {
    attackScore: Math.max(0, attackTotal),
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
    varianceFactor: dispatched.variance,
    lanePush,
    laneCover,
    attackingOrder: orderedAttackers.map((c) => c.id),
    cells: dispatched.cells,
  };
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
      text: beatText(outcome, shot.lane, scorerName, seed, inc, side, shotIdx),
    };
  });
}

// ---------------------------------------------------------------------------
// 4. resolveIncrement
// ---------------------------------------------------------------------------

export function resolveIncrement(
  state: MatchV5State,
  split: AttackDefenceSplit,
  seed: number,
): IncrementResult {
  const minute = INCREMENT_MINUTES[state.currentIncrement];

  // The opponent is a real positioned side (step 4): its field runs through the same
  // path, so the contest is a symmetric mirror (§4) — your push vs their cover, and
  // theirs vs yours — and counters emerge from the verbs both sides emit.
  //
  // Objective hierarchy (§8): PRIMARY — scale its own points (play-to-strengths +
  // build-up, as squad records); SECONDARY — counter only if it can (reactivity-
  // weighted shift toward your weakness), low by default, high for reactive styles.
  const reactivity = reactivityFor(state.opponentStyle);
  const opp = computeSideField(
    state.opponentXI,
    state.opponentFormation,
    state.seed + 7777,
    state.currentIncrement,
    opponentScaleTraits(state.opponentXI, state.currentIncrement),
  );

  // The opponent runs the lean side path (no synergy/style/personality cascade). Its
  // raw lane push/cover are already power-comparable to a player side, so the lane
  // contest (shot volume) uses them straight — only the offensive counter biases its
  // push toward your thinnest cover lane. OPP_COHESION compensates ONLY for the skipped
  // cascade on the QUALITY/CONTROL dimensions (creation, finishing, possession), where a
  // player deck's synergy+style+personality stack genuinely lifts it above raw power.
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

  // --- Per-possession resolution: the period is a pool of possessions split by
  // control; each becomes a shot (push vs cover) carrying an xG that is itself a dice
  // roll. Goals are the sum, so a period yields 0..n. The zonal contest feeds it.
  const drama = state.currentIncrement === 4 ? 1.3 : 1.0;
  // Chance quality blends finishing with creation, so a creation-heavy (build-up) side
  // still converts rather than being punished for low raw finishing.
  const chanceQuality = (finishing: number, creation: number) => 0.55 * finishing + 0.45 * creation;
  const youSide: PossessionSide = {
    lanePush: split.lanePush,
    laneCover: split.laneCover,
    shotQuality: chanceQuality(split.shotQuality, split.chanceCreation),
    defenceScore: split.defenceScore,
    control: split.chanceCreation + split.attackScore,
    denial: yourDenial,
  };
  const oppSide: PossessionSide = {
    lanePush: oppPush,
    laneCover: oppEffCover,
    shotQuality: chanceQuality(oppFinishing, opp.chanceCreation * OPP_COHESION),
    defenceScore: opp.defenceScore,
    control: (opp.chanceCreation + opp.attackScore) * OPP_COHESION,
    denial: theirDenial,
  };

  const period = simulatePeriod(youSide, oppSide, seed, state.currentIncrement, drama);
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
    ...buildBeats(period.you.shots, state.xi, state.formation, 'you', 0, minute, seed, state.currentIncrement, committedIds),
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
    opponentAttack: opp.attackScore,
    opponentDefence: opp.defenceScore,
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
    const fitness = clamp((card.fitness ?? 6) - drain, 1, 6);

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

  return {
    ...state,
    xi: newXi,
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

export function makeSub(state: MatchV5State, xiCardId: number, benchCardId: number): MatchV5State {
  if (state.subsRemaining <= 0) return state;

  const xiCard = state.xi.find((c) => c.id === xiCardId);
  const benchCard = state.bench.find((c) => c.id === benchCardId);
  if (!xiCard || !benchCard) return state;

  // First half: injury subs only
  if (state.isFirstHalf && !xiCard.injured) return state;

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
// 9. getMatchResult
// ---------------------------------------------------------------------------

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
  };
}
