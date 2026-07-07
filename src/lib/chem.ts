/**
 * Kickoff Clash — Run-accumulated chemistry (engine v1, CARDS §5)
 *
 * Distinct from the legacy positional combos in `chemistry.ts` (which still feed the
 * cascade). This is the redesign's model:
 *
 *   - **Pairwise, run-accumulated, no decay.** A co-appearance counter per card-pair
 *     ticks up while both are on the pitch; chemistry = f(co-appearances). Resets each
 *     run (the matrix lives in RunState; permadeath wipes it). Churn taxes you by
 *     foregone accumulation, not active decay.
 *   - **Payoff = a zonal field connection bonus.** A chemistry'd pair placed in
 *     *connecting* cells (a passing link — adjacent lane or band) emits a bonus into
 *     the forward cell, scaling with accumulated chemistry. So it rewards stable
 *     partnerships (time) AND smart placement (connecting zones).
 *   - Plus **nationality** (static link) and **trait links** (here: shared archetype).
 *
 * Player-only: the opponent is generated fresh each match (no shared history); its
 * `OPP_COHESION` stands in for team coordination. A settled core peaks toward the
 * run's climax — the combinatorial compounding source from ARCHETYPES §0.
 *
 * The bonus is emitted as squad TraitRecords (verbs.ts `generate` with a `to` cell),
 * so it flows through the same dispatcher as everything else.
 */

import type { Card } from './scoring';
import type { Cell, Band, Lane } from './field';
import { cellOf, bandOf, laneOf } from './field';
import type { Formation } from './formations';

/** Per-pair co-appearance counts, keyed by sorted id pair. Serialisable (RunState). */
export type CoAppearance = Record<string, number>;

/** Tuning dials (CARDS §8 / DESIGN §7). */
const CHEM_TAU = 18;        // co-appearances for ~63% of the earned curve (≈3–4 matches)
const NATION_BASE = 0.25;   // same-nation static link
const TRAIT_BASE = 0.15;    // trait link (shared archetype) static bonus
const EARNED_WEIGHT = 0.7;  // how much of full chemistry is earned vs static

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function coApp(matrix: CoAppearance, a: number, b: number): number {
  return matrix[pairKey(a, b)] ?? 0;
}

/**
 * Increment every on-pitch pair by `increments` (run-accumulated, no decay). Pure —
 * returns a new matrix. Called once per match from the run layer.
 */
export function accrueMatch(matrix: CoAppearance, xiIds: number[], increments: number): CoAppearance {
  const out: CoAppearance = { ...matrix };
  for (let i = 0; i < xiIds.length; i++) {
    for (let j = i + 1; j < xiIds.length; j++) {
      const k = pairKey(xiIds[i], xiIds[j]);
      out[k] = (out[k] ?? 0) + increments;
    }
  }
  return out;
}

/**
 * Drop every pair involving a card — the churn tax (ECONOMY §3/§5): selling or
 * replacing a card forfeits its accumulated chemistry. Pure.
 */
export function pruneCard(matrix: CoAppearance, cardId: number): CoAppearance {
  const out: CoAppearance = {};
  for (const key of Object.keys(matrix)) {
    const [a, b] = key.split(':').map(Number);
    if (a !== cardId && b !== cardId) out[key] = matrix[key];
  }
  return out;
}

/**
 * Chemistry strength for a pair: a saturating earned curve over co-appearances, plus
 * static links (nationality, shared archetype). 0..1.
 */
export function chemistryStrength(co: number, sameNation: boolean, traitLink: boolean): number {
  const earned = 1 - Math.exp(-Math.max(0, co) / CHEM_TAU);
  const stat = (sameNation ? NATION_BASE : 0) + (traitLink ? TRAIT_BASE : 0);
  return Math.min(1, earned * EARNED_WEIGHT + stat);
}

const BAND_RANK: Record<Band, number> = { DEF: 0, MID: 1, ATT: 2 };

/** A passing link: same lane & band-adjacent, or same band & lane-adjacent. */
function cellsConnect(a: Cell, b: Cell): boolean {
  if (a === b) return false;
  const la = laneOf(a), lb = laneOf(b), ba = bandOf(a), bb = bandOf(b);
  const bandAdj = Math.abs(BAND_RANK[ba] - BAND_RANK[bb]) === 1;
  const laneOrder: Record<Lane, number> = { L: 0, C: 1, R: 2 };
  const laneAdj = Math.abs(laneOrder[la] - laneOrder[lb]) === 1;
  return (la === lb && bandAdj) || (ba === bb && laneAdj);
}

/** One live chemistry link between two placed cards (SCORING_V2: flat points). */
export interface ChemLink {
  aId: number;
  bId: number;
  aName: string;
  bName: string;
  /** 0..1 — the earned + static link strength. points.ts converts to flat mods. */
  strength: number;
}

/**
 * The XI's live chemistry links: each CONNECTING pair (adjacent lane or band — a
 * real passing link on the pitch) with its accumulated strength. SCORING_V2: the
 * payoff is flat points (points.ts `chemistry` mods), never a multiplier — this
 * just reports the links.
 */
export function chemistryLinks(xi: Card[], formation: Formation, matrix: CoAppearance): ChemLink[] {
  const cells: Cell[] = xi.map((_, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    return cellOf(slot.x, slot.y);
  });

  const links: ChemLink[] = [];
  for (let i = 0; i < xi.length; i++) {
    for (let j = i + 1; j < xi.length; j++) {
      if (!cellsConnect(cells[i], cells[j])) continue;
      const sameNation = !!xi[i].nation && xi[i].nation === xi[j].nation;
      const traitLink = xi[i].archetype === xi[j].archetype;
      const strength = chemistryStrength(coApp(matrix, xi[i].id, xi[j].id), sameNation, traitLink);
      if (strength <= 0) continue;
      links.push({ aId: xi[i].id, bId: xi[j].id, aName: xi[i].name, bName: xi[j].name, strength });
    }
  }
  return links;
}
