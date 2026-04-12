'use client';

import type { Card } from '../lib/scoring';
import { getTransferFee } from '../lib/economy';
import { RARITY_COLORS, RARITY_GLOW, THEME_GRADIENTS, THEME_ICONS } from './theme';

// ---------------------------------------------------------------------------
// Durability badges
// ---------------------------------------------------------------------------

const DURABILITY_BADGE: Record<string, string> = {
  glass: '\u{1F52E}',
  fragile: '\u{1FA78}',
  standard: '\u{1F6E1}',
  iron: '\u2699',
  titanium: '\u2B50',
  phoenix: '\u{1F525}',
};

// ---------------------------------------------------------------------------
// Position colors (felt table palette)
// ---------------------------------------------------------------------------

const POSITION_COLORS: Record<string, string> = {
  GK: '#e8621a',
  CD: '#4a9eff',
  WD: '#4a9eff',
  DM: '#22c55e',
  CM: '#22c55e',
  WM: '#22c55e',
  AM: '#a855f7',
  WF: '#f59e0b',
  CF: '#ef4444',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlayerCardProps {
  card: Card;
  size?: 'full' | 'mini' | 'pill' | 'hand';
  onClick?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  showSellPrice?: boolean;
  assignment?: 'attacking' | 'defending' | null; // v5 attack/defend state
  diminished?: boolean; // beyond soft cap (50% power)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerCard({
  card,
  size = 'full',
  onClick,
  selected = false,
  dimmed = false,
  showSellPrice = false,
  assignment = null,
  diminished = false,
}: PlayerCardProps) {
  const rarityColor = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  const rarityGlow = RARITY_GLOW[card.rarity] ?? RARITY_GLOW.Common;
  const theme = card.personalityTheme ?? 'General';
  const gradient = THEME_GRADIENTS[theme] ?? THEME_GRADIENTS.General;
  const themeIcon = THEME_ICONS[theme] ?? THEME_ICONS.General;
  const durabilityBadge = DURABILITY_BADGE[card.durability] ?? DURABILITY_BADGE.standard;
  const posColor = POSITION_COLORS[card.position] ?? '#71717a';

  // ---- Pill layout ----
  if (size === 'pill') {
    return (
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        style={{
          background: gradient,
          border: `1.5px solid ${rarityColor}`,
          boxShadow: selected ? rarityGlow : '0 2px 6px rgba(0,0,0,0.4)',
          opacity: dimmed ? 0.3 : 1,
          transform: selected ? 'translateY(-1px)' : undefined,
        }}
        className="relative flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all duration-150"
      >
        {/* Position badge */}
        <span
          className="shrink-0 rounded px-1 text-[9px] font-bold leading-tight"
          style={{ background: posColor, color: '#f5f0e0' }}
        >
          {card.position}
        </span>

        {/* Name (truncated) */}
        <span
          className="min-w-0 flex-1 truncate text-[10px] font-bold"
          style={{ color: '#f5f0e0' }}
        >
          {card.name}
        </span>

        {/* Power */}
        <span
          className="shrink-0 text-[11px] font-black"
          style={{ fontFamily: "var(--font-display, sans-serif)", color: rarityColor }}
        >
          {card.power}
        </span>

        {/* Tiny durability badge */}
        <span className="absolute -bottom-0.5 right-1 text-[8px] leading-none">
          {durabilityBadge}
        </span>
      </div>
    );
  }

  // ---- Shared card dimensions ----
  const isHand = size === 'hand';
  const isMini = size === 'mini' || isHand;
  const w = isHand ? 82 : size === 'mini' ? 72 : 130;
  const h = isHand ? 112 : size === 'mini' ? 98 : 170;

  // v5 assignment styling
  const isAttacking = assignment === 'attacking';
  const isDefending = assignment === 'defending';
  const isInjured = !!card.injured;

  const borderColor = isInjured
    ? '#ef4444'
    : isAttacking
      ? '#fbbf24'
      : isDefending
        ? '#60a5fa'
        : rarityColor;

  const assignmentTransform = isAttacking
    ? 'translateY(-2px)'
    : selected
      ? 'translateY(-3px) scale(1.03)'
      : undefined;

  const assignmentShadow = isAttacking
    ? '0 0 12px rgba(251,191,36,0.4), 0 4px 12px rgba(0,0,0,0.4)'
    : isDefending
      ? '0 0 8px rgba(96,165,250,0.3), 0 4px 12px rgba(0,0,0,0.4)'
      : selected
        ? `${rarityGlow}, 0 8px 20px rgba(0,0,0,0.5)`
        : '0 4px 12px rgba(0,0,0,0.4)';

  return (
    <div
      onClick={isInjured && isAttacking ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="relative flex flex-col justify-between overflow-hidden transition-all duration-150"
      style={{
        width: w,
        height: h,
        background: gradient,
        borderLeft: assignment ? `3px solid ${borderColor}` : undefined,
        border: assignment ? undefined : `2px solid ${rarityColor}`,
        borderTop: assignment ? `1px solid ${borderColor}` : undefined,
        borderRight: assignment ? `1px solid ${borderColor}` : undefined,
        borderBottom: assignment ? `1px solid ${borderColor}` : undefined,
        borderRadius: 10,
        boxShadow: assignmentShadow,
        opacity: dimmed ? 0.3 : isInjured ? 0.6 : 1,
        transform: assignmentTransform,
        cursor: onClick && !(isInjured && isAttacking) ? 'pointer' : 'default',
      }}
    >
      {/* ---- Top row: position badge + power ---- */}
      <div className="flex items-start justify-between" style={{ padding: isMini ? 4 : 8 }}>
        {/* Position pill */}
        <span
          className="rounded-full font-bold leading-none"
          style={{
            background: posColor,
            color: '#f5f0e0',
            fontSize: isHand ? 9 : isMini ? 8 : 10,
            padding: isHand ? '2px 5px' : isMini ? '2px 4px' : '3px 6px',
          }}
        >
          {card.position}
        </span>

        {/* Power number */}
        <span
          className="font-black leading-none"
          style={{
            fontFamily: "var(--font-display, sans-serif)",
            color: rarityColor,
            fontSize: isHand ? 16 : isMini ? 14 : 22,
          }}
        >
          {card.power}
        </span>
      </div>

      {/* ---- Center: name + archetype ---- */}
      <div
        className="flex flex-col items-center justify-center px-1 text-center"
        style={{ flex: 1 }}
      >
        <span
          className="w-full truncate font-bold leading-tight"
          style={{
            color: '#f5f0e0',
            fontSize: isHand ? 10 : isMini ? 9 : 13,
          }}
        >
          {card.name}
        </span>

        {!isMini && card.abilityName && (
          <span
            className="mt-0.5 w-full truncate leading-tight"
            style={{
              color: '#9a8b73',
              fontSize: 10,
            }}
          >
            {card.abilityName}
          </span>
        )}
      </div>

      {/* ---- Bottom row: durability + personality icon ---- */}
      <div
        className="flex items-end justify-between"
        style={{ padding: isMini ? 4 : 8 }}
      >
        <span style={{ fontSize: isMini ? 10 : 14, lineHeight: 1 }}>
          {durabilityBadge}
        </span>

        {(isHand || !isMini) && (
          <span style={{ fontSize: isHand ? 12 : 14, lineHeight: 1, opacity: 0.7 }}>
            {themeIcon}
          </span>
        )}
      </div>

      {/* ---- Bottom rarity bar ---- */}
      <div
        style={{
          height: isHand ? 2.5 : isMini ? 2 : 3,
          background: rarityColor,
          width: '100%',
        }}
      />

      {/* ---- Injured overlay ---- */}
      {isInjured && assignment !== null && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-[8px]"
          style={{ background: 'rgba(239,68,68,0.2)', pointerEvents: 'none' }}
        >
          <span
            className="rounded px-1.5 py-0.5 font-black uppercase"
            style={{
              background: 'rgba(239,68,68,0.85)',
              color: '#fff',
              fontSize: isMini ? 8 : 11,
            }}
          >
            Injured
          </span>
        </div>
      )}

      {/* ---- Diminished badge (soft cap) ---- */}
      {diminished && (
        <div
          className="absolute flex items-center justify-center rounded-full"
          style={{
            top: isMini ? 2 : 4,
            right: isMini ? 2 : 4,
            width: isMini ? 18 : 24,
            height: isMini ? 18 : 24,
            background: 'rgba(239,68,68,0.9)',
            color: '#fff',
            fontSize: isMini ? 8 : 10,
            fontWeight: 900,
            pointerEvents: 'none',
          }}
        >
          50%
        </div>
      )}

      {/* ---- Sell price overlay ---- */}
      {showSellPrice && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-[8px]"
          style={{ background: 'rgba(0,0,0,0.65)' }}
        >
          <span
            className="font-black"
            style={{
              fontFamily: "var(--font-display, sans-serif)",
              color: '#d4a035',
              fontSize: isMini ? 12 : 18,
            }}
          >
            ${getTransferFee(card).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
