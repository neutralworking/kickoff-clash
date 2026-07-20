/**
 * Kickoff Clash V6 — self-contained fixture pool (handoff §`fixtures.ts`).
 *
 * ~48 prototype cards + four decks (managers). Kept SEPARATE from legacy card
 * power — V6 gameplay data is cost + ATT/DEF + sector + actions only. Stat
 * budgets follow `STAT_BUDGET_BY_COST` with an ATT bias; most cards carry one
 * action; the legendaries carry two (and shed ~2 raw stat points, per handoff).
 *
 * Four archetypes the sim compares:
 *   • Aggressive — high-ATT starters, add-chance / faces payloads.
 *   • Flexible   — cheap, discount / move-sector / reactive subs.
 *   • Defensive  — high-DEF starters, cancel-chance / enemy-debuff closers.
 *   • Combo      — faces + reroll + add-chance stackers (the A2 skill ceiling).
 */

import type { CardFilter, CardInPlay, Rarity, Sector, TeamSide, V6Action, V6Card, V6MatchState } from './types';
import { initialPriority } from './priority';

// ── Action shorthands (typed to V6Action) ───────────────────────────────────

const atk = (amount: number, trigger: V6Action['trigger'] = 'ongoing', scope: 'self' | 'sector' | 'team' = 'sector'): V6Action =>
  ({ kind: 'modify_attack', trigger, amount, target: { scope }, duration: trigger === 'on_reveal' ? 'period' : 'ongoing' });
const def = (amount: number, trigger: V6Action['trigger'] = 'ongoing', scope: 'self' | 'sector' | 'team' = 'sector'): V6Action =>
  ({ kind: 'modify_defence', trigger, amount, target: { scope }, duration: trigger === 'on_reveal' ? 'period' : 'ongoing' });
const faces = (fs: (1 | 2 | 3 | 4 | 5 | 6)[], which: 'first_in_sector' | 'all_in_sector' = 'first_in_sector'): V6Action =>
  ({ kind: 'improve_die_faces', trigger: 'ongoing', faces: fs, target: { which }, duration: 'ongoing' });
const reroll = (count = 1, which: 'first_in_sector' | 'all_in_sector' = 'first_in_sector'): V6Action =>
  ({ kind: 'reroll_die', trigger: 'ongoing', target: { which }, count });
const addChance = (count = 1, trigger: V6Action['trigger'] = 'on_reveal'): V6Action =>
  ({ kind: 'add_chance', trigger, target: {}, count });
const cancel = (count = 1, trigger: V6Action['trigger'] = 'on_reveal'): V6Action =>
  ({ kind: 'cancel_chance', trigger, target: {}, count });
const enemyAtk = (amount: number): V6Action =>
  ({ kind: 'modify_enemy_attack', trigger: 'ongoing', amount, target: { scope: 'sector' }, duration: 'ongoing' });
const discount = (amount: number, filter?: CardFilter): V6Action =>
  ({ kind: 'discount_cost', trigger: 'on_bench', amount, filter });
const move = (target: Sector): V6Action => ({ kind: 'move_sector', trigger: 'on_reveal', target });
const reactAtk = (amount: number): V6Action => ({ kind: 'modify_attack', trigger: 'when_subbed_on', amount, target: { scope: 'sector' }, duration: 'period' });

// ── Pool spec ────────────────────────────────────────────────────────────────

interface Spec {
  name: string;
  sector: Sector;
  cost: number;
  att: number;
  def: number;
  rarity: Rarity;
  role: string;
  position: string;
  actions: V6Action[];
}

const short = (name: string): string => {
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
};

