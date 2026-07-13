/**
 * Kickoff Clash — pitch token placement geometry.
 *
 * A pitch token is absolutely positioned at its formation slot's x/y percentage
 * with translate(-50%,-50%). But a token has REAL width/height, so a raw slot at
 * an extreme x (a wing-back at x≈8, a winger at x≈92) puts half the token off the
 * green — it spills onto the black surround. The fix is to remap the formation's
 * full [0,100] range into a SAFE INTERIOR BAND, inset by half the token's size
 * (plus a little breathing room), so the token's FULL footprint stays inside the
 * pitch rect at every formation and every viewport width.
 *
 * The remap is a linear compression toward the pitch centre, expressed as a CSS
 * calc that mixes the fixed inset (px) with the pitch's own size (100%), so it's
 * responsive — no measurement or ResizeObserver needed. `pitchAxisFrac` is the
 * numeric counterpart for hit-testing a drag against a measured pitch rect, so
 * the rendered token and the drop-target maths never drift.
 */

/** The CSS `left`/`top` value for a token at `pct` (0–100) on an axis whose token
 *  half-extent + edge padding is `inset` px. Maps [0,100] → [inset, size−inset]. */
export function pitchAxis(pct: number, inset: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  return `calc(${inset}px + ${t.toFixed(4)} * (100% - ${inset * 2}px))`;
}

/** The 0–1 fraction of the pitch a token centre lands at, for a pitch `size` px.
 *  Mirrors `pitchAxis` exactly (used by drag hit-testing). */
export function pitchAxisFrac(pct: number, inset: number, size: number): number {
  const t = Math.max(0, Math.min(1, pct / 100));
  return (inset + t * (size - inset * 2)) / size;
}
