import type {
  FormationDefinition,
  FormationSlot as V7FormationSlot,
  PositionCode,
  Rarity,
  Sector,
  V7ManagerCard,
  V7PlayerCard,
} from '@/engine-v7';
import { getFormation, type Formation, type FormationSlot } from '@/lib/formations';
import type { HandState } from '@/lib/hand';
import type { JokerCard } from '@/lib/jokers';
import { generateOpponentXI, cupMatchPower } from '@/lib/opponent';
import { buildMatchSeed, cupSize, getOpponent, type RunState } from '@/lib/run';
import type { Card } from '@/lib/scoring';
import { adaptPlayerCard } from './adapter/cards';
import type { FixtureSquad, V7Fixture } from './fixtures';

const rarityOf = (rarity: string | undefined): Rarity => {
  const value = (rarity ?? '').toLowerCase();
  if (value === 'legendary' || value === 'epic' || value === 'rare' || value === 'uncommon') return value;
  return 'common';
};

function sectorForSlot(slot: FormationSlot, siblings: readonly FormationSlot[]): Sector {
  if (slot.type === 'FB' || slot.type === 'WM' || slot.type === 'WF') return slot.x < 50 ? 'left' : 'right';
  if (slot.type === 'AM' && siblings.filter((candidate) => candidate.type === 'AM').length > 1) {
    return slot.x < 40 ? 'left' : slot.x > 60 ? 'right' : 'centre';
  }
  if (slot.type === 'CF' && siblings.filter((candidate) => candidate.type === 'CF').length > 1) {
    return slot.x < 50 ? 'left' : 'right';
  }
  return 'centre';
}

function positionForSlot(slot: FormationSlot, siblings: readonly FormationSlot[]): PositionCode {
  switch (slot.type) {
    case 'GK': return 'GK';
    case 'CB': return 'CB';
    case 'FB': return slot.x < 50 ? 'LB' : 'RB';
    case 'DM': return 'DM';
    case 'CM': return 'CM';
    case 'WM': return slot.x < 50 ? 'LM' : 'RM';
    case 'AM': return 'AM';
    case 'WF': return slot.x < 50 ? 'LW' : 'RW';
    case 'CF': {
      const count = siblings.filter((candidate) => candidate.type === 'CF').length;
      if (count <= 1) return 'CF';
      return slot.x < 50 ? 'LF' : 'RF';
    }
    default: return 'CM';
  }
}

function slotKey(slot: FormationSlot, index: number, siblings: readonly FormationSlot[]): string {
  const same = siblings.filter((candidate) => candidate.type === slot.type).sort((a, b) => a.x - b.x);
  const rank = same.indexOf(slot);
  switch (slot.type) {
    case 'GK': return 'gk';
    case 'FB': return slot.x < 50 ? 'lb' : 'rb';
    case 'CB': return same.length === 3 ? ['lcb', 'ccb', 'rcb'][rank] ?? `cb${rank}` : ['lcb', 'rcb'][rank] ?? `cb${rank}`;
    case 'DM': return same.length === 1 ? 'dm' : ['ldm', 'rdm'][rank] ?? `dm${rank}`;
    case 'CM': return same.length === 1 ? 'cm' : same.length === 2 ? ['lcm', 'rcm'][rank] ?? `cm${rank}` : ['lcm', 'cm', 'rcm'][rank] ?? `cm${rank}`;
    case 'WM': return slot.x < 50 ? 'lm' : 'rm';
    case 'AM': return same.length === 1 ? 'am' : ['lam', 'ram'][rank] ?? `am${rank}`;
    case 'WF': return slot.x < 50 ? 'lw' : 'rw';
    case 'CF': return same.length === 1 ? 'cf' : ['lf', 'rf'][rank] ?? `cf${rank}`;
    default: return `slot-${index}`;
  }
}

export function adaptLiveFormation(formation: Formation): FormationDefinition {
  return {
    id: `live-formation-${formation.id}`,
    formationKey: formation.id,
    name: formation.name,
    slots: formation.slots.map((slot, index): V7FormationSlot => ({
      slotKey: slotKey(slot, index, formation.slots),
      positionCode: positionForSlot(slot, formation.slots),
      sector: sectorForSlot(slot, formation.slots),
      xOrder: Math.round(slot.x),
      yOrder: Math.round(slot.y),
      adjacentSlotKeys: [],
      partnerLinkKeys: [],
    })),
  };
}

