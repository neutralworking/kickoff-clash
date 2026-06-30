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
  fitnessMeter,
  formatCash,
  nationFlag,
  nationCode,
  lastName,
  definingTraitsFor,
  shortTraitLabel,
  type ResolvedTrait,
} from './cardTokens';

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
  const accent = accentFor(model);
  const glass = glassFor(model, accent);
  const full = size === 'full';

  // Stacked elevation: the hard ink-black pixel drop (the flat-sprite tell) PLUS
  // a soft ambient shadow underneath (real height). Selected adds an accent ring;
  // Epic/Legendary add a coloured glow halo to the same stack.
  const inkDrop = `0 ${full ? 6 : 3}px 0 0 var(--ink-black)`;
  const ambient = `0 ${full ? 12 : 5}px ${full ? 26 : 10}px rgba(2,9,5,0.5)`;
  const glow = glass.glow ? `0 0 ${full ? 22 : 14}px ${full ? 3 : 1}px ${glass.glow}` : null;
  const ring = selected ? `0 0 0 2px ${accent}` : null;
  const boxShadow = [ring, inkDrop, ambient, glow].filter(Boolean).join(', ');

  const frameStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: `${ASPECT}`,
    borderRadius: full ? 'var(--radius)' : 'var(--radius-sm)',
    border: `${full ? 3 : 2}px solid var(--ink-black)`,
    background: 'linear-gradient(165deg, var(--surface-raised) 0%, var(--surface) 55%, #0c1d12 100%)',
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
    model.variant === 'player' ? (
      <PlayerBody card={model.card} full={full} accent={accent} />
    ) : model.variant === 'manager' ? (
      <ManagerBody manager={model.manager} full={full} accent={accent} />
    ) : model.variant === 'tactic' ? (
      <TacticBody tactic={model.tactic} full={full} accent={accent} />
    ) : (
      <InvestmentBody investment={model.investment} full={full} accent={accent} />
    );

  const content = (
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
// PLAYER body
// ===========================================================================

function PlayerBody({ card, full, accent }: { card: Card; full: boolean; accent: string }) {
  const posColor = POSITION_COLOR[card.position] ?? 'var(--dust)';
  const flag = nationFlag(card.nation);
  const hasFitness = typeof card.fitness === 'number';
  // Defining traits — N pills where N = rarity (so rarity reads as trait depth).
  const traits = definingTraitsFor(card);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: full ? 11 : '5px 6px' }}>
      {/* Header row: position tab (+ nation) · rating. The rating is the strongest
          single signal, so it sits largest, top-right, always --line-white. */}
      <div className="flex items-start justify-between" style={{ gap: 4 }}>
        <div className="flex items-center" style={{ gap: full ? 5 : 3, minWidth: 0 }}>
          <span
            style={{
              background: posColor,
              color: 'var(--line-white)',
              fontFamily: PIXEL,
              fontSize: full ? 11 : 8,
              lineHeight: 1,
              padding: full ? '5px 6px' : '3px 4px',
              borderRadius: 3,
              flexShrink: 0,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.3)',
            }}
          >
            {card.position}
          </span>
          {flag ? (
            <span style={{ fontSize: full ? 14 : 10, flexShrink: 0, lineHeight: 1 }}>{flag}</span>
          ) : card.nation ? (
            <span style={{ fontFamily: PIXEL, fontSize: full ? 8 : 6.5, color: 'var(--dust)', flexShrink: 0, lineHeight: 1 }}>
              {nationCode(card.nation)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-end" style={{ flexShrink: 0 }}>
          <span style={{ fontFamily: PIXEL, fontSize: full ? 26 : 14, lineHeight: 0.9, color: 'var(--line-white)', textShadow: '0 2px 0 var(--ink-black)' }}>
            {Math.round(card.power)}
          </span>
          {full && (
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 1, color: 'var(--dust)', lineHeight: 1, marginTop: 2 }}>
              OVR
            </span>
          )}
        </div>
      </div>

      {/* Sprite portrait — pixel-block kit + head, drawn in CSS/SVG. Height-capped
          so a dense grid card (4 traits + name + fitness) never overflows and stacks
          the nameplate on top of the sprite (the collision the first pass shipped). */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? '8px 0' : '2px 0', overflow: 'hidden' }}>
        <PlayerSprite accent={accent} posColor={posColor} isGK={card.position === 'GK'} full={full} />
      </div>

      {/* Nameplate — surname is the second-strongest signal, so it reads large and
          bright; the archetype is the quiet sub-line. A hard accent rule under the
          name seats it as the card's identity band. */}
      <div style={{ borderTop: `2px solid ${accent}`, paddingTop: full ? 6 : 3, marginTop: full ? 4 : 2 }}>
        <span
          className="truncate"
          style={{ display: 'block', fontFamily: PIXEL, fontSize: full ? 14 : 10, color: 'var(--cream)', lineHeight: 1.05, textShadow: '0 1px 0 var(--ink-black)' }}
        >
          {lastName(card.name).toUpperCase()}
        </span>
        <span className="truncate" style={{ display: 'block', fontSize: full ? 10 : 8, color: 'var(--dust)', letterSpacing: 0.2, lineHeight: 1.1, marginTop: 1 }}>
          {card.archetype}
        </span>
      </div>

      {/* Fitness pip meter (where condition is tracked). Crisp pixel cells. */}
      {hasFitness && <FitnessMeter fitness={card.fitness as number} full={full} />}

      {/* Defining-trait rail — the action-buff signature, now READABLE: every pill
          carries its pixel-font word at BOTH sizes (the old glyph-only grid chip
          read as a blank box). Count = rarity, so a Legendary visibly carries more
          than a Common. Coloured by trait kind. */}
      {traits.length > 0 && <TraitPillStrip traits={traits} full={full} />}
    </div>
  );
}

