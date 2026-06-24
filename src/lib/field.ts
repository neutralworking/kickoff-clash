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

/** The 9 field cells in a fixed, band-major order (determinism: stable iteration). */
export const CELLS: Cell[] = BANDS.flatMap((band) => LANES.map((lane): Cell => `${band}_${lane}`));

/** Tunable contest constants (DESIGN §7 — playtest dials). */
export const FIELD_CONST = {
  k: 1.1,            // contest convexity (near-linear: balanced shapes stay viable)
  oppReact: 0.5,     // how hard the opponent's cover shifts toward our strong lanes
  coverPool: 0.6,    // share of our defensive cover that is mobile/shared across lanes
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

const total = (r: Record<Lane, number>): number => r.L + r.C + r.R;

/**
 * Your attacking threat vs the opponent's *positioned* per-lane cover. Now that the
 * opponent is a real XI (step 4), the base cover per lane comes from its actual
 * shape; on top of that the defender — the reactive AI — shifts a mobile fraction
 * (`oppReact`) toward whichever lanes you load heaviest. So overloading a lane the
 * opponent left structurally thin is rewarded, but a predictable overload gets met.
 * Returns a pressure ratio (~1.0 when evenly matched), averaged over lanes.
 */
export function attackVsCover(push: Record<Lane, number>, cover: Record<Lane, number>): number {
  const { k, oppReact } = FIELD_CONST;
  const pushSum = total(push) || 1;
  const coverSum = total(cover);
  let acc = 0;
  for (const lane of LANES) {
    const base = cover[lane] * (1 - oppReact);
    const reactive = coverSum * oppReact * (push[lane] / pushSum);
    const eff = Math.max(1, base + reactive);
    acc += Math.pow(push[lane] / eff, k);
  }
  return acc / LANES.length;
}

/**
 * The opponent's positioned per-lane push vs your cover. You committed your shape,
 * so you can't read them mid-increment — but most of your cover is a mobile reserve
 * (`coverPool`) shared across lanes, so a lane you stripped still has some backup
 * while a genuinely thin lane leaks more.
 */
export function pushVsReserveCover(push: Record<Lane, number>, cover: Record<Lane, number>): number {
  const { k, coverPool } = FIELD_CONST;
  const reserve = (total(cover) * coverPool) / LANES.length;
  let acc = 0;
  for (const lane of LANES) {
    const eff = cover[lane] * (1 - coverPool) + reserve;
    acc += Math.pow(push[lane] / Math.max(1, eff), k);
  }
  return acc / LANES.length;
}
