/**
 * Kickoff Clash — Match Engine (v2)
 *
 * 5 rounds per match with goal probabilities.
 * Each round: XI generates passive strength, action cards modify goal chances,
 * seeded random determines if goals happen.
 *
 * Goal probability formula:
 *   difference = your_strength - opponent_strength
 *   your_goal_chance  = clamp(0.15 + difference/200, 0.05, 0.50)
 *   opponent_goal_chance = clamp(0.15 - difference/200, 0.05, 0.50)
 */

import { findConnections, Connection } from './chemistry';
import { ActionCard } from './actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Durability = 'glass' | 'fragile' | 'standard' | 'iron' | 'titanium' | 'phoenix';

export interface Card {
  id: number;
  name: string;
  position: string;       // GK/CD/WD/DM/CM/WM/AM/WF/CF
  archetype: string;       // primary (Engine, Creator, etc.)
  secondaryArchetype?: string;
  tacticalRole?: string;   // Regista, Volante, etc.
  personalityType?: string; // ANSC, IXLC, etc.
  personalityTheme?: string; // General/Catalyst/Maestro/Captain/Professor
  power: number;           // 1-100
  rarity: string;
  abilityName?: string;
  abilityText?: string;
  gatePull: number;        // fans attracted
  durability: Durability;
  phoenixMatchesSurvived?: number;  // tracks for Phoenix promotion
  injured?: boolean;                 // for Fragile cards — miss next match
  // Extended fields from kc_characters
  bio?: string;
  tags?: string[];
  quirk?: string;
  strengths?: string[];
  weaknesses?: string[];
  nation?: string;
}

export interface SlottedCard {
  card: Card;
  slot: string; // formation slot like "CF", "CM_L", "WD_R", etc.
}

export interface PlayingStyle {
  name: string;
  bonusArchetypes: string[];
  multiplier: number;
}

export interface RoleEffect {
  cardName: string;
  roleName: string;
  abilityName: string;
  effect: string;
  scoreImpact: number;
}

// ---------------------------------------------------------------------------
// Match State & Round Result
// ---------------------------------------------------------------------------

export interface MatchState {
  xi: SlottedCard[];           // auto-populated XI
  bench: Card[];
  hand: ActionCard[];          // current hand of action cards
  actionDeck: ActionCard[];    // remaining action cards to draw from
  round: number;               // 1-5 (maps to 15'/30'/45'/60'/75')
  yourGoals: number;
  opponentGoals: number;
  yourActions: ActionCard[];   // cards played this round
  opponentStrength: number;
  fanAccumulator: number;      // fans accumulated during match
  /** Persistent modifiers (rest-of-match effects) */
  persistentYourMod: number;
  persistentOpponentMod: number;
  /** Pending next-round modifier (e.g. Overload's -15%, Hairdryer's +20%) */
  nextRoundYourMod: number;
  /** Whether opponent scored last round (for Counter Attack) */
  opponentScoredLastRound: boolean;
  /** Red card penalty active for rest of match */
  redCardPenalty: number;
  /** Offside trap active this round */
  offsideTrapActive: boolean;
  /** Match seed for deterministic randomness */
  matchSeed: number;
}

export interface RoundResult {
  minute: number;              // 15, 30, 45, 60, 75
  yourStrength: number;
  opponentStrength: number;
  yourGoalChance: number;
  opponentGoalChance: number;
  yourScored: boolean;
  opponentScored: boolean;
  commentary: string[];
  fansEarned: number;
}

// ---------------------------------------------------------------------------
// Durability Constants
// ---------------------------------------------------------------------------

export const DURABILITY_WEIGHTS: Record<Durability, number> = {
  glass: 0.4,
  fragile: 0.7,
  standard: 1.0,
  iron: 1.5,
  titanium: 999,
  phoenix: 0.6,
};

export const SHATTER_CHANCE: Record<Durability, number> = {
  glass: 0.20,
  phoenix: 0.30,
  fragile: 0,
  standard: 0,
  iron: 0,
  titanium: 0,
};

export const INJURY_CHANCE: Record<Durability, number> = {
  fragile: 0.10,
  glass: 0,
  phoenix: 0,
  standard: 0,
  iron: 0,
  titanium: 0,
};

export const DURABILITY_PRICE_MOD: Record<Durability, number> = {
  glass: 0.5,
  fragile: 0.7,
  standard: 1.0,
  iron: 1.5,
  titanium: 3.0,
  phoenix: 0.8,
};

export const DURABILITY_FAN_BONUS: Record<Durability, number> = {
  glass: 15,
  phoenix: 15,
  fragile: 5,
  standard: 0,
  iron: 0,
  titanium: 0,
};

// ---------------------------------------------------------------------------
// Playing Styles
// ---------------------------------------------------------------------------

