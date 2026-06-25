/**
 * Kickoff Clash — pre-match team-selection helpers.
 *
 * Pure logic for the TeamSelect screen: an XI is an array of cardIds in
 * formation-slot order (slot i ↔ starters[i], matching xi[i] ↔ slots[i] in the
 * match engine) plus a bench of up to BENCH_SIZE subs. Auto-fill assigns the
 * best available player to each empty slot (eligible by position first).
 */

import type { Card } from './scoring';
import type { Formation } from './formations';
import { positionFitsSlot } from './formations';

export const BENCH_SIZE = 7;

export interface XISelection {
  starters: (number | null)[]; // length === formation.slots.length; cardId per slot
  bench: number[];             // up to BENCH_SIZE cardIds
}

export function emptySelection(formation: Formation): XISelection {
  return { starters: formation.slots.map(() => null), bench: [] };
}

export function startersFilled(sel: XISelection): number {
  return sel.starters.filter((x) => x != null).length;
}

/**
 * Auto-fill the selection. `mode: 'all'` clears first and picks a full XI+bench;
 * `mode: 'empty'` keeps current placements and only fills the gaps. Eligible
 * players (by slot position) are preferred; otherwise the best remaining is used.
 */
export function autoFill(
  pool: Card[],
  formation: Formation,
  current: XISelection,
  mode: 'all' | 'empty',
): XISelection {
  const next: XISelection =
    mode === 'all'
      ? emptySelection(formation)
      : { starters: [...current.starters], bench: [...current.bench] };

  const used = new Set<number>([
    ...next.starters.filter((x): x is number => x != null),
    ...next.bench,
  ]);
  const remaining = () =>
    pool.filter((c) => !used.has(c.id)).sort((a, b) => b.power - a.power);

  // Best eligible (fallback: best remaining) into each empty starter slot.
  formation.slots.forEach((slot, i) => {
    if (next.starters[i] != null) return;
    const avail = remaining();
    const pick = avail.find((c) => positionFitsSlot(c.position, slot)) ?? avail[0];
    if (pick) {
      next.starters[i] = pick.id;
      used.add(pick.id);
    }
  });

  // Top up the bench with the best remaining players.
  for (const c of remaining()) {
    if (next.bench.length >= BENCH_SIZE) break;
    next.bench.push(c.id);
    used.add(c.id);
  }

  return next;
}
