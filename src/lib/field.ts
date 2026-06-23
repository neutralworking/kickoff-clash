/**
 * Kickoff Clash — Zonal field & coupled lane contest (engine v1, step 2)
 *
 * MATCH_ENGINE_V1 §4. The pitch is bucketed into 3 lanes × 3 bands = 9 cells from
 * formation slot x/y. A finite XI distributes power across them, so strengthening
 * one lane starves another. The mirror contest runs per lane, then aggregates.
 *
 * Design decisions for this build (confirmed with the design owner, diverging from
 * the literal §4 where noted):
 *   - COUPLED defence, not independent lanes: the opponent's finite defensive
 *     budget shifts to cover our strongest lanes, so overloading one lane is met
 *     while spreading forces them thin — and our own cover is the finite by-product
 *     of how many cards we commit forward. This is what makes "stretch / overload"
 *     counters real (§4's "lanes resolve independently" is relaxed).
 *   - CONVEXITY k starts near-linear (1.1), so a balanced, no-weak-lane shape is
 *     viable rather than mathematically dominated by single-lane overload.
 *   - Gentle resolution downstream: this module produces threat *ratios*; the
 *     existing volume×quality goal model consumes them (variance verbs widen toward
 *     Poisson tails — they are not the default).
 */

export type Band = 'ATT' | 'MID' | 'DEF';
export type Lane = 'L' | 'C' | 'R';
export type Cell = `${Band}_${Lane}`;

export const LANES: Lane[] = ['L', 'C', 'R'];
export const BANDS: Band[] = ['ATT', 'MID', 'DEF'];

/** Tunable contest constants (DESIGN §7 — playtest dials). */
export const FIELD_CONST = {
  k: 1.1,            // contest convexity (near-linear: balanced shapes stay viable)
  oppReact: 0.5,     // how hard the opponent's cover shifts toward our strong lanes
  coverPool: 0.6,    // share of our defensive cover that is mobile/shared across lanes
  pushW: { ATT: 1.0, MID: 0.5, DEF: 0.25 },   // attack push weights by band (overlapping FBs count a little)
  coverW: { DEF: 1.0, MID: 0.5, ATT: 0 },      // defensive cover weights by band
};

/** Bucket a formation slot's x/y into a field cell (§4). */
export function cellOf(x: number, y: number): Cell {
  const lane: Lane = x < 37 ? 'L' : x > 63 ? 'R' : 'C';
  const band: Band = y < 33 ? 'ATT' : y > 66 ? 'DEF' : 'MID';
  return `${band}_${lane}`;
}

export function bandOf(cell: Cell): Band {
  return cell.split('_')[0] as Band;
}
export function laneOf(cell: Cell): Lane {
  return cell.split('_')[1] as Lane;
}

export interface PlacedEmission {
  cell: Cell;
  attack: number;
  defence: number;
}

export interface LaneVectors {
  push: Record<Lane, number>;   // attacking threat we generate per lane
  cover: Record<Lane, number>;  // defensive cover we hold per lane
}

/**
 * Collapse placed per-card emission into per-lane attack push and defensive cover,
 * weighting bands per §4 (front-line attack and rear-line cover count fully;
 * midfield contributes to both at half weight).
 */
export function computeLaneVectors(placed: PlacedEmission[]): LaneVectors {
  const push: Record<Lane, number> = { L: 0, C: 0, R: 0 };
  const cover: Record<Lane, number> = { L: 0, C: 0, R: 0 };
  for (const p of placed) {
    const band = bandOf(p.cell);
    const lane = laneOf(p.cell);
    push[lane] += FIELD_CONST.pushW[band] * p.attack;
    cover[lane] += FIELD_CONST.coverW[band] * p.defence;
  }
  return { push, cover };
}

const total = (r: Record<Lane, number>): number => r.L + r.C + r.R;

/**
 * Our attacking threat vs a finite, *reactive* opponent defensive budget.
 * The opponent splits `oppDefence` across lanes: an even third plus a reactive
 * shift toward the lanes we load heaviest. So pure overload is covered, while a
 * spread pulls them thin — and stretching them wide opens the rest.
 * Returns a pressure ratio (~1.0 when evenly matched), averaged over lanes.
 */
export function coupledAttackThreat(push: Record<Lane, number>, oppDefence: number): number {
  const { k, oppReact } = FIELD_CONST;
  const sum = total(push) || 1;
  let acc = 0;
  for (const lane of LANES) {
    const share = push[lane] / sum;
    const cover = Math.max(1, oppDefence * ((1 - oppReact) / 3 + oppReact * share));
    acc += Math.pow(push[lane] / cover, k);
  }
  return acc / LANES.length;
}

/**
 * The opponent's threat against us. They attack evenly (baseline opponent has no
 * lane intent yet — opponent XIs arrive in step 4); our cover varies by lane, so a
 * lane we stripped to commit attackers forward is the one that gets punished.
 */
export function coupledDefenceThreat(cover: Record<Lane, number>, oppAttack: number): number {
  const { k, coverPool } = FIELD_CONST;
  // Coupling: most of our cover is a shared/mobile reserve, so a lane stripped to
  // push attackers forward still has backup — but a genuinely thin lane leaks more.
  const reserve = (total(cover) * coverPool) / LANES.length;
  let acc = 0;
  for (const lane of LANES) {
    const effCover = cover[lane] * (1 - coverPool) + reserve;
    acc += Math.pow(oppAttack / LANES.length / Math.max(1, effCover), k);
  }
  return acc / LANES.length;
}
