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
import type { TraitRecord } from './verbs';

/** Per-pair co-appearance counts, keyed by sorted id pair. Serialisable (RunState). */
export type CoAppearance = Record<string, number>;

/** Tuning dials (CARDS §8 / DESIGN §7). */
const CHEM_TAU = 18;        // co-appearances for ~63% of the earned curve (≈3–4 matches)
const NATION_BASE = 0.25;   // same-nation static link
const TRAIT_BASE = 0.15;    // trait link (shared archetype) static bonus
const EARNED_WEIGHT = 0.7;  // how much of full chemistry is earned vs static
const CHEM_GAIN = 0.16;     // connection-bonus magnitude per (strength × avg power)

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

/**
 * Chemistry connection bonuses for the XI: each connecting pair emits a bonus
 * (attack + creation) into the forward cell of the link, scaling with the pair's
 * chemistry and combined power. Returns squad TraitRecords for the dispatcher.
 */
export function chemistryRecords(xi: Card[], formation: Formation, matrix: CoAppearance): TraitRecord[] {
  const cells: Cell[] = xi.map((_, i) => {
    const slot = formation.slots[i] ?? formation.slots[formation.slots.length - 1];
    return cellOf(slot.x, slot.y);
  });

  const recs: TraitRecord[] = [];
  for (let i = 0; i < xi.length; i++) {
    for (let j = i + 1; j < xi.length; j++) {
      const ca = cells[i];
      const cb = cells[j];
      if (!cellsConnect(ca, cb)) continue;

      const sameNation = !!xi[i].nation && xi[i].nation === xi[j].nation;
      const traitLink = xi[i].archetype === xi[j].archetype;
      const strength = chemistryStrength(coApp(matrix, xi[i].id, xi[j].id), sameNation, traitLink);
      if (strength <= 0) continue;

      // Deposit into the more advanced cell — the link's end product.
      const fwd = BAND_RANK[bandOf(ca)] >= BAND_RANK[bandOf(cb)] ? ca : cb;
      const band = bandOf(fwd);
      const lane = laneOf(fwd);
      const avgPower = (xi[i].power + xi[j].power) / 2;
      const amount = strength * avgPower * CHEM_GAIN;
      if (amount <= 0) continue;

      // A settled partnership keeps the ball (possession) and opens chances (creation).
      recs.push({ name: 'Chemistry', verb: 'generate', params: { amount }, scope: 'zone', target: { kind: 'zone', zone: 'possession' }, to: { band, lane } });
      recs.push({ name: 'Chemistry', verb: 'generate', params: { amount: amount * 0.6 }, scope: 'zone', target: { kind: 'zone', zone: 'creation' }, to: { band, lane } });
    }
  }
  return recs;
}
