'use client';

/**
 * Kickoff Clash — GameCard
 *
 * The reusable, pixel-art PLAYING CARD. One shared frame, four variants:
 *   • PLAYER     — sprite portrait, position tab, big rating, surname, archetype.
 *   • MANAGER    — gaffer crest, name, philosophy flavour, trait pills.
 *   • TACTIC     — category crest, name, effect, category tab.
 *   • INVESTMENT — Boardroom crest, ladder tab, cost, football name, effect line.
 *
 * Two sizes: `grid` (the dense token in a list/pack/sheet) and `full` (the
 * expanded card rendered inside CardModal). Both share the same frame so a
 * tapped grid card visibly grows into its full self.
 *
 * The reconciliation (LOCKED): GLASSY FRAME, PIXEL INTERIOR. The frame carries
 * the depth — an inner top-edge highlight, a rarity-tinted diagonal sheen sweep,
 * a soft rarity glow on Epic/Legendary, and real stacked elevation. The interior
 * (sprite + flat blocks + Silkscreen) stays crisp pixel art: `pixelated`,
 * `shapeRendering="crispEdges"`, no blur, no soft shadow on a sprite — depth on a
 * sprite comes from MORE pixels (a 3-value ramp + rim-light), never a filter.
 *
 * Tokens come from cardTokens.ts and DESIGN.md. See DESIGN.md › Cards + Glass.
 */

import type { Card } from '../../lib/scoring';
import { deriveStats } from '../../lib/funnel';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard } from '../../lib/tactics';
import type { InvestmentCard } from '../../lib/economy';
import {
  PIXEL,
  RARITY_COLOR,
  RARITY_GLASS,
  POSITION_COLOR,
  TACTIC_CAT_COLOR,
  INVESTMENT_META,
  formatCash,
  nationFlag,
  nationCode,
  lastName,
  definingTraitsFor,
  managerAccent,
  managerTraitStyle,
  TACTIC_ICON,
  type ManagerProp,
  type ChalkRect,
} from './cardTokens';
import {
  portraitBackgroundStyle,
  rarityFrame,
  fitnessColor,
  conditionRecipe,
  WEAR_GLYPH,
  HERO,
  type ConditionGrade,
} from './portrait';

// The trait glyphs (✦ ➴ ⚑ ◣ …) live outside the Silkscreen glyph set, so render
// them in a Unicode-complete fallback stack. The READABLE pixel-font label is the
// signal; the glyph is a small accent that degrades gracefully if a symbol is
// missing. (Why the old glyph-only grid chip read as a blank box.)
const GLYPH_FONT = "'DejaVu Sans', 'Noto Sans Symbols', 'Segoe UI Symbol', sans-serif";

export type CardSize = 'grid' | 'full';

export type GameCardModel =
  | { variant: 'player'; card: Card }
  | { variant: 'manager'; manager: JokerCard }
  | { variant: 'tactic'; tactic: TacticCard }
  | { variant: 'investment'; investment: InvestmentCard };

interface GameCardProps {
  model: GameCardModel;
  size?: CardSize;
  onClick?: () => void;
  /** Visually dim ineligible/disabled cards (e.g. wrong position for a slot). */
  dimmed?: boolean;
  /** Selected ring (e.g. chosen gaffer / current formation). */
  selected?: boolean;
  /** Stagger animation delay (ms) for reveal grids. */
  delay?: number;
  className?: string;
  ariaLabel?: string;
}

// Card aspect is a true playing-card 2.5:3.5 ratio.
const ASPECT = 2.5 / 3.5;

/**
 * The glass treatment for a card, derived from its accent + (for players) the
 * rarity glass companion. Non-player families fall back to a quiet glass with a
 * faint accent sheen and no glow halo, so a gaffer/tactic/investment reads as the
 * same material without the rarity escalation.
 */
interface CardGlass {
  /** 3-value rim ramp [shadow, base, highlight] for the inner frame edges. */
  ramp: [string, string, string];
  /** Outer glow token, or null for none. */
  glow: string | null;
  /** Diagonal sheen strength 0–1. */
  sheen: number;
  /** Legendary animated foil. */
  foil: boolean;
}

function glassFor(model: GameCardModel, accent: string): CardGlass {
  if (model.variant === 'player') {
    const g = RARITY_GLASS[model.card.rarity] ?? RARITY_GLASS.Common;
    return { ramp: g.ramp, glow: g.glow, sheen: g.sheen, foil: g.foil };
  }
  // Gaffer / tactic / investment: quiet glass, faint accent sheen, no glow halo.
  return { ramp: [accent, accent, accent], glow: null, sheen: 0.45, foil: false };
}

