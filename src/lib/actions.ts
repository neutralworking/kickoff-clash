/**
 * @deprecated v2 action cards — replaced by joker system in v3.
 * Kept for reference. No longer imported by any component.
 */

/**
 * Kickoff Clash — Action Card Definitions
 *
 * Action cards are played from hand during match rounds.
 * Four types: tactical (attacking/defensive), moment, mind_game, substitution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionEffect {
  /** Additive modifier to your goal chance this round (e.g. +0.15 = +15%) */
  yourGoalMod?: number;
  /** Additive modifier to opponent goal chance this round (e.g. -0.20) */
  opponentGoalMod?: number;
  /** Modifier applied to YOUR goal chance NEXT round (e.g. Overload's -0.15) */
  yourNextRoundMod?: number;
  /** Modifier applied to OPPONENT goal chance for rest of match */
  opponentRestOfMatchMod?: number;
  /** Modifier applied to YOUR goal chance for rest of match */
  yourRestOfMatchMod?: number;
  /** If true, cancels opponent's highest-value action this round */
  cancelOpponentAction?: boolean;
  /** Probability of a negative side-effect (e.g. 0.20 for red card) */
  riskChance?: number;
  /** Penalty applied to YOUR goal chance rest of match if risk fires */
  riskPenalty?: number;
  /** Probability of a positive outcome (e.g. Penalty Shout 0.40) */
  successChance?: number;
  /** Goal mod if success fires */
  successGoalMod?: number;
  /** Goal mod if success fails (waved away) */
  failGoalMod?: number;
  /** Backfire chance — reverses effect (e.g. Wind Up 0.15) */
  backfireChance?: number;
  /** What happens on backfire — added to opponent goal mod */
  backfireOpponentMod?: number;
  /**
   * Conditional: only applies full effect if a card with matching
   * archetype/role/personality is in the XI.
   */
  requiresInXI?: string;
  /** Reduced effect if condition not met */
  fallbackGoalMod?: number;
  /** Per-matching-card bonus (e.g. Tiki-Taka +5% per Controller/Passer) */
  perCardArchetypes?: string[];
  perCardGoalMod?: number;
  /** Only playable at specific round (e.g. Last-Minute Drama = round 5) */
  onlyAtRound?: number;
  /** Requires next-round setup (The Hairdryer applies next round) */
  appliesNextRound?: boolean;
}

export interface ActionCard {
  id: string;
  name: string;
  type: 'tactical' | 'moment' | 'mind_game' | 'substitution';
  subtype?: 'attacking' | 'defensive';
  effect: ActionEffect;
  duration: 'round' | 'match';
  flavour: string;
  /** Fan impact from playing this card (positive = more fans, negative = fewer) */
  fanImpact: number;
  /** Conditions for playing (human-readable, enforced by game engine) */
  conditions?: string[];
  /** For substitution cards: the bench player card data */
  _benchCard?: import('./scoring').Card;
}

// ---------------------------------------------------------------------------
// Attacking Tactical Cards (8)
// ---------------------------------------------------------------------------

