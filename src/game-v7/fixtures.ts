import type {
  FormationDefinition,
  FormationSlot,
  PositionCode,
  Sector,
  V7ActionDefinition,
  V7ManagerCard,
  V7PlayerCard,
} from '@/engine-v7';

/**
 * Kickoff Clash V7 — deterministic development fixture for the live-match slice.
 *
 * DEVELOPMENT DATA. The frontend card models and the current database do not yet
 * emit V7 player / manager / formation / action contracts, so this fixture is
 * authored directly in V7 shape (clearly marked, never a production loader). It
 * is self-contained and deterministic: the same fixture + seed replays exactly.
 *
 * It supplies everything one V7 match needs: two managers, two legal formations,
 * two full XIs + seven-player benches, and a small set of actions the merged V7
 * engine already supports (game_start / ongoing / activated + chance cancellation).
 */

export const FIXTURE_SEED = 20260723;

// ── Actions (only V7-supported shapes) ───────────────────────────────────────

function baseAction(partial: Partial<V7ActionDefinition> & Pick<V7ActionDefinition, 'id' | 'name' | 'timing' | 'target' | 'effects' | 'duration'>): V7ActionDefinition {
  return {
    actionKey: partial.id,
    displayText: partial.displayText ?? partial.name,
    ownerType: 'player',
    conditionGroups: [],
    activationLimitPerBreak: 1,
    isNegative: false,
    copyRules: {},
    disableRules: {},
    engineSupportStatus: 'supported',
    ...partial,
  };
}

/** A kickoff talisman: +2 attack to itself for the whole match. */
const ACTION_TALISMAN = baseAction({
  id: 'act_talisman',
  name: 'Talisman',
  displayText: '+2 ATT for the whole match.',
  timing: 'game_start',
  target: { type: 'self' },
  effects: [{ type: 'modify_stat', stat: 'attack', mode: 'flat', amount: 2 }],
  duration: 'whole_match',
});

/** An ongoing wall: +2 defence to itself while active. */
const ACTION_WALL = baseAction({
  id: 'act_wall',
  name: 'Wall',
  displayText: '+2 DEF while on the pitch.',
  timing: 'ongoing',
  target: { type: 'self' },
  effects: [{ type: 'modify_stat', stat: 'defence', mode: 'flat', amount: 2 }],
  duration: 'ongoing',
});

/** An activated playmaker window: a reroll on the first centre chance this period. */
const ACTION_SPARK = baseAction({
  id: 'act_spark',
  name: 'Spark',
  displayText: 'Reroll the first centre chance.',
  timing: 'activated',
  printedCharges: 2,
  target: { type: 'chance', side: 'own', selector: 'first_in_sector', sector: 'centre' },
  effects: [{ type: 'add_reroll', count: 1 }],
  duration: 'current_period',
});

/** An activated destroyer window: cancel the enemy's first centre chance. */
const ACTION_LOCKDOWN = baseAction({
  id: 'act_lockdown',
  name: 'Lockdown',
  displayText: "Cancel the opponent's first centre chance.",
  timing: 'activated',
  printedCharges: 1,
  target: { type: 'chance', side: 'enemy', selector: 'first_in_sector', sector: 'centre' },
  effects: [{ type: 'cancel_chance', count: 1 }],
  duration: 'current_period',
});

export const FIXTURE_ACTIONS: V7ActionDefinition[] = [ACTION_TALISMAN, ACTION_WALL, ACTION_SPARK, ACTION_LOCKDOWN];

// ── Formations ────────────────────────────────────────────────────────────────

function slot(slotKey: string, positionCode: PositionCode, sector: Sector, order: number): FormationSlot {
  return { slotKey, positionCode, sector, xOrder: order, yOrder: order, adjacentSlotKeys: [], partnerLinkKeys: [] };
}

