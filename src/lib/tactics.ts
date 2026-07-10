/**
 * Kickoff Clash — TACTICS BY CARDS.
 *
 * A tactic is a card you CALL mid-match, at a planning break, for the coming
 * period. Each call spends one CHARGE; a called play's flat effect applies for
 * that period only, then you re-decide at the next break. A card's charge
 * capacity scales with its rarity (Common 1 / Rare 2 / Legendary 3), so rarer
 * plays cover more of the match before they run dry. A freshly-packed tactic
 * arrives with a single charge; between fixtures every owned tactic refills to
 * its capacity (see run.ts `refillTacticCharges`).
 *
 * `effect` strings are plain and factual — they state what the call does.
 * `contradicts` is retained as card lore (the paired opposite) for the surfaces.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TacticRarity = 'common' | 'rare' | 'legendary';

export interface TacticCard {
  id: string;
  name: string;
  effect: string;
  flavour: string;
  rarity: TacticRarity;      // drives the card frame AND the charge capacity
  contradicts?: string;      // id of the opposing tactic (display only — no slot rules)
  category: 'attacking' | 'defensive' | 'specialist';  // display accent (cardTokens)
}

/** Charge capacity by rarity — the most times a play can be called in one match
 *  (max 3). A pack pull starts at 1 charge and refills to this between fixtures. */
export const TACTIC_CHARGE_CAP: Record<TacticRarity, number> = {
  common: 1,
  rare: 2,
  legendary: 3,
};

/** A tactic's full charge capacity (by rarity). */
export function tacticCapacity(t: TacticCard): number {
  return TACTIC_CHARGE_CAP[t.rarity];
}

// ---------------------------------------------------------------------------
// All 16 plays
// ---------------------------------------------------------------------------

export const ALL_TACTICS: TacticCard[] = [
  // ---- ATTACKING (CREATE / FINISH / KEEP) ----------------------------------
  {
    id: 'high_line',
    name: 'High Line',
    effect: 'Your attackers +1 ATK — raises CREATE; your back line −1 DEF — drops STOP (the risk).',
    flavour: '"We press from the front. The last line is courage."',
    contradicts: 'low_block',
    rarity: 'rare',
    category: 'attacking',
  },
  {
    id: 'wing_play',
    name: 'Wing Play',
    effect: 'Your attackers +2 ATK — raises CREATE.',
    flavour: '"Stretch them. Make the pitch as wide as possible."',
    contradicts: 'narrow',
    rarity: 'common',
    category: 'attacking',
  },
  {
    id: 'possession',
    name: 'Possession Game',
    effect: 'Your ball-players +2 ATK — raises KEEP (wins the ball contest).',
    flavour: '"The ball is ours. They can\'t score without it."',
    contradicts: 'counter_attack',
    rarity: 'rare',
    category: 'attacking',
  },
  {
    id: 'counter_attack',
    name: 'Counter Attack',
    effect: 'While you trail: your forwards +3 ATK — raises FINISH on the break.',
    flavour: '"One touch. Three passes. Goal. They never learn."',
    contradicts: 'possession',
    rarity: 'legendary',
    category: 'attacking',
  },
  {
    id: 'overload_left',
    name: 'Overload Left',
    effect: 'Your attackers in the LEFT lane +2 ATK — raises CREATE down the left.',
    flavour: '"Everything down the left. Make that touchline ours."',
    contradicts: 'overload_right',
    rarity: 'common',
    category: 'attacking',
  },
  {
    id: 'overload_right',
    name: 'Overload Right',
    effect: 'Your attackers in the RIGHT lane +2 ATK — raises CREATE down the right.',
    flavour: '"Swing it right and keep it there. Stretch them until they snap."',
    contradicts: 'overload_left',
    rarity: 'common',
    category: 'attacking',
  },

  // ---- DEFENSIVE (STOP / BREAK / PRESS) ------------------------------------
  {
    id: 'fortress',
    name: 'Fortress',
    effect: 'Your back line +3 DEF — raises STOP.',
    flavour: '"Build the wall. Make them break themselves against it."',
    rarity: 'rare',
    category: 'defensive',
  },
  {
    id: 'low_block',
    name: 'Low Block',
    effect: 'Your back line +2 DEF — raises STOP; protecting a lead, your forwards +2 ATK (FINISH).',
    flavour: '"Let them have the ball. We\'ll take the three points."',
    contradicts: 'high_line',
    rarity: 'rare',
    category: 'defensive',
  },
  {
    id: 'sit_deep',
    name: 'Counter Trap',
    effect: 'Your back line +1 DEF — raises STOP; your forwards +2 ATK — the break threat (FINISH).',
    flavour: '"Let them come. The space behind them is ours."',
    contradicts: 'press_high',
    rarity: 'common',
    category: 'defensive',
  },
  {
    id: 'man_marking',
    name: 'Man-to-Man Marking',
    effect: 'Your midfield +2 DEF — raises BREAK.',
    flavour: '"Pick a man. Stay with him. Nobody runs free today."',
    rarity: 'common',
    category: 'defensive',
  },
  {
    id: 'narrow',
    name: 'Narrow Shape',
    effect: 'Your midfield +2 DEF — raises BREAK (a compact middle).',
    flavour: '"Compact. Triangles everywhere. No space for them to breathe."',
    contradicts: 'wing_play',
    rarity: 'common',
    category: 'defensive',
  },
  {
    id: 'press_high',
    name: 'Press High',
    effect: 'Your front line +2 DEF — raises PRESS; your Sprinters and Engines tire each round.',
    flavour: '"Every second counts. Suffocate them early."',
    contradicts: 'sit_deep',
    rarity: 'common',
    category: 'defensive',
  },
  {
    id: 'gegenpress',
    name: 'Gegenpress',
    effect: 'While you trail: your front line +2 DEF — raises PRESS to win it back high; the runners tire.',
    flavour: '"Lose it? Win it back in six seconds."',
    rarity: 'rare',
    category: 'defensive',
  },

  // ---- SPECIALIST (chance injection / cross-side / tempo) ------------------
  {
    id: 'set_piece',
    name: 'Set Piece Specialists',
    effect: 'A chance of an extra dead-ball beat each round; your forwards +1 ATK — raises FINISH.',
    flavour: '"Every dead ball is a chance. We\'ve rehearsed them all."',
    rarity: 'rare',
    category: 'specialist',
  },
  {
    id: 'route_one',
    name: 'Route One',
    effect: 'A chance of an extra direct-ball beat each round; your forwards +1 ATK — raises FINISH.',
    flavour: '"Why pass it through them when you can go over them?"',
    rarity: 'rare',
    category: 'specialist',
  },
  {
    id: 'dark_arts',
    name: 'Dark Arts',
    effect: 'While level or behind: their best player −1 ATK/−1 DEF and loses fitness each round.',
    flavour: '"They don\'t call it the beautiful game for nothing. Beautifully ugly."',
    rarity: 'legendary',
    category: 'specialist',
  },
  {
    id: 'youth_policy',
    name: 'Fresh Legs',
    effect: 'From 60\' on: tired players (under 70% fitness) +2 ATK/+2 DEF.',
    flavour: '"Fresh legs win late games."',
    rarity: 'legendary',
    category: 'specialist',
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function getTacticById(id: string): TacticCard | undefined {
  return ALL_TACTICS.find(t => t.id === id);
}