const ATTACKING_CARDS: ActionCard[] = [
  {
    id: 'press_high',
    name: 'Press High',
    type: 'tactical',
    subtype: 'attacking',
    effect: { yourGoalMod: 0.15, opponentGoalMod: 0.10 },
    duration: 'round',
    flavour: 'PRESS! PRESS! PRESS!',
    fanImpact: 10,
  },
  {
    id: 'counter_attack',
    name: 'Counter Attack',
    type: 'tactical',
    subtype: 'attacking',
    effect: { yourGoalMod: 0.05, fallbackGoalMod: 0.05 },
    // Full +20% if opponent scored last round, else +5% — handled by engine
    duration: 'round',
    flavour: 'Let them come. Then punish.',
    fanImpact: 5,
  },
  {
    id: 'wing_play',
    name: 'Wing Play',
    type: 'tactical',
    subtype: 'attacking',
    effect: { yourGoalMod: 0.10, requiresInXI: 'Lateral|Winger', fallbackGoalMod: 0.0 },
    duration: 'match',
    flavour: 'Get it wide!',
    fanImpact: 5,
  },
  {
    id: 'overload',
    name: 'Overload',
    type: 'tactical',
    subtype: 'attacking',
    effect: { yourGoalMod: 0.20, yourNextRoundMod: -0.15 },
    duration: 'round',
    flavour: 'Everyone forward!',
    fanImpact: 15,
  },
  {
    id: 'through_ball',
    name: 'Through Ball',
    type: 'tactical',
    subtype: 'attacking',
    effect: { yourGoalMod: 0.15, requiresInXI: 'Creator|Passer', fallbackGoalMod: 0.0 },
    duration: 'round',
    flavour: 'The gap! THE GAP!',
    fanImpact: 10,
  },
  {
    id: 'long_ball',
    name: 'Long Ball',
    type: 'tactical',
    subtype: 'attacking',
    effect: { yourGoalMod: 0.10, requiresInXI: 'Target', fallbackGoalMod: 0.0 },
    duration: 'round',
    flavour: 'Route one.',
    fanImpact: 0,
  },
  {
    id: 'tiki_taka',
    name: 'Tiki-Taka',
    type: 'tactical',
    subtype: 'attacking',
    effect: { perCardArchetypes: ['Controller', 'Passer'], perCardGoalMod: 0.05 },
    duration: 'round',
    flavour: 'Pass. Pass. Pass. Pass. Goal.',
    fanImpact: 10,
  },
  {
    id: 'set_piece',
    name: 'Set Piece',
    type: 'tactical',
    subtype: 'attacking',
    effect: { yourGoalMod: 0.12, requiresInXI: 'Target|Commander', fallbackGoalMod: 0.12 },
    // Doubled to 0.24 if Target or Commander in XI, else 0.12 — engine handles
    duration: 'round',
    flavour: 'Everyone in the box',
    fanImpact: 5,
  },
];

// ---------------------------------------------------------------------------
// Defensive Tactical Cards (6)
// ---------------------------------------------------------------------------

const DEFENSIVE_CARDS: ActionCard[] = [
  {
    id: 'park_the_bus',
    name: 'Park the Bus',
    type: 'tactical',
    subtype: 'defensive',
    effect: { opponentGoalMod: -0.20, yourGoalMod: -0.10 },
    duration: 'round',
    flavour: 'Two banks of four.',
    fanImpact: -10,
  },
  {
    id: 'man_mark',
    name: 'Man Mark',
    type: 'tactical',
    subtype: 'defensive',
    effect: { cancelOpponentAction: true },
    duration: 'round',
    flavour: "Don't let him breathe.",
    fanImpact: 0,
  },
  {
    id: 'offside_trap',
    name: 'Offside Trap',
    type: 'tactical',
    subtype: 'defensive',
    // 30% chance of cancelling opponent goal — resolved by engine
    effect: { successChance: 0.30 },
    duration: 'round',
    flavour: 'STEP UP! STEP UP!',
    fanImpact: 5,
  },
  {
    id: 'tactical_foul',
    name: 'Tactical Foul',
    type: 'tactical',
    subtype: 'defensive',
    effect: { cancelOpponentAction: true, riskChance: 0.20, riskPenalty: -0.10 },
    duration: 'round',
    flavour: 'Take one for the team.',
    fanImpact: -5,
    conditions: ['20% red card risk: -10% your goal chance rest of match'],
  },
  {
    id: 'time_waste',
    name: 'Time Waste',
    type: 'tactical',
    subtype: 'defensive',
    effect: { opponentGoalMod: -0.15, yourGoalMod: -0.05 },
    duration: 'round',
    flavour: 'The crowd is NOT happy.',
    fanImpact: -20,
  },
  {
    id: 'sweeper_keeper',
    name: 'Sweeper Keeper',
    type: 'tactical',
    subtype: 'defensive',
    effect: { opponentGoalMod: -0.10, requiresInXI: 'Passer' },
    // Only works if GK has Passer archetype — engine checks
    duration: 'round',
    flavour: "He's coming out!",
    fanImpact: 10,
  },
];

// ---------------------------------------------------------------------------
// Moment Cards (7) — high impact, single-use-per-match feel
// ---------------------------------------------------------------------------

