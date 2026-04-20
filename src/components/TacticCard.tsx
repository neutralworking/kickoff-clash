'use client';

import type { TacticCard as TacticCardType } from '../lib/tactics';
import { TACTIC_CATEGORY } from './theme';

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
// Component — v2 Balatro-style tactic card
// ---------------------------------------------------------------------------

export default function TacticCard({
  tactic,
  onClick,
  deployed = false,
  contradicted = false,
  compact = false,
}: TacticCardProps) {
  const cat = TACTIC_CATEGORY[tactic.category] ?? TACTIC_CATEGORY.specialist;

  const w = compact ? 80 : 120;
  const h = compact ? 112 : 170;
  const pad = compact ? 6 : 10;
  const nameF = compact ? 10 : 13;
  const effF = compact ? 7 : 9;
  const flavF = compact ? 8 : 10;

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
        background: cat.bg,
        border: `3px solid ${cat.color}`,
        boxShadow: deployed
          ? `var(--shadow-card-lift), 0 0 24px ${cat.color}aa`
          : `var(--shadow-card), 0 0 12px ${cat.color}55`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        padding: pad,
        color: 'var(--cream)',
        boxSizing: 'border-box',
        fontFamily: 'var(--font-body)',
        cursor: onClick ? 'pointer' : 'default',
        transform: deployed ? 'translateY(-6px)' : undefined,
        transition: 'transform 0.15s, box-shadow 0.15s',
        opacity: contradicted ? 0.45 : 1,
      }}
    >
      {/* Category symbol */}
      <div
        style={{
          textAlign: 'center',
          fontSize: h * 0.3,
          color: cat.color,
          lineHeight: 1,
          marginTop: pad * 0.2,
        }}
      >
        {cat.icon}
      </div>

      {/* Name */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: nameF,
          letterSpacing: '0.04em',
          textAlign: 'center',
          textTransform: 'uppercase',
          marginTop: pad * 0.3,
        }}
      >
        {tactic.name}
      </div>

      {/* Effect */}
      <div
        style={{
          fontSize: effF,
          color: cat.color,
          textAlign: 'center',
          marginTop: pad * 0.3,
          lineHeight: 1.25,
          fontWeight: 600,
        }}
      >
        {tactic.effect}
      </div>

      {/* Flavour quote */}
      {!compact && tactic.flavour && (
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
          &ldquo;{tactic.flavour}&rdquo;
        </div>
      )}

      {/* Bottom accent stripe */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: cat.color,
        }}
      />

      {/* ACTIVE badge */}
      {deployed && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            background: 'var(--gold-hi)',
            color: '#1a1008',
            padding: '2px 6px',
            borderRadius: 3,
            fontFamily: 'var(--font-arcade)',
            fontSize: 8,
            letterSpacing: '0.1em',
          }}
        >
          ACTIVE
        </div>
      )}

      {/* Contradicted overlay */}
      {contradicted && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--r-card)',
            background: 'rgba(180, 30, 30, 0.25)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              color: 'var(--danger)',
              lineHeight: 1,
              opacity: 0.85,
            }}
          >
            ✕
          </span>
        </div>
      )}
    </div>
  );
}
