/**
 * Kickoff Clash — Economy Engine (v2)
 *
 * Fans → Gate Revenue → Cash
 * Updated with: durability price modifiers, goal/action fan sources, academy system.
 */

import type { Card, SlottedCard, Durability } from './scoring';
import { DURABILITY_PRICE_MOD, DURABILITY_FAN_BONUS, seededRandom } from './scoring';

/** Entertainment crowd multiplier by playing style (ECONOMY §1: spectacle draws
 *  bigger gates; pragmatic styles draw smaller). §10 tuning dial. */
const ENTERTAINMENT_MOD: Record<string, number> = {
  'total-football': 1.18,
  'tiki-taka': 1.15,
  'gegenpressing': 1.12,
  'counter-attack': 0.95,
  'direct-play': 0.92,
};

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
  goalFans: number;          // flat result bonus (win/draw/loss) — anti-snowball (§1)
  synergyFans: number;
  totalGoalsBonus: number;   // capped goal spectacle
  entertainmentMod: number;  // style crowd multiplier (§1)
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

// Named price constants — the SINGLE SOURCE OF TRUTH for the two XI-upgrade picks (the
// shop-every-match snowball driver). Under the new cadence the player reaches a shop after
// nearly every one of 19 matches (was ~4 between-cups gates), so the picks are raised: a
// Card Pick is now ~1.3 matches' income, a Rare+ Pick ~2.6 — upgrading stays a real
// save-vs-spend decision, not an every-match reflex. ShopPhase.tsx currently DUPLICATES
// these as local literals (15_000 / 35_000); wire it to these exports to take the new
// prices live. Until then, the ~20% income trim (BASE_WIN_CASH, below — fully wired via
// matchReward) is the lever that lands, and it alone already pulls the median snowball
// back into a challenging band (see the economy sim). ECONOMY §1.
export const CARD_PICK_COST = 20000;   // was 15000 — the everyday XI upgrade
export const RARE_PICK_COST = 48000;   // was 35000 — the guaranteed Rare+ upgrade
/** The cheap DEPTH buy: 3 random Common/Rare players, priced under a match-1 win
 *  (BASE_WIN_CASH[0] = 6000) so a squad deficiency can be addressed immediately
 *  after the first game. Bodies, not stars — the elite picks above stay the
 *  expensive commitment, so the anti-snowball on the top end holds. */
export const PLAYER_PACK_COST = 5000;
/** Scouting is a cheap information buy (the squad-screen Scout Report overlay
 *  charges this to unlock the opponent's estimated lineup). */
export const SCOUT_COST = 2500;

