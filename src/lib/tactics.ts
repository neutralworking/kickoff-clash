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
    effect: 'Possession and creation +26%; your defence −12%.',
    flavour: '"We press from the front. The last line is courage."',
    contradicts: 'low_block',
    category: 'attacking',
  },
  {
    id: 'press_high',
    name: 'Press High',
    effect: 'Pressing +35% and their conversion −15%; your Sprinters and Engines lose 0.5 fitness each spell.',
    flavour: '"Every second counts. Suffocate them early."',
    contradicts: 'sit_deep',
    category: 'attacking',
  },
  {
    id: 'wing_play',
    name: 'Wing Play',
    effect: 'Extra chance creation down both wings; Dribblers and Sprinters +12%.',
    flavour: '"Stretch them. Make the pitch as wide as possible."',
    contradicts: 'narrow',
    category: 'attacking',
  },
  {
    id: 'narrow',
    name: 'Narrow Shape',
    effect: 'Extra chance creation through the middle; Controllers and Passers +12%.',
    flavour: '"Compact. Triangles everywhere. No space for them to breathe."',
    contradicts: 'wing_play',
    category: 'attacking',
  },

  // ---- DEFENSIVE -----------------------------------------------------------
  {
    id: 'low_block',
    name: 'Low Block',
    effect: 'Their conversion −20% and extra cover across the back line. Protecting a lead you spring the break (creation +26%); otherwise your possession −8%.',
    flavour: '"Let them have the ball. We\'ll take the three points."',
    contradicts: 'high_line',
    category: 'defensive',
  },
  {
    id: 'sit_deep',
    name: 'Counter Trap',
    effect: 'Their conversion −10% and extra back-line cover; Sprinters and Dribblers +25%.',
    flavour: '"Let them come. The space behind them is ours."',
    contradicts: 'press_high',
    category: 'defensive',
  },
  {
    id: 'fortress',
    name: 'Fortress',
    effect: 'Their conversion −25% and a wall of extra back-line cover.',
    flavour: '"Build the wall. Make them break themselves against it."',
    category: 'defensive',
  },

  // ---- SPECIALIST ----------------------------------------------------------
  {
    id: 'counter_attack',
    name: 'Counter Attack',
    effect: 'While you trail: their conversion −10% and your creation and finishing +28%.',
    flavour: '"One touch. Three passes. Goal. They never learn."',
    contradicts: 'possession',
    category: 'specialist',
  },
  {
    id: 'possession',
    name: 'Possession Game',
    effect: 'Possession +22%, creation +10% — keep the ball and steady the game.',
    flavour: '"The ball is ours. They can\'t score without it."',
    contradicts: 'counter_attack',
    category: 'specialist',
  },
  {
    id: 'set_piece',
    name: 'Set Piece Specialists',
    effect: 'A central dead-ball chance every spell; Targets and Commanders finish +20%.',
    flavour: '"Every dead ball is a chance. We\'ve rehearsed them all."',
    category: 'specialist',
  },
  {
    id: 'dark_arts',
    name: 'Dark Arts',
    effect: 'Their conversion −10%, and their best player loses 1.5 fitness each spell.',
    flavour: '"They don\'t call it the beautiful game for nothing. Beautifully ugly."',
    category: 'specialist',
  },
  {
    id: 'youth_policy',
    name: 'Fresh Legs',
    effect: 'From 60\' on: lifts your whole XI, weakest players most.',
    flavour: '"Fresh legs win late games."',
    category: 'specialist',
  },

  // ---- LANE OVERLOADS + VARIETY --------------------------------------------
  {
    id: 'overload_left',
    name: 'Overload Left',
    effect: 'Piles chance creation into the LEFT channel.',
    flavour: '"Everything down the left. Make that touchline ours."',
    contradicts: 'overload_right',
    category: 'attacking',
  },
  {
    id: 'overload_right',
    name: 'Overload Right',
    effect: 'Piles chance creation into the RIGHT channel.',
    flavour: '"Swing it right and keep it there. Stretch them until they snap."',
    contradicts: 'overload_left',
    category: 'attacking',
  },
  {
    id: 'route_one',
    name: 'Route One',
    effect: 'A direct central finishing chance every spell, with the knock-downs creating more.',
    flavour: '"Why pass it through them when you can go over them?"',
    category: 'attacking',
  },
  {
    id: 'man_marking',
    name: 'Man-to-Man Marking',
    effect: 'Their conversion −18%, your defence +10% and extra back-line cover.',
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
