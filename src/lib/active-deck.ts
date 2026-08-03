import type { Card } from './scoring';

export const ACTIVE_DECK_SIZE = 18;

const STORAGE_KEY = 'kickoff-clash-active-deck-v1';

/**
 * Keep only owned, unique card ids and fill any missing spaces from the owned
 * collection. This makes old saves and sold/shattered cards self-healing while
 * preserving the player's chosen order wherever possible.
 */
export function normaliseActiveDeckIds(
  collection: Card[],
  ids: number[] = [],
): number[] {
  const owned = new Set(collection.map((card) => card.id));
  const next = [...new Set(ids)]
    .filter((id) => owned.has(id))
    .slice(0, ACTIVE_DECK_SIZE);

  for (const card of collection) {
    if (next.length >= ACTIVE_DECK_SIZE) break;
    if (!next.includes(card.id)) next.push(card.id);
  }

  return next;
}

export function loadActiveDeckIds(
  collection: Card[],
  fallbackIds: number[] = [],
): number[] {
  if (typeof window === 'undefined') {
    return normaliseActiveDeckIds(collection, fallbackIds);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return normaliseActiveDeckIds(collection, fallbackIds);
    const parsed = JSON.parse(raw);
    return normaliseActiveDeckIds(collection, Array.isArray(parsed) ? parsed : fallbackIds);
  } catch {
    return normaliseActiveDeckIds(collection, fallbackIds);
  }
}

export function saveActiveDeckIds(ids: number[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...new Set(ids)].slice(0, ACTIVE_DECK_SIZE)),
    );
  } catch {
    // Storage can be unavailable in private browsing or constrained embeds.
  }
}
