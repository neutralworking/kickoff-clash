/**
 * Kickoff Clash — Hand Engine v4
 *
 * 11-card XI with formation slot filling, 7-card bench, unlimited bench
 * discards from remaining deck, 5 scoring increments with sub management.
 */

import type { Card, SlottedCard, Durability } from './scoring';
import { seededRandom, DURABILITY_WEIGHTS, PLAYING_STYLES } from './scoring';
import { findConnections, type Connection } from './chemistry';
import type { Formation } from './formations';
import { positionFitsSlot } from './formations';
import type { TacticSlots } from './tactics';
import { calculateTacticBonus, createEmptySlots } from './tactics';
import type { JokerCard } from './jokers';
import { applyJoker } from './jokers';

// Re-export JokerCard from the canonical jokers module
export type { JokerCard } from './jokers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INCREMENT_MINUTES = [15, 30, 60, 75, 90] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandState {
  xi: Card[];                    // 11 cards
  bench: Card[];                 // 7 cards
  remainingDeck: Card[];         // undrawn cards
  subsRemaining: number;         // starts at 5
  subsUsed: { outId: number; inId: number; minute: number }[];
  tacticSlots: TacticSlots;
  currentIncrement: number;      // 0-4 index into INCREMENT_MINUTES
  isFirstHalf: boolean;          // true for increments 0-1
  scores: IncrementScore[];
  yourGoals: number;
  opponentGoals: number;
}

export interface IncrementScore {
  minute: number;
  cascade: ScoreCascade;
  opponentScore: number;
  yourScored: boolean;
  opponentScored: boolean;
  event: MatchEvent;
}

export interface ScoreCascade {
  basePower: number;
  chemistryBonus: number;
  chemistryMultiplier: number;
  styleBonus: number;
  tacticBonus: number;
  managerBonus: number;
  total: number;
}

export interface MatchEvent {
  minute: number;
  text: string;
  type: 'goal-yours' | 'goal-opponent' | 'chance' | 'save' | 'injury';
}

export interface MatchResult {
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
  scores: IncrementScore[];
  handState: HandState;
}

// ---------------------------------------------------------------------------
// Commentary
// ---------------------------------------------------------------------------

const GOAL_COMMENTARY = [
  "Thunderbolt into the top corner!",
  "Slotted home with the composure of a seasoned pro.",
  "A tap-in after a gorgeous team move.",
  "Headed in from a pinpoint cross!",
  "Curled it around the wall — what a free kick!",
  "Cool as you like from the penalty spot.",
  "A scramble in the box and it's bundled over the line!",
  "Chips the keeper from 30 yards — outrageous!",
  "Arrives late at the back post — clinical finish.",
  "One-on-one and makes no mistake.",
  "Absolute rocket from outside the box!",
  "Pokes it through the keeper's legs — nutmeg!",
  "Overhead kick! Are you kidding me?!",
  "Dinks it over the keeper with pure audacity.",
  "Smashes it in off the crossbar — what a hit!",
];

const CHANCE_COMMENTARY = [
  "Hits the post and bounces away! So close.",
  "The keeper pulls off a world-class save!",
  "Blazes it over from six yards — how?!",
  "Cleared off the line at the last second.",
  "The crossbar rattles but it stays out!",
  "Scuffs the shot wide — should've done better.",
  "Great save! Tips it around the corner.",
  "Header flashes just past the post.",
  "One-on-one but the keeper stands tall!",
  "Somehow hits both posts and comes back out.",
  "VAR check — nope, offside by a toenail.",
  "Skies it into row Z. The crowd groans.",
  "Slips at the crucial moment — chance gone.",
  "Curler heading in but the wind takes it wide.",
  "Blocked on the line by a last-ditch tackle!",
];

const OPPONENT_GOAL_COMMENTARY = [
  "They break and finish clinically.",
  "A set piece goal — poor marking in the box.",
  "A deflection wrong-foots the keeper. Cruel.",
  "Long-range effort and it nestles in the corner.",
  "Counter-attack at pace — nothing you could do.",
  "Penalty given. Converted coolly.",
  "A mistake at the back is ruthlessly punished.",
  "They score against the run of play. Typical.",
];