const MOMENT_CARDS: ActionCard[] = [
  {
    id: 'screamer',
    name: 'Screamer',
    type: 'moment',
    effect: { yourGoalMod: 0.25 },
    duration: 'round',
    flavour: 'From THIRTY YARDS!',
    fanImpact: 20,
  },
  {
    id: 'nutmeg',
    name: 'Nutmeg',
    type: 'moment',
    effect: { yourGoalMod: 0.20 },
    duration: 'round',
    flavour: 'MEGS! The crowd goes wild',
    fanImpact: 30,
  },
  {
    id: 'last_minute_drama',
    name: 'Last-Minute Drama',
    type: 'moment',
    effect: { yourGoalMod: 0.35, onlyAtRound: 5 },
    duration: 'round',
    flavour: 'ADDED TIME...',
    fanImpact: 40,
    conditions: ['Only playable at 75\' (round 5)'],
  },
  {
    id: 'captains_armband',
    name: "Captain's Armband",
    type: 'moment',
    // +15% base, doubled to +30% if Captain personality in XI
    effect: { yourGoalMod: 0.15, requiresInXI: 'Captain' },
    duration: 'round',
    flavour: "He's grabbed this game",
    fanImpact: 15,
  },
  {
    id: 'moment_of_genius',
    name: 'Moment of Genius',
    type: 'moment',
    // +30% if Maestro in XI, else +10%
    effect: { yourGoalMod: 0.30, requiresInXI: 'Maestro', fallbackGoalMod: 0.10 },
    duration: 'round',
    flavour: "You can't coach that.",
    fanImpact: 20,
  },
  {
    id: 'wonder_goal',
    name: 'Wonder Goal',
    type: 'moment',
    effect: { yourGoalMod: 0.20 },
    duration: 'round',
    flavour: 'GOLAZO!',
    fanImpact: 50,
  },
  {
    id: 'penalty_shout',
    name: 'Penalty Shout',
    type: 'moment',
    // 40% chance → +30%, 60% → +0%
    effect: { successChance: 0.40, successGoalMod: 0.30, failGoalMod: 0.0 },
    duration: 'round',
    flavour: "Was it? WASN'T IT?",
    fanImpact: 15,
  },
];

// ---------------------------------------------------------------------------
// Mind Game Cards (5)
// ---------------------------------------------------------------------------

const MIND_GAME_CARDS: ActionCard[] = [
  {
    id: 'wind_up',
    name: 'Wind Up',
    type: 'mind_game',
    // -10% opponent, but 15% chance of backfire (+10% opponent instead)
    effect: { opponentGoalMod: -0.10, backfireChance: 0.15, backfireOpponentMod: 0.10 },
    duration: 'round',
    flavour: 'Did you just say that?',
    fanImpact: 10,
  },
  {
    id: 'crowd_surge',
    name: 'Crowd Surge',
    type: 'mind_game',
    // +15% if Catalyst in XI, else +5%
    effect: { yourGoalMod: 0.15, requiresInXI: 'Catalyst', fallbackGoalMod: 0.05 },
    duration: 'round',
    flavour: 'LISTEN to this atmosphere!',
    fanImpact: 10,
  },
  {
    id: 'the_hairdryer',
    name: 'The Hairdryer',
    type: 'mind_game',
    // +20% next round
    effect: { yourNextRoundMod: 0.20, appliesNextRound: true },
    duration: 'round',
    flavour: "Nobody's sitting down.",
    fanImpact: 5,
    conditions: ['requires_captain_in_xi'],
  },
  {
    id: 'press_conference',
    name: 'Press Conference',
    type: 'mind_game',
    effect: { opponentRestOfMatchMod: -0.05 },
    duration: 'match',
    flavour: 'I prefer not to speak.',
    fanImpact: 5,
  },
  {
    id: 'ultra_defensive',
    name: 'Ultra Defensive',
    type: 'mind_game',
    effect: { opponentGoalMod: -0.25, yourGoalMod: -0.20 },
    duration: 'round',
    flavour: 'Anti-football. But it works.',
    fanImpact: -30,
  },
];

// ---------------------------------------------------------------------------
// All action cards combined
// ---------------------------------------------------------------------------

export const ALL_ACTION_CARDS: ActionCard[] = [
  ...ATTACKING_CARDS,
  ...DEFENSIVE_CARDS,
  ...MOMENT_CARDS,
  ...MIND_GAME_CARDS,
];

/**
 * Look up an action card by id.
 */
export function getActionCard(id: string): ActionCard | undefined {
  return ALL_ACTION_CARDS.find(c => c.id === id);
}

/**
 * Get all action cards of a given type.
 */
export function getActionCardsByType(type: ActionCard['type']): ActionCard[] {
  return ALL_ACTION_CARDS.filter(c => c.type === type);
}

/**
 * Check if an action card can be played in the given round.
 */
export function canPlayAction(card: ActionCard, round: number): boolean {
  if (card.effect.onlyAtRound !== undefined && card.effect.onlyAtRound !== round) {
    return false;
  }
  return true;
}