export default function GameCard({
  model,
  size = 'grid',
  onClick,
  dimmed = false,
  selected = false,
  delay,
  className,
  ariaLabel,
}: GameCardProps) {
  const full = size === 'full';

  let frameStyle: React.CSSProperties;
  let content: React.ReactNode;

  if (model.variant === 'player') {
    // PIXEL HERO: the rarity is the FRAME MATERIAL (foil gradient) — the padding IS
    // the border. A near-black inner face carries the crisp pixel anatomy.
    const fr = rarityFrame(model.card.rarity);
    const ring = selected ? '0 0 0 2px var(--gold), ' : '';
    frameStyle = {
      position: 'relative',
      width: '100%',
      aspectRatio: `${ASPECT}`,
      borderRadius: full ? 16 : 10,
      padding: full ? 6 : 4,
      background: fr.frame,
      boxShadow: ring + fr.glow,
      boxSizing: 'border-box',
      opacity: dimmed ? 0.42 : 1,
      display: 'flex',
      textAlign: 'left',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.12s ease',
      minWidth: 0,
      animationDelay: delay != null ? `${delay}ms` : undefined,
    };
    content = <PlayerFace card={model.card} full={full} frameLabel={fr.label} labelColor={fr.lc} foil={fr.foil} />;
  } else {
    const accent = accentFor(model);
    const glass = glassFor(model, accent);
    // Stacked elevation: the hard ink-black pixel drop (the flat-sprite tell) PLUS
    // a soft ambient shadow underneath (real height). Selected adds an accent ring;
    // Epic/Legendary add a coloured glow halo to the same stack.
    const inkDrop = `0 ${full ? 6 : 3}px 0 0 var(--ink-black)`;
    const ambient = `0 ${full ? 12 : 5}px ${full ? 26 : 10}px rgba(2,9,5,0.5)`;
    const glow = glass.glow ? `0 0 ${full ? 22 : 14}px ${full ? 3 : 1}px ${glass.glow}` : null;
    const ring = selected ? `0 0 0 2px ${accent}` : null;
    const boxShadow = [ring, inkDrop, ambient, glow].filter(Boolean).join(', ');

    frameStyle = {
      position: 'relative',
      width: '100%',
      aspectRatio: `${ASPECT}`,
      borderRadius: full ? 'var(--radius)' : 'var(--radius-sm)',
      border: `${full ? 3 : 2}px solid var(--ink-black)`,
      background: 'linear-gradient(165deg, var(--surface-raised) 0%, var(--surface) 55%, var(--felt) 100%)',
      boxShadow,
      overflow: 'hidden',
      opacity: dimmed ? 0.42 : 1,
      display: 'flex',
      flexDirection: 'column',
      textAlign: 'left',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.12s ease',
      minWidth: 0,
      animationDelay: delay != null ? `${delay}ms` : undefined,
    };

    const body =
      model.variant === 'manager' ? (
        <ManagerBody manager={model.manager} full={full} accent={accent} />
      ) : model.variant === 'tactic' ? (
        <TacticBody tactic={model.tactic} full={full} accent={accent} />
      ) : (
        <InvestmentBody investment={model.investment} full={full} accent={accent} />
      );

    content = (
      <>
        {/* Accent top rail — the family signature, lit on its top edge. */}
        <div style={{ position: 'relative', height: full ? 5 : 3, background: accent, flexShrink: 0, zIndex: 2 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)' }} />
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', zIndex: 2 }}>
          {body}
        </div>
        {/* Accent bottom rail — shaded on its top edge for a seated look. */}
        <div style={{ position: 'relative', height: full ? 5 : 3, background: accent, flexShrink: 0, zIndex: 2 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.4), transparent)' }} />
        </div>

        {/* --- GLASS CHROME OVERLAYS (under the content z-index, never on pixels) --- */}
        <GlassChrome glass={glass} full={full} />
      </>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`active:scale-95 ${delay != null ? 'chip-reveal' : ''} ${className ?? ''}`}
        style={frameStyle}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={`${delay != null ? 'chip-reveal' : ''} ${className ?? ''}`} style={frameStyle}>
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glass chrome — the lit-glass tells layered behind the pixel content. All at
// z-index 1 (content sits at 2), pointer-events none, never blurring a pixel.
// ---------------------------------------------------------------------------

function GlassChrome({ glass, full }: { glass: CardGlass; full: boolean }) {
  const [, , highlight] = glass.ramp;
  return (
    <>
      {/* Inner top-edge highlight — the "lit glass" tell, brightest at the top. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: full ? 40 : 22,
          background: `linear-gradient(180deg, rgba(242,246,239,0.18) 0%, transparent 100%)`,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      {/* A 1px rim-light hairline just inside the ink border, rarity-tinted. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          boxShadow: `inset 0 0 0 1px ${withAlpha(highlight, glass.sheen > 0 ? 0.34 : 0.16)}, inset 0 1px 0 0 rgba(242,246,239,0.22)`,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      {/* Rarity-tinted diagonal sheen sweep (static on Common→Epic; absent on Common). */}
      {glass.sheen > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(118deg, transparent 30%, ${withAlpha(highlight, 0.06 * glass.sheen)} 44%, ${withAlpha(highlight, 0.22 * glass.sheen)} 50%, ${withAlpha(highlight, 0.05 * glass.sheen)} 56%, transparent 70%)`,
            pointerEvents: 'none',
            zIndex: 1,
            mixBlendMode: 'screen',
          }}
        />
      )}
      {/* Legendary foil: an animated travelling gloss band over the static sheen. */}
      {glass.foil && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', zIndex: 1 }}>
          <div
            className="card-foil"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '46%',
              background: `linear-gradient(90deg, transparent, ${withAlpha(highlight, 0.34)} 50%, transparent)`,
              mixBlendMode: 'screen',
            }}
          />
        </div>
      )}
    </>
  );
}

/** Parse a hex colour to [r,g,b], or null if it isn't a hex string. */
function hexToRgb(color: string): [number, number, number] | null {
  if (!color.startsWith('#')) return null;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A hex position colour, defaulting to a mid-grey for CSS-var/unknown tints so
 *  the sprite ramp always has a concrete base to lighten/darken from. */
function posHex(color: string): string {
  return color.startsWith('#') ? color : '#7a828c';
}

/** Lighten a hex toward white by `t` (0–1). Used for the top-left kit highlight. */
function lighten(color: string, t: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const [r, g, b] = rgb.map((c) => Math.round(c + (255 - c) * t));
  return `rgb(${r},${g},${b})`;
}

/** Darken a hex toward black by `t` (0–1). Used for the bottom-right kit shadow. */
function darken(color: string, t: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const [r, g, b] = rgb.map((c) => Math.round(c * (1 - t)));
  return `rgb(${r},${g},${b})`;
}

/** Apply an alpha to a colour. Hex (#rgb/#rrggbb) → rgba; otherwise wrap as-is. */
function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }
  // CSS var or named colour — fall back to a neutral light so the effect survives.
  return `rgba(242,246,239,${a})`;
}

// ---------------------------------------------------------------------------
// Accent per variant
// ---------------------------------------------------------------------------

function accentFor(model: GameCardModel): string {
  if (model.variant === 'player') return RARITY_COLOR[model.card.rarity] ?? RARITY_COLOR.Common;
  if (model.variant === 'manager') return 'var(--kit-red)';
  if (model.variant === 'tactic') return TACTIC_CAT_COLOR[model.tactic.category] ?? 'var(--gold)';
  return INVESTMENT_META[model.investment.ladder]?.accent ?? 'var(--gold)';
}

// ===========================================================================
// PLAYER face — "Pixel Hero" (design handoff 2a/3a)
//
// A black-card-stock face inside a rarity foil frame. Top→bottom: header
// (position badge + ATK/DEF columns) · seeded 16-bit portrait window · name ·
// gold ROLE band · action panel (name + rules text on `full`, name-only on
// `grid`) · footer (rarity label + condition chip, `full` only). Legendary earns
// an animated foil sweep. The portrait is procedural (portrait.ts, seeded by the
// card id) — crisp pixels, never blurred; the foil/glow lives on the frame.
// ===========================================================================

function PlayerFace({
  card,
  full,
  frameLabel,
  labelColor,
  foil,
}: {
  card: Card;
  full: boolean;
  frameLabel: string;
  labelColor: string;
  foil: boolean;
}) {
  const posColor = POSITION_COLOR[card.position] ?? '#9aa0a8';
  const stats = deriveStats(card);
  const name = lastName(card.name).toUpperCase();
  const role = card.tacticalRole ?? card.archetype;
  // The player's ACTION is their marquee defining trait (label + one-line rules
  // text). Falls back to the printed ability when a card carries no defining trait.
  const traits = definingTraitsFor(card);
  const primary = traits[0];
  const actionName = (primary ? primary.copy.label : card.abilityName ?? '').toUpperCase();
  const actionText = primary ? primary.copy.blurb : card.abilityText ?? '';
  const cond = conditionRecipe(card.condition);

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        borderRadius: full ? 11 : 7,
        border: `2px solid ${HERO.ink}`,
        background: HERO.faceGradient,
        display: 'flex',
        flexDirection: 'column',
        filter: cond.filt !== 'none' ? cond.filt : undefined,
        clipPath: cond.clip !== 'none' ? cond.clip : undefined,
      }}
    >
      {/* HEADER — position badge (left) · ATK/DEF columns (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: full ? '10px 10px 0' : '6px 6px 0', gap: 4 }}>
        <span
          style={{
            fontFamily: PIXEL,
            fontSize: full ? 9 : 6,
            lineHeight: 1,
            color: HERO.badgeText,
            background: posColor,
            padding: full ? '4px 6px' : '2px 4px',
            borderRadius: full ? 3 : 2,
            border: `1px solid ${HERO.ink}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}
        >
          {card.position}
        </span>
        <div style={{ display: 'flex', gap: full ? 10 : 5, flexShrink: 0 }}>
          <StatCol value={stats.atk} label="ATK" valueColor={HERO.cream} labelColor={HERO.atk} full={full} />
          <StatCol value={stats.def} label="DEF" valueColor={HERO.creamBody} labelColor={HERO.def} full={full} />
        </div>
      </div>

      {/* PORTRAIT WINDOW — the seeded 16-bit bust, bottom-anchored. */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: full ? 76 : 52,
          marginTop: 2,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          background: `radial-gradient(90% 80% at 50% 30%, rgba(232,178,60,${full ? 0.2 : 0.16}), transparent 72%)`,
        }}
      >
        {full && <div style={{ position: 'absolute', left: 12, right: 12, bottom: 0, height: 1, background: 'rgba(232,178,60,0.35)' }} />}
        <div
          className="pixelated"
          aria-hidden
          style={{ ...portraitBackgroundStyle(card.id), width: '100%', height: full ? '92%' : '94%' }}
        />
      </div>

      {/* NAME */}
      <div style={{ padding: full ? '7px 10px 6px' : '5px 6px 2px' }}>
        <span
          style={{
            display: 'block',
            fontFamily: PIXEL,
            fontSize: full ? 15 : 8,
            color: HERO.cream,
            textShadow: `0 ${full ? 2 : 1}px 0 ${HERO.ink}`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </span>
      </div>

      {/* GOLD ROLE BAND */}
      <div
        style={{
          background: full ? HERO.roleBand : HERO.roleBandMini,
          borderTop: `${full ? 2 : 1}px solid ${HERO.ink}`,
          borderBottom: `${full ? 2 : 1}px solid ${HERO.ink}`,
          padding: full ? '4px 10px' : '2px 6px',
          marginTop: full ? 0 : 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: full ? 9 : 6, color: '#171207', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {role}
        </span>
        {full && <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: 'rgba(23,18,7,0.65)', flexShrink: 0 }}>ROLE</span>}
      </div>

      {/* ACTION — full panel (name + rules text) on profile, name-only on grid. */}
      {full ? (
        <div style={{ margin: '8px 8px 6px', borderRadius: 6, border: '1px solid rgba(232,178,60,0.4)', background: 'rgba(0,0,0,0.35)', padding: '7px 8px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1.5, color: HERO.creamMuted }}>ACTION</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(232,178,60,0.3)' }} />
          </div>
          {actionName && <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 9, color: HERO.gold, marginTop: 5 }}>{actionName}</span>}
          {actionText && (
            // The card is a fixed-aspect frame, so the rules text is clamped to a
            // graceful preview (the modal's detail panel below shows it in full).
            <span
              style={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
                fontFamily: 'var(--font-body, sans-serif)',
                fontSize: 10.5,
                lineHeight: 1.4,
                color: HERO.creamBody,
                marginTop: 4,
              }}
            >
              {actionText}
            </span>
          )}
        </div>
      ) : (
        <div style={{ padding: '4px 6px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span aria-hidden style={{ fontFamily: PIXEL, fontSize: 5, color: HERO.creamMuted, flexShrink: 0 }}>◆</span>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, color: HERO.gold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {actionName || role}
          </span>
        </div>
      )}

      {/* FOOTER — rarity label · condition chip (profile only). */}
      {full && (
        <div style={{ padding: '0 10px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1.5, color: labelColor, whiteSpace: 'nowrap' }}>{frameLabel}</span>
          <span
            style={{
              fontFamily: PIXEL,
              fontSize: 6,
              letterSpacing: 1,
              color: cond.cc,
              border: `1px solid ${cond.cc}`,
              borderRadius: 3,
              padding: '2px 5px',
              flexShrink: 0,
            }}
          >
            {WEAR_GLYPH} {cond.label}
          </span>
        </div>
      )}

      {/* WEAR OVERLAY — drawn on the face when the card has degraded (design 3a). */}
      {cond.wearBg !== 'none' && <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: cond.wearBg }} />}
      {cond.stampDisp === 'flex' && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontFamily: PIXEL, fontSize: full ? 9 : 7, color: '#e0332d', border: '2px solid #e0332d', borderRadius: 4, padding: '3px 6px', background: 'rgba(11,7,3,0.75)', transform: 'rotate(-12deg)' }}>
            DESTROYED
          </span>
        </div>
      )}

      {/* LEGENDARY FOIL SWEEP — travelling gloss band (respects reduced-motion via .card-foil). */}
      {foil && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none' }}>
          <div
            className="card-foil"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '45%',
              background: 'linear-gradient(90deg, transparent, rgba(255,240,205,0.30), transparent)',
              mixBlendMode: 'screen',
            }}
          />
        </div>
      )}
    </div>
  );
}

