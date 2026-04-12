// ---------------------------------------------------------------------------
// Fan geometry — computes transform values for cards in a hand layout
// ---------------------------------------------------------------------------

export interface FanSlot {
  rotate: number;       // degrees
  translateY: number;   // px (positive = down)
  marginRight: number;  // px (negative for overlap)
  zIndex: number;
  scale: number;
}

export interface FanOptions {
  maxArcDeg: number;      // total spread in degrees (e.g. 18 for tight, 30 for wide)
  overlapPx: number;      // negative margin between cards (e.g. -16)
  selectedIndex: number | null;
}

/**
 * Compute transform values for a single card in a fan.
 * Center card is straight (0deg), edges fan outward with parabolic dip.
 */
export function computeFanSlot(
  index: number,
  total: number,
  opts: FanOptions,
): FanSlot {
  const { maxArcDeg, overlapPx, selectedIndex } = opts;

  if (total <= 1) {
    return {
      rotate: 0,
      translateY: 0,
      marginRight: 0,
      zIndex: 1,
      scale: selectedIndex === 0 ? 1.08 : 1,
    };
  }

  // Angle: evenly spread from -halfArc to +halfArc
  const halfArc = maxArcDeg / 2;
  const step = maxArcDeg / (total - 1);
  const angle = -halfArc + index * step;

  // Parabolic dip: edges drop more
  const normalizedDist = Math.abs(angle) / halfArc; // 0 at center, 1 at edges
  const dip = normalizedDist * normalizedDist * 8; // max 8px dip at edges

  const isSelected = selectedIndex === index;
  const isLast = index === total - 1;

  return {
    rotate: isSelected ? 0 : angle,
    translateY: isSelected ? -28 : dip,
    marginRight: isLast ? 0 : overlapPx,
    zIndex: isSelected ? 50 : index + 1,
    scale: isSelected ? 1.08 : 1,
  };
}

/**
 * Auto-calculate overlap based on container width and card count.
 * Ensures cards fit within the container.
 */
export function autoOverlap(
  containerWidth: number,
  cardWidth: number,
  total: number,
): number {
  if (total <= 1) return 0;
  const totalCardWidth = cardWidth * total;
  const availableSpace = containerWidth - 24; // 12px padding each side
  if (totalCardWidth <= availableSpace) return 0;
  const neededOverlap = (totalCardWidth - availableSpace) / (total - 1);
  return -Math.min(Math.ceil(neededOverlap), cardWidth * 0.4); // max 40% overlap
}
