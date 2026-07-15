import type { Card } from './scoring';
import { seededRandom } from './scoring';
import type { Connection } from './chemistry';

/**
 * The manager roster — MANAGER_ROSTER_V2 (design/handoff/manager-roster-v2.md,
 * NW-140 rewrite): 14 famous-style archetypes, replacing the old 8. Managers
 * are DATA; their match effects are flat, ledgered PointMods applied in
 * points.ts managerMods (scope × gate, per the roster's decided resolution
 * model — per-player buffs sum at lineup time, recomputed every round).
 *
 * THE LAW: every buff pays only behind its gate — contest COMMITMENT for most
 * (the engine's own T1 feeder thresholds via contestTotals().commit),
 * buildCount(aerial) for Set Pieces FC, results for Wheeler-Dealer.
 *
 * ADHERENCE: each manager has a preferred formation; his buffs pay in full
 * only when you play it. Adjacent shapes halve the package, foreign shapes
 * quarter it (rounded — small buffs die entirely in foreign shapes). The
 * Wheeler-Dealer treats every formation as native (his perk).
 *
 * Fictional names are placeholders (real-manager refs never ship).
 */

export type ManagerGate =
  | { kind: 'commit'; key: 'keep' | 'press' | 'create' | 'brk' | 'stop' | 'finish' }
  | { kind: 'buildCount'; what: 'aerial'; n: number }
  | { kind: 'results' };

