import type { Card } from './scoring';
import { seededRandom } from './scoring';
import type { Connection } from './chemistry';

/**
 * Authored 14-manager roster. The selected manager owns the available formation
 * pool and a once-per-match, 3-Energy V8 Action. Older gate and adherence fields
 * remain below only for compatibility with legacy run code; V8 does not use them.
 */

export type ManagerGate =
  | { kind: 'commit'; key: 'keep' | 'press' | 'create' | 'brk' | 'stop' | 'finish' }
  | { kind: 'buildCount'; what: 'aerial'; n: number }
  | { kind: 'results' };

export interface JokerCard {
  id: string;
  name: string;            // the manager (fictional placeholder)
  /** Real-life source used to ground identity and Action design. */
  realManagerSource?: string;
  sourceUrl?: string;
  archetype: string;       // the famous-style archetype label
  philosophy: string;      // one-line persona
  traits: string[];        // readable trait tags
  nation?: string;
  effect: string;          // printed V8 Action text
  flavour: string;
  rarity: 'common' | 'uncommon' | 'rare';
  /** Legacy adherence anchor; V8 uses manager-v8.ts formation pools. */
  preferredFormation: string | null;
  gate: ManagerGate;
  /** Economy hooks (post-match / shop). */
  winPayoutMult?: number;
  refreshDiscount?: number; // fraction off shop refresh cost
  compute: (xi: Card[], connections: Connection[]) => number; // legacy bonus points
}

const zero = () => 0;

