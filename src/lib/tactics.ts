import type { Card } from './scoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TacticCard {
  id: string;
  name: string;
  effect: string;
  flavour: string;
  contradicts?: string;      // id of contradicting tactic
  category: 'attacking' | 'defensive' | 'specialist';
  compute: (xi: Card[], increment: number) => number;
}

export interface TacticSlots {
  slots: (TacticCard | null)[];  // always length 3
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumPower(xi: Card[]): number {
  return xi.reduce((acc, c) => acc + c.power, 0);
}

function avgPower(xi: Card[]): number {
  if (xi.length === 0) return 0;
  return sumPower(xi) / xi.length;
}

function countArchetypes(xi: Card[], archetypes: string[]): number {
  return xi.filter(
    c => archetypes.includes(c.archetype) || (c.secondaryArchetype && archetypes.includes(c.secondaryArchetype))
  ).length;
}

const WING_POSITIONS = new Set(['WD', 'WM', 'WF']);
const CENTRAL_POSITIONS = new Set(['GK', 'CD', 'DM', 'CM', 'AM', 'CF']);

// ---------------------------------------------------------------------------
// All 12 Tactic Cards
// ---------------------------------------------------------------------------

export const ALL_TACTICS: TacticCard[] = [
  // ---- ATTACKING -----------------------------------------------------------
  {
    id: 'high_line',
    name: 'High Line',
    effect: '+15% base power — risky: opponent also gains +10%',
    flavour: '"We press from the front. The last line is courage."',
    contradicts: 'low_block',
    category: 'attacking',
    compute: (xi) => sumPower(xi) * 0.15,
  },
  {
    id: 'press_high',
    name: 'Press High',
    effect: '+20% if Engine/Destroyer in XI, else +5',
    flavour: '"Every second counts. Suffocate them early."',
    contradicts: 'sit_deep',
    category: 'attacking',
    compute: (xi) => {
      const n = countArchetypes(xi, ['Engine', 'Destroyer']);
      if (n > 0) {
        return xi
          .filter(c => ['Engine', 'Destroyer'].includes(c.archetype) || ['Engine', 'Destroyer'].includes(c.secondaryArchetype ?? ''))
          .reduce((acc, c) => acc + c.power, 0) * 0.20;
      }
      return 5;
    },
  },
  {
    id: 'wing_play',
    name: 'Wing Play',
    effect: '+10% avg power per Dribbler/Sprinter in wide slots',
    flavour: '"Stretch them. Make the pitch as wide as possible."',
    contradicts: 'narrow',
    category: 'attacking',
    compute: (xi) => {
      const wingers = xi.filter(
        c =>
          WING_POSITIONS.has(c.position) &&
          (['Dribbler', 'Sprinter'].includes(c.archetype) || ['Dribbler', 'Sprinter'].includes(c.secondaryArchetype ?? ''))
      );
      return wingers.length * avgPower(xi) * 0.10;
    },
  },
  {
    id: 'narrow',
    name: 'Narrow Shape',
    effect: '+10% avg power per Controller/Passer in central slots',
    flavour: '"Compact. Triangles everywhere. No space for them to breathe."',
    contradicts: 'wing_play',
    category: 'attacking',
    compute: (xi) => {
      const central = xi.filter(
        c =>
          CENTRAL_POSITIONS.has(c.position) &&
          (['Controller', 'Passer'].includes(c.archetype) || ['Controller', 'Passer'].includes(c.secondaryArchetype ?? ''))
      );
      return central.length * avgPower(xi) * 0.10;
    },
  },

  // ---- DEFENSIVE -----------------------------------------------------------
  {
    id: 'low_block',
    name: 'Low Block',
    effect: 'Cuts opponent power 20% — your attack down 10%',
    flavour: '"Let them have the ball. We\'ll take the three points."',
    contradicts: 'high_line',
    category: 'defensive',
    compute: () => 0,
  },
  {
    id: 'sit_deep',
    name: 'Sit Deep',
    effect: '-15% opponent, compounding -5% your attack per increment',
    flavour: '"Patience. The counter is coming. Wait for it."',
    contradicts: 'press_high',
    category: 'defensive',
    compute: () => 0,
  },
  {
    id: 'fortress',
    name: 'Fortress',
    effect: '-25% opponent first 30\', fades to 0 at 90\'',
    flavour: '"Build the wall. Make them break themselves against it."',
    category: 'defensive',
    compute: (_xi, increment) => {
      const bonuses = [30, 25, 15, 5, 0];
      return bonuses[Math.min(increment, bonuses.length - 1)] ?? 0;
    },
  },

  // ---- SPECIALIST ----------------------------------------------------------
  {
    id: 'counter_attack',
    name: 'Counter Attack',
    effect: '+25 flat after opponent scores',
    flavour: '"One touch. Three passes. Goal. They never learn."',
    contradicts: 'possession',
    category: 'specialist',
    compute: () => 25,
  },
  {
    id: 'possession',
    name: 'Possession Game',
    effect: '+5% cumulative per increment — rewards patience',
    flavour: '"The ball is ours. They can\'t score without it."',
    contradicts: 'counter_attack',
    category: 'specialist',
    compute: (xi, increment) => (increment + 1) * 8,
  },
  {
    id: 'set_piece',
    name: 'Set Piece Specialists',
    effect: '+15 per Target/Commander in XI',
    flavour: '"Every dead ball is a chance. We\'ve rehearsed them all."',
    category: 'specialist',
    compute: (xi) => countArchetypes(xi, ['Target', 'Commander']) * 15,
  },
  {
    id: 'dark_arts',
    name: 'Dark Arts',
    effect: '+20 flat, -10% opponent — 15% red card risk',
    flavour: '"They don\'t call it the beautiful game for nothing. Beautifully ugly."',
    category: 'specialist',
    compute: () => 20,
  },
  {
    id: 'youth_policy',
    name: 'Youth Policy',
    effect: '+20 per Common rarity card in XI',
    flavour: '"They\'re hungry. They have nothing to lose and everything to prove."',
    category: 'specialist',
    compute: (xi) => xi.filter(c => c.rarity === 'Common').length * 20,
  },
];

// ---------------------------------------------------------------------------
// Slot Management
// ---------------------------------------------------------------------------

export function createEmptySlots(): TacticSlots {
  return { slots: [null, null, null] };
}

export function getTacticById(id: string): TacticCard | undefined {
  return ALL_TACTICS.find(t => t.id === id);
}

export function canDeploy(
  slots: TacticSlots,
  tactic: TacticCard
): { canDeploy: boolean; wouldRemove?: string } {
  const hasFreeSlot = slots.slots.some(s => s === null);
  const alreadyDeployed = slots.slots.some(s => s?.id === tactic.id);

  if (alreadyDeployed) {
    return { canDeploy: false };
  }

  const contradicting = tactic.contradicts
    ? slots.slots.find(s => s?.id === tactic.contradicts) ?? null
    : null;

  // If a contradicting card is deployed it occupies a slot — deploying will
  // remove it, freeing the slot. We only need a free slot if nothing contradicts.
  if (contradicting) {
    return { canDeploy: true, wouldRemove: contradicting.id };
  }

  if (!hasFreeSlot) {
    return { canDeploy: false };
  }

  return { canDeploy: true };
}

export function deployTactic(
  slots: TacticSlots,
  tactic: TacticCard,
  slotIndex: number
): TacticSlots {
  const newSlots = [...slots.slots] as (TacticCard | null)[];

  // Auto-remove contradicting card from wherever it sits
  if (tactic.contradicts) {
    const contradictIdx = newSlots.findIndex(s => s?.id === tactic.contradicts);
    if (contradictIdx !== -1) {
      newSlots[contradictIdx] = null;
    }
  }

  newSlots[slotIndex] = tactic;
  return { slots: newSlots };
}

export function removeTactic(slots: TacticSlots, slotIndex: number): TacticSlots {
  const newSlots = [...slots.slots] as (TacticCard | null)[];
  newSlots[slotIndex] = null;
  return { slots: newSlots };
}

export function calculateTacticBonus(
  slots: TacticSlots,
  xi: Card[],
  increment: number
): number {
  return slots.slots.reduce((total, tactic) => {
    if (!tactic) return total;
    return total + tactic.compute(xi, increment);
  }, 0);
}

export function rehydrateTacticSlots(ids: (string | null)[]): TacticSlots {
  const slots = ids.slice(0, 3).map(id => (id ? (getTacticById(id) ?? null) : null));
  while (slots.length < 3) slots.push(null);
  return { slots: slots as (TacticCard | null)[] };
}
