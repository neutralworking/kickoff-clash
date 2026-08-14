import type { Formation, FormationSlot } from './formations';

export interface LineupPitchPosition {
  x: number;
  y: number;
}

/**
 * Presentation coordinates for the compact team-selection pitch.
 *
 * The authored formation coordinates are match geometry. They are intentionally
 * subtle (for example, a wide midfielder may be only a few points deeper than a
 * central midfielder), which does not leave enough room for a 64x92 card on a
 * phone. Each supported shape therefore gets its own readable card layout while
 * retaining the authored slot order and tactical structure.
 */
export const LINEUP_LAYOUTS: Readonly<Record<string, readonly LineupPitchPosition[]>> = {
  '4-3-3': [
    { x: 50, y: 100 },
    { x: 5, y: 73 }, { x: 30, y: 74 }, { x: 70, y: 74 }, { x: 95, y: 73 },
    { x: 50, y: 54 },
    { x: 25, y: 38 }, { x: 75, y: 38 },
    { x: 5, y: 12 }, { x: 50, y: 4 }, { x: 95, y: 12 },
  ],
  '4-4-2': [
    { x: 50, y: 100 },
    { x: 5, y: 68 }, { x: 30, y: 68 }, { x: 70, y: 68 }, { x: 95, y: 68 },
    { x: 5, y: 34 }, { x: 35, y: 34 }, { x: 65, y: 34 }, { x: 95, y: 34 },
    { x: 30, y: 0 }, { x: 70, y: 0 },
  ],
  '3-5-2': [
    { x: 50, y: 100 },
    { x: 23, y: 67 }, { x: 50, y: 67 }, { x: 77, y: 67 },
    { x: 0, y: 33 }, { x: 25, y: 33 }, { x: 50, y: 33 }, { x: 75, y: 33 }, { x: 100, y: 33 },
    { x: 30, y: 0 }, { x: 70, y: 0 },
  ],
  '4-2-3-1': [
    { x: 50, y: 100 },
    { x: 0, y: 76 }, { x: 33, y: 76 }, { x: 67, y: 76 }, { x: 100, y: 76 },
    { x: 20, y: 50 }, { x: 80, y: 50 },
    { x: 0, y: 25 }, { x: 35, y: 25 }, { x: 100, y: 25 },
    { x: 50, y: 0 },
  ],
  '3-4-3': [
    { x: 50, y: 100 },
    { x: 23, y: 67 }, { x: 50, y: 67 }, { x: 77, y: 67 },
    { x: 5, y: 34 }, { x: 35, y: 34 }, { x: 65, y: 34 }, { x: 95, y: 34 },
    { x: 5, y: 0 }, { x: 50, y: 0 }, { x: 95, y: 0 },
  ],
  '5-3-2': [
    { x: 50, y: 100 },
    { x: 0, y: 62 }, { x: 24, y: 70 }, { x: 50, y: 66 }, { x: 76, y: 70 }, { x: 100, y: 62 },
    { x: 22, y: 33 }, { x: 50, y: 33 }, { x: 78, y: 33 },
    { x: 30, y: 0 }, { x: 70, y: 0 },
  ],
  '5-4-1': [
    { x: 50, y: 100 },
    { x: 0, y: 62 }, { x: 20, y: 70 }, { x: 50, y: 66 }, { x: 80, y: 70 }, { x: 100, y: 62 },
    { x: 5, y: 22 }, { x: 35, y: 44 }, { x: 65, y: 44 }, { x: 95, y: 22 },
    { x: 50, y: 0 },
  ],
  '4-1-2-1-2': [
    { x: 50, y: 100 },
    { x: 5, y: 73 }, { x: 30, y: 74 }, { x: 70, y: 74 }, { x: 95, y: 73 },
    { x: 50, y: 57 },
    { x: 18, y: 40 }, { x: 82, y: 40 },
    { x: 50, y: 25 },
    { x: 25, y: 3 }, { x: 75, y: 3 },
  ],
};

export function lineupPitchPosition(
  formation: Pick<Formation, 'id'>,
  slot: FormationSlot,
  slotIndex: number,
): LineupPitchPosition {
  return LINEUP_LAYOUTS[formation.id]?.[slotIndex] ?? { x: slot.x, y: slot.y };
}
