import type { Card } from './scoring';
import { seededRandom } from './scoring';
import type { Connection } from './chemistry';

export interface JokerCard {
  id: string;
  name: string;
  effect: string;          // human-readable effect description
  flavour: string;         // comedic text
  rarity: 'common' | 'uncommon' | 'rare';
  compute: (xi: Card[], connections: Connection[]) => number; // returns bonus points
}

export const ALL_JOKERS: JokerCard[] = [
  {
    id: 'the_dinosaur',
    name: 'The Dinosaur',
    effect: '+30 per Target or Powerhouse in XI',
    flavour: 'Route one. Every time.',
    rarity: 'common',
    compute: (xi) => xi.filter(c => c.archetype === 'Target' || c.archetype === 'Powerhouse').length * 30,
  },
  {
    id: 'the_professor',
    name: 'The Professor',
    effect: '+25 per Controller or Passer',
    flavour: 'The game is simple.',
    rarity: 'common',
    compute: (xi) => xi.filter(c => c.archetype === 'Controller' || c.archetype === 'Passer').length * 25,
  },
  {
    id: 'the_gambler',
    name: 'The Gambler',
    effect: 'Glass and Phoenix cards get +40 power',
    flavour: 'Fortune favours the brave.',
    rarity: 'uncommon',
    compute: (xi) => xi.filter(c => c.durability === 'glass' || c.durability === 'phoenix').length * 40,
  },
  {
    id: 'youth_developer',
    name: 'Youth Developer',
    effect: '+20 per Common card in XI',
    flavour: 'Give the kids a chance.',
    rarity: 'common',
    compute: (xi) => xi.filter(c => c.rarity === 'Common').length * 20,
  },
  {
    id: 'the_mourinho',
    name: 'The Mourinho',
    effect: '+50 per Destroyer or Cover',
    flavour: 'Park the bus. Win the league.',
    rarity: 'uncommon',
    compute: (xi) => xi.filter(c => c.archetype === 'Destroyer' || c.archetype === 'Cover').length * 50,
  },
  {
    id: 'hairdryer',
    name: 'The Hairdryer',
    effect: '+80 if a Captain personality is in XI',
    flavour: "Nobody's sitting down.",
    rarity: 'rare',
    compute: (xi) => xi.some(c => c.personalityTheme === 'Captain') ? 80 : 0,
  },
  {
    id: 'chemistry_set',
    name: 'Chemistry Set',
    effect: 'Each synergy connection gives +15 extra',
    flavour: 'The whole is greater than the sum.',
    rarity: 'uncommon',
    compute: (_, connections) => connections.length * 15,
  },
  {
    id: 'scouts_eye',
    name: "Scout's Eye",
    effect: '+1 discard per match',
    flavour: 'I know a player...',
    rarity: 'rare',
    compute: () => 0, // bonus discards handled separately in hand logic
  },
];

export function applyJoker(joker: JokerCard, xi: Card[], connections: Connection[]): number {
  return joker.compute(xi, connections);
}

export function getExtraDiscards(jokers: JokerCard[]): number {
  return jokers.filter(j => j.id === 'scouts_eye').length;
}

export function getShopJokers(seed: number, count: number = 3): JokerCard[] {
  const available = [...ALL_JOKERS];
  const result: JokerCard[] = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(seededRandom(seed + i * 17) * available.length);
    result.push(available.splice(idx, 1)[0]);
  }
  return result;
}

// For serialization — joker compute functions can't be stored in localStorage
export function getJokerById(id: string): JokerCard | undefined {
  return ALL_JOKERS.find(j => j.id === id);
}

export function rehydrateJokers(ids: string[]): JokerCard[] {
  return ids.map(id => getJokerById(id)).filter((j): j is JokerCard => j !== undefined);
}