export const PLAYING_STYLES: Record<string, PlayingStyle> = {
  'tiki-taka': {
    name: 'Tiki-Taka',
    bonusArchetypes: ['Passer', 'Controller', 'Creator'],
    multiplier: 0.15,   // +15% per aligned card
  },
  'gegenpressing': {
    name: 'Gegenpressing',
    bonusArchetypes: ['Engine', 'Destroyer', 'Sprinter'],
    multiplier: 0.15,
  },
  'counter-attack': {
    name: 'Counter-Attack',
    bonusArchetypes: ['Cover', 'Sprinter', 'Striker'],
    multiplier: 0.15,
  },
  'direct-play': {
    name: 'Direct Play',
    bonusArchetypes: ['Target', 'Powerhouse', 'Passer'],
    multiplier: 0.15,
  },
  'total-football': {
    name: 'Total Football',
    bonusArchetypes: [], // all models — flat per card
    multiplier: 0.05,   // +5% flat per card
  },
};

// Attacker positions for role abilities
const ATTACKER_POSITIONS = new Set(['AM', 'WF', 'CF']);

// Compound categories for Tuttocampista
const COMPOUND_CATEGORIES: Record<string, string[]> = {
  Mental: ['Controller', 'Commander', 'Creator'],
  Physical: ['Target', 'Sprinter', 'Powerhouse'],
  Tactical: ['Cover', 'Engine', 'Destroyer'],
  Technical: ['Dribbler', 'Passer', 'Striker'],
};

// Round-to-minute mapping
const ROUND_MINUTES = [15, 30, 45, 60, 75];

// ---------------------------------------------------------------------------
// Seeded Random
// ---------------------------------------------------------------------------

/**
 * Deterministic pseudo-random number in [0, 1) using a seed.
 * Uses a simple hash-based approach for reproducibility.
 */
export function seededRandom(seed: number): number {
  const hash = ((seed * 2654435761) ^ (seed >>> 16)) >>> 0;
  return (hash % 10000) / 10000;
}

/**
 * Deterministic boolean: returns true if seeded random < threshold.
 */
