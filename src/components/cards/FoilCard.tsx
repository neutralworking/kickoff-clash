'use client';

/**
 * KC pack-opening card (design handoff, 1C "Foil Premium") — the engine-v2 card.
 *
 * Renders a `KCCard` as the whole-card-colour rarity ladder from the pack-opening
 * handoff: Common→BRONZE, Rare→SILVER, Epic→GOLD, Legendary→ONYX. The entire
 * card fill/border/glow IS the rarity read (no small badge); Epic+ carries a
 * live foil shimmer, every card a brushed-metal sheen. The 34px contest badge
 * (colour = CONTEST_COLOR, crisp 7×7 pixel glyph) replaces the prototype's
 * class badge; the two 34px unlabelled circles (red = ATK, blue = DEF) are the
 * visual anchor. The portrait window keeps the game's EXISTING seeded
 * "Pixel Hero" busts (owner decision) — zoomed toward the head, recessed window
 * tinted per tier, one-shot rarity flare on reveal, floating ✦ on Legendary.
 *
 * Presentational only — no engine imports beyond types + `cardTraits`. Pass
 * `revealDelayMs` to play the pack-cascade entry (rise + settle + flare) once;
 * omit it for static surfaces (gallery, shop restock). Height is FIXED at 234
 * regardless of rarity or action count (Legendary's two chips share one line).
 */

import type { CSSProperties } from 'react';
import type { KCCard } from '../../engine-v2';
import { cardTraits } from '../../engine-v2';
import { PIXEL, CONTEST_COLOR } from '../play/ui';
import { POSITION_COLOR, CONTEST_ICON } from './cardTokens';
import { portraitBackgroundStyle } from './portrait';

// ---------------------------------------------------------------------------
// Rarity → tier ladder (exact values from the handoff's `tier()`; Onyx included).
// The WHOLE card is this colour — fill, border, glow, inks.
// ---------------------------------------------------------------------------

type Rarity = KCCard['rarity'];

interface Tier {
  name: string;
  /** Whole-card fill (165° gradient). */
  fill: string;
  /** Border + metallic inset rim colour. */
  edge: string;
  /** The tier glow colour in the shadow stack. */
  glow: string;
  /** Primary text ink. */
  ink: string;
  /** Secondary text (role, labels). */
  sub: string;
  /** Light tiers take dark ink + a dark fitness track / recessed window. */
  light: boolean;
}

const TIER: Record<Rarity, Tier> = {
  Common: {
    name: 'Bronze',
    fill: 'linear-gradient(165deg, #8a5220 0%, #5c3413 60%, #3d220c 100%)',
    edge: '#d68b3c',
    glow: 'rgba(198,125,55,0.6)',
    ink: '#fbe9d2',
    sub: '#e4b184',
    light: false,
  },
  Rare: {
    name: 'Silver',
    fill: 'linear-gradient(165deg, #d3dae3 0%, #9aa5b4 58%, #737e8c 100%)',
    edge: '#ffffff',
    glow: 'rgba(210,220,235,0.75)',
    ink: '#1b2029',
    sub: '#3f4854',
    light: true,
  },
  Epic: {
    name: 'Gold',
    fill: 'linear-gradient(165deg, #ffd85c 0%, #eab21f 55%, #b47d10 100%)',
    edge: '#fff2b0',
    glow: 'rgba(245,197,66,0.85)',
    ink: '#3a2604',
    sub: '#6b4a0c',
    light: true,
  },
  Legendary: {
    name: 'Onyx',
    fill: 'linear-gradient(165deg, #26262f 0%, #131319 55%, #050506 100%)',
    edge: '#f5c542',
    glow: 'rgba(245,197,66,0.95)',
    ink: '#fdf3d4',
    sub: '#e0bd63',
    light: false,
  },
};

/** Reveal-flare colour per rarity (handoff `rarityColor()` — NOT the tier edge). */
const FLARE: Record<Rarity, string> = {
  Common: '#b6a68a',
  Rare: '#3aa0ff',
  Epic: '#b06cff',
  Legendary: '#ff9a00',
};