/**
 * The on-card defining-trait rail. Each pill is glyph + WORD, coloured by trait
 * KIND. The word is the signal (pixel font renders A–Z reliably); the glyph is a
 * small accent in a Unicode-complete fallback face so a missing symbol never
 * blanks the chip. On `grid` the word is a short identifier (POACHER, OFFSIDE);
 * on `full` it is the complete label. Pills wrap, capped so 4 (a Legendary) never
 * crowd the data above.
 */
function TraitPillStrip({ traits, full }: { traits: ResolvedTrait[]; full: boolean }) {
  // On the dense grid card, pack pills two-up so a 4-trait Legendary takes TWO rows,
  // not four — that keeps vertical room for the sprite to stay present (a Legendary
  // must still feel like a portrait, not a list). `full` keeps each pill on its own
  // generous row inside the modal-sized card.
  const grid2up = !full && traits.length >= 3;
  return (
    <div className="flex flex-wrap" style={{ gap: full ? 4 : 3, marginTop: full ? 7 : 4 }}>
      {traits.map((t, i) => (
        <span
          key={`${t.name}-${i}`}
          title={t.copy.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: full ? 4 : 2,
            fontFamily: PIXEL,
            fontSize: full ? 8.5 : grid2up ? 6 : 7,
            letterSpacing: full ? 0.3 : 0.1,
            lineHeight: 1,
            color: t.style.color,
            background: t.style.bg,
            border: `1px solid ${t.style.color}`,
            borderRadius: 3,
            padding: full ? '4px 6px' : grid2up ? '3px 3px' : '3px 4px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
            flex: grid2up ? '1 1 44%' : undefined,
            minWidth: 0,
            justifyContent: 'center',
          }}
        >
          {/* On the 2-up grid the word is the whole budget — drop the glyph so the
              label never clips (POSTMAN, OFFSIDE need the room). */}
          {!grid2up && (
            <span aria-hidden style={{ fontFamily: GLYPH_FONT, fontSize: full ? 9 : 7.5, lineHeight: 1, opacity: 0.95, flexShrink: 0 }}>{t.copy.glyph}</span>
          )}
          <span className="truncate" style={{ lineHeight: 1 }}>{full ? t.copy.label.toUpperCase() : shortTraitLabel(t.name, t.copy.label)}</span>
        </span>
      ))}
    </div>
  );
}