function seededChance(seed: number, threshold: number): boolean {
  return seededRandom(seed) < threshold;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function slotPosition(slot: string): string {
  const idx = slot.indexOf('_');
  return idx === -1 ? slot : slot.substring(0, idx);
}

// ---------------------------------------------------------------------------
// XI Strength Calculation
// ---------------------------------------------------------------------------

interface CardScoreState {
  powerMultiplier: number;
  powerBonus: number;
  connectionMultiplier: number;
}

/**
 * Apply role abilities to card score states.
 * Returns effects log for commentary.
 */
function applyRoleAbilities(
  cards: SlottedCard[],
  states: CardScoreState[],
  round: number,
): RoleEffect[] {
  const effects: RoleEffect[] = [];

  function addEffect(idx: number, abilityName: string, effect: string, scoreImpact: number) {
    effects.push({
      cardName: cards[idx].card.name,
      roleName: cards[idx].card.tacticalRole ?? 'Unknown',
      abilityName,
      effect,
      scoreImpact,
    });
  }

  for (let i = 0; i < cards.length; i++) {
    const sc = cards[i];
    const role = sc.card.tacticalRole;
    if (!role) continue;
    const pos = slotPosition(sc.slot);

    switch (role) {
      case 'Regista': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i) states[j].connectionMultiplier += 0.05;
        }
        addEffect(i, 'Metronome', "+5% to all connection bonuses", 0);
        break;
      }
      case 'Volante': {
        // -5% opponent goal chance per round — handled in resolveRound
        addEffect(i, 'Tackle & Go', '-5% opponent goal chance per round', 0);
        break;
      }
      case 'Anchor': {
        let lowestIdx = 0;
        let lowestPower = Infinity;
        for (let j = 0; j < cards.length; j++) {
          if (cards[j].card.power < lowestPower) {
            lowestPower = cards[j].card.power;
            lowestIdx = j;
          }
        }
        states[lowestIdx].powerMultiplier += 0.30;
        addEffect(i, 'The Shield', `${cards[lowestIdx].card.name} gets +30%`, lowestPower * 0.30);
        break;
      }
      case 'Trequartista': {
        const seed = sc.card.id * 1000 + round;
        if (seededChance(seed, 0.30)) {
          states[i].powerMultiplier += 1.0;
          addEffect(i, 'Moment of Genius', 'Own power doubled!', sc.card.power);
        } else {
          addEffect(i, 'Moment of Genius', 'No spark this time', 0);
        }
        break;
      }
      case 'Poacher': {
        // +15% goal chance when attacking cards played — handled in resolveRound
        addEffect(i, 'Box Presence', '+15% goal chance with attacking cards', 0);
        break;
      }
      case 'Tuttocampista': {
        const uniqueArchetypes = new Set(cards.map(c => c.card.archetype));
        const bonus = uniqueArchetypes.size * 0.03;
        states[i].powerMultiplier += bonus;
        addEffect(i, 'Box to Box', `+${(bonus * 100).toFixed(0)}% (${uniqueArchetypes.size} archetypes)`, sc.card.power * bonus);
        break;
      }
      case 'Lateral': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && (cards[j].card.tacticalRole === 'Inverted Winger' || cards[j].card.tacticalRole === 'Winger')) {
            states[i].powerMultiplier += 0.15;
            states[j].powerMultiplier += 0.15;
            addEffect(i, 'Overlap', `Paired with ${cards[j].card.name} — both +15%`, (sc.card.power + cards[j].card.power) * 0.15);
            break;
          }
        }
        break;
      }
      case 'Falso Nove': {
        addEffect(i, 'The Drop', 'Counts as both CF and AM for synergies', 0);
        break;
      }
      case 'Enganche': {
        let highestIdx = -1;
        let highestPower = -Infinity;
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && cards[j].card.power > highestPower) {
            highestPower = cards[j].card.power;
            highestIdx = j;
          }
        }
        if (highestIdx >= 0) {
          states[highestIdx].powerMultiplier += 0.25;
          states[i].powerMultiplier -= 0.10;
          addEffect(i, 'The Hook', `${cards[highestIdx].card.name} +25%, self -10%`,
            highestPower * 0.25 - sc.card.power * 0.10);
        }
        break;
      }
      case 'Libero': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && ATTACKER_POSITIONS.has(slotPosition(cards[j].slot))) {
            states[j].powerMultiplier += 0.10;
            addEffect(i, 'Surgical Pass', `${cards[j].card.name} gets +10%`, cards[j].card.power * 0.10);
          }
        }
        break;
      }
      // Keep additional roles from v1 that still make sense
      case 'Torwart': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && slotPosition(cards[j].slot) === 'CD') {
            states[j].powerMultiplier += 0.05;
          }
        }
        addEffect(i, 'Command', 'CD cards get +5%', 0);
        break;
      }
      case 'Sweeper Keeper': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && cards[j].card.archetype === 'Cover') {
            states[j].powerMultiplier += 0.10;
          }
        }
        addEffect(i, 'Sweeper', 'Cover cards get +10%', 0);
        break;
      }
      case 'Metodista': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && cards[j].card.archetype === 'Controller') {
            states[j].powerMultiplier += 0.10;
          }
        }
        addEffect(i, 'Tempo', 'Controller cards get +10%', 0);
        break;
      }
      case 'Winger': {
        if (pos === 'WM' || pos === 'WF') {
          states[i].powerMultiplier += 0.20;
          addEffect(i, 'Touchline', `+20% in ${pos} slot`, sc.card.power * 0.20);
        }
        break;
      }
      case 'Inverted Winger': {
        if (sc.card.archetype === 'Dribbler' || sc.card.archetype === 'Striker') {
          states[i].powerMultiplier += 0.15;
          addEffect(i, 'Cut Inside', `+15% (${sc.card.archetype})`, sc.card.power * 0.15);
        }
        break;
      }
      case 'Extremo': {
        if (sc.card.archetype === 'Sprinter') {
          states[i].powerMultiplier += 0.20;
          addEffect(i, 'Jet Heels', '+20% (Sprinter)', sc.card.power * 0.20);
        }
        break;
      }
      case 'Stopper': {
        if (sc.card.archetype === 'Destroyer') {
          states[i].powerMultiplier += 0.15;
          addEffect(i, 'Front Foot', '+15% (Destroyer)', sc.card.power * 0.15);
        }
        break;
      }
      case 'Zagueiro': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && cards[j].card.archetype === 'Commander') {
            states[j].powerMultiplier += 0.10;
          }
        }
        addEffect(i, 'Commander', 'Commander cards get +10%', 0);
        break;
      }
      case 'Mezzala': {
        if (pos === 'CM') {
          states[i].powerMultiplier += 0.15;
          addEffect(i, 'Half-Space Run', '+15% in CM slot', sc.card.power * 0.15);
        }
        break;
      }
      case 'Fantasista': {
        if (sc.card.archetype === 'Creator') {
          states[i].powerMultiplier += 0.15;
          addEffect(i, 'Half-Space Magic', '+15% (Creator)', sc.card.power * 0.15);
        }
        break;
      }
      // Raumdeuter role removed — now an earned archetype
      case 'Invertido': {
        if (sc.card.archetype === 'Controller' || sc.card.archetype === 'Passer') {
          states[i].powerMultiplier += 0.15;
          addEffect(i, 'Tuck Inside', `+15% (${sc.card.archetype})`, sc.card.power * 0.15);
        }
        break;
      }
      case 'Relayeur': {
        for (let j = 0; j < cards.length; j++) {
          if (cards[j].card.archetype === 'Engine') {
            states[j].powerMultiplier += 0.05;
          }
        }
        addEffect(i, 'Relay', 'Engine cards get +5%', 0);
        break;
      }
      // Complete Forward role removed — now an earned archetype
      case 'Prima Punta': {
        if (sc.card.archetype === 'Target') {
          states[i].powerMultiplier += 0.20;
        }
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && cards[j].card.archetype === 'Passer') {
            states[j].powerMultiplier += 0.10;
          }
        }
        addEffect(i, 'Target Man', 'Target +20%, Passers +10%', 0);
        break;
      }
      case 'Seconda Punta': {
        if (pos === 'AM' || pos === 'CF') {
          states[i].powerMultiplier += 0.10;
          addEffect(i, 'Between Lines', `+10% in ${pos} slot`, sc.card.power * 0.10);
        }
        break;
      }
      case 'Fluidificante': {
        states[i].powerMultiplier += 0.10;
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && ATTACKER_POSITIONS.has(slotPosition(cards[j].slot))) {
            states[j].powerMultiplier += 0.10;
            break;
          }
        }
        addEffect(i, 'Surge', '+10% self, +10% nearest attacker', 0);
        break;
      }
      case 'Tornante': {
        if (sc.card.archetype === 'Engine') {
          states[i].powerMultiplier += 0.10;
          addEffect(i, 'Full Flank', '+10% (Engine)', sc.card.power * 0.10);
        }
        break;
      }
      case 'Sweeper': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && cards[j].card.archetype === 'Cover') {
            states[j].powerMultiplier += 0.10;
          }
        }
        addEffect(i, 'Read Ahead', 'Cover cards get +10%', 0);
        break;
      }
      case 'Inventor': {
        if (sc.card.archetype === 'Creator') {
          states[i].powerMultiplier += 0.20;
          addEffect(i, 'From Nothing', '+20% (Creator)', sc.card.power * 0.20);
        }
        break;
      }
      case 'Ball-Playing GK': {
        for (let j = 0; j < cards.length; j++) {
          if (j !== i && cards[j].card.archetype === 'Passer') {
            states[j].powerMultiplier += 0.05;
          }
        }
        addEffect(i, 'Distribution', 'Passer cards get +5%', 0);
        break;
      }
      default:
        break;
    }
  }

  return effects;
}

