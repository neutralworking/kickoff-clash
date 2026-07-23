import type {
  CardZone,
  FormationDefinition,
  PositionCode,
  Sector,
  V7ActionDefinition,
  V7PlayerCard,
  V7TeamState,
} from '../../lib/match-v7/types';
import { calculatePlayerStats, type StatSetEffect } from '../core/stats';
import { evaluateGoalkeeperPlacement } from '../core/goalkeeper';
import { partnerSlots, slotByKey } from '../formations/geometry';
import type { LedgerEffect } from '../actions/effects';

// The effective-stat ledger. Given a team's runtime state and the current
// effect ledger, it folds every stat-touching LedgerEffect (set → swap → flat →
// multiply, in ledger order) onto each card's printed stats, then applies the
// positional rules: the emergency-goalkeeper penalty (a non-keeper in the GK
// slot) and the A3 out-of-position penalty (current sector ≠ natural sector).
// It reads the ledger — it never writes it — so the resolver can recompute the
// board deterministically at any point during a break.

/** The static definitions the resolver reads to hydrate runtime state. */
export interface CardRegistry {
  cards: ReadonlyMap<string, V7PlayerCard>;
  actions: ReadonlyMap<string, V7ActionDefinition>;
  formations: ReadonlyMap<string, FormationDefinition>;
}

export interface EffectivePlayer {
  cardId: string;
  zone: CardZone;
  slotKey?: string;
  position?: PositionCode;
  naturalSector: Sector;
  sector?: Sector;
  attack: number;
  defence: number;
  cost: number;
  outOfPosition: boolean;
  emergencyGoalkeeper: boolean;
  actionsSuppressed: boolean;
  partnerCardIds: string[];
}

/** The A3 flat out-of-position penalty (current sector ≠ natural sector). */
export const OUT_OF_POSITION_PENALTY = 2;

interface StatFold {
  attackSet: StatSetEffect[];
  defenceSet: StatSetEffect[];
  attackFlat: number[];
  defenceFlat: number[];
  attackMul: number[];
  defenceMul: number[];
  costFlat: number[];
  swap: boolean;
}

function emptyFold(): StatFold {
  return { attackSet: [], defenceSet: [], attackFlat: [], defenceFlat: [], attackMul: [], defenceMul: [], costFlat: [], swap: false };
}

/** Collect every stat-touching ledger effect that targets each card, in ledger order. */
function foldByCard(ledger: readonly LedgerEffect[]): Map<string, StatFold> {
  const folds = new Map<string, StatFold>();
  const foldFor = (cardId: string): StatFold => {
    let fold = folds.get(cardId);
    if (!fold) {
      fold = emptyFold();
      folds.set(cardId, fold);
    }
    return fold;
  };

  ledger.forEach((entry, order) => {
    for (const cardId of entry.targetIds) {
      const fold = foldFor(cardId);
      const effect = entry.effect;
      if (effect.type === 'swap_stats') {
        fold.swap = !fold.swap;
      } else if (effect.type === 'modify_cost') {
        fold.costFlat.push(effect.amount);
      } else if (effect.type === 'modify_stat') {
        const set = effect.stat === 'attack' ? fold.attackSet : fold.defenceSet;
        const flat = effect.stat === 'attack' ? fold.attackFlat : fold.defenceFlat;
        const mul = effect.stat === 'attack' ? fold.attackMul : fold.defenceMul;
        if (effect.mode === 'set') set.push({ value: effect.amount, resolvedOrder: order });
        else if (effect.mode === 'flat') flat.push(effect.amount);
        else mul.push(effect.amount);
      }
    }
  });

  return folds;
}

function occupancy(team: V7TeamState): Map<string, string> {
  const bySlot = new Map<string, string>();
  for (const player of team.players) {
    if (player.zone === 'active' && player.currentSlotKey) bySlot.set(player.currentSlotKey, player.cardId);
  }
  return bySlot;
}

/** Compute effective stats for every active + benched card on a team. */
export function effectivePlayers(
  team: V7TeamState,
  registry: CardRegistry,
  ledger: readonly LedgerEffect[],
): EffectivePlayer[] {
  const formation = registry.formations.get(team.formationId);
  const folds = foldByCard(ledger);
  const bySlot = occupancy(team);

  const result: EffectivePlayer[] = [];
  for (const player of team.players) {
    if (player.zone === 'removed') continue;
    const card = registry.cards.get(player.cardId);
    if (!card) continue;

    const fold = folds.get(player.cardId) ?? emptyFold();
    const stats = calculatePlayerStats({
      printedAttack: card.printedAttack,
      printedDefence: card.printedDefence,
      attackSetEffects: fold.attackSet,
      defenceSetEffects: fold.defenceSet,
      swapStats: fold.swap,
      attackFlatModifiers: fold.attackFlat,
      defenceFlatModifiers: fold.defenceFlat,
      attackMultipliers: fold.attackMul,
      defenceMultipliers: fold.defenceMul,
    });
    const cost = card.printedCost + fold.costFlat.reduce((sum, amount) => sum + amount, 0);

    if (player.zone === 'bench') {
      result.push({
        cardId: player.cardId,
        zone: 'bench',
        naturalSector: card.naturalSector,
        attack: Math.max(0, stats.attack.effective),
        defence: Math.max(0, stats.defence.effective),
        cost,
        outOfPosition: false,
        emergencyGoalkeeper: false,
        actionsSuppressed: false,
        partnerCardIds: [],
      });
      continue;
    }

    const slot = player.currentSlotKey && formation ? slotByKey(formation, player.currentSlotKey) : undefined;
    const sector = player.currentSector ?? slot?.sector ?? card.naturalSector;

    // Emergency-GK rule first (goalkeeper.ts), then the A3 sector penalty.
    let attack = stats.attack.effective;
    let defence = stats.defence.effective;
    let outOfPosition = false;
    let emergencyGoalkeeper = false;
    let actionsSuppressed = false;

    if (slot) {
      const gk = evaluateGoalkeeperPlacement(card, slot, attack, defence);
      if (gk.emergencyGoalkeeper) {
        attack = gk.attack;
        defence = gk.defence;
        emergencyGoalkeeper = true;
        actionsSuppressed = true;
      } else if (sector !== card.naturalSector) {
        attack -= OUT_OF_POSITION_PENALTY;
        defence -= OUT_OF_POSITION_PENALTY;
        outOfPosition = true;
      }
    } else if (sector !== card.naturalSector) {
      attack -= OUT_OF_POSITION_PENALTY;
      defence -= OUT_OF_POSITION_PENALTY;
      outOfPosition = true;
    }

    const partnerCardIds =
      slot && formation
        ? partnerSlots(formation, slot.slotKey)
            .map((partner) => bySlot.get(partner.slotKey))
            .filter((cardId): cardId is string => Boolean(cardId))
        : [];

    result.push({
      cardId: player.cardId,
      zone: 'active',
      ...(slot ? { slotKey: slot.slotKey, position: slot.positionCode } : {}),
      naturalSector: card.naturalSector,
      sector,
      attack: Math.max(0, attack),
      defence: Math.max(0, defence),
      cost,
      outOfPosition,
      emergencyGoalkeeper,
      actionsSuppressed,
      partnerCardIds,
    });
  }

  return result;
}

/** Split effective players into active + bench sets. */
export function splitByZone(players: readonly EffectivePlayer[]): {
  active: EffectivePlayer[];
  bench: EffectivePlayer[];
} {
  return {
    active: players.filter((player) => player.zone === 'active'),
    bench: players.filter((player) => player.zone === 'bench'),
  };
}
