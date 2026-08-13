import type { JokerCard } from './jokers';
import { managerV8Profile } from './manager-v8';

/**
 * Compatibility surface for saves and callers that still use the V1 names.
 *
 * The roster and manager-owned formation pools are now authored in V8.
 */
export interface ManagerV1Profile {
  actionName: string;
  formations: string[];
}

export function managerV1Profile(manager: JokerCard): ManagerV1Profile {
  const profile = managerV8Profile(manager);
  return {
    actionName: profile.actionName,
    formations: profile.formations,
  };
}

export function managerActionNameV1(manager: JokerCard): string {
  return managerV1Profile(manager).actionName;
}

export function managerFormationsV1(manager: JokerCard): string[] {
  return managerV1Profile(manager).formations;
}

/**
 * Add a store-bought formation to a manager's current run pool. The roster
 * profile remains immutable; unlocked shapes belong to the run save.
 */
export function addManagerFormation(current: string[], formationId: string): string[] {
  return Array.from(new Set([...current, formationId])).slice(0, 3);
}
