import {
  V8_CALIBRATION_PLAYERS,
  V8_CALIBRATION_PLAYER_BY_ID,
  type V8CalibrationPlayerCard,
} from '@/engine-v8/calibration-cards';
import type { V8Zone } from '@/engine-v8/core';
import type { Card } from '@/lib/scoring';
import { managerV8Profile, type ManagerV8Profile } from '@/lib/manager-v8';
import {
  buildMatchSeed,
  getOpponentBuild,
  type OpponentPlayer,
  type RunState,
} from '@/lib/run';

export type LiveV8Fixture = {
  seed: number;
  homeCards: Card[];
  homePlayerIds: string[];
  homeManager: ManagerV8Profile | null;
  awayPlayerIds: string[];
  awayLabel: string;
  contextLabel: string;
};

const ZONES_BY_POSITION: Record<string, readonly V8Zone[]> = {
  GK: ['DEF'],
  CD: ['DEF'],
  CB: ['DEF'],
  WD: ['DEF', 'MID'],
  FB: ['DEF', 'MID'],
  WB: ['DEF', 'MID'],
  DM: ['DEF', 'MID'],
  CM: ['MID'],
  WM: ['MID'],
  AM: ['MID', 'ATT'],
  WF: ['ATT'],
  CF: ['ATT'],
  SS: ['ATT'],
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function naturalZones(position: string): readonly V8Zone[] {
  const zones = position
    .toUpperCase()
    .split(/[^A-Z]+/)
    .flatMap((code) => ZONES_BY_POSITION[code] ?? []);
  return [...new Set(zones.length ? zones : ['MID' as const])];
}

function legacyStats(position: string, power: number): { attack: number; defence: number } {
  const rating = clamp(Math.round((power - 35) / 5), 1, 11);
  const primary = position.toUpperCase().split(/[^A-Z]+/)[0] ?? 'CM';
  if (primary === 'GK') return { attack: 0, defence: rating };
  if (primary === 'CD' || primary === 'CB') return { attack: Math.max(1, Math.round(rating * .2)), defence: rating };
  if (primary === 'WD' || primary === 'FB' || primary === 'WB') return { attack: Math.round(rating * .55), defence: Math.round(rating * .8) };
  if (primary === 'DM') return { attack: Math.round(rating * .45), defence: Math.round(rating * .85) };
  if (primary === 'CM') return { attack: Math.round(rating * .7), defence: Math.round(rating * .6) };
  if (primary === 'WM' || primary === 'AM') return { attack: Math.round(rating * .85), defence: Math.round(rating * .4) };
  return { attack: rating, defence: Math.max(1, Math.round(rating * .15)) };
}

function registerFallbackPlayer(args: {
  id: string;
  realName: string;
  matchName: string;
  position: string;
  power: number;
  cost?: number;
  attack?: number;
  defence?: number;
}): string {
  if (V8_CALIBRATION_PLAYER_BY_ID.has(args.id)) return args.id;
  const fallback = legacyStats(args.position, args.power);
  const actionKey = 'live_adapter' as V8CalibrationPlayerCard['actionKey'];
  const player: V8CalibrationPlayerCard = {
    id: args.id,
    realName: args.realName,
    matchName: args.matchName,
    fullCardName: args.realName,
    trackerRow: -1,
    name: args.realName,
    position: args.position,
    naturalZones: naturalZones(args.position),
    cost: args.cost ?? clamp(Math.round((args.power - 38) / 12), 1, 5),
    printedAttack: args.attack ?? fallback.attack,
    printedDefence: args.defence ?? fallback.defence,
    actionKey,
    actionName: 'V8 ADAPTER',
    actionText: 'No authored V8 Action yet. Printed ATT and DEF still contribute normally.',
    actions: [{
      id: actionKey,
      name: 'V8 ADAPTER',
      timing: 'ongoing',
      text: 'No authored V8 Action yet. Printed ATT and DEF still contribute normally.',
    }],
    statSource: 'calibration_fallback',
    costSource: 'calibration_fallback',
    usesCalibrationStatFallback: true,
    usesCalibrationCostFallback: true,
  };

  (V8_CALIBRATION_PLAYERS as V8CalibrationPlayerCard[]).push(player);
  V8_CALIBRATION_PLAYER_BY_ID.set(player.id, player);
  return player.id;
}

function liveCardPlayerId(card: Card, used: Set<string>): string {
  const preferred = card.v8PlayerId;
  if (preferred && V8_CALIBRATION_PLAYER_BY_ID.has(preferred) && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }

  const id = preferred && !used.has(preferred) ? preferred : `live-card-${card.id}`;
  registerFallbackPlayer({
    id,
    realName: card.realName ?? card.name,
    matchName: card.name,
    position: card.position,
    power: card.power,
    cost: card.printedCost,
    attack: card.printedAttack,
    defence: card.printedDefence,
  });
  used.add(id);
  return id;
}

function opponentPlayerId(player: OpponentPlayer, index: number, seed: number): string {
  const id = `live-opponent-${seed}-${index}`;
  return registerFallbackPlayer({
    id,
    realName: player.name,
    matchName: player.name,
    position: player.position,
    power: player.power,
  });
}

function selectedHomeCards(runState: RunState): Card[] {
  const suspended = new Set(runState.suspendedIds ?? []);
  const eligible = runState.deck.filter((card) => !suspended.has(card.id));
  const byId = new Map(eligible.map((card) => [card.id, card]));
  const selected = (runState.startingXI ?? [])
    .map((id) => byId.get(id))
    .filter((card): card is Card => Boolean(card));
  const used = new Set(selected.map((card) => card.id));

  for (const card of eligible) {
    if (selected.length >= 11) break;
    if (used.has(card.id)) continue;
    selected.push(card);
    used.add(card.id);
  }

  if (selected.length !== 11) {
    throw new Error(`V8 requires 11 eligible players; received ${selected.length}.`);
  }
  return selected;
}

export function buildLiveV8Fixture(runState: RunState): LiveV8Fixture {
  const seed = buildMatchSeed(runState.seed, runState.round, runState.matchInCup);
  const homeCards = selectedHomeCards(runState);
  const usedPlayerIds = new Set<string>();
  const homePlayerIds = homeCards.map((card) => liveCardPlayerId(card, usedPlayerIds));
  const opponent = getOpponentBuild(runState.round, runState.matchInCup, runState.seed);
  const awayPlayerIds = opponent.xi.map((player, index) => opponentPlayerId(player, index, seed));

  if (awayPlayerIds.length !== 11) {
    throw new Error(`V8 requires an 11-player opponent; received ${awayPlayerIds.length}.`);
  }

  return {
    seed,
    homeCards,
    homePlayerIds,
    homeManager: runState.jokers[0] ? managerV8Profile(runState.jokers[0]) : null,
    awayPlayerIds,
    awayLabel: opponent.name,
    contextLabel: `CUP ${runState.round} · TIE ${runState.matchInCup}`,
  };
}
