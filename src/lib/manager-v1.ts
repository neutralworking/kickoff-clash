import type { JokerCard } from './jokers';
import { MAX_XI_COST } from './v6-bridge';

/**
 * V1 manager-owned setup rules.
 *
 * This is deliberately separate from the legacy adherence fields while the
 * roster is migrated. Formation pools start from the manager's existing single
 * authored shape; they can expand to a maximum of three through store
 * consumables. XI caps remain at the current live value until balance assigns
 * manager-specific numbers.
 */
export interface ManagerV1Profile {
  actionName: string;
  formations: string[];
  maxStartingXiCost: number;
}

const PROFILE_BY_ID: Record<string, ManagerV1Profile> = {
  pomo: { actionName: 'Direct Play', formations: ['4-4-2'], maxStartingXiCost: MAX_XI_COST },
  anti_football: { actionName: 'The Wall', formations: ['5-3-2'], maxStartingXiCost: MAX_XI_COST },
  tiki_taka: { actionName: 'Possession', formations: ['4-3-3'], maxStartingXiCost: MAX_XI_COST },
  gegenpress: { actionName: 'Counter-Press', formations: ['4-3-3'], maxStartingXiCost: MAX_XI_COST },
  box_office: { actionName: 'Showman', formations: ['4-2-3-1'], maxStartingXiCost: MAX_XI_COST },
  tinkerman: { actionName: 'Rotation', formations: ['4-4-2'], maxStartingXiCost: MAX_XI_COST },
  cholismo: { actionName: 'The Grind', formations: ['4-4-2'], maxStartingXiCost: MAX_XI_COST },
  murderball: { actionName: 'All-Out Press', formations: ['3-4-3'], maxStartingXiCost: MAX_XI_COST },
  fergie_time: { actionName: 'Late Show', formations: ['4-4-2'], maxStartingXiCost: MAX_XI_COST },
  entertainers: { actionName: 'All-Out Attack', formations: ['4-3-3'], maxStartingXiCost: MAX_XI_COST },
  total_football: { actionName: 'Fluidity', formations: ['3-4-3'], maxStartingXiCost: MAX_XI_COST },
  set_pieces_fc: { actionName: 'Aerial Bombardment', formations: ['5-4-1'], maxStartingXiCost: MAX_XI_COST },
  wheeler_dealer: { actionName: 'Market Genius', formations: ['4-3-3'], maxStartingXiCost: MAX_XI_COST },
  joga_bonito: { actionName: 'Flair', formations: ['4-3-3'], maxStartingXiCost: MAX_XI_COST },
};

function legacyFallback(manager: JokerCard): ManagerV1Profile {
  return {
    actionName: manager.traits[0]?.trim() || 'Match Effect',
    formations: manager.preferredFormation ? [manager.preferredFormation] : ['4-3-3'],
    maxStartingXiCost: MAX_XI_COST,
  };
}

export function managerV1Profile(manager: JokerCard): ManagerV1Profile {
  const profile = PROFILE_BY_ID[manager.id] ?? legacyFallback(manager);
  return {
    ...profile,
    formations: Array.from(new Set(profile.formations)).slice(0, 3),
  };
}

export function managerActionNameV1(manager: JokerCard): string {
  return managerV1Profile(manager).actionName;
}

export function managerFormationsV1(manager: JokerCard): string[] {
  return managerV1Profile(manager).formations;
}

export function managerMaxStartingXiCost(manager: JokerCard): number {
  return managerV1Profile(manager).maxStartingXiCost;
}

/**
 * Add a store-bought formation to a manager's current run pool. The roster
 * profile remains immutable; unlocked shapes belong to the run save.
 */
export function addManagerFormation(current: string[], formationId: string): string[] {
  return Array.from(new Set([...current, formationId])).slice(0, 3);
}
