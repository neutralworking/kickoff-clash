import type { JokerCard } from '../../lib/jokers';
import {
  managerActionNameV1,
  managerFormationsV1,
} from '../../lib/manager-v1';

/** Resolve the manager-owned formation pool, with explicit run overrides. */
export function resolveManagerFormations(manager: JokerCard, formations?: string[]): string[] {
  const source = formations && formations.length > 0
    ? formations
    : managerFormationsV1(manager);

  return Array.from(new Set(source)).slice(0, 3);
}

/** Every V1 manager action has an explicit printed name. */
export function managerActionName(manager: JokerCard): string {
  return managerActionNameV1(manager);
}

/**
 * Remove legacy formation-adherence copy from the existing effect string. In V1
 * the manager determines the available formation pool; formations do not pay
 * fractional adherence bonuses.
 */
export function managerActionText(manager: JokerCard): string {
  return manager.effect
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/^Prefers\b/i.test(sentence.trim()))
    .filter((sentence) => !/^At home in ANY formation\b/i.test(sentence.trim()))
    .filter((sentence) => !/^All formations count as native\b/i.test(sentence.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
