import type { JokerCard } from '../../lib/jokers';
import {
  managerActionNameV8,
  managerFormationsV8,
  managerV8Profile,
} from '../../lib/manager-v8';

/** Resolve the manager-owned formation pool, with explicit run overrides. */
export function resolveManagerFormations(manager: JokerCard, formations?: string[]): string[] {
  const source = formations && formations.length > 0
    ? formations
    : managerFormationsV8(manager);

  return Array.from(new Set(source)).slice(0, 3);
}

/** Every V8 manager Action has an explicit printed name. */
export function managerActionName(manager: JokerCard): string {
  return managerActionNameV8(manager);
}

/**
 * Remove legacy formation-adherence copy from the existing effect string. In V8
 * the manager determines the available formation pool; formations do not pay
 * fractional adherence bonuses.
 */
export function managerActionText(manager: JokerCard): string {
  return managerV8Profile(manager).actionText
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/^Prefers\b/i.test(sentence.trim()))
    .filter((sentence) => !/^At home in ANY formation\b/i.test(sentence.trim()))
    .filter((sentence) => !/^All formations count as native\b/i.test(sentence.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