// Explicit specs — grouped by archetype for legibility. ATT-plentiful overall.
const SPECS: Spec[] = [
  // ── Aggressive attackers (wings + centre, ATT bias) ──
  { name: 'Niko Vale', sector: 'centre', cost: 6, att: 9, def: 2, rarity: 'legendary', role: 'Finisher', position: 'CF', actions: [atk(2, 'on_reveal'), faces([5, 6])] },
  { name: 'Sol Voss', sector: 'centre', cost: 5, att: 8, def: 3, rarity: 'epic', role: 'Poacher', position: 'CF', actions: [faces([5, 6])] },
  { name: 'Rai Okonkwo', sector: 'left', cost: 5, att: 8, def: 2, rarity: 'epic', role: 'Winger', position: 'LW', actions: [addChance(1)] },
  { name: 'Juno Pike', sector: 'right', cost: 4, att: 7, def: 2, rarity: 'rare', role: 'Winger', position: 'RW', actions: [atk(2, 'on_reveal')] },
  { name: 'Bo Marsh', sector: 'left', cost: 4, att: 7, def: 2, rarity: 'rare', role: 'Winger', position: 'LW', actions: [reroll(1)] },
  { name: 'Enzo Cai', sector: 'centre', cost: 4, att: 6, def: 3, rarity: 'rare', role: 'Ten', position: 'AM', actions: [atk(1)] },
  { name: 'Tave Rune', sector: 'right', cost: 3, att: 5, def: 2, rarity: 'uncommon', role: 'Wide', position: 'RM', actions: [atk(1)] },
  { name: 'Lio Fen', sector: 'left', cost: 3, att: 5, def: 3, rarity: 'uncommon', role: 'Wide', position: 'LM', actions: [atk(1) ] },
  { name: 'Kip Sol', sector: 'centre', cost: 3, att: 5, def: 2, rarity: 'uncommon', role: 'Runner', position: 'CM', actions: [atk(1, 'on_reveal')] },
  { name: 'Ade Boro', sector: 'right', cost: 2, att: 4, def: 1, rarity: 'common', role: 'Wide', position: 'RM', actions: [atk(1)] },
  { name: 'Cy Dell', sector: 'left', cost: 2, att: 4, def: 1, rarity: 'common', role: 'Wide', position: 'LM', actions: [atk(1)] },
  { name: 'Milo Ray', sector: 'centre', cost: 2, att: 4, def: 1, rarity: 'common', role: 'Runner', position: 'CM', actions: [reactAtk(1)] },

  // ── Combo enablers (faces / reroll / add-chance) — the A2 skill lever, kept
  //    mostly first-in-sector so only a dedicated stack reaches high conversion.
  { name: 'Isa Dane', sector: 'centre', cost: 6, att: 8, def: 3, rarity: 'legendary', role: 'Maestro', position: 'AM', actions: [faces([5, 6]), reroll(1)] },
  { name: 'Ren Colm', sector: 'centre', cost: 5, att: 7, def: 3, rarity: 'epic', role: 'Playmaker', position: 'CM', actions: [faces([5, 6])] },
  { name: 'Umi Vale', sector: 'left', cost: 4, att: 6, def: 2, rarity: 'rare', role: 'Creator', position: 'LW', actions: [reroll(1)] },
  { name: 'Dex Falk', sector: 'right', cost: 4, att: 6, def: 3, rarity: 'rare', role: 'Creator', position: 'RW', actions: [faces([5, 6])] },
  { name: 'Nael Ortiz', sector: 'centre', cost: 3, att: 4, def: 3, rarity: 'uncommon', role: 'Link', position: 'CM', actions: [faces([5, 6])] },

  // ── Flexible utility (cheap, discount / move / reactive) ──
  { name: 'Bax Rami', sector: 'centre', cost: 1, att: 2, def: 1, rarity: 'common', role: 'Utility', position: 'CM', actions: [discount(1)] },
  { name: 'Tom Flint', sector: 'left', cost: 2, att: 4, def: 1, rarity: 'common', role: 'Impact', position: 'LM', actions: [reactAtk(1)] },
  { name: 'Val Marr', sector: 'left', cost: 3, att: 5, def: 3, rarity: 'uncommon', role: 'Rover', position: 'LM', actions: [move('centre')] },
  { name: 'Cass Ojo', sector: 'right', cost: 3, att: 5, def: 3, rarity: 'uncommon', role: 'Rover', position: 'RM', actions: [move('centre')] },
  { name: 'Rio Bast', sector: 'centre', cost: 2, att: 3, def: 2, rarity: 'common', role: 'Spark', position: 'CM', actions: [atk(2, 'on_reveal')] },
  { name: 'Nel Adu', sector: 'left', cost: 1, att: 2, def: 1, rarity: 'common', role: 'Squad', position: 'LM', actions: [discount(1)] },
  { name: 'Wyn Poll', sector: 'right', cost: 1, att: 2, def: 1, rarity: 'common', role: 'Squad', position: 'RM', actions: [reactAtk(1)] },

  // ── Defensive / closing (DEF bias, cancel / debuff) ──
  { name: 'Tomas Lock', sector: 'centre', cost: 6, att: 3, def: 8, rarity: 'legendary', role: 'Anchor', position: 'CB', actions: [def(2), cancel(1, 'on_reveal')] },
  { name: 'Mira Kaine', sector: 'centre', cost: 5, att: 2, def: 8, rarity: 'epic', role: 'Wall', position: 'CB', actions: [def(2)] },
  { name: 'Sig Reed', sector: 'left', cost: 4, att: 2, def: 6, rarity: 'rare', role: 'Fullback', position: 'LB', actions: [def(1)] },
  { name: 'Ode Vance', sector: 'right', cost: 4, att: 3, def: 6, rarity: 'rare', role: 'Fullback', position: 'RB', actions: [enemyAtk(-1)] },
  { name: 'Pao Lin', sector: 'left', cost: 3, att: 2, def: 5, rarity: 'uncommon', role: 'Marker', position: 'LB', actions: [def(1)] },
  { name: 'Malik Daro', sector: 'centre', cost: 3, att: 2, def: 5, rarity: 'uncommon', role: 'Screen', position: 'DM', actions: [def(1, 'on_reveal')] },
  { name: 'Rex Hale', sector: 'right', cost: 3, att: 3, def: 5, rarity: 'uncommon', role: 'Marker', position: 'RB', actions: [enemyAtk(-1)] },
  { name: 'Ivo Senn', sector: 'centre', cost: 2, att: 2, def: 3, rarity: 'common', role: 'Cover', position: 'DM', actions: [def(1)] },
  { name: 'Kes Rowan', sector: 'left', cost: 2, att: 1, def: 4, rarity: 'common', role: 'Cover', position: 'LB', actions: [def(1)] },
  { name: 'Bram Reef', sector: 'right', cost: 2, att: 1, def: 4, rarity: 'common', role: 'Cover', position: 'RB', actions: [cancel(1, 'on_reveal')] },
  { name: 'Gio Pace', sector: 'centre', cost: 4, att: 3, def: 6, rarity: 'rare', role: 'Sweeper', position: 'CB', actions: [cancel(1, 'on_reveal')] },

  // ── Balanced filler (fills sector depth) ──
  { name: 'Aris Nov', sector: 'centre', cost: 4, att: 5, def: 4, rarity: 'rare', role: 'Box2box', position: 'CM', actions: [atk(1)] },
  { name: 'Deni Ferro', sector: 'centre', cost: 3, att: 4, def: 3, rarity: 'uncommon', role: 'Carrier', position: 'CM', actions: [atk(1)] },
  { name: 'Otis Kane', sector: 'left', cost: 3, att: 4, def: 3, rarity: 'uncommon', role: 'Wingback', position: 'LB', actions: [atk(1, 'on_reveal')] },
  { name: 'Pier Sol', sector: 'right', cost: 3, att: 4, def: 3, rarity: 'uncommon', role: 'Wingback', position: 'RB', actions: [atk(1, 'on_reveal')] },
  { name: 'Levi Ash', sector: 'centre', cost: 5, att: 7, def: 4, rarity: 'epic', role: 'Engine', position: 'CM', actions: [atk(2, 'on_reveal')] },
  { name: 'Ugo Bell', sector: 'left', cost: 2, att: 3, def: 2, rarity: 'common', role: 'Wide', position: 'LM', actions: [atk(1)] },
  { name: 'Zane Roos', sector: 'right', cost: 2, att: 3, def: 2, rarity: 'common', role: 'Wide', position: 'RM', actions: [atk(1)] },
  { name: 'Fabi Ono', sector: 'centre', cost: 1, att: 2, def: 1, rarity: 'common', role: 'Squad', position: 'CM', actions: [reactAtk(1)] },
  { name: 'Hugo Selk', sector: 'left', cost: 4, att: 6, def: 3, rarity: 'rare', role: 'Winger', position: 'LW', actions: [faces([5, 6])] },
  { name: 'Ravi Tuck', sector: 'right', cost: 5, att: 8, def: 3, rarity: 'epic', role: 'Winger', position: 'RW', actions: [addChance(1)] },
  { name: 'Coby Wren', sector: 'right', cost: 6, att: 9, def: 2, rarity: 'legendary', role: 'Finisher', position: 'RW', actions: [atk(2, 'on_reveal'), reroll(1)] },
  { name: 'Sami Roux', sector: 'left', cost: 6, att: 8, def: 4, rarity: 'legendary', role: 'Talisman', position: 'LW', actions: [faces([5, 6], 'all_in_sector'), atk(1)] },
];

