'use client';

import type { TacticCard as TacticCardType } from '../lib/tactics';

// ---------------------------------------------------------------------------
// Category colour palette + icons
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<TacticCardType['category'], string> = {
  attacking:  '#c0392b',
  defensive:  '#2c6fbb',
  specialist: '#d4a035',
};

const CATEGORY_ICONS: Record<TacticCardType['category'], string> = {
  attacking:  '\u2694',  // crossed swords
  defensive:  '\u{1F6E1}',  // shield
  specialist: '\u2728',  // sparkles
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TacticCardProps {
  tactic: TacticCardType;
  onClick?: () => void;
  deployed?: boolean;
  contradicted?: boolean;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component — portrait card (3:4 ratio)
// ---------------------------------------------------------------------------

export default function TacticCard({
  tactic,
  onClick,
  deployed = false,
  contradicted = false,
  compact = false,
}: TacticCardProps) {
  const accent = CATEGORY_COLORS[tactic.category];
  const icon = CATEGORY_ICONS[tactic.category];

  const w = compact ? 80 : 96;
  const h = compact ? 106 : 128;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: w,
        height: h,
        borderRadius: 10,
        border: `2px solid ${accent}`,
        background: 'linear-gradient(160deg, var(--leather-light, #241e16), var(--leather, #1a1510))',
        padding: compact ? '6px 6px 4px' : '8px 8px 6px',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        boxSizing: 'border-box',
        boxShadow: deployed
          ? `0 0 0 2px var(--amber, #f59e0b), 0 0 10px var(--amber-glow, rgba(232,98,26,0.4))`
          : `0 0 6px ${accent}40, 0 4px 10px rgba(0,0,0,0.5)`,
        opacity: contradicted ? 0.45 : 1,
        transition: 'box-shadow 0.15s ease, opacity 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {/* Category icon — top center */}
      <div
        style={{
          textAlign: 'center',
          fontSize: compact ? 16 : 20,
          lineHeight: 1,
          opacity: 0.6,
        }}
      >
        {icon}
      </div>

      {/* Name — center */}
      <div
        style={{
          fontFamily: 'var(--font-display, sans-serif)',
          fontSize: compact ? 9 : 11,
          color: 'var(--cream, #f5f0e8)',
          lineHeight: 1.2,
          textAlign: 'center',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {tactic.name}
      </div>

      {/* Effect — bottom */}
      <div
        style={{
          fontFamily: 'var(--font-body, sans-serif)',
          fontSize: compact ? 7 : 8,
          color: 'var(--dust, #8a7560)',
          lineHeight: 1.2,
          textAlign: 'center',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {tactic.effect}
      </div>

      {/* Bottom accent bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 2.5,
          background: accent,
        }}
      />

      {/* Contradicted overlay */}
      {contradicted && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            background: 'rgba(180, 30, 30, 0.25)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display, sans-serif)',
              fontSize: 28,
              color: 'var(--danger, #ef4444)',
              lineHeight: 1,
              opacity: 0.75,
            }}
          >
            ✕
          </span>
        </div>
      )}

      {/* Deployed badge */}
      {deployed && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            fontFamily: 'var(--font-body, sans-serif)',
            fontSize: 7,
            color: 'var(--amber, #f59e0b)',
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          ACTIVE
        </div>
      )}
    </div>
  );
}
