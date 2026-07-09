/**
 * KC six-contest engine (NW-141) — the headless shop-bot draft.
 *
 * Given a shop stream (a pool of cards) and a manager, draft a legal XI in the
 * manager's formation that COMMITS to the manager's contest (so the reweight
 * fires — NW-140). The acceptance: from random shop streams, a viable committed
 * XI is draftable for all 11 managers.
 */

import { type Contest, type Position, contestDials } from './contests';
import { FORMATIONS } from './adherence';
import { COMMIT_MIN, type Manager } from './managers';
import type { KCCard } from './cards';

export interface DraftResult {
  xi: KCCard[];
  dials: Record<Contest, number>;
  favoured: Contest;
  committed: boolean;
}

/**
 * Fill the manager's formation from the pool, preferring cards that tilt the
 * manager's favoured contest (to reach commitment), then by raw ATT+DEF.
 * Returns null if a formation position cannot be filled from the pool.
 */
export function draftForManager(pool: KCCard[], manager: Manager): DraftResult | null {
  const formation: Position[] = FORMATIONS[manager.formation];
  const favoured = manager.favoured;

  const byPos = new Map<Position, KCCard[]>();
  for (const c of pool) (byPos.get(c.pos) ?? byPos.set(c.pos, []).get(c.pos)!).push(c);

  const score = (c: KCCard) => (c.contest === favoured ? 1000 + c.tilt * 100 : 0) + c.att + c.def;
  for (const arr of byPos.values()) arr.sort((a, b) => score(b) - score(a));

  const used = new Set<string>();
  const xi: KCCard[] = [];
  for (const pos of formation) {
    const cand = (byPos.get(pos) ?? []).find((c) => !used.has(c.id));
    if (!cand) return null; // can't field this formation from the stream
    used.add(cand.id);
    xi.push(cand);
  }

  const dials = contestDials(xi);
  return { xi, dials, favoured, committed: dials[favoured] >= COMMIT_MIN[favoured] };
}
