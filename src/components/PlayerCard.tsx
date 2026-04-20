'use client';

import type { Card } from '../lib/scoring';
import { getTransferFee } from '../lib/economy';
import {
  RARITY_COLORS,
  RARITY_GLOW,
  RARITY_FOIL,
  POSITION_COLORS,
  ARCHETYPE_MONOGRAM,
  DURABILITY_ICON,
} from './theme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlayerCardProps {
  card: Card;
  size?: 'full' | 'mini' | 'pill' | 'hand';
  onClick?: () => void;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnter?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>;
  draggable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  showSellPrice?: boolean;
  assignment?: 'attacking' | 'defending' | null;
  diminished?: boolean;
  showHandDetails?: boolean;
  playOrderLabel?: string | null;
}

// ---------------------------------------------------------------------------
// Procedurally derived sub-stats from `power` (PAC/TCH/GRT/FLR)
// ---------------------------------------------------------------------------

interface CardWithSubstats extends Card {
  pace?: number;
  touch?: number;
  grit?: number;
  flair?: number;
}

function subStats(card: Card): { pac: number; tch: number; grt: number; flr: number } {
  const c = card as CardWithSubstats;
  return {
    pac: c.pace ?? Math.round(card.power * 0.88),
    tch: c.touch ?? Math.round(card.power * 0.94),
    grt: c.grit ?? Math.round(card.power * 0.82),
    flr: c.flair ?? Math.round(card.power * 1.02),
  };
}