/**
 * Compute the style bonus for the XI.
 * v2: +15% per aligned card (or +5% flat per card for Total Football).
 */
function computeStyleBonus(cards: SlottedCard[], style: PlayingStyle): number {
  let bonus = 0;
  for (const sc of cards) {
    if (style.name === 'Total Football') {
      bonus += sc.card.power * style.multiplier;
    } else {
      const isAligned = style.bonusArchetypes.includes(sc.card.archetype)
        || (sc.card.secondaryArchetype && style.bonusArchetypes.includes(sc.card.secondaryArchetype));
      if (isAligned) {
        bonus += sc.card.power * style.multiplier;
      }
    }
  }
  return Math.round(bonus);
}

/**
 * Calculate the total XI strength for a round.
 * Sum of player power (with role abilities) + chemistry bonuses + style alignment.
 */
export function calculateXIStrength(xi: SlottedCard[], style: PlayingStyle): number {
  if (xi.length === 0) return 0;

  // Initialize per-card states
  const states: CardScoreState[] = xi.map(() => ({
    powerMultiplier: 1.0,
    powerBonus: 0,
    connectionMultiplier: 1.0,
  }));

  // Apply role abilities
  applyRoleAbilities(xi, states, 1);

  // Base power with role adjustments
  let basePower = 0;
  for (let i = 0; i < xi.length; i++) {
    basePower += Math.round(xi[i].card.power * states[i].powerMultiplier + states[i].powerBonus);
  }

  // Chemistry bonuses
  const connections = findConnections(xi);
  let connectionBonus = 0;
  for (const conn of connections) {
    let adjustedBonus = conn.bonus;
    for (let i = 0; i < xi.length; i++) {
      if (conn.cards.includes(xi[i].card.name) && states[i].connectionMultiplier !== 1.0) {
        adjustedBonus += conn.bonus * (states[i].connectionMultiplier - 1.0);
      }
    }
    connectionBonus += Math.round(adjustedBonus);
  }

  // Style bonus
  const styleBonus = computeStyleBonus(xi, style);

  return basePower + connectionBonus + styleBonus;
}

// ---------------------------------------------------------------------------
// Action Card Resolution Helpers
// ---------------------------------------------------------------------------

/**
 * Check if XI contains a card matching a requirement string.
 * Requirement can be pipe-delimited: "Creator|Passer" matches either archetype.
 * Also checks tacticalRole, personalityTheme.
 */
function xiHasMatch(xi: SlottedCard[], requirement: string): boolean {
  const options = requirement.split('|');
  return xi.some(sc => {
    const c = sc.card;
    return options.some(opt =>
      c.archetype === opt ||
      c.secondaryArchetype === opt ||
      c.tacticalRole === opt ||
      c.personalityTheme === opt
    );
  });
}

/**
 * Count XI cards matching any of the given archetypes.
 */
function countArchetypeMatches(xi: SlottedCard[], archetypes: string[]): number {
  return xi.filter(sc =>
    archetypes.includes(sc.card.archetype) ||
    (sc.card.secondaryArchetype && archetypes.includes(sc.card.secondaryArchetype))
  ).length;
}

/**
 * Resolve the effect of action cards on goal modifiers.
 */
