/**
 * Kickoff Clash — TACTICS BY CARDS.
 *
 * A tactic is a card you EQUIP before kick-off (up to TACTIC_SLOTS, match-v5).
 * Every equipped card's TraitRecords (squad-transforms.ts `tacticTraits`) run
 * through the verb dispatcher EVERY increment; situational conditions on the
 * records (trailing, leading, late-game) gate them during the match. There is
 * no per-spell calling, no charges and no counter-grading.
 *
 * `effect` strings are plain and factual — they state what the records do.
 * `contradicts` is retained as card lore (the paired opposite) for the surfaces.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TacticCard {
  id: string;
  name: string;
  effect: string;
  flavour: string;
  contradicts?: string;      // id of the opposing tactic (display only — no slot rules)
  category: 'attacking' | 'defensive' | 'specialist';  // display accent (cardTokens)
}

// ---------------------------------------------------------------------------
// All 16 plays
// ---------------------------------------------------------------------------

export const ALL_TACTICS: TacticCard[] = [
  // ---- ATTACKING -----------------------------------------------------------
  {
    id: 'high_line',
    name: 'High Line',
    effect: 'Midfield and attack +1 ATK each; your back line −1 DEF.',
    flavour: '"We press from the front. The last line is courage."',
    contradicts: 'low_block',
    category: 'attacking',
  },
  {
    id: 'press_high',
    name: 'Press High',
    effect: 'Your front line presses at +2 DEF; your Sprinters and Engines lose 0.5 fitness each round.',
    flavour: '"Every second counts. Suffocate them early."',
    contradicts: 'sit_deep',
    category: 'attacking',
  },
  {
    id: 'wing_play',
    name: 'Wing Play',
    effect: 'Wide players (WD/WM/WF) +2 ATK.',
    flavour: '"Stretch them. Make the pitch as wide as possible."',
    contradicts: 'narrow',
    category: 'attacking',
  },
  {
    id: 'narrow',
    name: 'Narrow Shape',
    effect: 'Controllers and Passers +2 ATK.',
    flavour: '"Compact. Triangles everywhere. No space for them to breathe."',
    contradicts: 'wing_play',
    category: 'attacking',
  },

  // ---- DEFENSIVE -----------------------------------------------------------
  {
    id: 'low_block',
    name: 'Low Block',
    effect: 'Back line +2 DEF; protecting a lead, Sprinters and Dribblers +2 ATK.',
    flavour: '"Let them have the ball. We\'ll take the three points."',
    contradicts: 'high_line',
    category: 'defensive',
  },
  {
    id: 'sit_deep',
    name: 'Counter Trap',
    effect: 'Back line +1 DEF; Sprinters and Dribblers +2 ATK.',
    flavour: '"Let them come. The space behind them is ours."',
    contradicts: 'press_high',
    category: 'defensive',
  },
  {
    id: 'fortress',
    name: 'Fortress',
    effect: 'Back line +3 DEF.',
    flavour: '"Build the wall. Make them break themselves against it."',
    category: 'defensive',
  },

  // ---- SPECIALIST ----------------------------------------------------------
  {
    id: 'counter_attack',
    name: 'Counter Attack',
    effect: 'While you trail: your front line +3 ATK.',
    flavour: '"One touch. Three passes. Goal. They never learn."',
    contradicts: 'possession',
    category: 'specialist',
  },
  {
    id: 'possession',
    name: 'Possession Game',
    effect: 'Controllers, Passers and Engines +2 ATK — wins the ball contest.',
    flavour: '"The ball is ours. They can\'t score without it."',
    contradicts: 'counter_attack',
    category: 'specialist',
  },
  {
    id: 'set_piece',
    name: 'Set Piece Specialists',
    effect: 'A chance of an extra dead-ball beat each round; Targets and Commanders +1 ATK.',
    flavour: '"Every dead ball is a chance. We\'ve rehearsed them all."',
    category: 'specialist',
  },
  {
    id: 'dark_arts',
    name: 'Dark Arts',
    effect: 'Their best player −1 ATK/−1 DEF and loses 1.5 fitness each round.',
    flavour: '"They don\'t call it the beautiful game for nothing. Beautifully ugly."',
    category: 'specialist',
  },
  {
    id: 'youth_policy',
    name: 'Fresh Legs',
    effect: 'From 60\' on: the whole XI +1 ATK/+1 DEF.',
    flavour: '"Fresh legs win late games."',
    category: 'specialist',
  },

  // ---- LANE OVERLOADS + VARIETY --------------------------------------------
  {
    id: 'overload_left',
    name: 'Overload Left',
    effect: 'Everyone stationed in the LEFT lane +2 ATK.',
    flavour: '"Everything down the left. Make that touchline ours."',
    contradicts: 'overload_right',
    category: 'attacking',
  },
  {
    id: 'overload_right',
    name: 'Overload Right',
    effect: 'Everyone stationed in the RIGHT lane +2 ATK.',
    flavour: '"Swing it right and keep it there. Stretch them until they snap."',
    contradicts: 'overload_left',
    category: 'attacking',
  },
  {
    id: 'route_one',
    name: 'Route One',
    effect: 'A chance of an extra direct-ball beat each round; Targets +1 ATK.',
    flavour: '"Why pass it through them when you can go over them?"',
    category: 'attacking',
  },
  {
    id: 'man_marking',
    name: 'Man-to-Man Marking',
    effect: 'Your midfield +2 DEF.',
    flavour: '"Pick a man. Stay with him. Nobody runs free today."',
    category: 'defensive',
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function getTacticById(id: string): TacticCard | undefined {
  return ALL_TACTICS.find(t => t.id === id);
}