function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerCard({
  card,
  size = 'full',
  onClick,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  onMouseDown,
  onMouseUp,
  onPointerDown,
  onPointerUp,
  draggable = false,
  selected = false,
  dimmed = false,
  showSellPrice = false,
  assignment = null,
  diminished = false,
  showHandDetails = false,
  playOrderLabel = null,
}: PlayerCardProps) {
  const rarityColor = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  const rarityGlow = RARITY_GLOW[card.rarity] ?? RARITY_GLOW.Common;
  const hasFoil = RARITY_FOIL[card.rarity] ?? false;
  const posC = POSITION_COLORS[card.position] ?? '#71717a';
  const dura = DURABILITY_ICON[card.durability] ?? DURABILITY_ICON.standard;
  const arche = ARCHETYPE_MONOGRAM[card.archetype]
    ?? (card.archetype || '---').slice(0, 3).toUpperCase();
  const stats = subStats(card);

  // ---- Pill layout (compact horizontal chip) ----
  if (size === 'pill') {
    return (
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        style={{
          background: 'var(--paper)',
          color: 'var(--surface-ink)',
          border: `1.5px solid ${rarityColor}`,
          boxShadow: selected
            ? `${rarityGlow !== 'none' ? rarityGlow : ''}${rarityGlow !== 'none' ? ',' : ''} 0 4px 10px rgba(0,0,0,0.5)`
            : '0 2px 6px rgba(0,0,0,0.4)',
          opacity: dimmed ? 0.3 : 1,
          transform: selected ? 'translateY(-1px)' : undefined,
        }}
        className="relative flex items-center gap-1.5 rounded-md px-2 py-1 transition-all duration-150"
      >
        <span
          className="shrink-0 rounded px-1 leading-tight"
          style={{
            background: posC,
            color: '#fff',
            fontFamily: 'var(--font-display)',
            fontSize: 9,
            letterSpacing: '0.05em',
          }}
        >
          {card.position}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-bold"
          style={{ color: 'var(--surface-ink)', fontSize: 10 }}
        >
          {card.name}
        </span>
        <span
          className="shrink-0 stat-number"
          style={{ color: 'var(--surface-ink)', fontSize: 12 }}
        >
          {card.power}
        </span>
        <span className="absolute -bottom-0.5 right-1 text-[8px] leading-none">
          {dura.icon}
        </span>
      </div>
    );
  }

  // ---- Top Trumps card sizes ----
  // hand=170×240, match-detailed mid-size, mini=128×186, full(pack)=220×324
  const isHand = size === 'hand';
  const isMini = size === 'mini';
  const isDetailedHand = isHand && showHandDetails;

  // We map legacy size names to v2 sizes.
  // - `hand` (default): match the v2 `match` size for 11-card rows on small viewports
  // - `hand` + showHandDetails: full v2 `hand` size
  // - `mini`: smallest readable variant
  // - `full`: pack/highlight size
  const sizeMap: Record<string, {
    w: number; h: number; pad: number;
    posFont: number; nameFont: number; powerFont: number;
    statFont: number; statLabel: number; portraitH: number;
  }> = {
    full:           { w: 220, h: 324, pad: 12, posFont: 20, nameFont: 20, powerFont: 64, statFont: 16, statLabel: 10, portraitH: 108 },
    handDetailed:   { w: 170, h: 240, pad: 9,  posFont: 15, nameFont: 15, powerFont: 44, statFont: 12, statLabel: 8,  portraitH: 72 },
    hand:           { w: 140, h: 208, pad: 7,  posFont: 12, nameFont: 12, powerFont: 34, statFont: 10, statLabel: 7,  portraitH: 58 },
    mini:           { w: 128, h: 186, pad: 6,  posFont: 12, nameFont: 12, powerFont: 32, statFont: 10, statLabel: 7,  portraitH: 52 },
  };

  const s = isDetailedHand
    ? sizeMap.handDetailed
    : isHand
      ? sizeMap.hand
      : isMini
        ? sizeMap.mini
        : sizeMap.full;

  const isAttacking = assignment === 'attacking';
  const isDefending = assignment === 'defending';
  const isInjured = !!card.injured;

  const borderColor = isInjured
    ? '#ef4444'
    : isAttacking
      ? '#ffb84d'
      : isDefending
        ? '#6bb6ff'
        : rarityColor;

  const boxShadow = [
    'var(--shadow-card)',
    selected ? 'var(--shadow-card-lift)' : null,
    rarityGlow !== 'none' ? rarityGlow : null,
    isAttacking ? '0 0 24px rgba(255,184,77,0.5)' : null,
    isDefending ? '0 0 12px rgba(107,182,255,0.35)' : null,
  ].filter(Boolean).join(', ');

  const transform = selected
    ? 'translateY(-14px) rotate(-2deg)'
    : isAttacking
      ? 'translateY(-6px)'
      : undefined;

  return (
    <div
      onClick={isInjured && isAttacking ? undefined : onClick}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      draggable={draggable}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="relative flex flex-col overflow-hidden"
      style={{
        width: s.w,
        height: s.h,
        background: 'var(--paper)',
        color: 'var(--surface-ink)',
        border: `3px solid ${borderColor}`,
        borderRadius: 'var(--r-card)',
        boxShadow,
        opacity: dimmed ? 0.5 : 1,
        filter: isInjured ? 'saturate(0.72)' : undefined,
        transform,
        transition: 'transform .18s cubic-bezier(.2,.8,.3,1.3), box-shadow .18s',
        cursor: onClick && !(isInjured && isAttacking) ? 'pointer' : draggable ? 'grab' : 'default',
        padding: s.pad,
        boxSizing: 'border-box',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Foil sheen on Epic+ */}
      {hasFoil && <div className="foil-overlay" />}

      {/* Header — POS chip + PWR */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: s.pad * 0.4 }}
      >
        <span
          style={{
            background: posC,
            color: '#fff',
            padding: `${s.pad * 0.2}px ${s.pad * 0.6}px`,
            borderRadius: 4,
            fontFamily: 'var(--font-display)',
            fontSize: s.posFont,
            letterSpacing: '0.05em',
            lineHeight: 1,
          }}
        >
          {card.position}
        </span>
        <div className="flex items-baseline" style={{ gap: 3 }}>
          <span
            className="stat-number"
            style={{
              fontSize: s.powerFont,
              color: 'var(--surface-ink)',
              lineHeight: 0.9,
              textShadow: '2px 2px 0 rgba(0,0,0,0.12)',
            }}
          >
            {card.power}
          </span>
          <span style={{ fontSize: s.statLabel, opacity: 0.55, letterSpacing: '0.1em' }}>
            PWR
          </span>
        </div>
      </div>

      {/* Portrait — procedural silhouette + initials over position-tinted gradient */}
      <PortraitSlot card={card} posC={posC} height={s.portraitH} />

      {/* Name plate — uppercase display, hairline rules */}
      <div
        style={{
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: s.nameFont,
          letterSpacing: '0.04em',
          lineHeight: 1.05,
          textTransform: 'uppercase',
          padding: `${s.pad * 0.3}px 0`,
          marginTop: s.pad * 0.3,
          borderTop: '1px solid rgba(0,0,0,0.14)',
          borderBottom: '1px solid rgba(0,0,0,0.14)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {card.name}
      </div>

      {/* Archetype monogram — coloured by position */}
      <div
        style={{
          textAlign: 'center',
          fontFamily: 'var(--font-arcade)',
          fontSize: s.nameFont * 0.85,
          color: posC,
          letterSpacing: '0.06em',
          margin: `${s.pad * 0.3}px 0`,
          lineHeight: 1,
        }}
      >
        {arche}
      </div>

      {/* Stat bars — PAC / TCH / GRT / FLR */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: s.pad * 0.2,
          justifyContent: 'flex-end',
        }}
      >
        <StatRow label="PAC" value={stats.pac} statFont={s.statFont} statLabel={s.statLabel} />
        <StatRow label="TCH" value={stats.tch} statFont={s.statFont} statLabel={s.statLabel} />
        <StatRow label="GRT" value={stats.grt} statFont={s.statFont} statLabel={s.statLabel} />
        <StatRow label="FLR" value={stats.flr} statFont={s.statFont} statLabel={s.statLabel} />
      </div>

      {/* Footer — durability + ability name */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: s.pad * 0.35,
          paddingTop: s.pad * 0.25,
          borderTop: '1px solid rgba(0,0,0,0.14)',
          fontSize: s.statLabel,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: 0.7 }}>
          <span style={{ fontSize: s.statFont }}>{dura.icon}</span>
          {!isHand || isDetailedHand ? dura.label : null}
        </span>
        <span
          style={{
            opacity: 0.85,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '60%',
          }}
        >
          {card.abilityName ?? '—'}
        </span>
      </div>

      {/* Bottom rarity stripe */}
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

      {/* Play-order badge (attackers) */}
      {playOrderLabel && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            left: -6,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#ffb84d',
            color: '#2a1f12',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-arcade)',
            fontSize: 13,
            border: '3px solid var(--paper)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {playOrderLabel}
        </div>
      )}

      {/* Diminished badge (soft cap) */}
      {diminished && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: 22,
            height: 22,
            background: 'rgba(239,68,68,0.95)',
            color: '#fff',
            fontFamily: 'var(--font-arcade)',
            fontSize: 9,
            pointerEvents: 'none',
          }}
        >
          50%
        </div>
      )}

      {/* Injured overlay (only with assignment context) */}
      {isInjured && assignment !== null && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: 'rgba(56,16,16,0.55)',
            borderRadius: 'var(--r-card)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
            <span
              className="rounded px-1.5 py-0.5 font-black uppercase"
              style={{
                background: 'rgba(239,68,68,0.95)',
                color: '#fff',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.08em',
                fontSize: isHand ? 10 : 11,
              }}
            >
              Injured
            </span>
          </div>
        </div>
      )}

      {/* Sell-price overlay (shop sell mode) */}
      {showSellPrice && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 'var(--r-card)',
          }}
        >
          <span
            className="stat-number"
            style={{
              color: 'var(--gold-hi)',
              fontSize: isHand ? 18 : 22,
            }}
          >
            £{getTransferFee(card).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PortraitSlot — procedural placeholder (head silhouette + initials monogram)
// ---------------------------------------------------------------------------

function PortraitSlot({
  card,
  posC,
  height,
}: {
  card: Card;
  posC: string;
  height: number;
}) {
  const init = initials(card.name || '??');
  return (
    <div
      style={{
        height,
        width: '100%',
        borderRadius: 'var(--r-sm)',
        background: `linear-gradient(180deg, ${posC}55 0%, ${posC}22 55%, ${posC}11 100%)`,
        border: '1px solid rgba(0,0,0,0.15)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Head silhouette */}
      <div
        style={{
          position: 'absolute',
          top: '16%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '38%',
          aspectRatio: '1',
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.28)',
        }}
      />
      {/* Shoulders */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '88%',
          height: '36%',
          borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
          background: 'rgba(0,0,0,0.28)',
        }}
      />
      {/* Initials watermark */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: 'var(--font-arcade)',
          fontSize: height * 0.42,
          color: 'rgba(255,255,255,0.18)',
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}
      >
        {init}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatRow — label · bar · numeric
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  statFont,
  statLabel,
}: {
  label: string;
  value: number;
  statFont: number;
  statLabel: number;
}) {
  const barPct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center" style={{ gap: 5, fontSize: statLabel }}>
      <span style={{ width: 22, letterSpacing: '0.06em', opacity: 0.7, fontWeight: 700 }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: statLabel * 0.65,
          background: 'rgba(0,0,0,0.1)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${barPct}%`,
            height: '100%',
            background: 'var(--surface-ink)',
            opacity: 0.85,
          }}
        />
      </div>
      <span
        className="stat-number"
        style={{ width: 22, textAlign: 'right', fontSize: statFont }}
      >
        {value}
      </span>
    </div>
  );
}
