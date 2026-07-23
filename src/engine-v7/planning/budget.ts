import { BREAK_ENERGY, type BreakBudgetReceipt, type BreakIndex } from '../../lib/match-v7/types';

export interface BudgetModifier {
  sourceId: string;
  actionId: string;
  amount: number;
  guaranteed: boolean;
}

export interface IncomingCost {
  cardId: string;
  cost: number;
}

export function calculateBreakBudget(
  breakIndex: BreakIndex,
  modifiers: readonly BudgetModifier[],
  incomingCosts: readonly IncomingCost[],
): BreakBudgetReceipt {
  const guaranteedModifiers = modifiers
    .filter((modifier) => modifier.guaranteed)
    .map(({ sourceId, actionId, amount }) => ({ sourceId, actionId, amount }));
  const availableEnergy = BREAK_ENERGY[breakIndex]
    + guaranteedModifiers.reduce((sum, modifier) => sum + modifier.amount, 0);
  const netIncomingCost = incomingCosts.reduce((sum, incoming) => sum + incoming.cost, 0);

  return {
    breakIndex,
    baseEnergy: BREAK_ENERGY[breakIndex],
    guaranteedModifiers,
    availableEnergy,
    incomingCosts: [...incomingCosts],
    netIncomingCost,
    legalAtSubmission: netIncomingCost <= availableEnergy,
  };
}