/** One stacked stat column — big Silkscreen value over a 6px tinted label. */
function StatCol({ value, label, valueColor, labelColor, full }: { value: number; label: string; valueColor: string; labelColor: string; full: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontFamily: PIXEL, fontSize: full ? 18 : 12, lineHeight: full ? 0.9 : 1, color: valueColor, textShadow: `0 ${full ? 2 : 1}px 0 ${HERO.ink}` }}>
        {value}
      </span>
      {full && <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: labelColor, lineHeight: 1 }}>{label}</span>}
    </div>
  );
}


// ===========================================================================
// MANAGER body
// ===========================================================================

function ManagerBody({ manager, full, accent }: { manager: JokerCard; full: boolean; accent: string }) {
  const flag = nationFlag(manager.nation);
  const visibleTraits = full ? manager.traits : manager.traits.slice(0, 2);
  const gaffer = managerAccent(manager.traits);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: full ? 10 : '5px 6px' }}>
      {/* Header: MANAGER tab · nation */}
      <div className="flex items-center justify-between" style={{ gap: 4 }}>
        <span
          style={{
            background: accent,
            color: 'var(--line-white)',
            fontFamily: PIXEL,
            fontSize: full ? 9 : 7,
            lineHeight: 1,
            padding: full ? '5px 6px' : '3px 4px',
            borderRadius: 3,
            letterSpacing: 0.5,
            flexShrink: 0,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.3)',
          }}
        >
          MANAGER
        </span>
        {flag ? (
          <span style={{ fontSize: full ? 15 : 11, lineHeight: 1 }}>{flag}</span>
        ) : manager.nation ? (
          <span style={{ fontFamily: PIXEL, fontSize: full ? 8 : 6.5, color: 'var(--dust)', lineHeight: 1 }}>
            {nationCode(manager.nation)}
          </span>
        ) : null}
      </div>

      {/* Gaffer crest sprite — a big half-body bust (no rating/fitness competes for
          space, so the crest is the hero) differentiated by the primary trait's
          tie/pocket-square tint + a small prop. */}
      <div style={{ flex: 1, minHeight: full ? 0 : 58, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: full ? '6px 0 0' : '2px 0 0', overflow: 'hidden' }}>
        <ManagerSprite tie={gaffer.tie} prop={gaffer.prop} full={full} />
      </div>

      {/* Nameplate — manager name seated on a hard accent rule (matches the player
          card's identity band), then the EFFECT (what the manager does) as the
          load-bearing line, and the philosophy as the quiet flavour beneath it. */}
      <div style={{ borderTop: `2px solid ${accent}`, paddingTop: full ? 6 : 3, marginTop: full ? 4 : 2 }}>
        <span className="truncate" style={{ display: 'block', fontFamily: PIXEL, fontSize: full ? 13 : 9.5, color: 'var(--cream)', lineHeight: 1.1, textShadow: '0 1px 0 var(--ink-black)' }}>
          {manager.name.toUpperCase()}
        </span>
        <p
          style={{
            fontSize: full ? 11 : 8.5,
            lineHeight: 1.35,
            color: 'var(--cream)',
            margin: '4px 0 0',
            display: '-webkit-box',
            WebkitLineClamp: full ? 4 : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {manager.effect}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: full ? 11 : 8,
            lineHeight: 1.3,
            color: 'var(--dust)',
            margin: '3px 0 0',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {'“'}{manager.philosophy}{'”'}
        </p>
      </div>
      {/* Trait tags — a gaffer's identity (Direct Play, Low Block, …), now COLOURED
          BY MEANING (defensive-blue, attacking-red, …) instead of a fixed kit-red,
          so a Low Block gaffer never reads the same as a Motivator. The grid layout
          reserves a min-height row so two tags never clip. */}
      <div
        className="flex flex-wrap"
        style={{ gap: full ? 5 : 3, marginTop: full ? 8 : 4, minHeight: full ? undefined : 18, flexShrink: 0 }}
      >
        {visibleTraits.map((t) => {
          const s = managerTraitStyle(t);
          return (
            <span
              key={t}
              style={{
                fontFamily: PIXEL,
                fontSize: full ? 8.5 : 6.5,
                letterSpacing: 0.3,
                color: s.color,
                background: s.bg,
                border: `1px solid ${s.color}`,
                borderRadius: 4,
                padding: full ? '4px 6px' : '3px 4px',
                lineHeight: 1,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                whiteSpace: 'nowrap',
              }}
            >
              {t.toUpperCase()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Gaffer BUST: a proper half-body (head + shoulders + suit + tie), ~60% of the
 * card height, filling the frame from the bottom up. It has no rating/fitness
 * competing for space, so the crest is the hero. Lit top-left — hair/forehead
 * highlight, right-shoulder shadow, a rim-light down the left lapel. The TIE +
 * pocket-square carry the primary-trait tint, and a small PROP (clipboard /
 * whistle / scarf / rosette / shield) differentiates the gaffer's identity.
 *
 * The viewBox is 24×20 (wider-than-tall bust) so a big head+shoulders fills the
 * width; the sprite's own container bottom-aligns it so the shoulders meet the
 * nameplate rule.
 */
function ManagerSprite({ tie, prop, full }: { tie: string; prop: ManagerProp; full: boolean }) {
  // Suit ramp (charcoal).
  const suitHi = '#33465a';
  const suit = '#1e2a38';
  const suitSh = '#0e151d';
  // Skin ramp.
  const skinHi = '#f4dcb8';
  const skin = '#e0b486';
  const skinSh = '#b88a5e';
  const tieHi = lighten(posHex(tie), 0.4);
  const tieSh = darken(posHex(tie), 0.34);
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 20"
      preserveAspectRatio="xMidYMax meet"
      style={{ width: full ? '96%' : '98%', maxWidth: full ? 150 : 82, height: '100%', display: 'block' }}
      shapeRendering="crispEdges"
    >
      {/* HAIR — big crown, lit top-left */}
      <rect x="7" y="0" width="10" height="4" fill="#2a2018" />
      <rect x="7" y="0" width="6" height="2" fill="#43342a" />
      <rect x="6" y="1" width="1" height="3" fill="#2a2018" />
      <rect x="17" y="1" width="1" height="3" fill="#1c150f" />

      {/* HEAD — large, base + top-left highlight + bottom-right shadow */}
      <rect x="7" y="3" width="10" height="8" fill={skin} />
      <rect x="7" y="3" width="5" height="4" fill={skinHi} />
      <rect x="14" y="7" width="3" height="4" fill={skinSh} />
      {/* brow line + eyes (a hint of a face) */}
      <rect x="9" y="6" width="2" height="1" fill={skinSh} />
      <rect x="13" y="6" width="2" height="1" fill={skinSh} />
      {/* ears */}
      <rect x="6" y="6" width="1" height="2" fill={skin} />
      <rect x="17" y="6" width="1" height="2" fill={skinSh} />
      {/* jaw shadow */}
      <rect x="8" y="10" width="8" height="1" fill={skinSh} />

      {/* NECK */}
      <rect x="10" y="11" width="4" height="2" fill={skinSh} />
      <rect x="10" y="11" width="2" height="1" fill={skin} />

      {/* SHOULDERS + SUIT — a broad bust filling the width, lit top-left */}
      <rect x="2" y="13" width="20" height="7" fill={suit} />
      <rect x="2" y="13" width="20" height="2" fill={suitHi} />
      <rect x="2" y="18" width="20" height="2" fill={suitSh} />
      {/* rim-light left shoulder, shaded right shoulder */}
      <rect x="2" y="13" width="1" height="7" fill={suitHi} />
      <rect x="21" y="13" width="1" height="7" fill={suitSh} />

      {/* SHIRT V (white), lit top */}
      <polygon points="9,13 15,13 12,19" fill="var(--line-white)" />
      <polygon points="9,13 15,13 12,15" fill="#ffffff" />

      {/* LAPELS — darker, right one fully shadowed */}
      <polygon points="7,13 10,13 7,18" fill={suitSh} />
      <polygon points="17,13 14,13 17,18" fill="#070d11" />

      {/* TIE in the trait tint — lit knot, base, shaded tail */}
      <rect x="11" y="13" width="2" height="6" fill={posHex(tie)} />
      <rect x="11" y="13" width="2" height="1" fill={tieHi} />
      <rect x="11" y="17" width="2" height="2" fill={tieSh} />

      {/* POCKET SQUARE (trait tint) on the right breast */}
      <rect x="17" y="15" width="2" height="1" fill={posHex(tie)} />
      <rect x="17" y="15" width="1" height="1" fill={tieHi} />

      {/* PROP — a small held item on the left breast that names the gaffer's craft */}
      <GafferProp prop={prop} tie={posHex(tie)} tieHi={tieHi} tieSh={tieSh} />
    </svg>
  );
}

/** The gaffer's held prop, drawn on the left breast (x 3–7, y 14–19). Lit top-left. */
function GafferProp({ prop, tie, tieHi, tieSh }: { prop: ManagerProp; tie: string; tieHi: string; tieSh: string }) {
  switch (prop) {
    case 'clipboard':
      return (
        <>
          <rect x="3" y="14" width="4" height="5" fill="#d8cfa8" />
          <rect x="3" y="14" width="4" height="1" fill="#efe8c8" />
          <rect x="4" y="13" width="2" height="1" fill="#9c8f5e" /> {/* clip */}
          <rect x="4" y="16" width="2" height="1" fill={tie} />
          <rect x="4" y="17" width="3" height="1" fill="rgba(0,0,0,0.35)" />
        </>
      );
    case 'whistle':
      return (
        <>
          <rect x="4" y="14" width="3" height="2" fill="#c9c9c9" />
          <rect x="4" y="14" width="3" height="1" fill="#efefef" />
          <rect x="3" y="16" width="1" height="1" fill="#7d7d7d" />
          {/* lanyard in the trait tint */}
          <rect x="6" y="13" width="1" height="2" fill={tie} />
          <rect x="4" y="16" width="1" height="1" fill="rgba(0,0,0,0.4)" />
        </>
      );
    case 'scarf':
      return (
        <>
          <rect x="3" y="13" width="2" height="6" fill={tie} />
          <rect x="3" y="13" width="2" height="1" fill={tieHi} />
          <rect x="3" y="17" width="2" height="2" fill={tieSh} />
          <rect x="4" y="15" width="1" height="1" fill="#ffffff" /> {/* stripe */}
        </>
      );
    case 'rosette':
      return (
        <>
          <rect x="4" y="14" width="3" height="3" fill={tie} />
          <rect x="4" y="14" width="3" height="1" fill={tieHi} />
          <rect x="5" y="15" width="1" height="1" fill="#ffffff" />
          {/* ribbon tails */}
          <rect x="4" y="17" width="1" height="2" fill={tie} />
          <rect x="6" y="17" width="1" height="2" fill={tieSh} />
        </>
      );
    case 'shield':
      return (
        <>
          <rect x="4" y="14" width="3" height="3" fill={tie} />
          <rect x="4" y="14" width="3" height="1" fill={tieHi} />
          <rect x="5" y="17" width="1" height="1" fill={tie} />
          <rect x="5" y="15" width="1" height="1" fill="#ffffff" />
        </>
      );
    default:
      return null;
  }
}

// ===========================================================================
// TACTIC body
// ===========================================================================

function TacticBody({ tactic, full, accent }: { tactic: TacticCard; full: boolean; accent: string }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: full ? 10 : '5px 6px' }}>
      {/* Category tab */}
      <div className="flex items-center justify-between" style={{ gap: 4 }}>
        <span
          style={{
            background: accent,
            color: 'var(--ink-black)',
            fontFamily: PIXEL,
            fontSize: full ? 9 : 6.5,
            lineHeight: 1,
            padding: full ? '5px 6px' : '3px 4px',
            borderRadius: 3,
            letterSpacing: 0.5,
            flexShrink: 0,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.25)',
          }}
        >
          {tactic.category.toUpperCase()}
        </span>
      </div>

      {/* Tactic crest sprite — bespoke chalk scene per tactic.id on a shared board.
          No rating/fitness/sprite competes for space here, so the board is the hero
          of the card: it fills the width. */}
      <div style={{ flex: 1, minHeight: full ? 0 : 74, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? '10px 0' : '4px 0', overflow: 'hidden' }}>
        <TacticSprite id={tactic.id} accent={accent} full={full} />
      </div>

      {/* Name + effect */}
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: full ? 12 : 9.5, color: 'var(--cream)', lineHeight: 1.2 }}>
        {tactic.name}
      </span>
      <span
        style={{
          fontSize: full ? 11 : 8.5,
          lineHeight: 1.35,
          color: 'var(--cream-soft)',
          marginTop: 3,
          display: '-webkit-box',
          WebkitLineClamp: full ? 5 : 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {tactic.effect}
      </span>
    </div>
  );
}

/**
 * Tactic crest: the shared pixel tactic BOARD (green field, lit top rail, shaded
 * base, halfway line — the family signature) with a bespoke chalk SCENE drawn on
 * top, dispatched on tactic.id from TACTIC_ICON. Every scene is lit top-left and
 * uses ≤6 colours (category accent + chalk white + ink shadow + a ball dot).
 * Anything without a scene falls back to the classic chevron.
 */
function TacticSprite({ id, accent, full }: { id: string; accent: string; full: boolean }) {
  const scene = TACTIC_ICON[id];
  const chalkFill = (f: ChalkRect['fill']): string =>
    f === 'accent' ? accent : f === 'chalk' ? 'rgba(242,246,239,0.92)' : f === 'ball' ? '#ffffff' : 'rgba(0,0,0,0.42)';
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '94%' : '100%', maxWidth: full ? 168 : 100, height: '100%', maxHeight: full ? 168 : 100, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      <rect x="3" y="3" width="18" height="18" fill="rgba(0,0,0,0.22)" />

      {/* tactic board — green field, lit top rail, shaded bottom */}
      <rect x="4" y="4" width="16" height="16" fill="#15402a" />
      <rect x="4" y="4" width="16" height="2" fill="#1f5e3c" />
      <rect x="4" y="18" width="16" height="2" fill="#0c2419" />
      {/* board rim-light left edge */}
      <rect x="4" y="4" width="1" height="16" fill="#236b45" />
      {/* halfway line */}
      <rect x="4" y="11" width="16" height="1" fill="rgba(242,246,239,0.16)" />

      {scene ? (
        scene.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={chalkFill(r.fill)} />
        ))
      ) : (
        <>
          {/* CHEVRON fallback — accent body, white lit edge, dark seated shadow */}
          <polygon points="6,15 12,8 18,15 15,15 12,11 9,15" fill={accent} />
          <polygon points="6,15 12,8 18,15 16,15 12,9 8,15" fill="rgba(255,255,255,0.35)" />
          <polygon points="9,16 12,12 15,16 14,16 12,13 10,16" fill="rgba(0,0,0,0.35)" />
        </>
      )}
    </svg>
  );
}