/** Fitness value colour (handoff `fitColor()`): ≥95 green, ≥80 amber, else red. */
function fitColor(f: number): string {
  return f >= 95 ? '#22c55e' : f >= 80 ? '#f59e0b' : '#ef4444';
}

// Attack / defence circle colours (spec: colour encodes the stat — no labels).
const ATK = '#e63946';
const DEF = '#3aa0ff';

// Contest badges whose colour is light gold/amber take dark glyph ink (the
// spec's Finisher/Engine rule, mapped onto the KEEP/CREATE possession-golds).
const DARK_GLYPH_CONTESTS = new Set<KCCard['contest']>(['KEEP', 'CREATE']);

// ---------------------------------------------------------------------------
// One-shot animations (handoff keyframes, `kcfc`-prefixed so they can't collide
// with globals.css). React 19 hoists + dedupes the tag via href/precedence.
// ---------------------------------------------------------------------------

const KCFC_CSS = `
@keyframes kcfcDeal {
  0%   { opacity: 0; transform: translateY(34px) rotateY(85deg) scale(.82); }
  55%  { opacity: 1; }
  100% { opacity: 1; transform: none; }
}
@keyframes kcfcFlare {
  0%   { opacity: 0; }
  35%  { opacity: .95; }
  100% { opacity: 0; }
}
@keyframes kcfcSpark {
  0%   { opacity: 0; transform: translate(-50%, 0) scale(.4); }
  30%  { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -46px) scale(1.25); }
}
@keyframes kcfcShimmer {
  0%   { background-position: -160% 0; }
  100% { background-position: 260% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .kcfc, .kcfc * { animation: none !important; }
}
`;

/** The 34px contest badge — CONTEST_COLOR circle + the crisp 7×7 pixel glyph
 *  from cardTokens, integer-scaled (×3 = 21px) so the pixels stay square. */