const FORMATION_433: FormationDefinition = {
  id: 'f_433',
  formationKey: '4-3-3',
  name: '4-3-3',
  slots: [
    slot('gk', 'GK', 'centre', 0),
    slot('lb', 'LB', 'left', 1), slot('lcb', 'CB', 'centre', 2), slot('rcb', 'CB', 'centre', 3), slot('rb', 'RB', 'right', 4),
    slot('lm', 'LM', 'left', 5), slot('cm', 'CM', 'centre', 6), slot('rm', 'RM', 'right', 7),
    slot('lw', 'LW', 'left', 8), slot('cf', 'CF', 'centre', 9), slot('rw', 'RW', 'right', 10),
  ],
};

const FORMATION_352: FormationDefinition = {
  id: 'f_352',
  formationKey: '3-5-2',
  name: '3-5-2',
  slots: [
    slot('gk', 'GK', 'centre', 0),
    slot('lcb', 'CB', 'centre', 1), slot('ccb', 'CB', 'centre', 2), slot('rcb', 'CB', 'centre', 3),
    slot('lwb', 'LWB', 'left', 4), slot('dm', 'DM', 'centre', 5), slot('cm', 'CM', 'centre', 6), slot('rwb', 'RWB', 'right', 7),
    slot('lf', 'LF', 'left', 8), slot('cf', 'CF', 'centre', 9),
  ].concat([slot('rf', 'RF', 'right', 10)]),
};

export const FIXTURE_FORMATIONS: FormationDefinition[] = [FORMATION_433, FORMATION_352];

// ── Card pool ─────────────────────────────────────────────────────────────────

interface CardSpec {
  id: string;
  name: string;
  position: PositionCode;
  sector: Sector;
  attack: number;
  defence: number;
  cost: number;
  role: string;
  actionIds?: string[];
}

function card(spec: CardSpec): V7PlayerCard {
  const parts = spec.name.split(' ');
  const shortName = parts.length > 1 ? `${parts[0]![0]}. ${parts[parts.length - 1]}` : spec.name;
  return {
    id: spec.id,
    cardKey: spec.id,
    name: spec.name,
    shortName,
    positionCodes: [spec.position],
    naturalSector: spec.sector,
    printedAttack: spec.attack,
    printedDefence: spec.defence,
    printedCost: spec.cost,
    role: spec.role,
    rarity: spec.cost >= 6 ? 'legendary' : spec.cost >= 5 ? 'epic' : spec.cost >= 4 ? 'rare' : spec.cost >= 3 ? 'uncommon' : 'common',
    actionIds: spec.actionIds ?? [],
  };
}