function resolveActionEffects(
  playedCards: ActionCard[],
  xi: SlottedCard[],
  state: MatchState,
  seed: number,
): {
  yourGoalMod: number;
  opponentGoalMod: number;
  nextRoundYourMod: number;
  persistentOpponentMod: number;
  persistentYourMod: number;
  redCardPenalty: number;
  fanImpact: number;
  commentary: string[];
  offsideTrapActive: boolean;
} {
  let yourGoalMod = 0;
  let opponentGoalMod = 0;
  let nextRoundYourMod = 0;
  let persistentOpponentMod = 0;
  let persistentYourMod = 0;
  let redCardPenalty = 0;
  let fanImpact = 0;
  let offsideTrapActive = false;
  const commentary: string[] = [];

  for (let ci = 0; ci < playedCards.length; ci++) {
    const ac = playedCards[ci];
    const cardSeed = seed + ci * 7;
    fanImpact += ac.fanImpact;

    // Penalty Shout — special resolution
    if (ac.effect.successChance !== undefined && ac.effect.successGoalMod !== undefined) {
      if (ac.id === 'offside_trap') {
        offsideTrapActive = true;
        commentary.push(`Offside Trap set — 30% chance to cancel opponent goal`);
        continue;
      }
      const success = seededChance(cardSeed, ac.effect.successChance);
      if (success) {
        yourGoalMod += ac.effect.successGoalMod;
        commentary.push(`${ac.name}: SUCCESS! +${(ac.effect.successGoalMod * 100).toFixed(0)}% goal chance`);
      } else {
        yourGoalMod += ac.effect.failGoalMod ?? 0;
        commentary.push(`${ac.name}: Waved away!`);
      }
      continue;
    }

    // Offside Trap (no successGoalMod, just successChance)
    if (ac.id === 'offside_trap') {
      offsideTrapActive = true;
      commentary.push(`Offside Trap set — 30% chance to cancel opponent goal`);
      continue;
    }

    // Backfire check (Wind Up)
    if (ac.effect.backfireChance !== undefined) {
      const backfired = seededChance(cardSeed + 1, ac.effect.backfireChance);
      if (backfired) {
        opponentGoalMod += ac.effect.backfireOpponentMod ?? 0;
        commentary.push(`${ac.name}: BACKFIRED! Opponent energised!`);
        continue;
      }
    }

    // Counter Attack: +20% if opponent scored last round, else +5%
    if (ac.id === 'counter_attack') {
      if (state.opponentScoredLastRound) {
        yourGoalMod += 0.20;
        commentary.push(`Counter Attack: They scored last round — +20% on the break!`);
      } else {
        yourGoalMod += 0.05;
        commentary.push(`Counter Attack: Sitting deep — +5%`);
      }
      continue;
    }

    // Set Piece: doubled if Target/Commander in XI
    if (ac.id === 'set_piece') {
      const hasTargetOrCommander = xiHasMatch(xi, 'Target|Commander');
      const mod = hasTargetOrCommander ? 0.24 : 0.12;
      yourGoalMod += mod;
      commentary.push(`Set Piece: +${(mod * 100).toFixed(0)}%${hasTargetOrCommander ? ' (doubled — Target/Commander in XI)' : ''}`);
      continue;
    }

    // Captain's Armband: doubled if Captain personality in XI
    if (ac.id === 'captains_armband') {
      const hasCaptain = xiHasMatch(xi, 'Captain');
      const mod = hasCaptain ? 0.30 : 0.15;
      yourGoalMod += mod;
      commentary.push(`Captain's Armband: +${(mod * 100).toFixed(0)}%${hasCaptain ? ' (Captain in XI!)' : ''}`);
      continue;
    }

    // Per-card archetype scaling (Tiki-Taka card)
    if (ac.effect.perCardArchetypes && ac.effect.perCardGoalMod) {
      const count = countArchetypeMatches(xi, ac.effect.perCardArchetypes);
      const mod = count * ac.effect.perCardGoalMod;
      yourGoalMod += mod;
      commentary.push(`${ac.name}: ${count} matching cards — +${(mod * 100).toFixed(0)}%`);
      continue;
    }

    // Conditional cards (requiresInXI)
    if (ac.effect.requiresInXI) {
      const hasMatch = xiHasMatch(xi, ac.effect.requiresInXI);
      if (hasMatch) {
        yourGoalMod += ac.effect.yourGoalMod ?? 0;
        opponentGoalMod += ac.effect.opponentGoalMod ?? 0;
        commentary.push(`${ac.name}: Condition met — +${((ac.effect.yourGoalMod ?? 0) * 100).toFixed(0)}%`);
      } else {
        yourGoalMod += ac.effect.fallbackGoalMod ?? 0;
        commentary.push(`${ac.name}: No matching card in XI — +${((ac.effect.fallbackGoalMod ?? 0) * 100).toFixed(0)}%`);
      }
    } else {
      // Standard modifiers
      if (ac.effect.yourGoalMod) yourGoalMod += ac.effect.yourGoalMod;
      if (ac.effect.opponentGoalMod) opponentGoalMod += ac.effect.opponentGoalMod;
      if (ac.effect.yourGoalMod || ac.effect.opponentGoalMod) {
        commentary.push(`${ac.name}: ${ac.flavour}`);
      }
    }

    // Rest-of-match effects
    if (ac.effect.opponentRestOfMatchMod) {
      persistentOpponentMod += ac.effect.opponentRestOfMatchMod;
      commentary.push(`${ac.name}: -${Math.abs(ac.effect.opponentRestOfMatchMod * 100).toFixed(0)}% opponent rest of match`);
    }
    if (ac.effect.yourRestOfMatchMod) {
      persistentYourMod += ac.effect.yourRestOfMatchMod;
    }

    // Next-round modifiers
    if (ac.effect.yourNextRoundMod) {
      nextRoundYourMod += ac.effect.yourNextRoundMod;
      if (ac.effect.appliesNextRound) {
        commentary.push(`${ac.name}: +${(ac.effect.yourNextRoundMod * 100).toFixed(0)}% next round`);
      }
    }

    // Red card risk (Tactical Foul)
    if (ac.effect.riskChance && ac.effect.riskPenalty) {
      const gotRedCard = seededChance(cardSeed + 2, ac.effect.riskChance);
      if (gotRedCard) {
        redCardPenalty += ac.effect.riskPenalty;
        commentary.push(`${ac.name}: RED CARD! ${(ac.effect.riskPenalty * 100).toFixed(0)}% penalty rest of match`);
      } else {
        commentary.push(`${ac.name}: Got away with it!`);
      }
    }

    // Cancel opponent action
    if (ac.effect.cancelOpponentAction) {
      commentary.push(`${ac.name}: Opponent's best action cancelled`);
    }
  }

  return {
    yourGoalMod,
    opponentGoalMod,
    nextRoundYourMod,
    persistentOpponentMod,
    persistentYourMod,
    redCardPenalty,
    fanImpact,
    commentary,
    offsideTrapActive,
  };
}

