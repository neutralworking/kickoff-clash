/**
 * KC rebuild engine — the reviewed trait-template pool (SYNERGY_MODEL_V1 §5).
 *
 * Templates, not free generation: QA reviews these 30 tuples, not 540 cards.
 * Each is a (verb, context, magnitude-tier) template; a card's trait is a
 * template stamped with the magnitude for its rarity. Every magnitude is
 * explicit per tier (no formula magic) — rarity scales CONDITIONALITY too:
 * Commons draw only `broad` templates; narrower, more violent templates are
 * gated to higher rarities by the regeneration script.
 *
 * Law 5 (dual-axis compounding) is executable here: every coverage context
 * must offer templates on BOTH axes — consistency (window conversion: charge
 * amps, denies, die shaping) and amplification (payout value: accruals,
 * goal-event bonuses, cash). REQUIRED_COVERAGE below is the contract the
 * regeneration script validates; gaps fail the build.
 */

import type { TraitContext, WindowKind, Posture } from '../contexts';
import type { VerbName } from '../../lib/verbs';
import type { Rarity } from '../cards';

export type TemplateAxis = 'consistency' | 'amplification';
export type TemplateBreadth = 'broad' | 'narrow';

/** The coverage contexts (SM §2 taxonomy collapsed onto template activation). */
export type CoverageContext =
  | 'transition'
  | 'set-piece'
  | 'possession'
  | 'deep-block'
  | 'scoreline'
  | 'clock'
  | 'streak'
  | 'fitness'
  | 'substitution'
  | 'goal-event';

export interface TraitTemplate {
  id: string;
  name: string;
  axis: TemplateAxis;
  breadth: TemplateBreadth;
  /** The coverage context this template fuels (for validation + manager fit). */
  covers: CoverageContext;
  verb: VerbName;
  context: TraitContext;
  magnitudes: Record<Rarity, number>;
  resource?: 'points' | 'cash';
}

const W = (window: WindowKind): TraitContext => ({ kind: 'window', window });
const P = (posture: Posture): TraitContext => ({ kind: 'posture', posture });

