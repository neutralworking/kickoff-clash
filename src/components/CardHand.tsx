'use client';

import React from 'react';
import { computeFanSlot, autoOverlap, type FanOptions } from '../lib/fan-geometry';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CardHandProps {
  children: React.ReactNode;
  cardCount: number;
  cardWidth?: number;       // width of each card for overlap calc
  maxSpreadDeg?: number;    // total arc degrees (default 18)
  overlapPx?: number;       // override auto overlap
  selectedIndex?: number | null;
  label?: string;           // "Attack" / "Defend"
  labelColor?: string;
  containerWidth?: number;  // override for auto-overlap calc
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CardHand({
  children,
  cardCount,
  cardWidth = 82,
  maxSpreadDeg = 18,
  overlapPx,
  selectedIndex = null,
  label,
  labelColor,
  containerWidth,
}: CardHandProps) {
  // Calculate overlap: use override or auto-calculate
  const effectiveOverlap = overlapPx ?? autoOverlap(
    containerWidth ?? 390, // default mobile width
    cardWidth,
    cardCount,
  );

  const fanOpts: FanOptions = {
    maxArcDeg: maxSpreadDeg,
    overlapPx: effectiveOverlap,
    selectedIndex,
  };

  const childArray = React.Children.toArray(children);

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Label */}
      {label && (
        <div
          style={{
            textAlign: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: labelColor ?? 'var(--dust, #8a7560)',
            letterSpacing: 1,
            textTransform: 'uppercase',
            padding: '2px 0',
          }}
        >
          {label}
        </div>
      )}

      {/* Fan container */}
      <div className="card-hand">
        {childArray.map((child, i) => {
          const slot = computeFanSlot(i, cardCount, fanOpts);

          return (
            <div
              key={i}
              className={`card-hand-slot${selectedIndex === i ? ' card-hand-selected' : ''}`}
              style={{
                transform: `rotate(${slot.rotate}deg) translateY(${slot.translateY}px) scale(${slot.scale})`,
                zIndex: slot.zIndex,
                marginRight: i < cardCount - 1 ? slot.marginRight : 0,
              }}
            >
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
}
