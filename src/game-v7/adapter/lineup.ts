import {
  autoMapFormation,
  BREAK_ENERGY,
  calculateBreakBudget,
  effectivePlayers,
  validateBreakPlan,
  type BreakIndex,
  type BreakPlan,
  type LedgerEffect,
  type PlannedActivation,
  type ResolutionStage,
  type V7PlayerCard,
  type V7TeamState,
} from '@/engine-v7';
import type { GameRegistry } from './match';
import { err, ok, type AdapterResult } from './result';

// Lineup adaptation: turn the player's break decisions (substitutions, an
// optional formation switch, and activations) into a legal V7 `BreakPlan`. Every
// plan is validated against the engine's own rules before it leaves the adapter;
// an illegal plan is returned as a typed error and never handed to the resolver.

export interface SubDecision {
  outCardId: string;
  inCardId: string;
}

export interface ActivationDecision {
  actionInstanceId: string;
  sourceId: string;
  stage?: ResolutionStage;
}

export interface BreakDecision {
  formationSwitchId?: string;
  subs: SubDecision[];
  activations?: ActivationDecision[];
}

function activeSlotMap(team: V7TeamState): Record<string, string> {
  const map: Record<string, string> = {};
  for (const player of team.players) {
    if (player.zone === 'active' && player.currentSlotKey) map[player.currentSlotKey] = player.cardId;
  }
  return map;
}

function slotOfCard(team: V7TeamState, cardId: string): string | undefined {
  return team.players.find((player) => player.cardId === cardId && player.zone === 'active')?.currentSlotKey;
}

function toActivations(decision: BreakDecision, team: V7TeamState): AdapterResult<PlannedActivation[]> {
  const instanceIds = new Set(team.players.flatMap((player) => player.actionInstances.map((instance) => instance.instanceId)));
  const activations: PlannedActivation[] = [];
  (decision.activations ?? []).forEach((activation, index) => {
    activations.push({
      actionInstanceId: activation.actionInstanceId,
      sourceId: activation.sourceId,
      stage: activation.stage ?? 'after_lineup_changes',
      order: index,
    });
  });
  for (const activation of activations) {
    if (!instanceIds.has(activation.actionInstanceId)) {
      return err('unknown_action', `Activation references unknown action instance "${activation.actionInstanceId}".`);
    }
  }
  return ok(activations);
}

/** Build and validate a player break plan from a decision, or a typed error.
 *  The `ledger` is required so an incoming sub is priced at its EFFECTIVE reserve
 *  cost (printed + any `modify_cost` reductions, floored at COST_FLOOR) rather than
 *  its printed cost — otherwise a cost-reduction effect would be silently ignored by
 *  break-budget legality (NW-162 / Batch-1 Law 4). */
export function buildBreakPlan(
  side: BreakPlan['side'],
  team: V7TeamState,
  decision: BreakDecision,
  breakIndex: BreakIndex,
  registry: GameRegistry,
  seed: number,
  ledger: readonly LedgerEffect[] = [],
): AdapterResult<BreakPlan> {
  const switching = Boolean(decision.formationSwitchId && decision.formationSwitchId !== team.formationId);
  if (switching && decision.subs.length > 0) {
    return err('unsupported_combo', 'This slice does not support a formation switch and substitutions in the same break.');
  }

  const newFormationId = decision.formationSwitchId ?? team.formationId;
  const formation = registry.formations.get(newFormationId);
  if (!formation) return err('unknown_formation', `Unknown formation "${newFormationId}".`, { side });

  const activations = toActivations(decision, team);
  if (!activations.ok) return activations;

  let finalSlotAssignments: Record<string, string>;
  const outgoingCardIds: string[] = [];
  const incomingAssignments: BreakPlan['incomingAssignments'] = [];

  if (switching) {
    const activeCards: V7PlayerCard[] = [];
    for (const player of team.players) {
      if (player.zone !== 'active') continue;
      const card = registry.cards.get(player.cardId);
      if (!card) return err('unknown_card', `Active card "${player.cardId}" is not in the registry.`, { side });
      activeCards.push(card);
    }
    const mapping = autoMapFormation(formation, activeCards.map((card, index) => ({ card, deploymentOrder: index })), seed);
    if (mapping.unmappedCardIds.length > 0 || mapping.emptySlotKeys.length > 0) {
      return err('incomplete_lineup', `Cannot fit the current XI into ${formation.formationKey}.`, { unmapped: mapping.unmappedCardIds, empty: mapping.emptySlotKeys });
    }
    finalSlotAssignments = mapping.assignments;
  } else {
    finalSlotAssignments = activeSlotMap(team);
    for (const sub of decision.subs) {
      const outSlot = slotOfCard(team, sub.outCardId);
      if (!outSlot) return err('illegal_plan', `Cannot sub off "${sub.outCardId}" — not an active player.`, { side });
      const incoming = team.players.find((player) => player.cardId === sub.inCardId);
      if (!incoming || incoming.zone !== 'bench') return err('illegal_plan', `Cannot sub on "${sub.inCardId}" — not on the bench.`, { side });
      finalSlotAssignments[outSlot] = sub.inCardId;
      outgoingCardIds.push(sub.outCardId);
      incomingAssignments.push({ cardId: sub.inCardId, slotKey: outSlot });
    }
  }

  // Price each incoming sub at its effective reserve cost (printed + modify_cost
  // reductions, floored), not its printed cost, so cost-reduction effects actually
  // change what a manager can afford at the break.
  const effectiveCostByCard = new Map(effectivePlayers(team, registry, ledger).map((player) => [player.cardId, player.cost]));
  const incomingCosts = incomingAssignments.map((assignment) => ({
    cardId: assignment.cardId,
    cost: effectiveCostByCard.get(assignment.cardId) ?? registry.cards.get(assignment.cardId)?.printedCost ?? 0,
  }));
  const submittedBudget = calculateBreakBudget(breakIndex, [], incomingCosts);

  const plan: BreakPlan = {
    side,
    breakIndex,
    ...(switching ? { formationSwitchId: newFormationId } : {}),
    outgoingCardIds,
    incomingAssignments,
    finalSlotAssignments,
    activations: activations.value,
    submittedBudget,
    scannerRevealState: 'none',
    locked: true,
  };

  const validation = validateBreakPlan({ plan, formation, players: team.players });
  if (!validation.legal) {
    return err('illegal_plan', validation.errors.join(' '), { side, errors: validation.errors });
  }

  return ok(plan);
}

/** A deterministic no-op plan: keep the XI, no subs, no activations. */
export function noopBreakPlan(side: BreakPlan['side'], team: V7TeamState, breakIndex: BreakIndex): BreakPlan {
  return {
    side,
    breakIndex,
    outgoingCardIds: [],
    incomingAssignments: [],
    finalSlotAssignments: activeSlotMap(team),
    activations: [],
    submittedBudget: calculateBreakBudget(breakIndex, [], []),
    scannerRevealState: 'none',
    locked: true,
  };
}

/** The deterministic scripted opponent plan (a legal no-op for this slice). */
export function scriptedOpponentPlan(team: V7TeamState, breakIndex: BreakIndex): BreakPlan {
  return noopBreakPlan('opponent', team, breakIndex);
}
