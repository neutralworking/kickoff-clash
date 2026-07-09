/**
 * KC six-contest engine (NW-139 Fork A) — the positional layer as a graph.
 *
 * The formation is a graph (CARD_SYSTEM_V2_CHANGES §2): each slot has a LINE
 * (depth) and a LANE (L/C/R). Depth is REFERENCE-FRAME ONLY — contests still
 * resolve as global team totals (contests.ts); the graph just routes which slot
 * a positional action targets.
 *
 * Five references: in-front · behind · beside · same-lane · opposite (opposite
 * is cross-team — the marking matchup, the enemy slot in your lane one line up).
 *
 * DISCIPLINE RULE (loose coupling): a positional action targets the OCCUPANT of
 * a related slot and applies a FIXED effect; it may NOT read that occupant's
 * role or traits. Structure-reference, never card-reference. These resolvers
 * therefore return slot indices only — the caller applies a fixed magnitude to
 * whoever sits there.
 */

import type { Position } from './contests';

export type Lane = 'L' | 'C' | 'R';

/** Depth line per position (GK deepest = 0, forwards highest = 5). */
export const LINE_OF: Record<Position, number> = {
  GK: 0,
  CD: 1,
  WD: 1,
  DM: 2,
  CM: 3,
  WM: 3,
  AM: 4,
  WF: 5,
  CF: 5,
};

/** Positions that occupy a wide lane; everything else is central. */
const WIDE: ReadonlySet<Position> = new Set<Position>(['WD', 'WM', 'WF']);

export interface Slot {
  index: number;
  pos: Position;
  line: number;
  lane: Lane;
}

/**
 * Build a slot graph from an ordered position list. Lanes are assigned L→R
 * within each line for wide positions (two wide of the same line become L and
 * R); central positions sit in C. Deterministic in the input order.
 */
export function buildSlots(positions: Position[]): Slot[] {
  const slots: Slot[] = positions.map((pos, index) => ({
    index,
    pos,
    line: LINE_OF[pos],
    lane: 'C' as Lane,
  }));
  // assign L/R to wide slots line by line, in field order
  const byLine = new Map<number, Slot[]>();
  for (const s of slots) {
    if (!WIDE.has(s.pos)) continue;
    const arr = byLine.get(s.line) ?? [];
    arr.push(s);
    byLine.set(s.line, arr);
  }
  for (const arr of byLine.values()) {
    arr.forEach((s, i) => {
      s.lane = i === 0 ? 'L' : 'R';
    });
  }
  return slots;
}

const laneMatch = (a: Slot, b: Slot) => a.lane === b.lane;

/** The slots in a lane at the line nearest to `s` on one side (up or down). */
function nearestInLane(pool: Slot[], s: Slot, dir: 1 | -1): number[] {
  const ahead = pool.filter((o) => o !== s && o.lane === s.lane && Math.sign(o.line - s.line) === dir);
  if (!ahead.length) return [];
  const nearestLine = ahead.reduce(
    (best, o) => (Math.abs(o.line - s.line) < Math.abs(best - s.line) ? o.line : best),
    ahead[0].line
  );
  return ahead.filter((o) => o.line === nearestLine).map((o) => o.index);
}

/**
 * In-front: the nearest slot(s) ahead in the same lane (a fullback's winger is
 * "the man ahead in the lane" even across a line gap — CARD_ACTIONS_V1 Overlap).
 */
export function inFront(slots: Slot[], i: number): number[] {
  return nearestInLane(slots, slots[i], 1);
}

/** Behind: the nearest slot(s) behind in the same lane (Anchor's Shield → CBs). */
export function behind(slots: Slot[], i: number): number[] {
  return nearestInLane(slots, slots[i], -1);
}

/** Beside: same line, an adjacent (different) lane. */
export function beside(slots: Slot[], i: number): number[] {
  const s = slots[i];
  return slots.filter((o) => o.index !== i && o.line === s.line && o.lane !== s.lane).map((o) => o.index);
}

/** Same-lane: any other slot sharing the lane. */
export function sameLane(slots: Slot[], i: number): number[] {
  const s = slots[i];
  return slots.filter((o) => o.index !== i && laneMatch(o, s)).map((o) => o.index);
}

/**
 * Opposite (cross-team): the nearest enemy slot ahead in your lane — the
 * marking matchup (a fullback's man is the winger he faces). Returns indices
 * into the OPPONENT's slot list.
 */
export function opposite(oppSlots: Slot[], slots: Slot[], i: number): number[] {
  const s = slots[i];
  const ahead = oppSlots.filter((o) => o.lane === s.lane && o.line > s.line);
  if (!ahead.length) return [];
  const nearestLine = ahead.reduce((best, o) => (o.line < best ? o.line : best), ahead[0].line);
  return ahead.filter((o) => o.line === nearestLine).map((o) => o.index);
}

/**
 * Off-position soft-tilt (§6): a card played off its native position softens
 * its tilt one step (natural→stretch, i.e. −1, floored at 0). Versatile waives
 * it. Returns the effective tilt to use for the dial aggregation.
 */
export function effectiveTilt(tilt: number, nativePos: Position, slotPos: Position, versatile = false): number {
  if (versatile || nativePos === slotPos) return tilt;
  return Math.max(0, tilt - 1);
}