const INJURY_COMMENTARY = [
  "goes down clutching the hamstring — doesn't look good.",
  "pulls up after a sprint — muscle problem.",
  "is limping badly — can't continue.",
  "signals to the bench — needs to come off.",
  "twists an ankle in a challenge — agony.",
  "feels the calf tighten and waves for a sub.",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Pick a card weighted by durability. Titanium cards have overwhelming weight
 * (auto-select). Returns undefined if cards is empty.
 */
export function weightedPick(cards: Card[], seed: number): Card | undefined {
  if (cards.length === 0) return undefined;
  if (cards.length === 1) return cards[0];

  const weights = cards.map(c => DURABILITY_WEIGHTS[c.durability as Durability] ?? 1.0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  const roll = seededRandom(seed) * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < cards.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return cards[i];
  }
  return cards[cards.length - 1];
}

/**
 * Generate goal commentary, referencing synergies when possible.
 */
export function generateGoalText(connections: Connection[], seed: number): string {
  if (connections.length > 0) {
    const connIdx = Math.floor(seededRandom(seed * 17 + 3) * connections.length);
    const conn = connections[connIdx];
    const prefixes = [
      `The ${conn.name} synergy pays off!`,
      `${conn.cards[0]} and ${conn.cards[1] ?? 'the lads'} combine brilliantly!`,
      `Chemistry unlocked — ${conn.name}!`,
    ];
    const prefixIdx = Math.floor(seededRandom(seed * 23 + 11) * prefixes.length);
    const goalIdx = Math.floor(seededRandom(seed * 37 + 7) * GOAL_COMMENTARY.length);
    return `${prefixes[prefixIdx]} ${GOAL_COMMENTARY[goalIdx]}`;
  }
  const idx = Math.floor(seededRandom(seed * 41 + 13) * GOAL_COMMENTARY.length);
  return GOAL_COMMENTARY[idx];
}

/**
 * Generate near-miss commentary.
 */
export function generateChanceText(seed: number): string {
  const idx = Math.floor(seededRandom(seed * 53 + 19) * CHANCE_COMMENTARY.length);
  return CHANCE_COMMENTARY[idx];
}

function generateOpponentGoalText(seed: number): string {
  const idx = Math.floor(seededRandom(seed * 59 + 23) * OPPONENT_GOAL_COMMENTARY.length);
  return OPPONENT_GOAL_COMMENTARY[idx];
}

/**
 * Generate injury commentary for fatigue injuries.
 */
export function generateInjuryText(card: Card): string {
  const idx = Math.abs(card.id * 7 + card.power) % INJURY_COMMENTARY.length;
  return `${card.name} ${INJURY_COMMENTARY[idx]}`;
}

// ---------------------------------------------------------------------------
// 1. rollXI — Deal 18 cards, fill 11 formation slots, 7 bench
// ---------------------------------------------------------------------------

/**
 * Draw 18 cards from deck. Fill 11 formation slots by position eligibility
 * with durability weighting. Remaining 7 go to bench. Rest stay in remainingDeck.
 */
export function rollXI(deck: Card[], formation: Formation, seed: number): HandState {
  // Shuffle the deck deterministically
  const shuffled = [...deck];
  let shuffleSeed = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(shuffleSeed) * (i + 1));
    shuffleSeed = shuffleSeed * 31 + 7;
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Take 18 cards (or as many as available)
  const poolSize = Math.min(18, shuffled.length);
  const pool = shuffled.slice(0, poolSize);
  const remaining = shuffled.slice(poolSize);

  const available = [...pool];
  const xi: Card[] = [];
  let currentSeed = seed * 13 + 41;

  for (const slot of formation.slots) {
    // Find eligible cards for this slot
    const eligible = available.filter(c => positionFitsSlot(c.position, slot));

    if (eligible.length === 0) {
      // No positional match — pick any remaining card
      const fallback = weightedPick(available, currentSeed);
      currentSeed = currentSeed * 31 + 7;
      if (fallback) {
        xi.push(fallback);
        available.splice(available.indexOf(fallback), 1);
      }
      continue;
    }

    const picked = weightedPick(eligible, currentSeed);
    currentSeed = currentSeed * 31 + 7;
    if (picked) {
      xi.push(picked);
      available.splice(available.indexOf(picked), 1);
    }
  }

  // Whatever is left in the pool goes to bench
  const bench = available;

  return {
    xi,
    bench,
    remainingDeck: remaining,
    subsRemaining: 5,
    subsUsed: [],
    tacticSlots: createEmptySlots(),
    currentIncrement: 0,
    isFirstHalf: true,
    scores: [],
    yourGoals: 0,
    opponentGoals: 0,
  };
}

