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
import type { CallGrade } from './plays';
import { gradeCall } from './plays';
import {
  INCREMENT_MINUTES,
  generateGoalText,
  generateChanceText,
  generateInjuryText,
} from './hand';
import type { MatchEvent } from './hand';
import type { DispatchCard, ZoneName, TraitRecord, TraitLogLine } from './verbs';
import { dispatchTraits, ZONES } from './verbs';
import { traitsForCard } from './role-transforms';
import type { Lane, Cell, Band } from './field';
import { CELLS, BANDS, LANES, cellOf, bandOf } from './field';
import {
  generateOpponentXI, opponentScaleTraits, counterPush, reactivityFor,
  pickOpponentPlay, getOpponentPlayById,
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
  // --- Called Plays (per-spell calls; the 3-slot tactic model is gone) ---
  /** The play the player has called for THIS spell (null = no call). */
  calledPlayId: string | null;
  /** Charges consumed per play id across this match (charges live on TacticCard). */
  playChargesUsed: Record<string, number>;
  /** The opponent's play for the COMING spell — its telegraph is shown at the break. */
  opponentPlay: { id: string; name: string; telegraph: string } | null;
  /** Telegraph candidates (play ids): [the play] for every style; the Adaptive
   *  style telegraphs 2 (the real play + a decoy) — the real one plays. */
  opponentPlayCandidates: string[];
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
  /** Per-card pre-dispatch emission (attack/defence/creation/finishing) keyed by card id.
   *  The basis for the read-side per-player rating. Additive — never fed back into the
   *  resolution math, so scorelines are unchanged. */
  cardEmit: Record<number, Record<ZoneName, number>>;
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
  // --- Called Plays readout (display-only, deterministic) ---
  /** The play you called this spell (null = no call). */
  calledPlayName: string | null;
  /** The opponent's play this spell. */
  opponentPlayName: string | null;
  /** How your call graded against their play (null = no call made). */
  callGrade: CallGrade | null;
  /** Counterfactual xG impact (same seed, re-read without the play's records):
   *  yourCallXG = net xG swing your call produced (+ favours you);
   *  theirPlayXG = net xG swing their play produced (+ favours them).
   *  Display-only — never feeds match math. */
  playImpact: { yourCallXG: number; theirPlayXG: number } | null;
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
  viaPlay?: string;
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
  key: 'power' | 'chances' | 'conversion' | 'control' | 'plan' | 'calls';
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
const OPP_COHESION = 1.05;

/** Weight of a side's finishing in its possession-CONTROL term (the rest is creation +
 *  attack). A finisher-heavy deck earns possession credit for its attacking quality, so
 *  possession tracks total attacking strength rather than creation alone. Symmetric. */
const CONTROL_FIN = 0.5;

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
  calledPlayId: string | null,
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
      creationBonus: 42 + (calledPlayId === 'counter_attack' ? 18 : 0),
      qualityBonus: 50 + (calledPlayId === 'set_piece' ? 10 : 0),
      attackBonus: 34,
      defenceBonus: -12,
    };
  }

  if (wideCount >= 2 && playmakers >= 1 && finishers >= 1) {
    return {
      name: 'Wing Overload',
      summary: `Stretch them wide, feed the flanks, and finish through ${finisher.name}.`,
      creationBonus: 46 + (calledPlayId === 'wing_play' ? 22 : 0),
      qualityBonus: 34 + (orderedAttackers.some((c) => c.archetype === 'Engine') ? 12 : 0),
      attackBonus: 30,
      defenceBonus: defendersHolding >= 4 ? 10 : -10,
    };
  }

  if ((playingStyle === 'Tiki-Taka' || calledPlayId === 'possession' || calledPlayId === 'narrow') && orderedAttackers.length >= 5 && playmakers >= 2) {
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

  if (calledPlayId === 'counter_attack' && defendersHolding >= 5 && finishers >= 1) {
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
  opponentPower?: number,
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
  // The opponent's play for the FIRST spell is rolled here; each advanceIncrement
  // rolls the next, so the break screen can telegraph the coming spell.
  const firstPlay = pickOpponentPlay(opponentStyle, 0, 0, seed);
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
    calledPlayId: null,
    playChargesUsed: {},
    opponentPlay: { id: firstPlay.play.id, name: firstPlay.play.name, telegraph: firstPlay.play.telegraph },
    opponentPlayCandidates: firstPlay.candidates.map((p) => p.id),
    seed,
  };
}

// ---------------------------------------------------------------------------
// 1b. callPlay — set (or clear) this spell's called play
// ---------------------------------------------------------------------------

/**
 * Call a play for THIS spell (null clears the call). Validates the play exists
 * and has a charge remaining; the charge is consumed when the spell resolves
 * (advanceIncrement), so re-calling before kick-off is free.
 */
