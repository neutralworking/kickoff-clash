/**
 * Kickoff Clash — Economy Engine (v2)
 *
 * Fans → Gate Revenue → Cash
 * Updated with: durability price modifiers, goal/action fan sources, academy system.
 */

import type { Card, SlottedCard, Durability } from './scoring';
import { DURABILITY_PRICE_MOD, DURABILITY_FAN_BONUS, seededRandom } from './scoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Connection {
  name: string;
  tier: number;
  bonus: number;
  key: string;
}

export interface Stadium {
  tier: number;
  name: string;
  capacity: number;
  ticketPrice: number;
}

export interface AttendanceResult {
  archetypeFans: number;
  personalityFans: number;
  durabilityFans: number;
  goalFans: number;
  actionFans: number;
  synergyFans: number;
  totalGoalsBonus: number;
  rawAttendance: number;
  capacity: number;
  attendance: number;
  ticketPrice: number;
  revenue: number;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: 'card' | 'action_pack' | 'manager' | 'utility' | 'upgrade';
}

export interface Academy {
  tier: number;
  name: string;
  playersOffered: number;
  maxRarity: string;
  cost: number;  // per player
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STADIUMS: Stadium[] = [
  { tier: 1, name: 'The Cage',             capacity: 500,   ticketPrice: 10 },
  { tier: 2, name: 'The Community Ground', capacity: 2000,  ticketPrice: 15 },
  { tier: 3, name: 'The Arena',            capacity: 8000,  ticketPrice: 20 },
  { tier: 4, name: 'The Theatre',          capacity: 25000, ticketPrice: 30 },
  { tier: 5, name: 'The Cathedral',        capacity: 60000, ticketPrice: 40 },
];

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'card_pick',       name: 'Card Pick',              description: 'Choose 1 of 3 cards',              cost: 15000, category: 'card' },
  { id: 'rare_pick',       name: 'Rare+ Pick',             description: 'Choose 1 of 3 (Rare or better)',   cost: 35000, category: 'card' },
  { id: 'tactical_pack',   name: 'Tactical Pack',          description: '3 random tactical cards',          cost: 10000, category: 'action_pack' },
  { id: 'moment_pack',     name: 'Moment Pack',            description: '2 random moment cards',            cost: 20000, category: 'action_pack' },
  { id: 'mind_games_pack', name: 'Mind Games Pack',        description: '2 random mind game cards',         cost: 15000, category: 'action_pack' },
  { id: 'mixed_pack',      name: 'Mixed Pack',             description: '3 random from all types',          cost: 8000,  category: 'action_pack' },
  { id: 'manager_card',    name: 'Manager Card',           description: 'Random manager modifier',          cost: 20000, category: 'manager' },
  { id: 'reroll',          name: 'Reroll Shop',            description: 'Refresh shop offerings',           cost: 8000,  category: 'utility' },
  { id: 'heal',            name: 'Heal Injured Card',      description: 'Restore an injured card',          cost: 12000, category: 'utility' },
  { id: 'scout_report',    name: 'Scout Report',           description: 'See next opponent style + strength', cost: 10000, category: 'utility' },
  { id: 'food_upgrade',    name: 'Stadium Food Upgrade',   description: '+£5 ticket price permanently',     cost: 25000, category: 'upgrade' },
];

// Fan sources from archetypes in XI
const ARCHETYPE_FAN_PULL: Record<string, number> = {
  Dribbler: 30,
  Creator: 25,
  Striker: 20,
  Sprinter: 15,
  Engine: 5,
  Target: 10,
  Powerhouse: 10,
  Passer: 5,
  Cover: 0,
  Destroyer: 0,
  Controller: 0,
  Commander: 0,
  GK: 0,
};

// Fan sources from personality themes
const PERSONALITY_FAN_PULL: Record<string, number> = {
  Catalyst:  40,
  Captain:   15,
  Maestro:   10,
  General:   5,
  Professor: 0,
};

// Fan sources from synergy tiers
const SYNERGY_FAN_PULL: Record<number, number> = {
  1: 20,
  2: 40,
  3: 75,
  4: 200,
};

const TRANSFER_FEE_BY_RARITY: Record<string, number> = {
  Common:    2000,
  Rare:      8000,
  Epic:      20000,
  Legendary: 50000,
};

// ---------------------------------------------------------------------------
// Academy
// ---------------------------------------------------------------------------

export const ACADEMY_TIERS: Academy[] = [
  { tier: 1, name: 'Grassroots',   playersOffered: 1, maxRarity: 'Common', cost: 0 },
  { tier: 2, name: 'Development',  playersOffered: 2, maxRarity: 'Rare',   cost: 2000 },
  { tier: 3, name: 'Elite',        playersOffered: 2, maxRarity: 'Rare',   cost: 3000 },
  { tier: 4, name: 'World Class',  playersOffered: 3, maxRarity: 'Epic',   cost: 5000 },
];

export const ACADEMY_UPGRADE_COST = 30000;

/**
 * Generate academy player cards from a pool.
 * Durability mix varies by tier.
 * Returns partial Card objects (caller should assign full card data from pool).
 */
