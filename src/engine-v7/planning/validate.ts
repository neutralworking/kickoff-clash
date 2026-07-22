import type { BreakPlan, FormationDefinition, RuntimePlayerState } from '../../lib/match-v7/types';

export interface PlanValidationInput {
  plan: BreakPlan;
  formation: FormationDefinition;
  players: readonly RuntimePlayerState[];
}

export interface PlanValidationResult {
  legal: boolean;
  errors: string[];
}

export function validateBreakPlan(input: PlanValidationInput): PlanValidationResult {
  const errors: string[] = [];
  const slotKeys = new Set(input.formation.slots.map((slot) => slot.slotKey));
  const cardIds = new Set(input.players.map((player) => player.cardId));
  const assignedCards = Object.values(input.plan.finalSlotAssignments);
  const assignedSlots = Object.keys(input.plan.finalSlotAssignments);

  if (!input.plan.submittedBudget.legalAtSubmission) {
    errors.push('Incoming net cost exceeds available break energy.');
  }

  for (const slotKey of assignedSlots) {
    if (!slotKeys.has(slotKey)) errors.push(`Unknown formation slot: ${slotKey}.`);
  }

  for (const cardId of assignedCards) {
    if (!cardIds.has(cardId)) errors.push(`Unknown card assignment: ${cardId}.`);
  }

  if (new Set(assignedCards).size !== assignedCards.length) {
    errors.push('A card cannot occupy more than one slot.');
  }

  const goalkeeperSlot = input.formation.slots.find((slot) => slot.positionCode === 'GK');
  if (!goalkeeperSlot || !input.plan.finalSlotAssignments[goalkeeperSlot.slotKey]) {
    errors.push('A player must occupy the GK slot.');
  }

  for (const player of input.players) {
    if (player.mandatoryRemoval && assignedCards.includes(player.cardId)) {
      errors.push(`${player.cardId} must be removed before continuing.`);
    }
  }

  const outgoing = new Set(input.plan.outgoingCardIds);
  const incoming = new Set(input.plan.incomingAssignments.map((assignment) => assignment.cardId));
  for (const cardId of outgoing) {
    if (incoming.has(cardId)) errors.push(`${cardId} cannot leave and enter in the same break.`);
  }

  return { legal: errors.length === 0, errors };
}