export const ALL_JOKERS: JokerCard[] = [
  {
    id: 'pomo',
    name: 'Dean Prowse',
    realManagerSource: 'Sam Allardyce',
    sourceUrl: 'https://en.wikipedia.org/wiki/Sam_Allardyce',
    archetype: 'POMO',
    philosophy: 'Direct, physical, relentless. Fewer chances — better ones.',
    traits: ['Direct Play', 'Set-Piece Threat'],
    nation: 'England',
    effect: 'Players here add +2 ATT each this period. A DEF play feeds that bonus into MID.',
    flavour: 'Straight lines. No frills.',
    rarity: 'common',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'stop' },
    compute: zero,
  },
  {
    id: 'anti_football',
    name: 'Vittorio Scudieri',
    realManagerSource: 'Helenio Herrera',
    sourceUrl: 'https://en.wikipedia.org/wiki/Helenio_Herrera',
    archetype: 'Anti-Football',
    philosophy: 'Concede nothing. Ever.',
    traits: ['Catenaccio', 'Dark Arts'],
    nation: 'Argentina / France',
    effect: 'Players here add +2 DEF each this period, or +3 DEF each when played in DEF.',
    flavour: 'A 0–0 is a work of art.',
    rarity: 'common',
    preferredFormation: '5-3-2',
    gate: { kind: 'commit', key: 'stop' },
    compute: zero,
  },
  {
    id: 'tiki_taka',
    name: 'Oriol Casals',
    realManagerSource: 'Pep Guardiola',
    sourceUrl: 'https://en.wikipedia.org/wiki/Pep_Guardiola',
    archetype: 'Tiki-Taka',
    philosophy: 'Keep the ball; the game cannot hurt you.',
    traits: ['Positional Play', 'Possession'],
    nation: 'Spain',
    effect: 'Players here add +1 ATT and +1 DEF each this period.',
    flavour: 'The ball is the best defender.',
    rarity: 'common',
    preferredFormation: '4-3-3',
    gate: { kind: 'commit', key: 'keep' },
    compute: zero,
  },
  {
    id: 'gegenpress',
    name: 'Falko Rehberg',
    realManagerSource: 'Jürgen Klopp',
    sourceUrl: 'https://en.wikipedia.org/wiki/J%C3%BCrgen_Klopp',
    archetype: 'Gegenpress',
    philosophy: 'Win it high, score in five seconds.',
    traits: ['Counter-Press', 'Heavy Metal'],
    nation: 'Germany',
    effect: 'Players here add +1 ATT and +1 DEF each; add another +2 ATT if the facing opponent zone is occupied.',
    flavour: 'The press is the playmaker.',
    rarity: 'uncommon',
    preferredFormation: '4-3-3',
    gate: { kind: 'commit', key: 'press' },
    compute: zero,
  },
  {
    id: 'box_office',
    name: 'Duarte Vilaça',
    realManagerSource: 'José Mourinho',
    sourceUrl: 'https://en.wikipedia.org/wiki/Jos%C3%A9_Mourinho',
    archetype: 'Box Office',
    philosophy: 'Big games, big moments, big money.',
    traits: ['Park the Bus', 'Special One'],
    nation: 'Portugal',
    effect: 'Players here add +3 DEF each this period, but your team loses 2 ATT.',
    flavour: 'Please, do not call me arrogant.',
    rarity: 'rare',
    preferredFormation: '4-2-3-1',
    gate: { kind: 'commit', key: 'finish' },
    winPayoutMult: 1.25,
    compute: zero,
  },
  {
    id: 'tinkerman',
    name: 'Aurelio Benti',
    realManagerSource: 'Claudio Ranieri',
    sourceUrl: 'https://en.wikipedia.org/wiki/Claudio_Ranieri',
    archetype: 'Tinkerman',
    philosophy: 'Rotate, surprise, repeat.',
    traits: ['Rotation', 'Fresh Ideas'],
    nation: 'Italy',
    effect: 'Players here add +1 ATT and +1 DEF each this period. Draw the next player from your deck.',
    flavour: 'Dilly ding, dilly dong.',
    rarity: 'uncommon',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'create' },
    compute: zero,
  },
  {
    id: 'cholismo',
    name: 'Emiliano Roldán',
    realManagerSource: 'Diego Simeone',
    sourceUrl: 'https://en.wikipedia.org/wiki/Diego_Simeone',
    archetype: 'Cholismo',
    philosophy: 'Suffer together, win together.',
    traits: ['Low Block', 'Partido a Partido'],
    nation: 'Argentina',
    effect: 'Players here add +3 DEF each while level or behind, or +2 DEF each while ahead.',
    flavour: 'Effort is non-negotiable.',
    rarity: 'common',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'brk' },
    compute: zero,
  },
  {
    id: 'murderball',
    name: 'Aníbal Cornejo',
    realManagerSource: 'Marcelo Bielsa',
    sourceUrl: 'https://en.wikipedia.org/wiki/Marcelo_Bielsa',
    archetype: 'Murderball',
    philosophy: 'Run more than the opponent thinks is possible.',
    traits: ['Murderball', 'Attrition'],
    nation: 'Argentina',
    effect: 'Players here add +2 ATT and +2 DEF each this period. Facing opponents add +1 ATT each.',
    flavour: 'Murderball. Nobody rests.',
    rarity: 'uncommon',
    preferredFormation: '3-4-3',
    gate: { kind: 'commit', key: 'press' },
    compute: zero,
  },
  {
    id: 'fergie_time',
    name: 'Alistair Craddock',
    realManagerSource: 'Alex Ferguson',
    sourceUrl: 'https://en.wikipedia.org/wiki/Alex_Ferguson',
    archetype: 'Fergie Time',
    philosophy: 'Never beaten before the whistle.',
    traits: ['Fergie Time', 'Winner'],
    nation: 'Scotland',
    effect: 'Players here add +1 ATT each this period, or +3 ATT each in Period 4.',
    flavour: 'Football, bloody hell.',
    rarity: 'rare',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'finish' },
    compute: zero,
  },
  {
    id: 'entertainers',
    name: 'Ronnie Fairweather',
    realManagerSource: 'Kevin Keegan',
    sourceUrl: 'https://en.wikipedia.org/wiki/Kevin_Keegan',
    archetype: 'The Entertainers',
    philosophy: "We'll score more than you.",
    traits: ['All-Out Attack', 'No Brakes'],
    nation: 'England',
    effect: 'Players here add +3 ATT each and lose 1 DEF each this period.',
    flavour: 'I would love it if we beat them.',
    rarity: 'uncommon',
    preferredFormation: '4-3-3',
    gate: { kind: 'commit', key: 'finish' },
    compute: zero,
  },
  {
    id: 'total_football',
    name: 'Maarten Roos',
    realManagerSource: 'Rinus Michels',
    sourceUrl: 'https://en.wikipedia.org/wiki/Rinus_Michels',
    archetype: 'Total Football',
    philosophy: 'Everyone attacks, everyone defends.',
    traits: ['Fluidity', 'Universality'],
    nation: 'Netherlands',
    effect: 'Every deployed player adds +1 ATT and +1 DEF this period.',
    flavour: 'Position is a state of mind.',
    rarity: 'rare',
    preferredFormation: '3-4-3',
    gate: { kind: 'commit', key: 'keep' },
    compute: zero,
  },
  {
    id: 'set_pieces_fc',
    name: 'Gordon Blackwood',
    realManagerSource: 'Tony Pulis',
    sourceUrl: 'https://en.wikipedia.org/wiki/Tony_Pulis',
    archetype: 'Set Pieces FC',
    philosophy: 'The corner flag is a weapon.',
    traits: ['Aerial Bombardment', 'Long Throw'],
    nation: 'Wales',
    effect: 'Create a Corner this period: +3 ATT, plus +1 ATT for every player here.',
    flavour: 'Get it in the mixer.',
    rarity: 'uncommon',
    preferredFormation: '5-4-1',
    gate: { kind: 'buildCount', what: 'aerial', n: 3 },
    compute: zero,
  },
  {
    id: 'wheeler_dealer',
    name: 'Les Hornby',
    realManagerSource: 'Harry Redknapp',
    sourceUrl: 'https://en.wikipedia.org/wiki/Harry_Redknapp',
    archetype: 'Wheeler-Dealer',
    philosophy: 'Triffic. Pay peanuts, sell for millions.',
    traits: ['Arm Around the Shoulder', 'Motivator'],
    nation: 'England',
    effect: 'The highest-Cost player here gets +3 ATT and +3 DEF this period.',
    flavour: 'No mugs here, son.',
    rarity: 'rare',
    preferredFormation: null,
    gate: { kind: 'results' },
    winPayoutMult: 1.2,
    refreshDiscount: 0.5,
    compute: zero,
  },
  {
    id: 'joga_bonito',
    name: 'Otávio Bragança',
    realManagerSource: 'Telê Santana',
    sourceUrl: 'https://en.wikipedia.org/wiki/Tel%C3%AA_Santana',
    archetype: 'Joga Bonito',
    philosophy: 'Play beautifully or not at all.',
    traits: ['Joga Bonito', 'No Handbrake'],
    nation: 'Brazil',
    effect: 'Players here add +2 ATT each this period; an ATT play adds another +2 ATT.',
    flavour: 'The beautiful game, or nothing.',
    rarity: 'uncommon',
    preferredFormation: '4-3-3',
    gate: { kind: 'commit', key: 'create' },
    compute: zero,
  },
];

