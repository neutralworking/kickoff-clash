import type { Card } from './scoring';
import { seededRandom } from './scoring';
import type { Connection } from './chemistry';

export interface JokerCard {
  id: string;
  name: string;            // the manager (a person)
  philosophy: string;      // one-line persona
  traits: string[];        // readable trait tags (backed by managerTraits records)
  nation?: string;
  effect: string;          // what the manager actually does (matches squad-transforms.ts managerTraits)
  flavour: string;
  rarity: 'common' | 'uncommon' | 'rare';
  compute: (xi: Card[], connections: Connection[]) => number; // legacy bonus points
}

export const ALL_JOKERS: JokerCard[] = [
  {
    id: 'the_dinosaur',
    name: 'Roy Tanner',
    philosophy: 'Get it forward and win the second ball.',
    traits: ['Direct Play', 'Aerial Targets'],
    nation: 'England',
    effect: 'Targets & Powerhouses +2 ATK.',
    flavour: 'Route one. Every time.',
    rarity: 'common',
    compute: (xi) => xi.filter(c => c.archetype === 'Target' || c.archetype === 'Powerhouse').length * 30,
  },
  {
    id: 'the_professor',
    name: 'Émile Roux',
    philosophy: 'Keep the ball; the goals will come.',
    traits: ['Possession', 'Patient Build-up'],
    nation: 'France',
    effect: 'Controllers & Passers +2 ATK.',
    flavour: 'The game is simple.',
    rarity: 'common',
    compute: (xi) => xi.filter(c => c.archetype === 'Controller' || c.archetype === 'Passer').length * 25,
  },
  {
    id: 'the_gambler',
    name: 'Vince Calloway',
    philosophy: 'Fortune favours the brave.',
    traits: ['High Risk', 'Backs Mavericks'],
    nation: 'Scotland',
    effect: 'Glass & Phoenix cards +1 ATK/+1 DEF.',
    flavour: 'Fortune favours the brave.',
    rarity: 'uncommon',
    compute: (xi) => xi.filter(c => c.durability === 'glass' || c.durability === 'phoenix').length * 40,
  },
  {
    id: 'youth_developer',
    name: 'Greta Lind',
    philosophy: 'Trust the kids and they repay you.',
    traits: ['Youth Project', 'Raw Talent'],
    nation: 'Sweden',
    effect: 'Common cards +1 ATK.',
    flavour: 'Give the kids a chance.',
    rarity: 'common',
    compute: (xi) => xi.filter(c => c.rarity === 'Common').length * 20,
  },
  {
    id: 'the_mourinho',
    name: 'Aurélio Sá',
    philosophy: 'Concede nothing, punish everything.',
    traits: ['Low Block', 'Counter-Punch'],
    nation: 'Portugal',
    effect: 'Destroyers & Cover +2 DEF.',
    flavour: 'Park the bus. Win the league.',
    rarity: 'uncommon',
    compute: (xi) => xi.filter(c => c.archetype === 'Destroyer' || c.archetype === 'Cover').length * 50,
  },
  {
    id: 'hairdryer',
    name: 'Iain MacRae',
    philosophy: 'Leaders set the standard; everyone follows.',
    traits: ['Motivator', 'Leaders Thrive'],
    nation: 'Scotland',
    effect: 'With a Captain in your XI, everyone +1 ATK/+1 DEF.',
    flavour: "Nobody's sitting down.",
    rarity: 'rare',
    compute: (xi) => xi.some(c => c.personalityTheme === 'Captain') ? 80 : 0,
  },
  {
    id: 'chemistry_set',
    name: 'Marta Pires',
    philosophy: 'The whole is greater than the sum.',
    traits: ['Team Cohesion', 'Chemistry'],
    nation: 'Brazil',
    effect: 'Every card with a chemistry link +1 ATK.',
    flavour: 'The whole is greater than the sum.',
    rarity: 'uncommon',
    compute: (_, connections) => connections.length * 15,
  },
  {
    id: 'scouts_eye',
    name: 'Dieter Falk',
    philosophy: 'I always know a player.',
    traits: ['Scouting Network', 'Squad Depth'],
    nation: 'Germany',
    effect: 'Back line +1 DEF, plus an extra bench discard.',
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
