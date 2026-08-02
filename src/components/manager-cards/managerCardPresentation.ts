import type { JokerCard } from '../../lib/jokers';

/**
 * The production manager model still exposes the legacy single
 * `preferredFormation` field. The groomed card accepts the V1 formation pool
 * explicitly and falls back to that legacy field only while the data migration
 * is pending.
 */
export function resolveManagerFormations(manager: JokerCard, formations?: string[]): string[] {
  const source = formations && formations.length > 0
    ? formations
    : manager.preferredFormation
      ? [manager.preferredFormation]
      : [];

  return Array.from(new Set(source)).slice(0, 3);
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