export function generateAcademyDurability(tier: number, count: number, seed: number): Durability[] {
  const result: Durability[] = [];
  for (let i = 0; i < count; i++) {
    const r = seededRandom(seed + i * 13);
    let dur: Durability;
    if (tier <= 2) {
      // 80% Standard, 20% Phoenix
      dur = r < 0.80 ? 'standard' : 'phoenix';
    } else if (tier === 3) {
      // 60% Standard, 40% Phoenix
      dur = r < 0.60 ? 'standard' : 'phoenix';
    } else {
      // Tier 4: 50% Standard, 40% Phoenix, 10% Iron
      if (r < 0.50) dur = 'standard';
      else if (r < 0.90) dur = 'phoenix';
      else dur = 'iron';
    }
    result.push(dur);
  }
  return result;
}

export function getAcademyTier(tier: number): Academy {
  const clamped = Math.max(1, Math.min(4, tier));
  return ACADEMY_TIERS[clamped - 1];
}

// ---------------------------------------------------------------------------
// Stadium Tier
// ---------------------------------------------------------------------------

/**
 * Determine stadium tier from run progress.
 */
export function getStadiumTier(
  wins: number,
  reachedMatch5: boolean,
  wonRun: boolean,
): number {
  if (wonRun) return 5;
  if (reachedMatch5) return 4;
  if (wins >= 3) return 3;
  if (wins >= 1) return 2;
  return 1;
}

export function getStadium(tier: number): Stadium {
  const clamped = Math.max(1, Math.min(5, tier));
  return STADIUMS[clamped - 1];
}

// ---------------------------------------------------------------------------
// Attendance & Revenue (v2)
// ---------------------------------------------------------------------------

/**
 * Calculate attendance and match-day revenue.
 *
 * v2 fan sources:
 * - Archetype pull from XI cards
 * - Personality theme pull from XI cards
 * - Durability bonuses (Glass/Phoenix in XI)
 * - Goals scored/conceded
 * - Action card spectacle (accumulated fanImpact)
 * - Synergy tier bonuses
 * - Total goals bonus
 */
export function calculateAttendance(
  xi: SlottedCard[],
  connections: Connection[],
  yourGoals: number,
  opponentGoals: number,
  actionFanAccumulator: number,
  stadiumTier: number,
  ticketPriceBonus: number = 0,
): AttendanceResult {
  const stadium = getStadium(stadiumTier);

  // Archetype fans
  const archetypeFans = xi.reduce((sum, sc) => {
    return sum + (ARCHETYPE_FAN_PULL[sc.card.archetype] ?? 0);
  }, 0);

  // Personality fans
  const personalityFans = xi.reduce((sum, sc) => {
    const theme = sc.card.personalityTheme;
    return sum + (theme ? (PERSONALITY_FAN_PULL[theme] ?? 0) : 0);
  }, 0);

  // Durability fans (Glass/Phoenix get +15 each)
  const durabilityFans = xi.reduce((sum, sc) => {
    return sum + (DURABILITY_FAN_BONUS[sc.card.durability] ?? 0);
  }, 0);

  // Goal fans
  const goalFans = (yourGoals * 50) + (opponentGoals * 30);

  // Action card spectacle (accumulated fan impact from all rounds)
  const actionFans = Math.max(0, actionFanAccumulator); // Floor at 0

  // Synergy fans
  const synergyFans = connections.reduce((sum, conn) => {
    return sum + (SYNERGY_FAN_PULL[conn.tier] ?? 0);
  }, 0);

  // Total goals bonus
  const totalGoals = yourGoals + opponentGoals;
  const totalGoalsBonus = totalGoals * 20;

  const rawAttendance = archetypeFans + personalityFans + durabilityFans +
    goalFans + actionFans + synergyFans + totalGoalsBonus;
  const capacity = stadium.capacity;
  const attendance = Math.min(rawAttendance, capacity);
  const ticketPrice = stadium.ticketPrice + ticketPriceBonus;
  const revenue = attendance * ticketPrice;

  return {
    archetypeFans,
    personalityFans,
    durabilityFans,
    goalFans,
    actionFans,
    synergyFans,
    totalGoalsBonus,
    rawAttendance,
    capacity,
    attendance,
    ticketPrice,
    revenue,
  };
}

// ---------------------------------------------------------------------------
// Transfer Fees (Sell-On Market)
// ---------------------------------------------------------------------------

/**
 * Calculate the transfer fee for selling a card.
 * Applies durability modifier and Catalyst +50% bonus.
 */
export function getTransferFee(card: Card): number {
  const baseFee = TRANSFER_FEE_BY_RARITY[card.rarity] ?? 0;
  const durabilityMod = DURABILITY_PRICE_MOD[card.durability] ?? 1.0;
  const catalystMod = card.personalityTheme === 'Catalyst' ? 1.5 : 1.0;
  return Math.floor(baseFee * durabilityMod * catalystMod);
}

// ---------------------------------------------------------------------------
// Shop Helpers
// ---------------------------------------------------------------------------

export function canAfford(cash: number, item: ShopItem): boolean {
  return cash >= item.cost;
}

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}

export function purchase(cash: number, item: ShopItem): number | null {
  if (!canAfford(cash, item)) return null;
  return cash - item.cost;
}
