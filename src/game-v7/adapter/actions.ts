import {
  instantiatePlayerActions,
  type RuntimeActionInstance,
  type V7ActionDefinition,
  type V7PlayerCard,
} from '@/engine-v7';
import { err, ok, type AdapterResult } from './result';

// Action adaptation: turn action definitions into a lookup and mint the runtime
// instances a card carries. Every id a card references must resolve — an
// unresolved action id is a typed error, not a silently dropped ability.

export function actionRegistry(actions: readonly V7ActionDefinition[]): Map<string, V7ActionDefinition> {
  return new Map(actions.map((action) => [action.id, action]));
}

/** Build the runtime action instances for one card, or a typed error. */
export function buildRuntimeInstances(
  card: V7PlayerCard,
  actions: ReadonlyMap<string, V7ActionDefinition>,
): AdapterResult<RuntimeActionInstance[]> {
  for (const actionId of card.actionIds) {
    if (!actions.has(actionId)) {
      return err('unknown_action', `Card ${card.name} references unknown action "${actionId}".`, { cardId: card.id, actionId });
    }
  }
  return ok(instantiatePlayerActions(card, actions));
}
