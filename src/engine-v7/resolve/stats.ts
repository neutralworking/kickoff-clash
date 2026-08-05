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

/**
 * A single stat contribution, tagged with its ledger `order` and whether it is
 * `temporary` — i.e. anything that is not a whole-match effect. `reset_stats`
 * clears a card's temporary stat contributions that precede it; match-lifetime
 * ones survive. Cost is not a stat and is never reset.
 */
interface StatContribution {
  value: number;
  order: number;
  temporary: boolean;
}

interface CardAccumulator {
  attackSet: StatContribution[];
  defenceSet: StatContribution[];
  attackFlat: StatContribution[];
  defenceFlat: StatContribution[];
  attackMul: StatContribution[];
  defenceMul: StatContribution[];
  swapToggles: StatContribution[];
  costFlat: number[];
}

function emptyAccumulator(): CardAccumulator {
  return {
    attackSet: [],
    defenceSet: [],
    attackFlat: [],
    defenceFlat: [],
    attackMul: [],
    defenceMul: [],
    swapToggles: [],
    costFlat: [],
  };
}

const keepMatchLifetime = (list: StatContribution[]): StatContribution[] =>
  list.filter((contribution) => !contribution.temporary);

/**
 * Collect every stat-touching ledger effect that targets each card, in ledger
 * order, then flatten to the shape `calculatePlayerStats` consumes. A
 * `reset_stats` effect drops the card's temporary stat contributions accrued
 * before it (set / flat / multiply / swap), leaving whole-match ones intact.
 * Because ongoing effects are re-emitted at the end of the ledger after each
 * break resolves, a reset never clears passives — they land after it and are
 * reapplied naturally.
 */
function foldByCard(ledger: readonly LedgerEffect[]): Map<string, StatFold> {
  const accumulators = new Map<string, CardAccumulator>();
  const accumulatorFor = (cardId: string): CardAccumulator => {
    let acc = accumulators.get(cardId);
    if (!acc) {
      acc = emptyAccumulator();
      accumulators.set(cardId, acc);
    }
    return acc;
  };

  ledger.forEach((entry, order) => {
    const temporary = entry.lifetime.kind !== 'match';
    for (const cardId of entry.targetIds) {
      const acc = accumulatorFor(cardId);
      const effect = entry.effect;
      if (effect.type === 'reset_stats') {
        acc.attackSet = keepMatchLifetime(acc.attackSet);
        acc.defenceSet = keepMatchLifetime(acc.defenceSet);
        acc.attackFlat = keepMatchLifetime(acc.attackFlat);
        acc.defenceFlat = keepMatchLifetime(acc.defenceFlat);
        acc.attackMul = keepMatchLifetime(acc.attackMul);
        acc.defenceMul = keepMatchLifetime(acc.defenceMul);
        acc.swapToggles = keepMatchLifetime(acc.swapToggles);
      } else if (effect.type === 'swap_stats') {
        acc.swapToggles.push({ value: 1, order, temporary });
      } else if (effect.type === 'modify_cost') {
        acc.costFlat.push(effect.amount);
      } else if (effect.type === 'modify_stat') {
        const set = effect.stat === 'attack' ? acc.attackSet : acc.defenceSet;
        const flat = effect.stat === 'attack' ? acc.attackFlat : acc.defenceFlat;
        const mul = effect.stat === 'attack' ? acc.attackMul : acc.defenceMul;
        if (effect.mode === 'set') set.push({ value: effect.amount, order, temporary });
        else if (effect.mode === 'flat') flat.push({ value: effect.amount, order, temporary });
        else mul.push({ value: effect.amount, order, temporary });
      }
    }
  });

  const folds = new Map<string, StatFold>();
  for (const [cardId, acc] of accumulators) {
    folds.set(cardId, {
      attackSet: acc.attackSet.map((c) => ({ value: c.value, resolvedOrder: c.order })),
      defenceSet: acc.defenceSet.map((c) => ({ value: c.value, resolvedOrder: c.order })),
      attackFlat: acc.attackFlat.map((c) => c.value),
      defenceFlat: acc.defenceFlat.map((c) => c.value),
      attackMul: acc.attackMul.map((c) => c.value),
      defenceMul: acc.defenceMul.map((c) => c.value),
      costFlat: acc.costFlat,
      swap: acc.swapToggles.length % 2 === 1,
    });
  }
  return folds;
}

function emptyFold(): StatFold {
  return { attackSet: [], defenceSet: [], attackFlat: [], defenceFlat: [], attackMul: [], defenceMul: [], costFlat: [], swap: false };
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
        position: card.positionCodes[0],
        naturalSector: card.naturalSector,
        sector: card.naturalSector,
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