export const TRAIT_TEMPLATES: TraitTemplate[] = [
  // --- TRANSITION ------------------------------------------------------------
  { id: 'break-runner', name: 'Break Runner', axis: 'consistency', breadth: 'broad', covers: 'transition',
    verb: 'amplify', context: W('transition'), magnitudes: { Common: 0.4, Rare: 0.7, Epic: 1.1, Legendary: 1.8 } },
  { id: 'last-ditch-block', name: 'Last-Ditch Block', axis: 'consistency', breadth: 'broad', covers: 'transition',
    verb: 'deny', context: W('transition'), magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.8, Legendary: 1.25 } },
  { id: 'sucker-punch', name: 'Sucker Punch', axis: 'amplification', breadth: 'narrow', covers: 'transition',
    verb: 'generate', context: { kind: 'goal-event', on: 'scored', via: 'transition' },
    magnitudes: { Common: 1, Rare: 1.5, Epic: 2.5, Legendary: 4 } },

  // --- SET-PIECE -------------------------------------------------------------
  { id: 'dead-ball-specialist', name: 'Dead-Ball Specialist', axis: 'consistency', breadth: 'broad', covers: 'set-piece',
    verb: 'amplify', context: W('set-piece'), magnitudes: { Common: 0.4, Rare: 0.7, Epic: 1.1, Legendary: 1.8 } },
  { id: 'zonal-marker', name: 'Zonal Marker', axis: 'consistency', breadth: 'broad', covers: 'set-piece',
    verb: 'deny', context: W('set-piece'), magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.8, Legendary: 1.25 } },
  { id: 'towering-header', name: 'Towering Header', axis: 'amplification', breadth: 'narrow', covers: 'set-piece',
    verb: 'generate', context: { kind: 'goal-event', on: 'scored', via: 'set-piece' },
    magnitudes: { Common: 1, Rare: 1.5, Epic: 2.5, Legendary: 4 } },

  // --- POSSESSION posture ----------------------------------------------------
  { id: 'tempo-dictator', name: 'Tempo Dictator', axis: 'consistency', breadth: 'broad', covers: 'possession',
    verb: 'amplify', context: P('possession'), magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.8, Legendary: 1.2 } },
  { id: 'passing-rhythm', name: 'Passing Rhythm', axis: 'amplification', breadth: 'broad', covers: 'possession',
    verb: 'generate', context: P('possession'), magnitudes: { Common: 0.03, Rare: 0.05, Epic: 0.08, Legendary: 0.12 } },
  { id: 'maverick', name: 'Maverick', axis: 'consistency', breadth: 'narrow', covers: 'possession',
    verb: 'amplify-variance', context: P('possession'), magnitudes: { Common: 1, Rare: 1, Epic: 1, Legendary: 1 } },

  // --- DEEP-BLOCK posture ----------------------------------------------------
  { id: 'line-holder', name: 'Line Holder', axis: 'consistency', breadth: 'broad', covers: 'deep-block',
    verb: 'amplify', context: P('deep-block'), magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.8, Legendary: 1.2 } },
  { id: 'shutout-shift', name: 'Shutout Shift', axis: 'amplification', breadth: 'broad', covers: 'deep-block',
    verb: 'generate', context: P('deep-block'), magnitudes: { Common: 0.03, Rare: 0.05, Epic: 0.08, Legendary: 0.12 } },
  { id: 'professional', name: 'Professional', axis: 'consistency', breadth: 'narrow', covers: 'deep-block',
    verb: 'dampen-variance', context: P('deep-block'), magnitudes: { Common: 1, Rare: 1, Epic: 1, Legendary: 1 } },

  // --- SCORELINE -------------------------------------------------------------
  { id: 'comeback-spark', name: 'Comeback Spark', axis: 'consistency', breadth: 'broad', covers: 'scoreline',
    verb: 'amplify', context: { kind: 'scoreline', is: 'chasing' }, magnitudes: { Common: 0.3, Rare: 0.5, Epic: 0.8, Legendary: 1.25 } },
  { id: 'killer-instinct', name: 'Killer Instinct', axis: 'consistency', breadth: 'narrow', covers: 'scoreline',
    verb: 'amplify', context: { kind: 'scoreline', is: 'leading' }, magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.75, Legendary: 1.25 } },
  { id: 'rally-the-crowd', name: 'Rally the Crowd', axis: 'amplification', breadth: 'narrow', covers: 'scoreline',
    verb: 'generate', context: { kind: 'scoreline', is: 'chasing' }, magnitudes: { Common: 0.05, Rare: 0.1, Epic: 0.15, Legendary: 0.25 } },

  // --- CLOCK -----------------------------------------------------------------
  { id: 'fast-starter', name: 'Fast Starter', axis: 'consistency', breadth: 'broad', covers: 'clock',
    verb: 'amplify', context: { kind: 'clock', band: 'early' }, magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.75, Legendary: 1.25 } },
  { id: 'big-match-temperament', name: 'Big-Match Temperament', axis: 'consistency', breadth: 'broad', covers: 'clock',
    verb: 'amplify', context: { kind: 'clock', band: 'late' }, magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.75, Legendary: 1.25 } },
  { id: 'showstopper', name: 'Showstopper', axis: 'amplification', breadth: 'narrow', covers: 'clock',
    verb: 'generate', context: { kind: 'clock', band: 'late' }, magnitudes: { Common: 0.05, Rare: 0.1, Epic: 0.15, Legendary: 0.25 } },

  // --- STREAK ----------------------------------------------------------------
  { id: 'momentum-rider', name: 'Momentum Rider', axis: 'consistency', breadth: 'narrow', covers: 'streak',
    verb: 'amplify', context: { kind: 'streak', atLeast: 2 }, magnitudes: { Common: 0.5, Rare: 0.75, Epic: 1, Legendary: 1.5 } },
  { id: 'momentum-banker', name: 'Momentum Banker', axis: 'amplification', breadth: 'narrow', covers: 'streak',
    verb: 'generate', context: { kind: 'streak', atLeast: 3 }, magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.75, Legendary: 1.25 } },

  // --- FITNESS ---------------------------------------------------------------
  { id: 'iron-lungs', name: 'Iron Lungs', axis: 'consistency', breadth: 'broad', covers: 'fitness',
    verb: 'amplify', context: { kind: 'fitness', atLeast: 7 }, magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.75, Legendary: 1.25 } },
  { id: 'second-wind', name: 'Second Wind', axis: 'consistency', breadth: 'narrow', covers: 'fitness',
    verb: 'amplify', context: { kind: 'fitness', below: 5 }, magnitudes: { Common: 0.25, Rare: 0.5, Epic: 0.75, Legendary: 1.25 } },
  { id: 'warrior-spirit', name: 'Warrior Spirit', axis: 'amplification', breadth: 'narrow', covers: 'fitness',
    verb: 'generate', context: { kind: 'fitness', atLeast: 8 }, magnitudes: { Common: 0.05, Rare: 0.1, Epic: 0.15, Legendary: 0.25 } },

  // --- SUBSTITUTION ----------------------------------------------------------
  { id: 'impact-sub', name: 'Impact Sub', axis: 'consistency', breadth: 'narrow', covers: 'substitution',
    verb: 'amplify', context: { kind: 'substitution' }, magnitudes: { Common: 0.4, Rare: 0.6, Epic: 0.9, Legendary: 1.4 } },
  { id: 'super-sub-payoff', name: 'Super-Sub Payoff', axis: 'amplification', breadth: 'narrow', covers: 'substitution',
    verb: 'generate', context: { kind: 'substitution' }, magnitudes: { Common: 0.1, Rare: 0.2, Epic: 0.3, Legendary: 0.5 } },

  // --- GOAL-EVENT (payout site — amplification only) ---------------------------
  { id: 'big-game-bonus', name: 'Big-Game Bonus', axis: 'amplification', breadth: 'broad', covers: 'goal-event',
    verb: 'generate', resource: 'cash', context: { kind: 'goal-event', on: 'scored' },
    magnitudes: { Common: 50, Rare: 100, Epic: 150, Legendary: 250 } },
  { id: 'fan-favourite', name: 'Fan Favourite', axis: 'amplification', breadth: 'broad', covers: 'goal-event',
    verb: 'generate', resource: 'cash', context: { kind: 'goal-event', on: 'scored' },
    magnitudes: { Common: 25, Rare: 50, Epic: 75, Legendary: 150 } },
  { id: 'insurance-policy', name: 'Insurance Policy', axis: 'amplification', breadth: 'narrow', covers: 'goal-event',
    verb: 'generate', resource: 'cash', context: { kind: 'goal-event', on: 'conceded' },
    magnitudes: { Common: 25, Rare: 50, Epic: 75, Legendary: 150 } },

  // --- Cross-window pressure (consistency spread) -----------------------------
  { id: 'press-trigger', name: 'Press Trigger', axis: 'consistency', breadth: 'narrow', covers: 'transition',
    verb: 'relocate', context: W('transition'), magnitudes: { Common: 0.03, Rare: 0.05, Epic: 0.08, Legendary: 0.12 } },
  { id: 'foul-winner', name: 'Foul Winner', axis: 'consistency', breadth: 'narrow', covers: 'set-piece',
    verb: 'relocate', context: W('set-piece'), magnitudes: { Common: 0.03, Rare: 0.05, Epic: 0.08, Legendary: 0.12 } },
];

