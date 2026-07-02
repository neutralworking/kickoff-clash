/**
 * Kickoff Clash — Tactic cards as per-spell CALLED PLAYS.
 *
 * The 3-slot persistent-tactic model is gone. A tactic is now a PLAY the player
 * CALLS for one 15-minute spell, against the opponent's telegraphed play
 * (opponent.ts OPPONENT_PLAYS). Each play carries a limited number of CHARGES
 * per match (most 2; cheap shaping plays 3). The mechanical effect of a call is
 * authored as TraitRecords in squad-transforms.ts `tacticTraits` and runs through
 * the verb dispatcher for THIS spell only.
 *
 * `effect` strings are plain and factual — they state what the records do.
 * `contradicts` is retained as card lore (the paired opposite play) for the card
 * surfaces; it has no slot mechanics any more.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TacticCard {
  id: string;
  name: string;
  effect: string;
  flavour: string;
  contradicts?: string;      // id of the opposing play (display only — no slot rules)
  category: 'attacking' | 'defensive' | 'specialist';  // display accent (cardTokens)
  /** What kind of call this is — used by call policies and the break screen. */
  playClass: 'attacking' | 'defensive' | 'control';
  /** Uses per match. Calling the play for a spell consumes one charge. */
  charges: number;
}

// ---------------------------------------------------------------------------
// All 16 plays
// ---------------------------------------------------------------------------

export const ALL_TACTICS: TacticCard[] = [
  // ---- ATTACKING -----------------------------------------------------------
  {
    id: 'high_line',
    name: 'High Line',
    effect: 'This spell: your attack and creation +15%, your defence −10%.',
    flavour: '"We press from the front. The last line is courage."',
    contradicts: 'low_block',
    category: 'attacking',
    playClass: 'attacking',
    charges: 2,
  },
  {
    id: 'press_high',
    name: 'Press High',
    effect: 'This spell: their conversion −15%; Engines & Destroyers +20% but lose 0.5 fitness.',
    flavour: '"Every second counts. Suffocate them early."',
    contradicts: 'sit_deep',
    category: 'attacking',
    playClass: 'control',
    charges: 2,
  },
  {
    id: 'wing_play',
    name: 'Wing Play',
    effect: 'This spell: extra attacking threat down both wings; Dribblers & Sprinters +10%.',
    flavour: '"Stretch them. Make the pitch as wide as possible."',
    contradicts: 'narrow',
    category: 'attacking',
    playClass: 'attacking',
    charges: 3,
  },
  {
    id: 'narrow',
    name: 'Narrow Shape',
    effect: 'This spell: extra threat through the middle; Controllers & Passers +10%.',
    flavour: '"Compact. Triangles everywhere. No space for them to breathe."',
    contradicts: 'wing_play',
    category: 'attacking',
    playClass: 'control',
    charges: 3,
  },

  // ---- DEFENSIVE -----------------------------------------------------------
  {
    id: 'low_block',
    name: 'Low Block',
    effect: 'This spell: their conversion −20%; your attack −10%.',
    flavour: '"Let them have the ball. We\'ll take the three points."',
    contradicts: 'high_line',
    category: 'defensive',
    playClass: 'defensive',
    charges: 2,
  },
  {
    id: 'sit_deep',
    name: 'Counter Trap',
    effect: 'This spell: their conversion −10%; Sprinters & Dribblers +15% — doubled against an attacking play.',
    flavour: '"Let them come. The space behind them is ours."',
    contradicts: 'press_high',
    category: 'defensive',
    playClass: 'defensive',
    charges: 2,
  },
  {
    id: 'fortress',
    name: 'Fortress',
    effect: 'This spell: their conversion −25%.',
    flavour: '"Build the wall. Make them break themselves against it."',
    category: 'defensive',
    playClass: 'defensive',
    charges: 2,
  },

  // ---- SPECIALIST ----------------------------------------------------------
  {
    id: 'counter_attack',
    name: 'Counter Attack',
    effect: 'This spell, if they are on an attacking play or you trail: your attack and finishing +15%.',
    flavour: '"One touch. Three passes. Goal. They never learn."',
    contradicts: 'possession',
    category: 'specialist',
    playClass: 'attacking',
    charges: 2,
  },
  {
    id: 'possession',
    name: 'Possession Game',
    effect: 'This spell: your creation +12% and a steadier spell (less variance).',
    flavour: '"The ball is ours. They can\'t score without it."',
    contradicts: 'counter_attack',
    category: 'specialist',
    playClass: 'control',
    charges: 3,
  },
  {
    id: 'set_piece',
    name: 'Set Piece Specialists',
    effect: 'This spell: a central finishing chance from dead balls; Targets & Commanders +15%.',
    flavour: '"Every dead ball is a chance. We\'ve rehearsed them all."',
    category: 'specialist',
    playClass: 'attacking',
    charges: 2,
  },
  {
    id: 'dark_arts',
    name: 'Dark Arts',
    effect: 'This spell: their conversion −8%, and their best player loses 1 fitness.',
    flavour: '"They don\'t call it the beautiful game for nothing. Beautifully ugly."',
    category: 'specialist',
    playClass: 'control',
    charges: 2,
  },
  {
    id: 'youth_policy',
    name: 'Fresh Legs',
    effect: 'From 60\' on, this spell: lifts your whole XI, weakest players most.',
    flavour: '"Fresh legs win late games."',
    category: 'specialist',
    playClass: 'control',
    charges: 2,
  },

  // ---- LANE OVERLOADS + VARIETY --------------------------------------------
  {
    id: 'overload_left',
    name: 'Overload Left',
    effect: 'This spell: piles attacking threat into the LEFT lane.',
    flavour: '"Everything down the left. Make that touchline ours."',
    contradicts: 'overload_right',
    category: 'attacking',
    playClass: 'attacking',
    charges: 2,
  },
  {
    id: 'overload_right',
    name: 'Overload Right',
    effect: 'This spell: piles attacking threat into the RIGHT lane.',
    flavour: '"Swing it right and keep it there. Stretch them until they snap."',
    contradicts: 'overload_left',
    category: 'attacking',
    playClass: 'attacking',
    charges: 2,
  },
  {
    id: 'route_one',
    name: 'Route One',
    effect: 'This spell: a direct ball makes a central finishing chance up top.',
    flavour: '"Why pass it through them when you can go over them?"',
    category: 'attacking',
    playClass: 'attacking',
    charges: 2,
  },
  {
    id: 'man_marking',
    name: 'Man-to-Man Marking',
    effect: 'This spell: their conversion −20%; your defence +12%.',
    flavour: '"Pick a man. Stay with him. Nobody runs free today."',
    category: 'defensive',
    playClass: 'defensive',
    charges: 2,
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function getTacticById(id: string): TacticCard | undefined {
  return ALL_TACTICS.find(t => t.id === id);
}

/** Charges a play has left, given the match's used-charges ledger. */
export function chargesLeft(tactic: TacticCard, used: Record<string, number>): number {
  return Math.max(0, tactic.charges - (used[tactic.id] ?? 0));
}
