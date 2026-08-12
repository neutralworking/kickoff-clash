import {
  V8_CALIBRATION_PLAYERS,
  type V8CalibrationPlayerCard,
} from '@/engine-v8/calibration-cards';
import { V8_BATCH_04_PLAYERS } from '@/engine-v8/calibration-expansion-batch-04-cards';
import { V8_BATCH_05_PLAYERS } from '@/engine-v8/calibration-expansion-batch-05-cards';
import { V8_BATCH_06_PLAYERS } from '@/engine-v8/calibration-expansion-batch-06-cards';
import { V8_BATCH_07_PLAYERS } from '@/engine-v8/calibration-expansion-batch-07-cards';
import type { Card } from '@/lib/scoring';

const RUN_POSITION: Record<string, Card['position']> = {
  GK: 'GK',
  CB: 'CD',
  CD: 'CD',
  SW: 'CD',
  LB: 'WD',
  RB: 'WD',
  FB: 'WD',
  LWB: 'WD',
  RWB: 'WD',
  WB: 'WD',
  DM: 'DM',
  CM: 'CM',
  LM: 'WM',
  RM: 'WM',
  WM: 'WM',
  AM: 'AM',
  LW: 'WF',
  RW: 'WF',
  WF: 'WF',
  LF: 'CF',
  RF: 'CF',
  SS: 'CF',
  CF: 'CF',
};

const POWER_BY_COST = [0, 56, 64, 72, 80, 86, 92] as const;

function runPosition(position: string): Card['position'] {
  for (const code of position.split('/').map((value) => value.trim())) {
    if (RUN_POSITION[code]) return RUN_POSITION[code];
  }
  return 'CM';
}

function runArchetype(card: V8CalibrationPlayerCard, position: Card['position']): string {
  if (position === 'GK') return 'Shotstopper';
  if (position === 'CD') return card.printedDefence >= 10 ? 'Cover' : 'Commander';
  if (position === 'WD' || position === 'DM') return 'Powerhouse';
  if (position === 'CM' || position === 'WM') return card.printedAttack > card.printedDefence ? 'Passer' : 'Engine';
  if (position === 'AM' || position === 'WF') return 'Creator';
  return card.actionName.includes('HEADER') ? 'Target' : 'Striker';
}

function runRarity(cost: number): Card['rarity'] {
  if (cost >= 5) return 'Legendary';
  if (cost === 4) return 'Epic';
  if (cost === 3) return 'Rare';
  return 'Common';
}

function runCard(card: V8CalibrationPlayerCard): Card {
  const position = runPosition(card.position);
  return {
    id: 100000 + card.trackerRow,
    name: card.matchName,
    realName: card.realName,
    v8PlayerId: card.id,
    position,
    archetype: runArchetype(card, position),
    power: POWER_BY_COST[card.cost] ?? 72,
    rarity: runRarity(card.cost),
    abilityName: card.actionName,
    abilityText: card.actionText,
    printedCost: card.cost,
    printedAttack: card.printedAttack,
    printedDefence: card.printedDefence,
    gatePull: 0,
    durability: 'standard',
    bio: card.realName,
    tags: ['V8 roster'],
  };
}

/** Later expansion registrations replace duplicated early calibration aliases. */
const V8_RUN_SOURCE = [
  ...V8_CALIBRATION_PLAYERS,
  ...V8_BATCH_04_PLAYERS,
  ...V8_BATCH_05_PLAYERS,
  ...V8_BATCH_06_PLAYERS,
  ...V8_BATCH_07_PLAYERS,
];

/**
 * Canonical player pool for the live run shell. Opening packs, transfer picks and
 * paid shop packs must all draw from this same implemented V8 roster so every
 * acquired card carries its authored V8 identity, printed stats and Action.
 */
export const V8_RUN_PLAYER_POOL: readonly Card[] = [
  ...new Map(V8_RUN_SOURCE.map((card) => [card.realName, card])).values(),
].map(runCard);