/** Adherence bands: a manager's buffs pay ×1 in his preferred formation,
 *  ×0.5 in an ADJACENT shape, ×0.25 in a foreign one (rounded; ±1 buffs die
 *  in foreign shapes). Adjacency is DATA — the classic 8-formation set. */
export const FORMATION_ADJACENCY: Record<string, string[]> = {
  '4-4-2': ['4-2-3-1', '4-1-2-1-2', '5-4-1'],
  '4-3-3': ['3-4-3', '4-2-3-1', '3-5-2'],
  '4-2-3-1': ['4-4-2', '4-3-3', '4-1-2-1-2'],
  '4-1-2-1-2': ['4-4-2', '4-2-3-1', '3-5-2'],
  '3-5-2': ['3-4-3', '5-3-2', '4-1-2-1-2'],
  '3-4-3': ['4-3-3', '3-5-2'],
  '5-3-2': ['5-4-1', '3-5-2'],
  '5-4-1': ['5-3-2', '4-4-2'],
};

export type AdherenceBand = 'native' | 'adjacent' | 'foreign';

export function adherenceBand(joker: JokerCard, formationId: string): AdherenceBand {
  if (!joker.preferredFormation) return 'native'; // Wheeler-Dealer's perk
  if (joker.preferredFormation === formationId) return 'native';
  return (FORMATION_ADJACENCY[joker.preferredFormation] ?? []).includes(formationId) ? 'adjacent' : 'foreign';
}

export const ADHERENCE_MULT: Record<AdherenceBand, number> = { native: 1, adjacent: 0.5, foreign: 0.25 };

export function applyJoker(joker: JokerCard, xi: Card[], connections: Connection[]): number {
  return joker.compute(xi, connections);
}

/** Legacy hook (the old scout perk retired with the 8-roster). */
export function getExtraDiscards(_jokers: JokerCard[]): number {
  return 0;
}

/** Post-match payout multiplier from the bench (Box Office / Wheeler-Dealer). */
export function payoutMult(jokers: JokerCard[]): number {
  return jokers.reduce((m, j) => m * (j.winPayoutMult ?? 1), 1);
}

/** Shop-refresh discount fraction (Wheeler-Dealer). */
export function refreshDiscount(jokers: JokerCard[]): number {
  return Math.min(0.75, jokers.reduce((d, j) => d + (j.refreshDiscount ?? 0), 0));
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