export function callPlay(state: MatchV5State, tacticId: string | null): MatchV5State {
  if (tacticId === null) return { ...state, calledPlayId: null };
  const tactic = getTacticById(tacticId);
  if (!tactic) return state;
  const used = state.playChargesUsed[tacticId] ?? 0;
  if (used >= tactic.charges) return state;
  return { ...state, calledPlayId: tacticId };
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
  // The faceless generated opponent opts OUT of the defining-trait suite (its difficulty
  // is already carried by ROUND_POWER + opponentScaleTraits; stacking generates/denies on
  // top double-counts it). The player path leaves this true and keeps the full suite.
  includeDefiningTraits = true,
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
      traits: traitsForCard(card, includeDefiningTraits),
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
  calledPlay: TacticCard | null,
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
  const playPattern = inferPlayPattern(orderedAttackers, defenders, calledPlay?.id ?? null, playingStyle);

  attackBreakdown.push({ label: 'Forward shape', value: baseAttack, type: 'base' });
  defenceBreakdown.push({ label: 'Back-line shape', value: baseDefence, type: 'base' });

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
    ...squadTraits(calledPlay, jokers, {
      xi,
      increment: state.currentIncrement,
      opponentGoals: state.opponentGoals,
      yourGoals: state.yourGoals,
      connections: allConnections,
      intent: state.intent,
      opponentPlayId: state.opponentPlay?.id,
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

  // ZERO-EMIT opponent shadows: the opponent XI enters the dispatch with empty
  // emission and no traits, so it adds NOTHING to any accumulator — it exists only
  // as a target pool for enemy-targeted STATE effects (Dark Arts' drain-fitness on
  // their best player). Field math is byte-identical with or without them for any
  // record that doesn't target an enemy card.
  const lastOppSlot = state.opponentFormation.slots[state.opponentFormation.slots.length - 1];
  const opponentShadows: DispatchCard[] = state.opponentXI.map((card, i) => {
    const slot = state.opponentFormation.slots[i] ?? lastOppSlot;
    const cell = cellOf(slot.x, slot.y);
    return {
      id: card.id,
      power: card.power,
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

  // Adopt the transformed field. attack/defence are the raw aggregate; creation &
  // finishing are a band-weighted projection of the transformed cells (§4), so a
  // relocate that moves a card to a new band re-mixes the chance profile.
  let finalCreationProj = 0;
  let finalFinishingProj = 0;
  for (const cell of CELLS) {
    finalCreationProj += dispatched.cells[cell].creation * CREATION_BAND[bandOf(cell)];
    finalFinishingProj += dispatched.cells[cell].finishing * FINISHING_BAND[bandOf(cell)];
  }

  // Squad-source records (deployed tactics + manager + intent) ride the synthetic
  // owner (cardId −1). Attribute their attack/defence deltas as NAMED cascade
  // lines — type 'manager' when the record name is the manager's, else 'tactic' —
  // so the player's PLAN is visible in the breakdown instead of dissolving into
  // the generic ability aggregate. Attack/defence aggregate raw in the dispatcher,
  // so log values match the zone deltas 1:1; creation/finishing are band-weighted
  // projections, so those stay in the aggregate (raw log values wouldn't match).
  const managerNames = new Set(jokers.map((j) => j.name));
  const squadAttack = new Map<string, number>();
  const squadDefence = new Map<string, number>();
  for (const line of dispatched.log) {
    if (line.cardId !== -1 || !line.value) continue;
    if (line.zone === 'attack') squadAttack.set(line.trait, (squadAttack.get(line.trait) ?? 0) + line.value);
    if (line.zone === 'defence') squadDefence.set(line.trait, (squadDefence.get(line.trait) ?? 0) + line.value);
  }

  const transformLabels: Record<ZoneName, Set<string>> = {
    attack: new Set(), defence: new Set(), creation: new Set(), finishing: new Set(),
  };
  for (const line of dispatched.log) {
    // Squad records get their own named lines; keep them out of the ability label.
    if (line.zone && line.cardId !== -1) transformLabels[line.zone].add(line.trait);
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

  // Named plan lines first (tactics / manager / intent), then the residual
  // player-trait delta as the ability aggregate. The split is display-only —
  // the lines still sum to the same attack/defence deltas.
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
    attackBreakdown.push({ label: `${[...transformLabels.attack].join(' + ') || 'Verb dispatcher'}`, value: attackDelta - squadAttackTotal, type: 'ability' });
  }
  if (defenceDelta - squadDefenceTotal !== 0) {
    defenceBreakdown.push({ label: `${[...transformLabels.defence].join(' + ') || 'Verb dispatcher'}`, value: defenceDelta - squadDefenceTotal, type: 'ability' });
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

  // Surface the per-card pre-dispatch emission for the read-side player rating (additive;
  // never re-enters the resolution math, so the scoreline is unaffected).
  const cardEmit: Record<number, Record<ZoneName, number>> = {};
  emit.forEach((v, k) => { cardEmit[k] = v; });

  // Defining-trait firings this increment (animation-tagged), for the match-feel layer.
  const traitEvents = collectTraitEvents(dispatched.log);

  // Per-card fitness deltas from drain-fitness records (Press High's press cost;
  // Dark Arts' knock on their star via the shadows). Applied in advanceIncrement.
  const fitnessDelta: Record<number, number> = {};
  dispatched.fitness.forEach((v, id) => { if (v !== 0) fitnessDelta[id] = v; });

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
    cardEmit,
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
  viaPlayName: string | null = null,
  boostedLanes: Record<Lane, boolean> | null = null,
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
      ...(outcome === 'goal' && viaPlayName && boostedLanes?.[shot.lane]
        ? { viaPlay: viaPlayName }
        : {}),
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

  // Chance quality blends finishing with creation, so a creation-heavy (build-up) side
  // still converts rather than being punished for low raw finishing.
  const chanceQuality = (finishing: number, creation: number) => 0.55 * finishing + 0.45 * creation;
  // Possession control: creation + attack are the deep build-up that earns the ball, but a
  // finisher-heavy side (Sprinter/Powerhouse/Target stacks) was getting NO possession
  // credit for its finishing strength — so a higher-power finisher deck got out-possessed
  // by a lower-power creative one, breaking monotonicity (balance-lab: the S3-mid dip).
  // A light finishing term (CONTROL_FIN) credits attacking quality so a finisher-heavy
  // side isn't judged on creation alone. Symmetric — the opponent gets the same blend
  // under OPP_COHESION.
  const control = (creation: number, attack: number, finishing: number) =>
    creation + attack + CONTROL_FIN * finishing;
  const youSide: PossessionSide = {
    lanePush: split.lanePush,
    laneCover: split.laneCover,
    shotQuality: chanceQuality(split.shotQuality, split.chanceCreation),
    defenceScore: split.defenceScore,
    control: control(split.chanceCreation, split.attackScore, split.shotQuality),
    denial: yourDenial,
  };
  const oppSide: PossessionSide = {
    lanePush: oppPush,
    laneCover: oppEffCover,
    shotQuality: chanceQuality(oppFinishing, opp.chanceCreation * OPP_COHESION),
    defenceScore: opp.defenceScore,
    control: control(opp.chanceCreation, opp.attackScore, oppFinishing) * OPP_COHESION,
    denial: theirDenial,
  };
  return { youSide, oppSide, oppPush, oppEffCover };
}

export function resolveIncrement(
  state: MatchV5State,
  split: AttackDefenceSplit,
  seed: number,
  /**
   * Your split resolved WITHOUT the called play's records (evaluateSplit with
   * calledPlay = null) — feeds the display-only playImpact counterfactual.
   * Pass null (or omit) when no play was called.
   */
  baselineSplit: AttackDefenceSplit | null = null,
): IncrementResult {
  const minute = INCREMENT_MINUTES[state.currentIncrement];

  // The opponent is a real positioned side (step 4): its field runs through the same
  // path, so the contest is a symmetric mirror (§4) — your push vs their cover, and
  // theirs vs yours — and counters emerge from the verbs both sides emit.
  //
  // Objective hierarchy (§8): PRIMARY — scale its own points (play-to-strengths +
  // build-up, as squad records); SECONDARY — counter only if it can (reactivity-
  // weighted shift toward your weakness), low by default, high for reactive styles.
  // The opponent's PLAY for this spell (rolled at the previous break) joins the
  // scale records on its squad source.
  const reactivity = reactivityFor(state.opponentStyle);
  const oppScale = opponentScaleTraits(state.opponentXI, state.currentIncrement);
  const oppPlayDef = state.opponentPlay ? getOpponentPlayById(state.opponentPlay.id) ?? null : null;
  const opp = computeSideField(
    state.opponentXI,
    state.opponentFormation,
    state.seed + 7777,
    state.currentIncrement,
    oppPlayDef ? [...oppScale, ...oppPlayDef.records] : oppScale,
    false, // opponent opts out of the defining-trait suite (difficulty already in ROUND_POWER)
  );

  // --- Per-possession resolution: the period is a pool of possessions split by
  // control; each becomes a shot (push vs cover) carrying an xG that is itself a dice
  // roll. Goals are the sum, so a period yields 0..n. The zonal contest feeds it.
  const drama = state.currentIncrement === 4 ? 1.3 : 1.0;
  const { youSide, oppSide, oppPush, oppEffCover } = buildContestSides(split, opp, reactivity);

  const period = simulatePeriod(youSide, oppSide, seed, state.currentIncrement, drama);

  // --- Called-play readout (display-only, deterministic; never feeds match math) ---
  const calledPlay = state.calledPlayId ? getTacticById(state.calledPlayId) ?? null : null;
  let callGrade: CallGrade | null = null;
  if (calledPlay) {
    const gradeCtx: SquadContext = {
      xi: state.xi,
      increment: state.currentIncrement,
      opponentGoals: state.opponentGoals,
      yourGoals: state.yourGoals,
      connections: [],
      intent: state.intent,
      opponentPlayId: state.opponentPlay?.id,
    };
    callGrade = gradeCall(calledPlay, oppPlayDef?.records ?? [], tacticTraits(calledPlay, gradeCtx));
  }

  // Counterfactual play impact: resolve the period again with the SAME seed but
  // (a) without your called play's records, (b) without the opponent play's records.
  // Both are net swings; deterministic and read-side only.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let playImpact: { yourCallXG: number; theirPlayXG: number } | null = null;
  const hasCall = calledPlay !== null && baselineSplit !== null;
  const hasOppPlay = !!oppPlayDef && oppPlayDef.records.length > 0;
  if (hasCall || hasOppPlay) {
    let yourCallXG = 0;
    if (hasCall && baselineSplit) {
      const alt = buildContestSides(baselineSplit, opp, reactivity);
      const p = simulatePeriod(alt.youSide, alt.oppSide, seed, state.currentIncrement, drama);
      yourCallXG = (period.you.xg - p.you.xg) - (period.opp.xg - p.opp.xg);
    }
    let theirPlayXG = 0;
    if (hasOppPlay) {
      const oppNoPlay = computeSideField(
        state.opponentXI, state.opponentFormation, state.seed + 7777, state.currentIncrement,
        oppScale, false,
      );
      const alt = buildContestSides(split, oppNoPlay, reactivity);
      const p = simulatePeriod(alt.youSide, alt.oppSide, seed, state.currentIncrement, drama);
      theirPlayXG = (period.opp.xg - p.opp.xg) - (period.you.xg - p.you.xg);
    }
    playImpact = { yourCallXG: round2(yourCallXG), theirPlayXG: round2(theirPlayXG) };
  }

  // Which lanes did your call materially boost? A goal in a boosted lane carries
  // the play's name on its beat (viaPlay).
  const boostedLanes: Record<Lane, boolean> = { L: false, C: false, R: false };
  if (calledPlay && baselineSplit) {
    for (const lane of LANES) {
      boostedLanes[lane] = split.lanePush[lane] > baselineSplit.lanePush[lane] * 1.10 + 1;
    }
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
      calledPlay?.name ?? null, boostedLanes,
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
    calledPlayName: calledPlay?.name ?? null,
    opponentPlayName: state.opponentPlay?.name ?? null,
    callGrade,
    playImpact,
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

  // The just-played spell consumes its called play's charge; the call clears.
  const playChargesUsed = { ...state.playChargesUsed };
  if (state.calledPlayId) {
    playChargesUsed[state.calledPlayId] = (playChargesUsed[state.calledPlayId] ?? 0) + 1;
  }

  // Roll the NEXT spell's opponent play now, so the break screen can show its
  // telegraph. Deterministic from (style, increment, scoreline, seed).
  const nextPlay = pickOpponentPlay(
    state.opponentStyle,
    nextIncrement,
    newOpponentGoals - newYourGoals,
    state.seed,
  );

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
    calledPlayId: null,     // per-spell call — cleared every advance
    playChargesUsed,
    opponentPlay: { id: nextPlay.play.id, name: nextPlay.play.name, telegraph: nextPlay.play.telegraph },
    opponentPlayCandidates: nextPlay.candidates.map((p) => p.id),
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
  // Called plays: how many calls were made, and how they graded.
  let callsMade = 0, callsAnswered = 0, callsCountered = 0;
  for (const r of state.scores) {
    if (!r.calledPlayName) continue;
    callsMade++;
    if (r.callGrade === 'answered') callsAnswered++;
    else if (r.callGrade === 'countered') callsCountered++;
  }
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
  if (callsMade > 0) {
    rawFactors.push({
      key: 'calls',
      label: 'Your calls',
      detail: `Calls answered ${callsAnswered} of ${callsMade}${callsCountered > 0 ? `, countered ${callsCountered}` : ''}.`,
      swing: Math.max(-1, Math.min(1, (callsAnswered - callsCountered) / callsMade)),
    });
  }
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
      contrib[id] = (contrib[id] ?? 0) + e.attack + e.defence + e.creation + e.finishing;
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