function sidedPosition(code: PositionCode, sector: Sector): PositionCode {
  if (sector === 'left') {
    if (code === 'RB') return 'LB';
    if (code === 'RM') return 'LM';
    if (code === 'RW') return 'LW';
    if (code === 'RWB') return 'LWB';
  }
  if (sector === 'right') {
    if (code === 'LB') return 'RB';
    if (code === 'LM') return 'RM';
    if (code === 'LW') return 'RW';
    if (code === 'LWB') return 'RWB';
  }
  return code;
}

function adaptCard(card: Card, id: string, naturalSector?: Sector): V7PlayerCard {
  const adapted = adaptPlayerCard(card);
  if (!adapted.ok) throw new Error(adapted.error.message);
  const sector = naturalSector ?? adapted.value.naturalSector;
  return {
    ...adapted.value,
    id,
    cardKey: id,
    positionCodes: adapted.value.positionCodes.map((code) => sidedPosition(code, sector)),
    naturalSector: sector,
  };
}

function adaptStartingXI(cards: readonly Card[], formation: Formation, prefix: string): V7PlayerCard[] {
  return cards.map((card, index) => adaptCard(card, `${prefix}-${card.id}`, sectorForSlot(formation.slots[index]!, formation.slots)));
}

function adaptBench(cards: readonly Card[], prefix: string, owned = false): V7PlayerCard[] {
  return cards.map((card, index) => {
    const wide = card.position === 'WD' || card.position === 'WM' || card.position === 'WF';
    const sector: Sector | undefined = wide ? (index % 2 === 0 ? 'left' : 'right') : undefined;
    const id = owned ? `live-${card.id}` : `${prefix}-${card.id}-${index}`;
    return adaptCard(card, id, sector);
  });
}

function managerCard(manager: JokerCard | undefined, id: string, name: string, formationIds: string[]): V7ManagerCard {
  return {
    id,
    cardKey: id,
    name: manager?.name ?? name,
    startingBudget: 5,
    formationIds,
    actionIds: [],
    rarity: rarityOf(manager?.rarity),
  };
}

function squad(manager: V7ManagerCard, formation: FormationDefinition, xi: readonly V7PlayerCard[], bench: readonly V7PlayerCard[]): FixtureSquad {
  return {
    manager,
    formationId: formation.id,
    startingXI: xi.map((card) => card.id),
    benchIds: bench.map((card) => card.id),
  };
}

/** Build the exact V7 match fixture used by the live GameShell. Everything outside
 * the match remains on the existing run/economy/cup stack. */
export function buildLiveV7Fixture(runState: RunState, hand: HandState): V7Fixture {
  if (hand.xi.length !== 11) throw new Error(`V7 requires 11 starters; received ${hand.xi.length}.`);
  if (hand.bench.length !== 7) throw new Error(`V7 requires seven substitutes; received ${hand.bench.length}.`);

  const seed = buildMatchSeed(runState.seed, runState.round, runState.matchInCup);
  const playerFormationSource = getFormation(runState.activeFormation);
  const playerFormation = adaptLiveFormation(playerFormationSource);

  const opponent = getOpponent(runState.round);
  const power = cupMatchPower(runState.round, runState.matchInCup, cupSize(runState.round));
  const opponentMain = generateOpponentXI(runState.round, opponent.style, seed, power);
  const opponentBenchSource = generateOpponentXI(runState.round, opponent.style, seed + 7919, power);
  const opponentFormation = adaptLiveFormation(opponentMain.formation);

  const playerXI = adaptStartingXI(hand.xi, playerFormationSource, 'live');
  const playerBench = adaptBench(hand.bench, 'live-bench', true);
  const opponentXI = adaptStartingXI(opponentMain.xi, opponentMain.formation, 'opponent');
  const opponentBench = adaptBench(opponentBenchSource.xi.slice(0, 7), 'opponent-bench');

  const homeManager = managerCard(runState.jokers?.[0], 'live-manager-home', 'Home Manager', [playerFormation.id]);
  const awayManager = managerCard(undefined, 'live-manager-away', opponent.name, [opponentFormation.id]);
  const formations = playerFormation.id === opponentFormation.id ? [playerFormation] : [playerFormation, opponentFormation];

  return {
    seed,
    cards: [...playerXI, ...playerBench, ...opponentXI, ...opponentBench],
    actions: [],
    formations,
    home: squad(homeManager, playerFormation, playerXI, playerBench),
    away: squad(awayManager, opponentFormation, opponentXI, opponentBench),
    source: 'fixture',
  };
}