/**
 * The coverage contract: per context, which axes the TEMPLATE pool must offer
 * (law 5), and the minimum share of cards carrying a trait that covers it, per
 * rarity band. `minShare` keys are the bands that must clear the bar —
 * transition is the flagship engine fuel (the ticket's ≥15% Commons example);
 * every context needs a pulse at every band.
 */
export interface CoverageRequirement {
  context: CoverageContext;
  axes: TemplateAxis[];
  minShare: Partial<Record<Rarity, number>>;
}

export const REQUIRED_COVERAGE: CoverageRequirement[] = [
  { context: 'transition', axes: ['consistency', 'amplification'], minShare: { Common: 0.15, Rare: 0.1, Epic: 0.08, Legendary: 0.08 } },
  { context: 'set-piece', axes: ['consistency', 'amplification'], minShare: { Common: 0.1, Rare: 0.08, Epic: 0.06, Legendary: 0.06 } },
  { context: 'possession', axes: ['consistency', 'amplification'], minShare: { Common: 0.1, Rare: 0.08, Epic: 0.06, Legendary: 0.06 } },
  { context: 'deep-block', axes: ['consistency', 'amplification'], minShare: { Common: 0.1, Rare: 0.08, Epic: 0.06, Legendary: 0.06 } },
  { context: 'scoreline', axes: ['consistency', 'amplification'], minShare: { Common: 0.06, Rare: 0.05, Epic: 0.04, Legendary: 0.04 } },
  { context: 'clock', axes: ['consistency', 'amplification'], minShare: { Common: 0.06, Rare: 0.05, Epic: 0.04, Legendary: 0.04 } },
  { context: 'streak', axes: ['consistency', 'amplification'], minShare: { Rare: 0.04, Epic: 0.04, Legendary: 0.04 } },
  { context: 'fitness', axes: ['consistency', 'amplification'], minShare: { Common: 0.04, Rare: 0.04, Epic: 0.04, Legendary: 0.04 } },
  { context: 'substitution', axes: ['consistency', 'amplification'], minShare: { Rare: 0.04, Epic: 0.04, Legendary: 0.04 } },
  { context: 'goal-event', axes: ['amplification'], minShare: { Common: 0.05, Rare: 0.05, Epic: 0.05, Legendary: 0.05 } },
];

export function getTemplate(id: string): TraitTemplate | undefined {
  return TRAIT_TEMPLATES.find((t) => t.id === id);
}
