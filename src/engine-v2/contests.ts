/**
 * KC six-contest engine (NW-139 Fork A) — the contest core (CARD_SYSTEM_V2 §2/§4).
 *
 * Six contests in three mirror-pairs. Each RESOLVES AS A GLOBAL TEAM TOTAL —
 * the positional graph (positional.ts) only routes which slot an action
 * targets, it never makes a contest lane-local (CARD_SYSTEM_V2_CHANGES §2).
 *
 *   Possession  KEEP  ⟷ PRESS   → the possession split (6 slots, clamp 2–4)
 *   Chances     CREATE ⟷ BREAK  → chance volume (+ the retain→BREAK coupling)
 *   Goals       FINISH ⟷ STOP   → xG conversion  (goal = 1 − e^(−xG))
 *
 * A tilt is a flat contest-native weight (§4): +2 natural, +1 stretch. Stacking
 * is linear; the only ceiling is what a legal 4-3-3 can physically field —
 * enforced by the role map, surfaced as `TILT_CEILING` (the §7 numbers). A tilt
 * never touches printed ATT/DEF; it pushes the contest's own dial.
 */

export type Contest = 'KEEP' | 'PRESS' | 'CREATE' | 'BREAK' | 'FINISH' | 'STOP';

export const CONTESTS: readonly Contest[] = [
  'KEEP',
  'PRESS',
  'CREATE',
  'BREAK',
  'FINISH',
  'STOP',
];

/** Each contest's mirror (the lever it is fought against). */
export const MIRROR: Record<Contest, Contest> = {
  KEEP: 'PRESS',
  PRESS: 'KEEP',
  CREATE: 'BREAK',
  BREAK: 'CREATE',
  FINISH: 'STOP',
  STOP: 'FINISH',
};

/**
 * Real ceilings a legal 4-3-3 can reach on each dial (CARD_SYSTEM_V2_CHANGES §7).
 * The sharpest dial (FINISH) is the LEAST stackable — this is the balance
 * backstop, not a hard clamp in code. The harness asserts the engine's own
 * squad builder observes these.
 */
export const TILT_CEILING: Record<Contest, number> = {
  KEEP: 12,
  CREATE: 10,
  BREAK: 10,
  PRESS: 9,
  STOP: 9,
  FINISH: 8,
};

export type Position = 'GK' | 'CD' | 'WD' | 'DM' | 'CM' | 'WM' | 'AM' | 'WF' | 'CF';

/** Positions that count toward the back line — STOP is the MEAN of their DEF (§2). */
export const DEF_POS: ReadonlySet<Position> = new Set<Position>(['GK', 'CD', 'WD']);

/** A player card as the engine consumes it — printed stats + a role tilt. */
export interface Card {
  id: string;
  role: string;
  pos: Position;
  /** The contest this card's role leans into (§3). */
  contest: Contest;
  /** Flat tilt weight: 2 natural, 1 stretch, 0 = no role tilt (a taker). */
  tilt: number;
  att: number;
  def: number;
  /** Waives the off-position soft-tilt (CARD_SYSTEM_V2_CHANGES §6). */
  versatile?: boolean;
  /** relocate: fold this card's tilt into the squad's most-committed contest. */
  relocate?: boolean;
  /** Aerial keyword on the DEF axis — attacks/defends dead-balls (§5). */
  aerial?: boolean;
}

/**
 * Aggregate a side's role tilts into contest dials (§4). `relocate` cards fold
 * their tilt into the side's otherwise-most-committed contest; that fold is
 * computed after the base pass so it can read the committed total.
 */
export function contestDials(cards: Card[]): Record<Contest, number> {
  const dials: Record<Contest, number> = {
    KEEP: 0,
    PRESS: 0,
    CREATE: 0,
    BREAK: 0,
    FINISH: 0,
    STOP: 0,
  };
  const relocators: Card[] = [];
  for (const c of cards) {
    if (c.relocate) {
      relocators.push(c);
      continue;
    }
    dials[c.contest] += c.tilt;
  }
  if (relocators.length) {
    // most-committed contest from the base pass (deterministic tie-break by order)
    let best: Contest = 'KEEP';
    for (const k of CONTESTS) if (dials[k] > dials[best]) best = k;
    for (const c of relocators) dials[best] += c.tilt;
  }
  return dials;
}

/** Mean effective DEF of the back line — the STOP term in the shot formula. */
export function backlineDef(cards: Card[]): number {
  const ds = cards.filter((c) => DEF_POS.has(c.pos)).map((c) => c.def);
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 40;
}

/** Mean of the top-k ATT — the attacking stat term in the shot formula. */
export function topAtt(cards: Card[], k = 3): number {
  const sorted = [...cards].map((c) => c.att).sort((a, b) => b - a);
  const top = sorted.slice(0, k);
  return top.reduce((a, b) => a + b, 0) / top.length;
}

/** Mean of the top-k DEF — the aerial pool for set pieces (DEF-keyed, §7). */
export function topDef(cards: Card[], k = 4): number {
  const sorted = [...cards].map((c) => c.def).sort((a, b) => b - a);
  const top = sorted.slice(0, k);
  return top.reduce((a, b) => a + b, 0) / top.length;
}
