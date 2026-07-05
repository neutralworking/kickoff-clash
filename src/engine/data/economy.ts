/**
 * KC rebuild engine — run economy (extends ECONOMY_V1; SM §4, §6).
 *
 * All numbers data-side. The load-bearing rules: match rewards scale with the
 * fixture; early-whistle surplus and Financier hooks pay through the match
 * engine's cash channel; shop stock carries the dual-axis guarantee; managers
 * appear RARELY and cost ~2 shops of player spend (SM §4 — cheap managers
 * kill run identity).
 */

import type { Rarity } from '../cards';

/** Cash at run start. */
export const STARTING_CASH = 600;

/** Fixture reward: base + per-fixture ramp (a won fixture funds ~1-2 signings). */
export const REWARD_BASE = 500;
export const REWARD_PER_FIXTURE = 100;
export const REWARD_PER_GOAL = 50;

export const CARD_PRICE: Record<Rarity, number> = {
  Common: 300,
  Rare: 600,
  Epic: 1200,
  Legendary: 2400,
};

/** Selling returns half the sticker price (floored). */
export function sellPrice(rarity: Rarity): number {
  return Math.floor(CARD_PRICE[rarity] / 2);
}

export const REROLL_COST = 100;

/** Shop shape: offers per shop; the dual-axis guarantee is enforced at stock time. */
export const SHOP_OFFERS = 8;

/**
 * Manager pricing (SM §4): ≥ ~2 shops of player purchases. A typical shop
 * spend is ~2 cards ≈ 1200–1800, so a pivot costs 3000. Managers appear only
 * in post-boss shops (rare by construction).
 */
export const MANAGER_PRICE = 3000;

/** Post-boss shops weight Epic/Legendary offers up (SM §8). */
export const BOSS_SHOP_RARITY_WEIGHTS: Record<Rarity, number> = {
  Common: 1,
  Rare: 2,
  Epic: 4,
  Legendary: 4,
};
export const NORMAL_SHOP_RARITY_WEIGHTS: Record<Rarity, number> = {
  Common: 3,
  Rare: 3,
  Epic: 1.5,
  Legendary: 0.2,
};

/** SM §8 target curve: points_target(f) = 1.8 × 1.42^f. */
export function pointsTarget(fixture: number): number {
  return 1.8 * Math.pow(1.42, fixture);
}
