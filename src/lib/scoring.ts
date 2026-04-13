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