// Home squad — "Harbour City" on a 4-3-3. Attack-leaning so chances are created
// (dev balance, not a tuned meta): active ATT ≈ 59 vs opposing DEF ≈ 46.
const HOME_SPECS: CardSpec[] = [
  { id: 'h_gk', name: 'Otto Kerr', position: 'GK', sector: 'centre', attack: 1, defence: 6, cost: 4, role: 'Keeper', actionIds: ['act_wall'] },
  { id: 'h_lb', name: 'Rue Vance', position: 'LB', sector: 'left', attack: 3, defence: 4, cost: 2, role: 'Fullback' },
  { id: 'h_lcb', name: 'Dane Holt', position: 'CB', sector: 'centre', attack: 2, defence: 5, cost: 3, role: 'Wall', actionIds: ['act_wall'] },
  { id: 'h_rcb', name: 'Ivo Senn', position: 'CB', sector: 'centre', attack: 2, defence: 4, cost: 3, role: 'Anchor', actionIds: ['act_lockdown'] },
  { id: 'h_rb', name: 'Cass Ojo', position: 'RB', sector: 'right', attack: 3, defence: 4, cost: 2, role: 'Fullback' },
  { id: 'h_lm', name: 'Lio Fen', position: 'LM', sector: 'left', attack: 6, defence: 3, cost: 3, role: 'Wide' },
  { id: 'h_cm', name: 'Ren Colm', position: 'CM', sector: 'centre', attack: 7, defence: 3, cost: 4, role: 'Playmaker', actionIds: ['act_spark'] },
  { id: 'h_rm', name: 'Tave Rune', position: 'RM', sector: 'right', attack: 6, defence: 3, cost: 3, role: 'Wide' },
  { id: 'h_lw', name: 'Rai Okonkwo', position: 'LW', sector: 'left', attack: 9, defence: 2, cost: 5, role: 'Winger' },
  { id: 'h_cf', name: 'Niko Vale', position: 'CF', sector: 'centre', attack: 9, defence: 2, cost: 5, role: 'Finisher', actionIds: ['act_talisman'] },
  { id: 'h_rw', name: 'Juno Pike', position: 'RW', sector: 'right', attack: 9, defence: 2, cost: 4, role: 'Winger' },
  // Seven-player bench: goalkeeper, defenders, midfielders and attackers, with
  // affordable early-break options as well as stronger late-break choices.
  { id: 'h_b1', name: 'Sol Voss', position: 'CF', sector: 'centre', attack: 8, defence: 2, cost: 4, role: 'Poacher', actionIds: ['act_talisman'] },
  { id: 'h_b2', name: 'Umi Vale', position: 'LW', sector: 'left', attack: 7, defence: 2, cost: 3, role: 'Creator', actionIds: ['act_spark'] },
  { id: 'h_b3', name: 'Deni Ferro', position: 'CM', sector: 'centre', attack: 5, defence: 3, cost: 2, role: 'Carrier' },
  { id: 'h_b4', name: 'Pao Lin', position: 'CB', sector: 'centre', attack: 2, defence: 5, cost: 3, role: 'Marker', actionIds: ['act_wall'] },
  { id: 'h_b5', name: 'Milo Ray', position: 'RM', sector: 'right', attack: 5, defence: 2, cost: 2, role: 'Runner' },
  { id: 'h_b6', name: 'Eli Moss', position: 'GK', sector: 'centre', attack: 1, defence: 5, cost: 2, role: 'Keeper' },
  { id: 'h_b7', name: 'Sacha Neri', position: 'LB', sector: 'left', attack: 4, defence: 4, cost: 3, role: 'Fullback' },
];