export const SHOP_ITEMS: ShopItem[] = [
  // NOTE: card_pick/rare_pick here are the source-of-truth prices; the pick UI is driven
  // by ShopPhase local constants today (SHOP_ITEMS is `void`ed there), so these two are
  // safe to raise ahead of the wiring. Every OTHER entry below is kept at its live display
  // value so no charge≠display desync ships (reroll & scout ARE charged from here via
  // buyShopItem, while their ShopPhase price labels are separate literals).
  { id: 'card_pick',       name: 'Card Pick',              description: 'Choose 1 of 3 cards',              cost: CARD_PICK_COST, category: 'card' },
  { id: 'rare_pick',       name: 'Rare+ Pick',             description: 'Choose 1 of 3 (Rare or better)',   cost: RARE_PICK_COST, category: 'card' },
  { id: 'player_pack',     name: 'Player Pack',            description: '3 random players (Common/Rare)',   cost: PLAYER_PACK_COST, category: 'card' },
  { id: 'tactical_pack',   name: 'Tactical Pack',          description: '3 random tactical cards',          cost: 10000, category: 'action_pack' },
  { id: 'moment_pack',     name: 'Moment Pack',            description: '2 random moment cards',            cost: 20000, category: 'action_pack' },
  { id: 'mind_games_pack', name: 'Mind Games Pack',        description: '2 random mind game cards',         cost: 15000, category: 'action_pack' },
  { id: 'mixed_pack',      name: 'Mixed Pack',             description: '3 random from all types',          cost: 8000,  category: 'action_pack' },
  { id: 'manager_card',    name: 'Manager Card',           description: 'Random manager modifier',          cost: 25000, category: 'manager' }, // == JOKER_COST
  { id: 'reroll',          name: 'Reroll Shop',            description: 'Refresh shop offerings',           cost: 8000,  category: 'utility' },
  { id: 'heal',            name: 'Heal Injured Card',      description: 'Restore an injured card',          cost: 12000, category: 'utility' },
  { id: 'scout_report',    name: 'Scout Report',           description: 'Unlock the next opponent’s estimated lineup', cost: SCOUT_COST, category: 'utility' },
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

/** Manager (joker) card price — single source of truth for the direct-buy. */
export const JOKER_COST = 25000;

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
// Match reward — Option B (Phase 2)
// ---------------------------------------------------------------------------
//
// A flat per-result base by round, multiplied by the purchased stadium payout tier,
// plus an opt-in Box Office per-goal bonus. The fan-source gate (`calculateAttendance`)
// is display-only — it no longer feeds cash. Stadium tier is now PLAYER-DRIVEN (bought
// as a Stadium Expansion Investment), not derived from results; over-banking under
// permadeath gets you eliminated before the compounding lands (ECONOMY §1, §4).

/** Per-round win reward, keyed by CUP (1-5), NOT by tie — every tie in a cup pays this
 *  base (draws derive via DRAW_REWARD_FACTOR; a loss ends the run).
 *
 *  Shop-every-match retune: the shop now opens after all 19 non-final matches (was ~4
 *  between-cups gates), so this per-match base is credited and SPENDABLE ~5× as often.
 *  Trimmed ~20% from the sparse-cadence values [8000,12000,16000,22000,30000] so the
 *  average match no longer fully funds a Card Pick every time — income now gates the
 *  new high-frequency shop so a mid squad upgrades meaningfully (+5 XI power over a run)
 *  without buying its way to elite (+9 under the old numbers). See ECONOMY §1 (anti-
 *  snowball) — this is the single dial that throttles EVERY purchase type at once. */
export const BASE_WIN_CASH = [6000, 9500, 13000, 18000, 24000];

/** Stadium payout multiplier by tier (1-indexed) — the compounding income axis. */
export const STADIUM_MULT = [1.0, 1.25, 1.6, 2.0, 2.5];

/** Box Office: cash per goal you score, when the Box Office Investment is unlocked. */
export const PER_GOAL_CASH = 1500;

export function matchReward(
  round: number,
  result: 'win' | 'draw' | 'loss',
  stadiumTier: number,
  drawFactor: number,
  yourGoals = 0,
  boxOffice = false,
): number {
  const base = BASE_WIN_CASH[Math.min(Math.max(round - 1, 0), BASE_WIN_CASH.length - 1)];
  const resultFactor = result === 'win' ? 1 : result === 'draw' ? drawFactor : 0;
  const mult = STADIUM_MULT[Math.min(Math.max(stadiumTier - 1, 0), STADIUM_MULT.length - 1)];
  const boxOfficeBonus = boxOffice ? Math.max(0, yourGoals) * PER_GOAL_CASH : 0;
  return Math.round(base * resultFactor * mult) + boxOfficeBonus;
}

// ---------------------------------------------------------------------------
// Investment cards (Boardroom) — Phase 2
// ---------------------------------------------------------------------------
//
// One-time-unlock cards (Balatro vouchers). Buying one is consumed into a RunState
// scalar/flag — there is no owned-Investment array. The shop offers only the NEXT tier
// in each ladder, read off the current scalar. Pure data (no compute fn) → serialises
// cleanly. Player-facing names are football (Stadium Expansion / Youth Academy / Box
// Office); `kind: 'investment'` is the internal discriminator.

export interface InvestmentCard {
  id: string;
  kind: 'investment';
  ladder: 'stadium' | 'academy' | 'boxoffice';
  tier: number;              // the tier THIS card unlocks (ladders), or 1 (one-shots)
  name: string;
  cost: number;
  description: string;
  effect: { stadiumTier?: number; academyTier?: number; boxOffice?: boolean };
}

/** Cost to unlock each stadium tier (1-indexed; tier 1 is the free default). */
export const STADIUM_INVEST_COST = [0, 10000, 22000, 40000, 70000];

/** The Stadium Expansion ladder — tiers 2..5, each card named after the ground it
 *  builds and tagged with the payout multiplier it unlocks. */
export const STADIUM_INVESTMENTS: InvestmentCard[] = STADIUMS.slice(1).map((s) => ({
  id: `stadium-${s.tier}`,
  kind: 'investment',
  ladder: 'stadium',
  tier: s.tier,
  name: s.name,
  cost: STADIUM_INVEST_COST[s.tier - 1],
  description: `Expand to ${s.name} — ×${STADIUM_MULT[s.tier - 1]} gate on every result.`,
  effect: { stadiumTier: s.tier },
}));

/** The next Stadium Expansion offered for a given current tier, or null if maxed. */
export function getStadiumInvestment(currentTier: number): InvestmentCard | null {
  return STADIUM_INVESTMENTS.find((c) => c.tier === currentTier + 1) ?? null;
}

/** The Youth Academy ladder — tiers 2..4, a flat ACADEMY_UPGRADE_COST per tier. */
export const ACADEMY_INVESTMENTS: InvestmentCard[] = ACADEMY_TIERS.slice(1).map((a) => ({
  id: `academy-${a.tier}`,
  kind: 'investment',
  ladder: 'academy',
  tier: a.tier,
  name: a.name,
  cost: ACADEMY_UPGRADE_COST,
  description: `Upgrade the academy to ${a.name} — ${a.maxRarity}+ intake, ${a.playersOffered}/round.`,
  effect: { academyTier: a.tier },
}));

/** The next Youth Academy upgrade for a given current tier, or null if maxed. */
export function getAcademyInvestment(currentTier: number): InvestmentCard | null {
  return ACADEMY_INVESTMENTS.find((c) => c.tier === currentTier + 1) ?? null;
}

/** Box Office — a one-shot unlock (not a ladder) that turns goals into cash. */
export const BOX_OFFICE_COST = 18000;
export const BOX_OFFICE_INVESTMENT: InvestmentCard = {
  id: 'boxoffice',
  kind: 'investment',
  ladder: 'boxoffice',
  tier: 1,
  name: 'Box Office',
  cost: BOX_OFFICE_COST,
  description: `Sell the spectacle — +£${PER_GOAL_CASH.toLocaleString()} for every goal you score.`,
  effect: { boxOffice: true },
};

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
  stadiumTier: number,
  playingStyle: string = '',
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

  // Result bonus — flat by outcome, NOT per-goal-margin: a narrow win funds nearly as
  // well as a rout (anti-snowball under permadeath, ECONOMY §1).
  const goalFans = yourGoals > opponentGoals ? 400 : yourGoals === opponentGoals ? 150 : 50;

  // Synergy fans
  const synergyFans = connections.reduce((sum, conn) => {
    return sum + (SYNERGY_FAN_PULL[conn.tier] ?? 0);
  }, 0);

  // Goal spectacle — capped, so goals add a little colour without rewarding routs.
  const totalGoals = yourGoals + opponentGoals;
  const totalGoalsBonus = Math.min(totalGoals, 5) * 25;

  // Entertaining styles pull bigger crowds (the spectacle-vs-pragmatism tension).
  const entertainmentMod = ENTERTAINMENT_MOD[playingStyle] ?? 1.0;

  const rawAttendance = Math.round(
    (archetypeFans + personalityFans + durabilityFans +
      goalFans + synergyFans + totalGoalsBonus) * entertainmentMod,
  );
  const capacity = stadium.capacity;
  const attendance = Math.min(rawAttendance, capacity);
  const ticketPrice = stadium.ticketPrice;
  const revenue = attendance * ticketPrice;

  return {
    archetypeFans,
    personalityFans,
    durabilityFans,
    goalFans,
    synergyFans,
    totalGoalsBonus,
    entertainmentMod,
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
