'use client';

import type { JokerCard as JokerCardType } from '../lib/jokers';

// ---------------------------------------------------------------------------
// Rarity styling (v2 — manager rarities are 3-tier: common/uncommon/rare)
// ---------------------------------------------------------------------------

const RARITY_BORDER: Record<string, string> = {
  common: '#b6a68a',
  uncommon: '#3aa0ff',
  rare: '#b06cff',
};

interface JokerCardProps {
  joker: JokerCardType;
  onClick?: () => void;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component — v2 Balatro-style joker card
// ---------------------------------------------------------------------------

export default function JokerCard({ joker, onClick, compact = false }: JokerCardProps) {
  const rarityColor = RARITY_BORDER[joker.rarity] ?? RARITY_BORDER.common;
  const w = compact ? 80 : 120;
  const h = compact ? 112 : 170;
  const pad = compact ? 6 : 10;
  const nameF = compact ? 10 : 13;
  const effF = compact ? 7 : 9;
  const flavF = compact ? 8 : 10;
  const monogram = joker.name.split(' ').map(w => w[0]).slice(0, 2).join('');

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: 'var(--r-card)',
        background: 'linear-gradient(160deg, #3a2818 0%, #1a1008 100%)',
        border: `3px solid ${rarityColor}`,
        boxShadow: `var(--shadow-card), 0 0 18px ${rarityColor}66`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        padding: pad,
        color: 'var(--cream)',
        fontFamily: 'var(--font-body)',
        boxSizing: 'border-box',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s',
      }}
    >
      {/* Foil sheen */}
      <div className="foil-overlay" style={{ opacity: 0.1 }} />

      {/* Portrait — manager monogram with radial glow */}
      <div
        style={{
          flex: '0 0 auto',
          height: h * 0.44,
          background: `radial-gradient(circle at 50% 35%, ${rarityColor}44 0%, transparent 70%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--r-sm)',
          marginBottom: pad * 0.4,
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: h * 0.28,
            color: rarityColor,
            textShadow: '0 2px 0 #000',
          }}
        >
          {monogram}
        </span>
      </div>

      {/* Name */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: nameF,
          letterSpacing: '0.03em',
          textAlign: 'center',
          color: 'var(--cream)',
          textTransform: 'uppercase',
          lineHeight: 1.05,
        }}
      >
        {joker.name}
      </div>

      {/* Effect */}
      <div
        style={{
          fontSize: effF,
          color: 'var(--amber-hi)',
          textAlign: 'center',
          marginTop: pad * 0.3,
          lineHeight: 1.25,
          fontWeight: 600,
        }}
      >
        {joker.effect}
      </div>

      {/* Flavour */}
      {!compact && joker.flavour && (
        <div
          className="flavour"
          style={{
            fontSize: flavF,
            color: 'var(--dust)',
            textAlign: 'center',
            marginTop: 'auto',
            paddingTop: pad * 0.3,
            lineHeight: 1.15,
          }}
        >
          &ldquo;{joker.flavour}&rdquo;
        </div>
      )}

      {/* Rarity bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: rarityColor,
        }}
      />
    </div>
  );
}