export const V6_CARD_POOL: V6Card[] = SPECS.map((sp, i) => ({
  id: `v6_${String(i + 1).padStart(3, '0')}`,
  name: sp.name,
  shortName: short(sp.name),
  position: sp.position,
  role: sp.role,
  sector: sp.sector,
  cost: sp.cost,
  attack: sp.att,
  defence: sp.def,
  rarity: sp.rarity,
  actions: sp.actions,
}));

export const V6_POOL_BY_ID: Record<string, V6Card> = Object.fromEntries(V6_CARD_POOL.map((c) => [c.id, c]));
const byName = (name: string): V6Card => {
  const c = V6_CARD_POOL.find((x) => x.name === name);
  if (!c) throw new Error(`fixture card not found: ${name}`);
  return c;
};

// ── Decks (managers) ─────────────────────────────────────────────────────────

export type DeckStyle = 'aggressive' | 'flexible' | 'defensive' | 'combo';

export interface V6Deck {
  id: string;
  name: string;
  style: DeckStyle;
  startingXI: string[]; // 11 card ids
  bench: string[]; // 7 card ids
}

const ids = (...names: string[]): string[] => names.map((n) => byName(n).id);

export const V6_DECKS: V6Deck[] = [
  {
    id: 'aggressive',
    name: 'Full Throttle',
    style: 'aggressive',
    // Moderate ATT with cover (stars wait on the bench): sector ATT≈DEF ~12–15.
    startingXI: ids(
      'Lio Fen', 'Otis Kane', 'Cy Dell', 'Sig Reed', // left
      'Enzo Cai', 'Aris Nov', 'Malik Daro', 'Ivo Senn', // centre
      'Pier Sol', 'Cass Ojo', 'Ode Vance', // right
    ),
    bench: ids('Niko Vale', 'Sol Voss', 'Juno Pike', 'Rio Bast', 'Milo Ray', 'Bax Rami', 'Nel Adu'),
  },
  {
    id: 'flexible',
    name: 'Total Rotation',
    style: 'flexible',
    // Balanced, cheap, mobile: sector ATT ~11–15, DEF ~10–12.
    startingXI: ids(
      'Lio Fen', 'Cy Dell', 'Ugo Bell', 'Kes Rowan',
      'Deni Ferro', 'Aris Nov', 'Malik Daro',
      'Tave Rune', 'Pier Sol', 'Zane Roos', 'Rex Hale',
    ),
    bench: ids('Val Marr', 'Tom Flint', 'Nel Adu', 'Wyn Poll', 'Rio Bast', 'Otis Kane', 'Enzo Cai'),
  },
  {
    id: 'defensive',
    name: 'Iron Vale',
    style: 'defensive',
    // DEF-heavy, low ATT: concedes little, grinds — sector DEF ~15–18.
    startingXI: ids(
      'Sig Reed', 'Pao Lin', 'Kes Rowan',
      'Gio Pace', 'Malik Daro', 'Ivo Senn', 'Enzo Cai',
      'Ode Vance', 'Rex Hale', 'Bram Reef', 'Pier Sol',
    ),
    bench: ids('Mira Kaine', 'Otis Kane', 'Sol Voss', 'Rio Bast', 'Bax Rami', 'Nael Ortiz', 'Cass Ojo'),
  },
  {
    id: 'combo',
    name: 'Clockwork',
    style: 'combo',
    // Faces/reroll enablers on a balanced spine — the A2 skill-ceiling deck.
    startingXI: ids(
      'Umi Vale', 'Cy Dell', 'Otis Kane',
      'Isa Dane', 'Nael Ortiz', 'Malik Daro', 'Ivo Senn',
      'Dex Falk', 'Tave Rune', 'Zane Roos', 'Ode Vance',
    ),
    bench: ids('Niko Vale', 'Sol Voss', 'Ren Colm', 'Rio Bast', 'Milo Ray', 'Bax Rami', 'Hugo Selk'),
  },
];