export interface JokerCard {
  id: string;
  name: string;            // the manager (fictional placeholder)
  archetype: string;       // the famous-style archetype label
  philosophy: string;      // one-line persona
  traits: string[];        // readable trait tags
  nation?: string;
  effect: string;          // what the manager actually does (matches managerMods)
  flavour: string;
  rarity: 'common' | 'uncommon' | 'rare';
  /** Adherence anchor; null = all formations count native (Wheeler-Dealer). */
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
    archetype: 'POMO',
    philosophy: 'Direct, physical, relentless. Fewer chances — better ones.',
    traits: ['Direct Play', 'Set-Piece Threat'],
    nation: 'England',
    effect: 'Everyone +1 DEF; your shots convert better (+3 goal threshold). Needs a STOP-committed XI. Prefers 4-4-2.',
    flavour: 'Straight lines. No frills.',
    rarity: 'common',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'stop' },
    compute: zero,
  },
  {
    id: 'anti_football',
    name: 'Vittorio Scudieri',
    archetype: 'Anti-Football',
    philosophy: 'Concede nothing. Ever.',
    traits: ['The Wall', 'Dark Arts'],
    nation: 'Italy',
    effect: 'Everyone +1 DEF; your back line a further +1 DEF (STOP). Needs a STOP-committed XI. Prefers 5-3-2.',
    flavour: 'A 0–0 is a work of art.',
    rarity: 'common',
    preferredFormation: '5-3-2',
    gate: { kind: 'commit', key: 'stop' },
    compute: zero,
  },
  {
    id: 'tiki_taka',
    name: 'Oriol Casals',
    archetype: 'Tiki-Taka',
    philosophy: 'Keep the ball; the game cannot hurt you.',
    traits: ['Possession', 'Positional Play'],
    nation: 'Spain',
    effect: 'Your ball-players +2 ATK (KEEP). Needs a KEEP-committed XI. Prefers 4-3-3.',
    flavour: 'The ball is the best defender.',
    rarity: 'common',
    preferredFormation: '4-3-3',
    gate: { kind: 'commit', key: 'keep' },
    compute: zero,
  },
  {
    id: 'gegenpress',
    name: 'Falko Rehberg',
    archetype: 'Gegenpress',
    philosophy: 'Win it high, score in five seconds.',
    traits: ['Counter-Press', 'Heavy Metal'],
    nation: 'Germany',
    effect: 'Your forwards +1 ATK/+1 DEF, finishers a further +1 ATK. Needs a PRESS-committed XI. Prefers 4-3-3.',
    flavour: 'The press is the playmaker.',
    rarity: 'uncommon',
    preferredFormation: '4-3-3',
    gate: { kind: 'commit', key: 'press' },
    compute: zero,
  },
  {
    id: 'box_office',
    name: 'Duarte Vilaça',
    archetype: 'Box Office',
    philosophy: 'Big games, big moments, big money.',
    traits: ['Showman', 'Special One'],
    nation: 'Portugal',
    effect: 'Your finishers +1 ATK (FINISH); wins pay 25% more. Needs a FINISH-committed XI. Prefers 4-2-3-1.',
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
    archetype: 'Tinkerman',
    philosophy: 'Rotate, surprise, repeat.',
    traits: ['Rotation', 'Fresh Ideas'],
    nation: 'Italy',
    effect: 'Every substitute you bring on plays at +2 ATK/+2 DEF. Needs a CREATE-committed XI. Prefers 4-4-2.',
    flavour: 'Dilly ding, dilly dong.',
    rarity: 'uncommon',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'create' },
    compute: zero,
  },
  {
    id: 'cholismo',
    name: 'Emiliano Roldán',
    archetype: 'Cholismo',
    philosophy: 'Suffer together, win together.',
    traits: ['The Grind', 'Partido a Partido'],
    nation: 'Argentina',
    effect: 'Your midfield +1 DEF (BREAK); your back line +1 DEF (STOP). Needs a BREAK-committed XI. Prefers 4-4-2.',
    flavour: 'Effort is non-negotiable.',
    rarity: 'common',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'brk' },
    compute: zero,
  },
  {
    id: 'murderball',
    name: 'Aníbal Cornejo',
    archetype: 'Murderball',
    philosophy: 'Run more than the opponent thinks is possible.',
    traits: ['All-Out Press', 'Attrition'],
    nation: 'Argentina',
    effect: 'Your pressers +1 DEF and creators +1 ATK — but the whole XI burns fitness every period. Needs a PRESS-committed XI. Prefers 3-4-3.',
    flavour: 'Murderball. Nobody rests.',
    rarity: 'uncommon',
    preferredFormation: '3-4-3',
    gate: { kind: 'commit', key: 'press' },
    compute: zero,
  },
  {
    id: 'fergie_time',
    name: 'Alistair Craddock',
    archetype: 'Fergie Time',
    philosophy: 'Never beaten before the whistle.',
    traits: ['Late Show', 'Winner'],
    nation: 'Scotland',
    effect: 'Your finishers +1 ATK — DOUBLED in the final periods. Needs a FINISH-committed XI. Prefers 4-4-2.',
    flavour: 'Football, bloody hell.',
    rarity: 'rare',
    preferredFormation: '4-4-2',
    gate: { kind: 'commit', key: 'finish' },
    compute: zero,
  },
  {
    id: 'entertainers',
    name: 'Ronnie Fairweather',
    archetype: 'The Entertainers',
    philosophy: "We'll score more than you.",
    traits: ['All-Out Attack', 'No Brakes'],
    nation: 'England',
    effect: 'Your attackers +2 ATK — but your back line −1 DEF. Needs a FINISH-committed XI. Prefers 4-3-3.',
    flavour: 'I would love it if we beat them.',
    rarity: 'uncommon',
    preferredFormation: '4-3-3',
    gate: { kind: 'commit', key: 'finish' },
    compute: zero,
  },
  {
    id: 'total_football',
    name: 'Maarten Roos',
    archetype: 'Total Football',
    philosophy: 'Everyone attacks, everyone defends.',
    traits: ['Fluidity', 'Universality'],
    nation: 'Netherlands',
    effect: 'Ball-players and creators +1 ATK; ALL position and flank penalties waived. Needs a KEEP-committed XI. Prefers 3-4-3.',
    flavour: 'Position is a state of mind.',
    rarity: 'rare',
    preferredFormation: '3-4-3',
    gate: { kind: 'commit', key: 'keep' },
    compute: zero,
  },
  {
    id: 'set_pieces_fc',
    name: 'Gordon Blackwood',
    archetype: 'Set Pieces FC',
    philosophy: 'The corner flag is a weapon.',
    traits: ['Aerial Bombardment', 'Long Throw'],
    nation: 'Scotland',
    effect: 'Your aerial threats +1 ATK; corners convert far better (+8 threshold). Needs 3+ aerial cards (Target/Powerhouse). Prefers 5-4-1.',
    flavour: 'Get it in the mixer.',
    rarity: 'uncommon',
    preferredFormation: '5-4-1',
    gate: { kind: 'buildCount', what: 'aerial', n: 3 },
    compute: zero,
  },
  {
    id: 'wheeler_dealer',
    name: 'Les Hornby',
    archetype: 'Wheeler-Dealer',
    philosophy: 'Triffic. Pay peanuts, sell for millions.',
    traits: ['Market Genius', 'Motivator'],
    nation: 'England',
    effect: 'No match buffs — every result pays 20% more and shop refreshes are half price. At home in ANY formation.',
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
    archetype: 'Joga Bonito',
    philosophy: 'Play beautifully or not at all.',
    traits: ['Flair', 'No Handbrake'],
    nation: 'Brazil',
    effect: 'Your midfield and attack creators +1 ATK; the first goal from a CREATOR unlocks +1 ATK for every creator, rest of match. No defensive help, anywhere. Needs a CREATE-committed XI. Prefers 4-3-3.',
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