// Away squad — "Iron Vale" on a 3-5-2. Active ATT ≈ 53 vs opposing DEF ≈ 42.
const AWAY_SPECS: CardSpec[] = [
  { id: 'a_gk', name: 'Bram Reef', position: 'GK', sector: 'centre', attack: 1, defence: 6, cost: 4, role: 'Keeper', actionIds: ['act_wall'] },
  { id: 'a_lcb', name: 'Sig Reed', position: 'CB', sector: 'centre', attack: 2, defence: 5, cost: 3, role: 'Wall', actionIds: ['act_wall'] },
  { id: 'a_ccb', name: 'Tomas Lock', position: 'CB', sector: 'centre', attack: 3, defence: 6, cost: 5, role: 'Anchor', actionIds: ['act_lockdown'] },
  { id: 'a_rcb', name: 'Gio Pace', position: 'CB', sector: 'centre', attack: 3, defence: 4, cost: 3, role: 'Sweeper', actionIds: ['act_lockdown'] },
  { id: 'a_lwb', name: 'Kes Rowan', position: 'LWB', sector: 'left', attack: 4, defence: 3, cost: 2, role: 'Wingback' },
  { id: 'a_dm', name: 'Malik Daro', position: 'DM', sector: 'centre', attack: 3, defence: 4, cost: 3, role: 'Screen', actionIds: ['act_wall'] },
  { id: 'a_cm', name: 'Aris Nov', position: 'CM', sector: 'centre', attack: 6, defence: 3, cost: 4, role: 'Box2box', actionIds: ['act_spark'] },
  { id: 'a_rwb', name: 'Rex Hale', position: 'RWB', sector: 'right', attack: 4, defence: 3, cost: 2, role: 'Wingback' },
  { id: 'a_lf', name: 'Bo Marsh', position: 'LF', sector: 'left', attack: 8, defence: 2, cost: 4, role: 'Winger' },
  { id: 'a_cf', name: 'Coby Wren', position: 'CF', sector: 'centre', attack: 9, defence: 2, cost: 5, role: 'Finisher', actionIds: ['act_talisman'] },
  { id: 'a_rf', name: 'Ravi Tuck', position: 'RF', sector: 'right', attack: 8, defence: 2, cost: 4, role: 'Winger' },
  // Seven-player bench mirrors the wider squad coverage available to the player.
  { id: 'a_b1', name: 'Mira Kaine', position: 'CB', sector: 'centre', attack: 2, defence: 6, cost: 3, role: 'Wall', actionIds: ['act_wall'] },
  { id: 'a_b2', name: 'Dex Falk', position: 'RF', sector: 'right', attack: 7, defence: 2, cost: 3, role: 'Creator', actionIds: ['act_spark'] },
  { id: 'a_b3', name: 'Levi Ash', position: 'CM', sector: 'centre', attack: 7, defence: 3, cost: 3, role: 'Engine' },
  { id: 'a_b4', name: 'Otis Kane', position: 'LWB', sector: 'left', attack: 4, defence: 3, cost: 2, role: 'Wingback' },
  { id: 'a_b5', name: 'Enzo Cai', position: 'CF', sector: 'centre', attack: 6, defence: 3, cost: 3, role: 'Ten', actionIds: ['act_talisman'] },
  { id: 'a_b6', name: 'Noa Flint', position: 'GK', sector: 'centre', attack: 1, defence: 5, cost: 2, role: 'Keeper' },
  { id: 'a_b7', name: 'Zed Orra', position: 'RWB', sector: 'right', attack: 5, defence: 3, cost: 3, role: 'Wingback' },
];

export const FIXTURE_CARDS: V7PlayerCard[] = [...HOME_SPECS, ...AWAY_SPECS].map(card);

// ── Squads + managers ─────────────────────────────────────────────────────────

export interface FixtureSquad {
  manager: V7ManagerCard;
  formationId: string;
  /** Starting XI card ids, in the slot order of the formation. */
  startingXI: string[];
  benchIds: string[];
}

export const HOME_SQUAD: FixtureSquad = {
  manager: { id: 'mgr_home', cardKey: 'mgr_home', name: 'The Optimist', startingBudget: 5, formationIds: ['f_433', 'f_352'], actionIds: [], rarity: 'rare' },
  formationId: 'f_433',
  startingXI: HOME_SPECS.slice(0, 11).map((s) => s.id),
  benchIds: HOME_SPECS.slice(11).map((s) => s.id),
};

export const AWAY_SQUAD: FixtureSquad = {
  manager: { id: 'mgr_away', cardKey: 'mgr_away', name: 'The Gaffer', startingBudget: 5, formationIds: ['f_352', 'f_433'], actionIds: [], rarity: 'rare' },
  formationId: 'f_352',
  startingXI: AWAY_SPECS.slice(0, 11).map((s) => s.id),
  benchIds: AWAY_SPECS.slice(11).map((s) => s.id),
};

export interface V7Fixture {
  seed: number;
  cards: V7PlayerCard[];
  actions: V7ActionDefinition[];
  formations: FormationDefinition[];
  home: FixtureSquad;
  away: FixtureSquad;
  /** Development marker so diagnostics can show data provenance. */
  source: 'fixture';
}

export function v7Fixture(): V7Fixture {
  return {
    seed: FIXTURE_SEED,
    cards: FIXTURE_CARDS,
    actions: FIXTURE_ACTIONS,
    formations: FIXTURE_FORMATIONS,
    home: HOME_SQUAD,
    away: AWAY_SQUAD,
    source: 'fixture',
  };
}