function ContestBadge({ contest }: { contest: KCCard['contest'] }) {
  const cc = CONTEST_COLOR[contest];
  const icon = CONTEST_ICON[contest.toLowerCase() as keyof typeof CONTEST_ICON];
  const glyphInk = DARK_GLYPH_CONTESTS.has(contest) ? '#241a06' : '#fff';
  return (
    <div
      title={contest}
      aria-label={contest}
      style={{
        width: 34,
        height: 34,
        flexShrink: 0,
        borderRadius: '50%',
        background: `linear-gradient(160deg, ${cc}, ${cc}bb)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 0 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.45)',
      }}
    >
      <svg
        className="pixelated"
        viewBox="0 0 7 7"
        width={21}
        height={21}
        shapeRendering="crispEdges"
        aria-hidden
        style={{ display: 'block' }}
      >
        {icon.glyph.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={glyphInk} />
        ))}
      </svg>
    </div>
  );
}

/** A 34px unlabelled stat circle — red attack / blue defence (the card anchor). */
function StatCircle({ value, col, onDark }: { value: number; col: string; onDark: boolean }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: `2.5px solid ${col}`,
        background: `${col}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 0 10px ${col}55, inset 0 0 7px ${col}22`,
      }}
    >
      <span
        style={{
          fontFamily: PIXEL,
          fontSize: 15,
          lineHeight: 1,
          color: onDark ? '#fff' : '#241a0e',
          textShadow: '0 1px 0 rgba(0,0,0,0.3)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function FoilCard({
  card,
  onClick,
  selected,
  revealDelayMs,
  priceTag,
  owned,
  width,
  fitness = 100,
}: {
  card: KCCard;
  onClick?: () => void;
  selected?: boolean;
  /** Stagger for the pack cascade; when set, plays the entry + flare once. */
  revealDelayMs?: number;
  /** e.g. "£4" — a small bottom chip when present. */
  priceTag?: string;
  /** Owned state: dims the price, shows an OWNED tick. */
  owned?: boolean;
  /** Fixed width if given; otherwise fills the grid cell (100%). Height stays
   *  fixed at 234 per spec either way. */
  width?: number;
  /** 0–100; shop cards are fresh, so it defaults to 100. */
  fitness?: number;
}) {
  const t = TIER[card.rarity] ?? TIER.Common;
  const onDark = !t.light;
  const legendary = card.rarity === 'Legendary';
  const epicPlus = legendary || card.rarity === 'Epic';
  const posColor = POSITION_COLOR[card.pos] ?? '#8a8173';
  const cc = CONTEST_COLOR[card.contest];
  const fit = Math.max(0, Math.min(100, Math.round(fitness)));
  const fc = fitColor(fit);

  // Action chips — first action normally; a Legendary carrying two keeps both
  // on ONE line at the smaller size so the card never changes height.
  const actions = cardTraits(card).map((a) => a.name);
  const shown = legendary ? actions.slice(0, 2) : actions.slice(0, 1);
  const two = shown.length > 1;

  // Dataset names are "First Surname"; the spec's card shows ONE display name.
  // Long full names fall back to the surname (full name stays in the title).
  const displayName = card.name.length > 10 ? card.name.split(' ').slice(-1)[0] : card.name;

  const animate = revealDelayMs != null;
  const delay = revealDelayMs ?? 0;
  const flareDelay = delay + 260;

  const shadow = [
    selected ? `0 0 0 2px #0b0703, 0 0 0 4.5px #f5c542, 0 0 18px ${t.glow}` : null,
    '0 5px 0 rgba(0,0,0,0.4)',
    '0 12px 22px rgba(0,0,0,0.55)',
    `0 0 ${legendary ? 30 : epicPlus ? 22 : 14}px ${t.glow}`,
    `inset 0 0 0 1px ${t.edge}66`,
  ]
    .filter(Boolean)
    .join(', ');

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: width ?? '100%',
    minWidth: 0,
    height: 234,
    boxSizing: 'border-box',
    borderRadius: 13,
    background: t.fill,
    border: `2.5px solid ${t.edge}`,
    boxShadow: shadow,
    overflow: 'hidden',
    padding: 7,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',
    fontFamily: 'var(--font-body)',
    cursor: onClick ? 'pointer' : 'default',
    transform: selected ? 'translateY(-2px)' : undefined,
    transition: 'transform 120ms cubic-bezier(.22,1,.36,1)',
    animation: animate ? `kcfcDeal .5s cubic-bezier(.22,1,.36,1) ${delay}ms both` : undefined,
  };

  const chip = (txt: string, k: string) => (
    <div
      key={k}
      style={{
        flexShrink: 1,
        minWidth: 0,
        padding: two ? '2px 5px' : '2px 7px',
        borderRadius: 5,
        background: `${cc}22`,
        border: `1px solid ${cc}`,
        color: onDark ? '#fff' : '#2a1f12',
        fontSize: two ? 6.5 : 8,
        fontWeight: 700,
        letterSpacing: two ? '.01em' : '.05em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {txt}
    </div>
  );

  const body = (
    <>
      <style href="kcfc-styles" precedence="medium">
        {KCFC_CSS}
      </style>

      {/* top row: contest badge + position pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
        <ContestBadge contest={card.contest} />
        <div
          style={{
            background: posColor,
            color: '#fff',
            fontFamily: PIXEL,
            fontSize: 11,
            letterSpacing: '.06em',
            padding: '2px 8px',
            borderRadius: 5,
            lineHeight: 1.15,
            boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
          }}
        >
          {card.pos}
        </div>
      </div>

      {/* portrait — the game's seeded Pixel Hero bust in a recessed tier window,
          zoomed toward the head with a sliver of kit (spec head-zoom treatment) */}
      <div
        style={{
          position: 'relative',
          height: 52,
          flexShrink: 0,
          margin: '5px 0 4px',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.3)',
          background: t.light
            ? 'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.12) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%)',
        }}
      >
        <div
          className="pixelated"
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            ...portraitBackgroundStyle(card.id),
            backgroundSize: 'auto 120%',
            backgroundPosition: 'center 25%',
          }}
        />
        {animate && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              opacity: 0,
              background: `radial-gradient(circle at 50% 45%, ${FLARE[card.rarity] ?? FLARE.Common} 0%, transparent 60%)`,
              animation: `kcfcFlare .7s ease-out ${flareDelay}ms both`,
            }}
          />
        )}
        {animate && legendary && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 6,
              left: '50%',
              color: '#fff',
              fontSize: 12,
              lineHeight: 1,
              opacity: 0,
              pointerEvents: 'none',
              animation: `kcfcSpark 1s ease-out ${flareDelay + 120}ms both`,
            }}
          >
            ✦
          </div>
        )}
      </div>

      {/* name */}
      <div
        style={{
          flexShrink: 0,
          fontFamily: PIXEL,
          fontSize: 13,
          lineHeight: 1.05,
          letterSpacing: '.01em',
          textAlign: 'center',
          color: t.ink,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={card.name}
      >
        {displayName}
      </div>

      {/* role */}
      <div
        style={{
          flexShrink: 0,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '.03em',
          textAlign: 'center',
          color: t.sub,
          marginTop: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {card.role}
      </div>

      {/* action chip(s) — Legendary carries two on one line */}
      {shown.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'nowrap',
            gap: two ? 3 : 4,
            marginTop: 4,
            minWidth: 0,
          }}
        >
          {shown.map((a, i) => chip(a, `a${i}`))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 3 }} />

      {/* fitness */}
      <div style={{ flexShrink: 0, marginTop: 4, marginBottom: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.14em', color: onDark ? 'var(--dust)' : '#8a6f3a' }}>
            FITNESS
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 11, color: fc, lineHeight: 1 }}>{fit}%</span>
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 4,
            background: onDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${fit}%`, height: '100%', background: fc, boxShadow: `0 0 6px ${fc}88` }} />
        </div>
      </div>

      {/* the two numbers — red attack, blue defence, no labels (the anchor) */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-evenly', alignItems: 'center', paddingTop: 1 }}>
        <StatCircle value={card.att} col={ATK} onDark={onDark} />
        <StatCircle value={card.def} col={DEF} onDark={onDark} />
      </div>

      {/* price / owned chip */}
      {(priceTag != null || owned) && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 3,
            transform: 'translateX(-50%)',
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 6px',
            borderRadius: 5,
            background: 'rgba(11,7,3,0.85)',
            border: `1px solid ${t.edge}`,
            whiteSpace: 'nowrap',
          }}
        >
          {owned && (
            <span aria-label="Owned" style={{ fontSize: 8, lineHeight: 1, color: '#22c55e' }}>
              ✓
            </span>
          )}
          {priceTag != null && (
            <span style={{ fontFamily: PIXEL, fontSize: 8, lineHeight: 1, color: '#f5c542', opacity: owned ? 0.55 : 1 }}>
              {priceTag}
            </span>
          )}
          {owned && priceTag == null && (
            <span style={{ fontFamily: PIXEL, fontSize: 8, lineHeight: 1, color: '#22c55e' }}>OWNED</span>
          )}
        </div>
      )}

      {/* brushed-metal diagonal sheen (every tier) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `linear-gradient(115deg, transparent 36%, ${t.edge}55 49%, transparent 60%)`,
          mixBlendMode: t.light ? 'overlay' : 'screen',
          opacity: 0.55,
        }}
      />

      {/* live foil shimmer — Epic and Legendary only */}
      {epicPlus && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'overlay',
            opacity: 0.5,
            background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.6) 48%, transparent 66%)',
            backgroundSize: '250% 100%',
            animation: `kcfcShimmer ${legendary ? 3 : 4}s linear infinite`,
          }}
        />
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="kcfc" style={rootStyle} aria-pressed={selected}>
        {body}
      </button>
    );
  }
  return (
    <div className="kcfc" style={rootStyle}>
      {body}
    </div>
  );
}