// ---------------------------------------------------------------------------
// Main Functions
// ---------------------------------------------------------------------------

/** @deprecated */
/**
 * Resolve a single round of the match.
 * Returns the round result and does NOT mutate the MatchState.
 */
export function resolveRound(
  state: MatchState,
  playedCards: ActionCard[],
  seed: number,
  weaknessArchetype?: string,
): RoundResult {
  const minute = ROUND_MINUTES[state.round - 1] ?? 90;
  const commentary: string[] = [];
  const style = PLAYING_STYLES['tiki-taka']; // default, overridden by caller via calculateXIStrength

  // Calculate XI strength
  const yourStrength = calculateXIStrength(state.xi, style);

  // Apply pending next-round modifier from previous round
  let pendingYourMod = state.nextRoundYourMod;

  // Resolve action card effects
  const actionResult = resolveActionEffects(playedCards, state.xi, state, seed);
  commentary.push(...actionResult.commentary);

  // Check Poacher role: +15% when attacking cards played
  const hasPoacher = state.xi.some(sc => sc.card.tacticalRole === 'Poacher');
  const hasAttackingCards = playedCards.some(ac => ac.subtype === 'attacking' || ac.type === 'moment');
  let poacherBonus = 0;
  if (hasPoacher && hasAttackingCards) {
    poacherBonus = 0.15;
    commentary.push(`Poacher in the box — +15% goal chance with attacking cards!`);
  }

  // Volante: -5% opponent goal chance per round (passive)
  const hasVolante = state.xi.some(sc => sc.card.tacticalRole === 'Volante');
  const volanteMod = hasVolante ? -0.05 : 0;

  // Weakness exploitation
  let weaknessBonus = 0;
  if (weaknessArchetype) {
    const weaknessCount = state.xi.filter(sc => sc.card.archetype === weaknessArchetype).length;
    weaknessBonus = weaknessCount * 0.03;
    if (weaknessCount > 0) {
      commentary.push(`Exploiting weakness: ${weaknessCount} ${weaknessArchetype}${weaknessCount > 1 ? 's' : ''} in XI (+${(weaknessBonus * 100).toFixed(0)}%)`);
    }
  }

  // Calculate goal probabilities
  const difference = yourStrength - state.opponentStrength;
  const baseYourChance = 0.15 + difference / 200;
  const baseOpponentChance = 0.15 - difference / 200;

  const totalYourMod = actionResult.yourGoalMod + pendingYourMod +
    state.persistentYourMod + state.redCardPenalty + poacherBonus + weaknessBonus;
  const totalOpponentMod = actionResult.opponentGoalMod +
    state.persistentOpponentMod + volanteMod;

  const yourGoalChance = clamp(baseYourChance + totalYourMod, 0.05, 0.50);
  const opponentGoalChance = clamp(baseOpponentChance + totalOpponentMod, 0.05, 0.50);

  // Determine if goals happen (seeded random)
  const yourGoalSeed = seed * 3 + 1;
  const opponentGoalSeed = seed * 3 + 2;

  const yourScored = seededChance(yourGoalSeed, yourGoalChance);
  let opponentScored = seededChance(opponentGoalSeed, opponentGoalChance);

  // Offside Trap: 30% chance to cancel opponent goal
  if (opponentScored && actionResult.offsideTrapActive) {
    const offsideSeed = seed * 3 + 5;
    if (seededChance(offsideSeed, 0.30)) {
      opponentScored = false;
      commentary.push(`OFFSIDE! Trap works — goal disallowed!`);
    } else {
      commentary.push(`Offside Trap failed — goal stands!`);
    }
  }

  // Generate commentary
  if (yourScored) {
    // Pick a scorer from the XI (weighted toward attackers)
    const attackers = state.xi.filter(sc => ATTACKER_POSITIONS.has(slotPosition(sc.slot)));
    const scorerPool = attackers.length > 0 ? attackers : state.xi;
    const scorerIdx = Math.abs(seed * 7) % scorerPool.length;
    const scorer = scorerPool[scorerIdx].card.name;
    commentary.push(`${minute}' — ${scorer} scores! GOAL!`);
  }
  if (opponentScored) {
    commentary.push(`${minute}' — Opponent scores. ${minute <= 45 ? 'Still time to respond.' : 'The pressure builds.'}`);
  }
  if (!yourScored && !opponentScored) {
    commentary.push(`${minute}' — No goals this round.`);
  }

  // Fan earnings for this round
  let fansEarned = 0;
  if (yourScored) fansEarned += 50;
  if (opponentScored) fansEarned += 30;  // drama
  fansEarned += actionResult.fanImpact;

  return {
    minute,
    yourStrength,
    opponentStrength: state.opponentStrength,
    yourGoalChance,
    opponentGoalChance,
    yourScored,
    opponentScored,
    commentary,
    fansEarned,
  };
}

