import type { FormationDefinition, FormationSlot, PositionCode, V7PlayerCard } from '../../lib/match-v7/types';
import { createRng } from '../core/rng';

export interface MappingPlayer {
  card: V7PlayerCard;
  currentSlotKey?: string;
  deploymentOrder: number;
}

export interface FormationMapping {
  assignments: Record<string, string>;
  unmappedCardIds: string[];
  emptySlotKeys: string[];
}

const COMPATIBLE: Partial<Record<PositionCode, PositionCode[]>> = {
  GK: ['GK'], LB: ['LB', 'LWB'], RB: ['RB', 'RWB'], CB: ['CB'],
  LWB: ['LWB', 'LB', 'LM'], RWB: ['RWB', 'RB', 'RM'], DM: ['DM', 'CM'],
  LM: ['LM', 'LW', 'LWB'], CM: ['CM', 'DM', 'AM'], RM: ['RM', 'RW', 'RWB'],
  LW: ['LW', 'LM', 'LF'], AM: ['AM', 'CM', 'LF', 'RF'], RW: ['RW', 'RM', 'RF'],
  LF: ['LF', 'LW', 'CF'], CF: ['CF', 'LF', 'RF'], RF: ['RF', 'RW', 'CF'],
};

export function positionFitsSlot(card: V7PlayerCard, slot: FormationSlot): boolean {
  return card.positionCodes.some((position) =>
    position === slot.positionCode || COMPATIBLE[position]?.includes(slot.positionCode),
  );
}

function mappingScore(player: MappingPlayer, slot: FormationSlot): number {
  if (player.currentSlotKey === slot.slotKey) return 600;
  if (player.card.positionCodes.includes(slot.positionCode) && player.card.naturalSector === slot.sector) return 500;
  if (positionFitsSlot(player.card, slot) && player.card.naturalSector === slot.sector) return 400;
  if (positionFitsSlot(player.card, slot)) return 300;
  if (player.card.naturalSector === slot.sector) return 200;
  return 100;
}

export function autoMapFormation(
  formation: FormationDefinition,
  players: MappingPlayer[],
  seed: number,
): FormationMapping {
  const assignments: Record<string, string> = {};
  const availableSlots = [...formation.slots];
  const remainingPlayers = [...players];

  const naturalKeepers = remainingPlayers.filter((player) => player.card.positionCodes.includes('GK'));
  const goalkeeperSlot = availableSlots.find((slot) => slot.positionCode === 'GK');
  if (goalkeeperSlot && naturalKeepers.length > 0) {
    const keeper = [...naturalKeepers].sort((a, b) =>
      b.card.printedCost - a.card.printedCost ||
      (b.card.printedAttack + b.card.printedDefence) - (a.card.printedAttack + a.card.printedDefence) ||
      a.deploymentOrder - b.deploymentOrder,
    )[0]!;
    assignments[goalkeeperSlot.slotKey] = keeper.card.id;
    availableSlots.splice(availableSlots.indexOf(goalkeeperSlot), 1);
    remainingPlayers.splice(remainingPlayers.indexOf(keeper), 1);
  }

  while (availableSlots.length > 0 && remainingPlayers.length > 0) {
    const candidates = remainingPlayers.flatMap((player) =>
      availableSlots.map((slot) => ({ player, slot, score: mappingScore(player, slot) })),
    );
    const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
    const best = candidates.filter((candidate) => candidate.score === bestScore);
    const ranked = [...best].sort((a, b) =>
      b.player.card.printedCost - a.player.card.printedCost ||
      (b.player.card.printedAttack + b.player.card.printedDefence) -
        (a.player.card.printedAttack + a.player.card.printedDefence) ||
      a.player.deploymentOrder - b.player.deploymentOrder,
    );
    const topRank = ranked.filter((candidate) =>
      candidate.player.card.printedCost === ranked[0]!.player.card.printedCost &&
      candidate.player.card.printedAttack + candidate.player.card.printedDefence ===
        ranked[0]!.player.card.printedAttack + ranked[0]!.player.card.printedDefence &&
      candidate.player.deploymentOrder === ranked[0]!.player.deploymentOrder,
    );
    const selected = topRank.length === 1
      ? topRank[0]!
      : createRng(seed, `formation-map:${Object.keys(assignments).length}`).pick(topRank);

    assignments[selected.slot.slotKey] = selected.player.card.id;
    availableSlots.splice(availableSlots.indexOf(selected.slot), 1);
    remainingPlayers.splice(remainingPlayers.indexOf(selected.player), 1);
  }

  return {
    assignments,
    unmappedCardIds: remainingPlayers.map((player) => player.card.id),
    emptySlotKeys: availableSlots.map((slot) => slot.slotKey),
  };
}