// ===========================================================================
// INVESTMENT body (Boardroom)
// ===========================================================================

function InvestmentBody({ investment, full, accent }: { investment: InvestmentCard; full: boolean; accent: string }) {
  const meta = INVESTMENT_META[investment.ladder] ?? INVESTMENT_META.stadium;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: full ? 10 : '5px 6px' }}>
      {/* Header: ladder tab · cost */}
      <div className="flex items-center justify-between" style={{ gap: 4 }}>
        <span
          style={{
            background: accent,
            color: 'var(--ink-black)',
            fontFamily: PIXEL,
            fontSize: full ? 9 : 6.5,
            lineHeight: 1,
            padding: full ? '5px 6px' : '3px 4px',
            borderRadius: 3,
            letterSpacing: 0.5,
            flexShrink: 0,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.25)',
          }}
        >
          {meta.tab}
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: full ? 15 : 10, lineHeight: 1, color: 'var(--gold)', flexShrink: 0, textShadow: '0 1px 0 var(--ink-black)' }}>
          {formatCash(investment.cost)}
        </span>
      </div>

      {/* Boardroom crest sprite — distinct per ladder */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? '8px 0' : '4px 0' }}>
        <InvestmentSprite ladder={investment.ladder} accent={accent} full={full} />
      </div>

      {/* Name + effect line */}
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: full ? 12 : 9.5, color: 'var(--cream)', lineHeight: 1.2 }}>
        {investment.name}
      </span>
      <span
        style={{
          fontSize: full ? 11 : 8.5,
          lineHeight: 1.35,
          color: 'var(--cream-soft)',
          marginTop: 3,
          display: '-webkit-box',
          WebkitLineClamp: full ? 5 : 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {investment.description}
      </span>
    </div>
  );
}