/** @deprecated */
/**
 * Create an initial MatchState for a new match.
 */
export function createMatchState(
  xi: SlottedCard[],
  bench: Card[],
  actionDeck: ActionCard[],
  opponentStrength: number,
  matchSeed: number,
): MatchState {
  // Draw opening hand of 5 action cards
  const hand = actionDeck.slice(0, 5);
  const remainingDeck = actionDeck.slice(5);

  return {
    xi,
    bench,
    hand,
    actionDeck: remainingDeck,
    round: 1,
    yourGoals: 0,
    opponentGoals: 0,
    yourActions: [],
    opponentStrength,
    fanAccumulator: 0,
    persistentYourMod: 0,
    persistentOpponentMod: 0,
    nextRoundYourMod: 0,
    opponentScoredLastRound: false,
    redCardPenalty: 0,
    offsideTrapActive: false,
    matchSeed,
  };
}

/** @deprecated */
/**
 * Advance the match state after a round is resolved.
 * Draws new cards, advances round counter, updates goals.
 */
export function advanceMatchState(
  state: MatchState,
  result: RoundResult,
  playedCards: ActionCard[],
  actionResult: {
    nextRoundYourMod: number;
    persistentOpponentMod: number;
    persistentYourMod: number;
    redCardPenalty: number;
  },
): MatchState {
  const newRound = state.round + 1;

  // Remove played cards from hand
  const playedIds = new Set(playedCards.map(c => c.id));
  let newHand = state.hand.filter(c => !playedIds.has(c.id));

  // Draw cards based on round
  let drawCount: number;
  if (newRound === 3) {
    drawCount = 3; // Half-time: draw 3
  } else {
    drawCount = 2; // Normal: draw 2
  }

  // Enforce hand size limit of 5
  const canDraw = Math.min(drawCount, 5 - newHand.length, state.actionDeck.length);
  const drawn = state.actionDeck.slice(0, canDraw);
  newHand = [...newHand, ...drawn];
  const newDeck = state.actionDeck.slice(canDraw);

  return {
    ...state,
    round: newRound,
    yourGoals: state.yourGoals + (result.yourScored ? 1 : 0),
    opponentGoals: state.opponentGoals + (result.opponentScored ? 1 : 0),
    hand: newHand,
    actionDeck: newDeck,
    yourActions: [],
    fanAccumulator: state.fanAccumulator + result.fansEarned,
    persistentYourMod: state.persistentYourMod + actionResult.persistentYourMod,
    persistentOpponentMod: state.persistentOpponentMod + actionResult.persistentOpponentMod,
    nextRoundYourMod: actionResult.nextRoundYourMod,
    opponentScoredLastRound: result.opponentScored,
    redCardPenalty: state.redCardPenalty + actionResult.redCardPenalty,
    offsideTrapActive: false,
    matchSeed: state.matchSeed,
  };
}

// ---------------------------------------------------------------------------
// Preview (Fix 2: Strength Preview Before Advancing)
// ---------------------------------------------------------------------------

/**
 * Preview what a set of action cards would do WITHOUT resolving goals.
 * Returns projected strengths and goal chances for UI display.
 */
export interface RoundPreview {
  yourStrength: number;
  opponentStrength: number;
  yourGoalChance: number;
  opponentGoalChance: number;
  baseYourGoalChance: number;
  baseOpponentGoalChance: number;
  strengthDelta: number; // vs baseline (no cards played)
}