// ---------------------------------------------------------------------------
// 2. discardFromBench — Remove bench card, draw replacement from deck
// ---------------------------------------------------------------------------

/**
 * Remove card from bench by ID. Draw 1 random card from remainingDeck to
 * replace it. If remainingDeck empty, just remove the bench card.
 * The discarded card is gone (not added back to any pile).
 */
export function discardFromBench(hand: HandState, benchCardId: number, seed: number): HandState {
  const benchIdx = hand.bench.findIndex(c => c.id === benchCardId);
  if (benchIdx === -1) return hand; // card not on bench

  const newBench = [...hand.bench];
  newBench.splice(benchIdx, 1);

  if (hand.remainingDeck.length > 0) {
    // Pick a random card from remaining deck
    const drawIdx = Math.floor(seededRandom(seed) * hand.remainingDeck.length);
    const drawn = hand.remainingDeck[drawIdx];
    const newDeck = [...hand.remainingDeck];
    newDeck.splice(drawIdx, 1);
    newBench.push(drawn);

    return { ...hand, bench: newBench, remainingDeck: newDeck };
  }

  return { ...hand, bench: newBench };
}

// ---------------------------------------------------------------------------
// 3. makeSub — Swap XI card for bench card
// ---------------------------------------------------------------------------

/**
 * Swap an XI card for a bench card. Decrement subsRemaining. Record in subsUsed
 * with current minute. During first half, only injured XI cards can be subbed.
 * Returns unchanged if subsRemaining <= 0.
 */
export function makeSub(hand: HandState, xiCardId: number, benchCardId: number): HandState {
  if (hand.subsRemaining <= 0) return hand;

  const xiIdx = hand.xi.findIndex(c => c.id === xiCardId);
  const benchIdx = hand.bench.findIndex(c => c.id === benchCardId);
  if (xiIdx === -1 || benchIdx === -1) return hand;

  // First half: only injury subs allowed
  if (hand.isFirstHalf && !hand.xi[xiIdx].injured) return hand;

  const minute = INCREMENT_MINUTES[hand.currentIncrement] ?? 90;

  const newXI = [...hand.xi];
  const newBench = [...hand.bench];

  const outCard = newXI[xiIdx];
  const inCard = newBench[benchIdx];

  newXI[xiIdx] = inCard;
  newBench[benchIdx] = outCard;

  return {
    ...hand,
    xi: newXI,
    bench: newBench,
    subsRemaining: hand.subsRemaining - 1,
    subsUsed: [...hand.subsUsed, { outId: xiCardId, inId: benchCardId, minute }],
  };
}

// ---------------------------------------------------------------------------
// 4. evaluateIncrement — Score cascade at current increment
// ---------------------------------------------------------------------------

/**
 * Calculate the full score cascade at the current increment.
 */