/**
 * Boardroom crest: a gold chairman's seal framing a per-ladder pixel glyph
 * (stadium stands / academy sapling / box-office ticket). Light top-left — each
 * glyph carries a lit top face and a shadowed base; the gold ring is rim-lit.
 */
function InvestmentSprite({ ladder, accent, full }: { ladder: string; accent: string; full: boolean }) {
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '58%' : '72%', maxWidth: full ? 92 : 50, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      {/* seal plate */}
      <rect x="3" y="3" width="18" height="18" fill="rgba(0,0,0,0.24)" />
      {/* gold crest ring — lit top/left, shaded bottom/right */}
      <rect x="3" y="3" width="18" height="1" fill="#ffe79a" />
      <rect x="3" y="3" width="1" height="18" fill="#ffe79a" />
      <rect x="3" y="20" width="18" height="1" fill="#9c7414" />
      <rect x="20" y="3" width="1" height="18" fill="#9c7414" />
      {ladder === 'stadium' ? (
        <>
          {/* terraced stand: three tiers, each lit on top + shaded base */}
          <rect x="5" y="14" width="14" height="5" fill={accent} />
          <rect x="5" y="14" width="14" height="1" fill="#ffe79a" />
          <rect x="5" y="18" width="14" height="1" fill="#9c7414" />
          <rect x="6" y="11" width="12" height="3" fill={accent} />
          <rect x="6" y="11" width="12" height="1" fill="#ffe79a" />
          <rect x="7" y="9" width="10" height="2" fill={accent} />
          <rect x="7" y="9" width="10" height="1" fill="#ffe79a" />
          {/* seat shadow pixels */}
          <rect x="7" y="16" width="2" height="2" fill="rgba(0,0,0,0.4)" />
          <rect x="11" y="16" width="2" height="2" fill="rgba(0,0,0,0.4)" />
          <rect x="15" y="16" width="2" height="2" fill="rgba(0,0,0,0.4)" />
          {/* floodlight — lit head */}
          <rect x="11" y="5" width="2" height="4" fill="#88a08c" />
          <rect x="9" y="4" width="6" height="2" fill="var(--line-white)" />
          <rect x="9" y="4" width="6" height="1" fill="#ffffff" />
        </>
      ) : ladder === 'academy' ? (
        <>
          {/* sapling in a pot: youth growth, light top-left */}
          <rect x="10" y="15" width="4" height="4" fill="#b9722e" />
          <rect x="10" y="15" width="4" height="1" fill="#d68f49" />
          <rect x="9" y="14" width="6" height="1" fill="#e0a35c" />
          {/* stem */}
          <rect x="11" y="7" width="2" height="8" fill="#6b4a2b" />
          <rect x="11" y="7" width="1" height="8" fill="#8a6238" />
          {/* leaves — accent, lit top-left, shaded base */}
          <rect x="7" y="9" width="3" height="3" fill={accent} />
          <rect x="7" y="9" width="3" height="1" fill="rgba(255,255,255,0.5)" />
          <rect x="14" y="9" width="3" height="3" fill={accent} />
          <rect x="14" y="11" width="3" height="1" fill="rgba(0,0,0,0.3)" />
          <rect x="9" y="5" width="6" height="3" fill={accent} />
          <rect x="9" y="5" width="6" height="1" fill="rgba(255,255,255,0.5)" />
          <rect x="9" y="7" width="6" height="1" fill="rgba(0,0,0,0.25)" />
        </>
      ) : (
        <>
          {/* admission ticket: box office, lit top, shaded base */}
          <rect x="5" y="8" width="14" height="8" fill={accent} />
          <rect x="5" y="8" width="14" height="1" fill="#ffe79a" />
          <rect x="5" y="15" width="14" height="1" fill="#9c7414" />
          <rect x="5" y="8" width="1" height="8" fill="#ffe79a" />
          {/* perforation notch */}
          <rect x="13" y="8" width="1" height="8" fill="rgba(0,0,0,0.45)" />
          {/* stub marks */}
          <rect x="7" y="11" width="2" height="2" fill="rgba(0,0,0,0.4)" />
          <rect x="10" y="11" width="2" height="2" fill="rgba(0,0,0,0.4)" />
          <rect x="15" y="10" width="3" height="1" fill="rgba(0,0,0,0.4)" />
          <rect x="15" y="13" width="3" height="1" fill="rgba(0,0,0,0.4)" />
        </>
      )}
    </svg>
  );
}