/** @deprecated */
export function previewRound(
  state: MatchState,
  playedCards: ActionCard[],
): RoundPreview {
  const style = PLAYING_STYLES['tiki-taka'];
  const yourStrength = calculateXIStrength(state.xi, style);
  const opponentStrength = state.opponentStrength;

  // Base chances (no cards)
  const difference = yourStrength - opponentStrength;
  const baseYourChance = clamp(0.15 + difference / 200, 0.05, 0.50);
  const baseOpponentChance = clamp(0.15 - difference / 200, 0.05, 0.50);

  // Estimate action modifiers (simplified — no seeded randomness)
  let yourGoalMod = state.nextRoundYourMod + state.persistentYourMod + state.redCardPenalty;
  let opponentGoalMod = state.persistentOpponentMod;

  // Volante passive
  const hasVolante = state.xi.some(sc => sc.card.tacticalRole === 'Volante');
  if (hasVolante) opponentGoalMod -= 0.05;

  // Poacher bonus
  const hasPoacher = state.xi.some(sc => sc.card.tacticalRole === 'Poacher');
  const hasAttackingCards = playedCards.some(ac => ac.subtype === 'attacking' || ac.type === 'moment');
  if (hasPoacher && hasAttackingCards) yourGoalMod += 0.15;

  for (const ac of playedCards) {
    // Simple additive mods
    if (ac.effect.yourGoalMod) yourGoalMod += ac.effect.yourGoalMod;
    if (ac.effect.opponentGoalMod) opponentGoalMod += ac.effect.opponentGoalMod;
    if (ac.effect.perCardArchetypes && ac.effect.perCardGoalMod) {
      const count = state.xi.filter(sc =>
        ac.effect.perCardArchetypes!.includes(sc.card.archetype) ||
        (sc.card.secondaryArchetype && ac.effect.perCardArchetypes!.includes(sc.card.secondaryArchetype))
      ).length;
      yourGoalMod += count * ac.effect.perCardGoalMod;
    }
    // Counter attack estimate
    if (ac.id === 'counter_attack') {
      yourGoalMod += state.opponentScoredLastRound ? 0.15 : 0; // net of the base 0.05 already in yourGoalMod
    }
  }

  const yourGoalChance = clamp(baseYourChance + yourGoalMod, 0.05, 0.50);
  const opponentGoalChance = clamp(baseOpponentChance + opponentGoalMod, 0.05, 0.50);

  // Strength delta: baseline = no cards played
  const baselineYourChance = clamp(baseYourChance + state.nextRoundYourMod + state.persistentYourMod + state.redCardPenalty + (hasVolante ? 0 : 0), 0.05, 0.50);
  const strengthDelta = Math.round((yourGoalChance - baselineYourChance) * 100);

  return {
    yourStrength,
    opponentStrength,
    yourGoalChance,
    opponentGoalChance,
    baseYourGoalChance: baselineYourChance,
    baseOpponentGoalChance: baseOpponentChance,
    strengthDelta,
  };
}

// Re-export for backward compatibility
export { type Connection } from './chemistry';

// ---------------------------------------------------------------------------
// Backward Compatibility (v1 API shims)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use resolveRound() for v2 match engine.
 * Kept for page.tsx backward compatibility.
 */
export interface ScoringResult {
  basePower: number;
  connections: Connection[];
  connectionBonus: number;
  styleMultiplier: number;
  roleAbilityEffects: RoleEffect[];
  finalScore: number;
  breakdown: string[];
}

/**
 * @deprecated Use resolveRound() + calculateXIStrength() for v2.
 * Evaluates a lineup as a single "Whistle" for backward compatibility.
 */
export function evaluateLineup(
  cards: SlottedCard[],
  style: PlayingStyle,
  opponentScore?: number,
  round: number = 1,
): ScoringResult {
  const states: CardScoreState[] = cards.map(() => ({
    powerMultiplier: 1.0,
    powerBonus: 0,
    connectionMultiplier: 1.0,
  }));

  const roleEffects = applyRoleAbilities(cards, states, round);
  let basePower = 0;
  for (let i = 0; i < cards.length; i++) {
    basePower += Math.round(cards[i].card.power * states[i].powerMultiplier + states[i].powerBonus);
  }

  const connections = findConnections(cards);
  let connectionBonus = 0;
  for (const conn of connections) {
    let adjustedBonus = conn.bonus;
    for (let i = 0; i < cards.length; i++) {
      if (conn.cards.includes(cards[i].card.name) && states[i].connectionMultiplier !== 1.0) {
        adjustedBonus += conn.bonus * (states[i].connectionMultiplier - 1.0);
      }
    }
    connectionBonus += Math.round(adjustedBonus);
  }

  const styleBonus = computeStyleBonus(cards, style);
  const styleMultiplier = 1 + styleBonus / Math.max(1, basePower + connectionBonus);
  const finalScore = basePower + connectionBonus + styleBonus;

  return {
    basePower,
    connections,
    connectionBonus,
    styleMultiplier,
    roleAbilityEffects: roleEffects,
    finalScore,
    breakdown: [`Base: ${basePower}, Connections: ${connectionBonus}, Style: +${styleBonus}, Final: ${finalScore}`],
  };
}