export const V6_DECK_BY_ID: Record<string, V6Deck> = Object.fromEntries(V6_DECKS.map((d) => [d.id, d]));

// ── Squad + initial state ────────────────────────────────────────────────────

function deckCards(deck: V6Deck): CardInPlay[] {
  const xi: CardInPlay[] = deck.startingXI.map((id) => ({ cardId: id, zone: 'active', sector: V6_POOL_BY_ID[id].sector }));
  const bench: CardInPlay[] = deck.bench.map((id) => ({ cardId: id, zone: 'bench', sector: V6_POOL_BY_ID[id].sector }));
  return [...xi, ...bench];
}

/** Build the kickoff match state for two decks. Both benches are visible from kickoff. */
export function buildInitialState(playerDeckId: string, opponentDeckId: string, seed: number): V6MatchState {
  const pDeck = V6_DECK_BY_ID[playerDeckId] ?? V6_DECKS[0];
  const oDeck = V6_DECK_BY_ID[opponentDeckId] ?? V6_DECKS[0];
  const pool: Record<string, V6Card> = { ...V6_POOL_BY_ID };
  const mkTeam = (side: TeamSide, deck: V6Deck) => ({
    side,
    managerId: deck.id,
    name: deck.name,
    cards: deckCards(deck),
    effects: [],
    score: 0,
  });
  return {
    seed,
    period: 1,
    breakIndex: 0,
    priority: initialPriority(seed),
    energy: 0,
    player: mkTeam('player', pDeck),
    opponent: mkTeam('opponent', oDeck),
    cardPool: pool,
    log: [{ type: 'kickoff', seed, priority: initialPriority(seed) }],
  };
}