/** Small crisp pixel fitness meter — N filled cells of 6, banded by condition. */
function FitnessMeter({ fitness, full }: { fitness: number; full: boolean }) {
  const { filled, total, color } = fitnessMeter(fitness);
  const cellW = full ? 9 : 5;
  const cellH = full ? 6 : 4;
  const gap = full ? 2 : 1.5;
  return (
    <div className="flex items-center" style={{ gap: full ? 5 : 3, marginTop: full ? 6 : 3 }}>
      <span style={{ fontFamily: PIXEL, fontSize: full ? 7 : 5.5, letterSpacing: 0.4, color: 'var(--dust)', lineHeight: 1, flexShrink: 0 }}>FIT</span>
      <div className="flex" style={{ gap }}>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            style={{
              width: cellW,
              height: cellH,
              background: i < filled ? color : 'rgba(255,255,255,0.10)',
              boxShadow: i < filled
                ? `inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.35), 0 0 0 1px var(--ink-black)`
                : 'inset 0 0 0 1px rgba(0,0,0,0.35)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Sprite-y player portrait. One light source TOP-LEFT: highlights on top/left
 * faces, base in the middle, shadow on bottom/right, a 1px rim-light on the lit
 * edge. Limited palette derived from the kit colour. Reads at grid size.
 */
function PlayerSprite({ accent, posColor, isGK, full }: { accent: string; posColor: string; isGK: boolean; full: boolean }) {
  // Kit ramp (3-value): outfield red, keeper green.
  const kitHi = isGK ? '#3fcf6e' : '#ff5a52';
  const kit = isGK ? '#1f9d4f' : '#e8362f';
  const kitSh = isGK ? '#0f6e34' : '#a52520';
  // Skin ramp.
  const skinHi = '#f4dcb8';
  const skin = '#e0b486';
  const skinSh = '#b88a5e';
  // Hair ramp.
  const hairHi = '#5a4636';
  const hair = '#3a2a1e';
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '58%' : '72%', maxWidth: full ? 92 : 50, maxHeight: '100%', aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      {/* seat plate — a soft dark disc so the sprite reads off the card fill */}
      <rect x="3" y="3" width="18" height="18" fill="rgba(0,0,0,0.22)" />

      {/* HEAD — base, then top-left highlight, then bottom-right shadow */}
      <rect x="9" y="4" width="6" height="6" fill={skin} />
      <rect x="9" y="4" width="3" height="3" fill={skinHi} />
      <rect x="13" y="8" width="2" height="2" fill={skinSh} />
      {/* HAIR — caps the head, lit on top-left */}
      <rect x="9" y="3" width="6" height="2" fill={hair} />
      <rect x="9" y="3" width="3" height="1" fill={hairHi} />
      <rect x="9" y="4" width="1" height="2" fill={hair} />
      {/* ear shadow on the right */}
      <rect x="14" y="6" width="1" height="2" fill={skinSh} />

      {/* NECK */}
      <rect x="10" y="10" width="4" height="1" fill={skinSh} />

      {/* SHIRT — base block, top-left highlight band, bottom shadow band */}
      <rect x="6" y="11" width="12" height="8" fill={kit} />
      <rect x="6" y="11" width="12" height="2" fill={kitHi} />
      <rect x="6" y="17" width="12" height="2" fill={kitSh} />
      {/* rim-light on the lit (left) edge */}
      <rect x="6" y="11" width="1" height="6" fill={kitHi} />
      {/* shaded right edge */}
      <rect x="17" y="11" width="1" height="8" fill={kitSh} />

      {/* SLEEVES — left lit, right shadowed */}
      <rect x="4" y="12" width="2" height="5" fill={kit} />
      <rect x="4" y="12" width="1" height="5" fill={kitHi} />
      <rect x="18" y="12" width="2" height="5" fill={kitSh} />

      {/* COLLAR — white V, top-lit */}
      <rect x="10" y="11" width="4" height="1" fill="var(--line-white)" />
      <rect x="11" y="12" width="2" height="2" fill={kitSh} />

      {/* CREST in accent — a small lit chip on the left chest */}
      <rect x="8" y="13" width="3" height="3" fill={accent} />
      <rect x="8" y="13" width="3" height="1" fill="rgba(255,255,255,0.55)" />
      <rect x="10" y="15" width="1" height="1" fill="rgba(0,0,0,0.4)" />

      {/* SHORTS hint — white band, lit top */}
      <rect x="8" y="19" width="8" height="2" fill="var(--line-white)" />
      <rect x="8" y="19" width="8" height="1" fill="#ffffff" />
      {/* position pip on the shorts */}
      <rect x="14" y="19" width="2" height="2" fill={posColor} />
    </svg>
  );
}

// ===========================================================================
// MANAGER body
// ===========================================================================

function ManagerBody({ manager, full, accent }: { manager: JokerCard; full: boolean; accent: string }) {
  const flag = nationFlag(manager.nation);
  const visibleTraits = full ? manager.traits : manager.traits.slice(0, 2);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: full ? 10 : '5px 6px' }}>
      {/* Header: GAFFER tab · nation */}
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
          GAFFER
        </span>
        {flag ? (
          <span style={{ fontSize: full ? 15 : 11, lineHeight: 1 }}>{flag}</span>
        ) : manager.nation ? (
          <span style={{ fontFamily: PIXEL, fontSize: full ? 8 : 6.5, color: 'var(--dust)', lineHeight: 1 }}>
            {nationCode(manager.nation)}
          </span>
        ) : null}
      </div>

      {/* Gaffer crest sprite */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? '8px 0' : '4px 0' }}>
        <ManagerSprite accent={accent} full={full} />
      </div>

      {/* Nameplate — gaffer name seated on a hard accent rule (matches the player
          card's identity band), then the philosophy as the quiet flavour line. */}
      <div style={{ borderTop: `2px solid ${accent}`, paddingTop: full ? 6 : 3, marginTop: full ? 4 : 2 }}>
        <span className="truncate" style={{ display: 'block', fontFamily: PIXEL, fontSize: full ? 13 : 9.5, color: 'var(--cream)', lineHeight: 1.1, textShadow: '0 1px 0 var(--ink-black)' }}>
          {manager.name.toUpperCase()}
        </span>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: full ? 12 : 8.5,
            lineHeight: 1.3,
            color: 'var(--cream-soft)',
            margin: '3px 0 0',
            display: '-webkit-box',
            WebkitLineClamp: full ? 3 : 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {'“'}{manager.philosophy}{'”'}
        </p>
      </div>
      {/* Trait tags — a gaffer's identity (Direct Play, Low Block, …). These read
          clearly at BOTH sizes now: even the dense grid card shows up to two full
          tags so a manager is never a faceless crest. */}
      <div className="flex flex-wrap" style={{ gap: full ? 5 : 3, marginTop: full ? 8 : 4 }}>
        {visibleTraits.map((t) => (
          <span
            key={t}
            style={{
              fontFamily: PIXEL,
              fontSize: full ? 8.5 : 6.5,
              letterSpacing: 0.3,
              color: accent,
              background: 'rgba(232,54,47,0.16)',
              border: `1px solid ${accent}`,
              borderRadius: 4,
              padding: full ? '4px 6px' : '3px 4px',
              lineHeight: 1,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
          >
            {t.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Gaffer crest: pixel suit + tie. Lit top-left — collar highlight, lapel shadow
 * on the right, rim-light on the left shoulder. Tie in the family accent.
 */
function ManagerSprite({ accent, full }: { accent: string; full: boolean }) {
  // Suit ramp (navy).
  const suitHi = '#2c3d4c';
  const suit = '#1b2730';
  const suitSh = '#0d141a';
  // Skin ramp.
  const skinHi = '#f4dcb8';
  const skin = '#e0b486';
  const skinSh = '#b88a5e';
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '60%' : '74%', maxWidth: full ? 96 : 52, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      <rect x="3" y="3" width="18" height="18" fill="rgba(0,0,0,0.22)" />

      {/* HEAD */}
      <rect x="9" y="4" width="6" height="6" fill={skin} />
      <rect x="9" y="4" width="3" height="3" fill={skinHi} />
      <rect x="13" y="8" width="2" height="2" fill={skinSh} />
      {/* HAIR */}
      <rect x="9" y="3" width="6" height="2" fill="#2a2018" />
      <rect x="9" y="3" width="3" height="1" fill="#43342a" />

      {/* SUIT JACKET — base, top-left highlight, bottom shadow */}
      <rect x="6" y="11" width="12" height="9" fill={suit} />
      <rect x="6" y="11" width="12" height="2" fill={suitHi} />
      <rect x="6" y="18" width="12" height="2" fill={suitSh} />
      {/* rim-light left shoulder, shaded right shoulder */}
      <rect x="6" y="11" width="1" height="8" fill={suitHi} />
      <rect x="17" y="11" width="1" height="9" fill={suitSh} />

      {/* SHIRT V (white), lit top */}
      <polygon points="10,11 14,11 12,17" fill="var(--line-white)" />
      <polygon points="10,11 14,11 12,13" fill="#ffffff" />

      {/* LAPELS — darker, the right one fully shadowed */}
      <polygon points="9,11 11,11 9,16" fill={suitSh} />
      <polygon points="15,11 13,11 15,16" fill="#070d11" />

      {/* TIE in accent — lit knot, shaded tail */}
      <rect x="11" y="12" width="2" height="6" fill={accent} />
      <rect x="11" y="12" width="2" height="1" fill="rgba(255,255,255,0.5)" />
      <rect x="11" y="16" width="2" height="2" fill="rgba(0,0,0,0.3)" />
    </svg>
  );
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

      {/* Tactic crest sprite */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? '8px 0' : '4px 0' }}>
        <TacticSprite accent={accent} full={full} />
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
 * Tactic crest: a pixel tactic board with a chalk chevron. Light top-left — the
 * board has a lit top rail and a shaded base; the chevron is the accent with a
 * white highlight edge and a dark seated shadow under it.
 */
function TacticSprite({ accent, full }: { accent: string; full: boolean }) {
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '58%' : '70%', maxWidth: full ? 92 : 48, aspectRatio: '1', display: 'block' }}
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
      <rect x="4" y="11" width="16" height="1" fill="rgba(242,246,239,0.28)" />

      {/* CHEVRON — accent body, white lit edge on top, dark seated shadow below */}
      <polygon points="6,15 12,8 18,15 15,15 12,11 9,15" fill={accent} />
      <polygon points="6,15 12,8 18,15 16,15 12,9 8,15" fill="rgba(255,255,255,0.35)" />
      <polygon points="9,16 12,12 15,16 14,16 12,13 10,16" fill="rgba(0,0,0,0.35)" />

      {/* node markers — lit dots top corners */}
      <rect x="6" y="6" width="2" height="2" fill="var(--line-white)" opacity="0.7" />
      <rect x="16" y="6" width="2" height="2" fill="var(--line-white)" opacity="0.45" />
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