export function evaluateIncrement(
  hand: HandState,
  playingStyle: string,
  jokers: JokerCard[],
  opponentStrength: number,
  seed: number,
): IncrementScore {
  const { xi, currentIncrement } = hand;

  // Base power
  const basePower = xi.reduce((sum, c) => sum + c.power, 0);

  // Chemistry
  const slottedXI: SlottedCard[] = xi.map((card, i) => ({ card, slot: 'slot_' + i }));
  const connections = findConnections(slottedXI);
  const chemistryBonus = connections.reduce((sum, conn) => sum + conn.bonus, 0);

  // Chemistry multiplier from highest tier
  const highestTier = connections.length > 0
    ? Math.max(...connections.map(c => c.tier))
    : 0;

  const tierMultipliers: Record<number, number> = {
    0: 1.0,
    1: 1.15,
    2: 1.3,
    3: 1.6,
    4: 2.5,
  };

  let chemistryMultiplier = tierMultipliers[highestTier] ?? 1.0;
  // +0.05 per extra connection beyond the first
  if (connections.length > 1) {
    chemistryMultiplier += (connections.length - 1) * 0.05;
  }

  // Style bonus
  let styleBonus = 0;
  const style = PLAYING_STYLES[playingStyle];
  if (style) {
    if (style.bonusArchetypes.length === 0) {
      // Total Football: flat bonus
      styleBonus = Math.round(basePower * style.multiplier);
    } else {
      const matchCount = xi.filter(c =>
        style.bonusArchetypes.includes(c.archetype),
      ).length;
      styleBonus = Math.round(matchCount * style.multiplier * basePower / xi.length);
    }
  }

  // Tactic bonus
  const tacticBonus = calculateTacticBonus(hand.tacticSlots, xi, currentIncrement);

  // Manager bonus (jokers)
  const managerBonus = jokers.reduce(
    (sum, j) => sum + applyJoker(j, xi, connections),
    0,
  );

  // Total
  const total = Math.round(
    (basePower + chemistryBonus + styleBonus + tacticBonus + managerBonus) * chemistryMultiplier,
  );

  // Goal resolution
  const diff = total - opponentStrength;
  let yourChance = clamp(0.12 + diff / 500, 0.03, 0.45);
  let oppChance = clamp(0.12 - diff / 500, 0.03, 0.35);

  // 90th minute drama
  if (currentIncrement === 4) {
    yourChance *= 1.3;
    oppChance *= 1.3;
  }

  const roll = seededRandom(seed + currentIncrement * 37);

  let yourScored = false;
  let opponentScored = false;
  let event: MatchEvent;
  const minute = INCREMENT_MINUTES[currentIncrement];
  const eventSeed = seed + currentIncrement * 53 + 11;

  if (roll < yourChance) {
    yourScored = true;
    event = {
      minute,
      text: generateGoalText(connections, eventSeed),
      type: 'goal-yours',
    };
  } else if (roll < yourChance + oppChance) {
    opponentScored = true;
    event = {
      minute,
      text: generateOpponentGoalText(eventSeed),
      type: 'goal-opponent',
    };
  } else if (roll < yourChance + oppChance + 0.15) {
    const isSave = seededRandom(eventSeed * 7) > 0.5;
    event = {
      minute,
      text: generateChanceText(eventSeed),
      type: isSave ? 'save' : 'chance',
    };
  } else {
    event = {
      minute,
      text: generateChanceText(eventSeed),
      type: 'chance',
    };
  }

  const cascade: ScoreCascade = {
    basePower,
    chemistryBonus,
    chemistryMultiplier,
    styleBonus,
    tacticBonus,
    managerBonus,
    total,
  };

  return {
    minute,
    cascade,
    opponentScore: opponentStrength,
    yourScored,
    opponentScored,
    event,
  };
}

// ---------------------------------------------------------------------------
// 5. advanceIncrement — Apply result and move forward
// ---------------------------------------------------------------------------

/**
 * Apply the increment result. Add to scores array. Update goals. Move
 * currentIncrement forward. Apply fatigue injuries at increments 2+ for
 * Glass/Phoenix cards.
 */
export function advanceIncrement(hand: HandState, incrementScore: IncrementScore): HandState {
  const newScores = [...hand.scores, incrementScore];
  const newYourGoals = hand.yourGoals + (incrementScore.yourScored ? 1 : 0);
  const newOpponentGoals = hand.opponentGoals + (incrementScore.opponentScored ? 1 : 0);
  const nextIncrement = hand.currentIncrement + 1;

  // Moving from increment 1 to 2 = half-time
  const isFirstHalf = nextIncrement <= 1;

  // Apply fatigue at increments 2+ (second half onwards)
  let newXI = [...hand.xi];
  if (hand.currentIncrement >= 1) {
    // Glass and Phoenix cards risk fatigue injury
    const fatigueSeed = incrementScore.minute * 71 + hand.currentIncrement * 13;
    newXI = newXI.map((card, i) => {
      if (card.injured) return card; // already injured
      if (card.durability === 'glass' || card.durability === 'phoenix') {
        const injuryChance = card.durability === 'glass' ? 0.15 : 0.10;
        const roll = seededRandom(fatigueSeed + i * 29 + card.id);
        if (roll < injuryChance) {
          return { ...card, injured: true };
        }
      }
      return card;
    });
  }

  return {
    ...hand,
    xi: newXI,
    scores: newScores,
    yourGoals: newYourGoals,
    opponentGoals: newOpponentGoals,
    currentIncrement: nextIncrement,
    isFirstHalf,
  };
}

// ---------------------------------------------------------------------------
// 6. getMatchResult — Final result after all 5 increments
// ---------------------------------------------------------------------------

/**
 * After all 5 increments, return final result.
 */
export function getMatchResult(hand: HandState): MatchResult {
  const result: 'win' | 'draw' | 'loss' =
    hand.yourGoals > hand.opponentGoals ? 'win' :
    hand.yourGoals < hand.opponentGoals ? 'loss' :
    'draw';

  return {
    yourGoals: hand.yourGoals,
    opponentGoals: hand.opponentGoals,
    result,
    scores: hand.scores,
    handState: hand,
  };
}
