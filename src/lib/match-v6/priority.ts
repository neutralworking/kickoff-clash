/**
 * Kickoff Clash V6 — reveal priority (spec B5).
 *
 * Initial priority is seeded-random and shown pre-kickoff. After each period the
 * side controlling MORE sectors (greater ATT+DEF in a sector) gets priority for
 * the next reveal; tiebreak 1 is total ATT+DEF across all sectors; tiebreak 2
 * alternates from the previous period.
 *
 * "Having priority" only means resolving your locked sequence FIRST (spec A1) —
 * it is not inherently good or bad, so this rule is a skill signal, not a
 * rubber-band. The sim watches lead-stickiness for snowball (spec D2).
 */

import type { BoardReceipt, TeamSide } from './types';
import { boardStrength, sectorControl } from './board';
import { makeRng, nextFloat } from './random';

/** Seeded initial priority (visible before kickoff). */
export function initialPriority(seed: number): TeamSide {
  const [f] = nextFloat(makeRng(seed ^ 0x9e3779b9));
  return f < 0.5 ? 'player' : 'opponent';
}

/** Next reveal priority from the end-of-period boards (spec B5). */
export function nextPriority(player: BoardReceipt, opponent: BoardReceipt, previous: TeamSide): TeamSide {
  const control = sectorControl(player, opponent);
  if (control.controlled.player > control.controlled.opponent) return 'player';
  if (control.controlled.opponent > control.controlled.player) return 'opponent';

  const ps = boardStrength(player);
  const os = boardStrength(opponent);
  if (ps > os) return 'player';
  if (os > ps) return 'opponent';

  return previous === 'player' ? 'opponent' : 'player';
}
