'use client';

import type { JokerCard as JokerCardType } from '../lib/jokers';

// ---------------------------------------------------------------------------
// Rarity styling
// ---------------------------------------------------------------------------

const RARITY_BORDER: Record<string, string> = {
  common: '#71717a',
  uncommon: '#4a9eff',
  rare: '#d4a035',
};

const RARITY_GLOW: Record<string, string> = {
  common: '0 0 6px rgba(113,113,122,0.3)',
  uncommon: '0 0 10px rgba(74,158,255,0.4)',
  rare: '0 0 14px rgba(212,160,53,0.5)',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface JokerCardProps {
  joker: JokerCardType;
  onClick?: () => void;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component — portrait card (3:4 ratio)
// ---------------------------------------------------------------------------

export default function JokerCard({ joker, onClick, compact = false }: JokerCardProps) {
  const borderColor = RARITY_BORDER[joker.rarity] ?? RARITY_BORDER.common;
  const glow = RARITY_GLOW[joker.rarity] ?? RARITY_GLOW.common;

  const w = compact ? 80 : 96;
  const h = compact ? 106 : 128;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: w,
        height: h,
        background: 'linear-gradient(160deg, var(--leather-light, #241e16), var(--leather, #1a1510))',
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        boxShadow: `${glow}, 0 4px 10px rgba(0,0,0,0.5)`,
        cursor: onClick ? 'pointer' : 'default',
        padding: compact ? '6px 6px 4px' : '8px 8px 6px',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Manager icon */}
      <div
        style={{
          fontSize: compact ? 18 : 22,
          lineHeight: 1,
          opacity: 0.7,
        }}
      >
        {'\u{1F454}'} {/* necktie — manager */}
      </div>

      {/* Name */}
      <div
        style={{
          fontFamily: 'var(--font-display, sans-serif)',
          fontSize: compact ? 9 : 11,
          color: 'var(--cream, #f5f0e8)',
          textAlign: 'center',
          lineHeight: 1.2,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {joker.name}
      </div>

      {/* Effect */}
      <div
        style={{
          fontFamily: 'var(--font-body, sans-serif)',
          fontSize: compact ? 7 : 8,
          color: 'var(--dust, #8a7560)',
          textAlign: 'center',
          lineHeight: 1.2,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {joker.effect}
      </div>

      {/* Bottom rarity bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 2.5,
          background: borderColor,
        }}
      />
    </div>
  );
}
