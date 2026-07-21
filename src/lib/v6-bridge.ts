/**
 * Live-card → V6-card bridge (migration Phase 2).
 *
 * The live roguelike keeps its 540-card collection, packs, run and real
 * portraits; the MATCH becomes V6. This maps a live `Card` onto the V6 engine's
 * `V6Card` so the card-deployment match can run on the real squad:
 *   • cost    — 1–6 from power (same bands as the card face).
 *   • sector  — centre for central roles, left/right for wide roles.
 *   • ATT/DEF — the V6 stat budget for the cost, split by the card's live
 *     ATK/DEF lean (so the six-contest ranges never leak into V6 thresholds).
 *   • action  — one V6 action from the card's rarity + attacking/defensive lean.
 *
 * This is a faithful-enough first pass; a bespoke trait→action catalogue can
 * replace `v6Action` later without changing callers.
 */

import type { Card } from './scoring';
import { deriveStats } from './funnel';
import { STAT_BUDGET_BY_COST, type Rarity, type Sector, type V6Action, type V6Card } from './match-v6';

const WIDE = new Set(['WD', 'WM', 'WF']);

/** V6 cost (1–6) from power — matches the card-face badge. */
export function v6Cost(card: Card): number {
  const p = card.power ?? 60;
  if (p < 60) return 1;
  if (p < 68) return 2;
  if (p < 76) return 3;
  if (p < 84) return 4;
  if (p < 90) return 5;
  return 6;
}

/** Central roles play centre; wide roles split left/right deterministically by id. */
export function v6Sector(card: Card): Sector {
  if (WIDE.has(card.position)) return card.id % 2 === 0 ? 'left' : 'right';
  return 'centre';
}

export function v6Rarity(rarity: string): Rarity {
  const s = (rarity ?? '').toLowerCase();
  if (s.includes('legend')) return 'legendary';
  if (s.includes('epic')) return 'epic';
  if (s.includes('rare')) return 'rare';
  if (s.includes('uncommon')) return 'uncommon';
  return 'common';
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
}

/** V6 attack/defence: the cost's stat budget, split by the live ATK/DEF lean. */
export function v6Stats(card: Card, cost: number): { attack: number; defence: number } {
  const live = deriveStats(card);
  const budget = STAT_BUDGET_BY_COST[cost] ?? 7;
  const la = Math.max(0, live.atk);
  const ld = Math.max(0, live.def);
  const total = Math.max(1, la + ld);
  const attack = Math.max(0, Math.min(budget, Math.round((budget * la) / total)));
  return { attack, defence: Math.max(0, budget - attack) };
}

/** One V6 action from rarity + attacking/defensive lean. */
function v6Action(card: Card, attack: number, defence: number, rarity: Rarity): V6Action[] {
  const attacker = attack >= defence;
  const elite = rarity === 'legendary' || rarity === 'epic';
  if (elite) {
    return attacker
      ? [{ kind: 'improve_die_faces', trigger: 'ongoing', faces: [5, 6], target: { which: 'first_in_sector' }, duration: 'ongoing' }]
      : [{ kind: 'cancel_chance', trigger: 'on_reveal', target: {}, count: 1 }];
  }
  return attacker
    ? [{ kind: 'modify_attack', trigger: 'ongoing', amount: 1, target: { scope: 'sector' }, duration: 'ongoing' }]
    : [{ kind: 'modify_defence', trigger: 'ongoing', amount: 1, target: { scope: 'sector' }, duration: 'ongoing' }];
}

/** Map a live `Card` to a V6 engine `V6Card`. */
export function toV6Card(card: Card): V6Card {
  const cost = v6Cost(card);
  const { attack, defence } = v6Stats(card, cost);
  const rarity = v6Rarity(card.rarity);
  return {
    id: `live_${card.id}`,
    name: card.name,
    shortName: shortName(card.name),
    position: card.position,
    role: card.tacticalRole ?? card.archetype,
    sector: v6Sector(card),
    cost,
    attack,
    defence,
    rarity,
    actions: v6Action(card, attack, defence, rarity),
  };
}
