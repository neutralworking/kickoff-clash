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

// The 18-card active deck is the full matchday squad: 11 starters + 7 substitutes.
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

// ---------------------------------------------------------------------------
// Competence — how well a card fits the slot it's placed in. `slot.accepts` is
// already ordered best-fit-first (formations.ts SLOT_ACCEPTS): index 0 is the
// slot's nominal position, later entries are looser fits, and anything absent
// is a genuine mismatch. This is the real data behind "MISFIT" — no new
// taxonomy, just reading the eligibility table we already draft against.
// ---------------------------------------------------------------------------

export type Competence = 'primary' | 'secondary' | 'incompetent';

export function competenceOf(cardPosition: string, slot: { accepts: string[] }): Competence {
  const idx = slot.accepts.indexOf(cardPosition);
  if (idx === 0) return 'primary';
  if (idx > 0) return 'secondary';
  return 'incompetent';
}

/** v4 squad-management handoff: the competence pill colours (bg + legible text),
 *  the single source of truth for the token's position-pill background on both
 *  the team-select and match pitches. */
export const COMPETENCE_COLOR: Record<Competence, { bg: string; text: string }> = {
  primary: { bg: '#2f8f4e', text: '#eafaef' },
  secondary: { bg: '#d99a2b', text: '#1a1206' },
  incompetent: { bg: '#b23b2f', text: '#ffe8e6' },
};

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

// ---------------------------------------------------------------------------
// Fitness-aware auto-select (the in-match "auto-select" default).
// ---------------------------------------------------------------------------

/** Fitness-adjusted strength for ranking. Raw power tapered by condition (mirrors the
 *  engine's fitnessFactor: 100 → ×1.0, 0 → ×0.6) so tired players drop down the order;
 *  injured players are pushed to the bottom so auto-select rests them. */
export function effectiveStrength(c: Card): number {
  const fit = Math.max(0, Math.min(100, c.fitness ?? 100));
  const fitMult = 0.6 + 0.004 * fit;
  return c.power * fitMult * (c.injured ? 0.2 : 1);
}

/**
 * Auto-pick the strongest legal XI from `pool` for `formation`, position-aware. With
 * `fitnessAware` (the in-match default) players rank by fitness-adjusted strength, so
 * tired/injured starters drop to the bench and fresh legs come in. Returns Cards in
 * formation-slot order (xi[i] ↔ slots[i]) plus the remaining bench, best-first.
 */
export function autoFillXI(
  pool: Card[],
  formation: Formation,
  fitnessAware = true,
): { xi: Card[]; bench: Card[] } {
  const score = fitnessAware ? effectiveStrength : (c: Card) => c.power;
  const used = new Set<number>();
  const remaining = () => pool.filter((c) => !used.has(c.id)).sort((a, b) => score(b) - score(a));

  const xi: Card[] = [];
  for (const slot of formation.slots) {
    const avail = remaining();
    const pick = avail.find((c) => positionFitsSlot(c.position, slot)) ?? avail[0];
    if (pick) {
      xi.push(pick);
      used.add(pick.id);
    }
  }
  const bench = remaining();
  return { xi, bench };
}
