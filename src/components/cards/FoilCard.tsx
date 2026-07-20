'use client';

/**
 * KC pack-opening card (design handoff, 1C "Foil Premium") — CLASSIC game.
 *
 * Renders a classic `Card` (src/lib/scoring.ts) as the whole-card-colour rarity
 * ladder from the pack-opening handoff: Common→BRONZE, Rare→SILVER, Epic→GOLD,
 * Legendary→ONYX (tokens: cardTokens FOIL_TIER). The entire card fill/border/
 * glow IS the rarity read (no small badge); Epic+ carries a live foil shimmer,
 * every card a brushed-metal sheen.
 *
 * The classic mappings (all read from the live engine's display layers):
 *   • class badge  → classOfCard + PLAYER_CLASS_META (Creator/Finisher/Destroyer/
 *                    Controller/Engine/Wall — the game's real 6-class taxonomy);
 *   • ATK / DEF    → deriveStats (funnel.ts) — the two unlabelled 34px circles
 *                    (red = attack, blue = defence), the card's visual anchor;
 *   • action chips → the card's real defining traits via definingTraitsFor →
 *                    traitCopy labels (one chip; Legendary two, on ONE line);
 *   • fitness      → card.fitness (0–100, fresh cards default 100);
 *   • portrait     → the game's EXISTING seeded "Pixel Hero" bust (owner
 *                    decision) — portrait.ts, zoomed toward the head, in a
 *                    recessed tier-tinted window, one-shot rarity flare on
 *                    reveal, floating ✦ on Legendary.
 *
 * Presentational only — no engine writes. Pass `revealDelayMs` to play the
 * pack-cascade entry (rise + settle + flare) once; omit it for static surfaces.
 * Height is FIXED at 234 regardless of rarity or action count; width fills the
 * grid cell (fluid) unless `width` pins it.
 */

import { useState, type CSSProperties } from 'react';
import type { Card } from '../../lib/scoring';
import { deriveStats } from '../../lib/funnel';
import { classOfCard, PLAYER_CLASS_META, type PlayerClass } from '../../lib/contest-map';
import {
  PIXEL,
  POSITION_COLOR,
  FOIL_FLARE,
  foilTier,
  foilFitColor,
  definingTraitsFor,
  lastName,
} from './cardTokens';
import { portraitBackgroundStyle, portraitSrc } from './portrait';

// Class glyphs (🪄 🎯 🗡️ 🎛️ ⚙️ 🧱) fall outside Silkscreen — render them in the
// same symbol-complete fallback stack GameCard uses, tinted per the spec.
const GLYPH_FONT = "'DejaVu Sans', 'Noto Sans Symbols', 'Segoe UI Symbol', sans-serif";
const BODY_FONT = "var(--font-body, 'DM Sans', sans-serif)";

// Attack / defence circle colours (spec: colour encodes the stat — no labels).
const ATK = '#e63946';
const DEF = '#3aa0ff';

// Classes whose badge colour is light gold/amber take dark glyph ink (the
// handoff's Finisher/Engine rule; the rest read white on their saturated fill).
const DARK_GLYPH_CLASSES = new Set<PlayerClass>(['Finisher', 'Engine']);

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

/** The 34×34 class badge — class-coloured gradient circle + the class glyph. */
function ClassBadge({ cls }: { cls: PlayerClass }) {
  const meta = PLAYER_CLASS_META[cls];
  const glyphInk = DARK_GLYPH_CLASSES.has(cls) ? '#241a06' : '#fff';
  return (
    <div
      title={meta.label}
      aria-label={meta.label}
      style={{
        width: 34,
        height: 34,
        flexShrink: 0,
        borderRadius: '50%',
        background: `linear-gradient(160deg, ${meta.color}, ${meta.color}bb)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 0 2px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.45)',
      }}
    >
      <span aria-hidden style={{ fontFamily: GLYPH_FONT, fontSize: 17, lineHeight: 1, color: glyphInk }}>
        {meta.glyph}
      </span>
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
  width,
}: {
  card: Card;
  onClick?: () => void;
  selected?: boolean;
  /** Stagger for the pack cascade; when set, plays the entry + flare once. */
  revealDelayMs?: number;
  /** Fixed width if given; otherwise fills the grid cell (100%). Height stays
   *  fixed at 234 per spec either way. */
  width?: number;
}) {
  const t = foilTier(card.rarity);
  const onDark = !t.light;
  const legendary = card.rarity === 'Legendary';
  const epicPlus = legendary || card.rarity === 'Epic';
  const cls = classOfCard(card);
  const clsColor = PLAYER_CLASS_META[cls].color;
  const posColor = POSITION_COLOR[card.position] ?? '#9a8b6a';
  const stats = deriveStats(card);
  const fit = Math.max(0, Math.min(100, Math.round(card.fitness ?? 100)));
  const fc = foilFitColor(fit);
  // Real sliced portrait (GK-biased), falling back to the seeded Pixel Hero bust.
  const portrait = portraitSrc(card);
  const [imgOk, setImgOk] = useState(true);

  // Action chips — the card's REAL defining traits (trait-copy labels). One chip
  // normally; a Legendary carries two, kept on ONE line at the smaller size so
  // the card never changes height.
  const traits = definingTraitsFor(card);
  const shown = (legendary ? traits.slice(0, 2) : traits.slice(0, 1)).map((tr) => tr.copy.label);
  const two = shown.length > 1;

  // The spec's card shows ONE display name; long full names fall back to the
  // surname (the full name stays in the title tooltip / modal).
  const displayName = card.name.length > 10 ? lastName(card.name) : card.name;
  const role = card.tacticalRole ?? card.archetype;

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
    fontFamily: BODY_FONT,
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
        background: `${clsColor}22`,
        border: `1px solid ${clsColor}`,
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

      {/* top row: class badge + position pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
        <ClassBadge cls={cls} />
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
          {card.position}
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
        {portrait && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element -- raw <img> is deliberate: needs onError → procedural fallback + a basePath src under static export.
          <img
            src={portrait}
            alt=""
            draggable={false}
            onError={() => setImgOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 22%', display: 'block' }}
          />
        ) : (
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
        )}
        {animate && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              opacity: 0,
              background: `radial-gradient(circle at 50% 45%, ${FOIL_FLARE[card.rarity] ?? FOIL_FLARE.Common} 0%, transparent 60%)`,
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
        {role}
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
        <StatCircle value={stats.atk} col={ATK} onDark={onDark} />
        <StatCircle value={stats.def} col={DEF} onDark={onDark} />
      </div>

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
