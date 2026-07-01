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
  roleToBody,
  roleEmblem,
  managerAccent,
  managerTraitStyle,
  TACTIC_ICON,
  type BodyKind,
  type EmblemRect,
  type ManagerProp,
  type ChalkRect,
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
// PLAYER body
// ===========================================================================

function PlayerBody({ card, full, accent }: { card: Card; full: boolean; accent: string }) {
  const posColor = POSITION_COLOR[card.position] ?? 'var(--dust)';
  const flag = nationFlag(card.nation);
  const hasFitness = typeof card.fitness === 'number';
  // The role drives the sprite silhouette + emblem; the sub-line prints the ROLE
  // (a real, evocative identity) rather than the scoring-internal archetype.
  const bodyKind = roleToBody(card.tacticalRole, card.position);
  const emblem = roleEmblem(card.tacticalRole, card.position);
  const subLine = card.tacticalRole ?? card.archetype;
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

      {/* Sprite portrait — a per-role pixel BODY tinted by position + a role emblem.
          It has a FLOOR height at grid size so the silhouette always reads (fixing
          the vanishing sprite): flex-grows to fill spare room but never collapses
          below `minHeight`. The trait rail below is trimmed on grid to keep the room. */}
      <div style={{ flex: 1, minHeight: full ? 58 : 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? '6px 0' : '2px 0', overflow: 'hidden' }}>
        <PlayerSprite
          accent={accent}
          posColor={posColor}
          bodyKind={bodyKind}
          emblem={emblem}
          isGK={card.position === 'GK'}
          full={full}
        />
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
          {subLine}
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
  // Cap the on-card rail at TWO pills (+ a "+N" chip for the rest) at BOTH sizes so
  // it never crowds out the sprite — which keeps a FLOOR height — or clips against
  // the frame. The full modal card is a small ~235px portrait; its DEFINING TRAITS
  // panel below lists every trait in full, so the card stays a portrait, not a
  // four-row list, and nothing is lost.
  const cap = 2;
  const overflow = Math.max(0, traits.length - cap);
  const shown = traits.slice(0, cap);
  const grid2up = !full && shown.length >= 2;
  return (
    <div className="flex flex-wrap items-center" style={{ gap: full ? 4 : 3, marginTop: full ? 7 : 4 }}>
      {shown.map((t, i) => (
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
      {overflow > 0 && (
        <span
          style={{
            fontFamily: PIXEL,
            fontSize: full ? 8 : 6,
            lineHeight: 1,
            color: 'var(--dust)',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: full ? '4px 5px' : '3px 3px',
            flexShrink: 0,
          }}
        >
          {`+${overflow}`}
        </span>
      )}
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
 * Per-role player portrait. sprite = BODY[bodyKind] tinted by POSITION_COLOR +
 * EMBLEM[role]. One light source TOP-LEFT on every body (highlights on top/left,
 * base in the middle, shadow on bottom/right, a 1px rim-light on the lit edge),
 * ~5-colour palette derived from the position tint. Seven bodies cover all 23
 * roles; the emblem is a tiny role motif stamped on the chest. Reads at grid size.
 */
function PlayerSprite({
  accent,
  posColor,
  bodyKind,
  emblem,
  isGK,
  full,
}: {
  accent: string;
  posColor: string;
  bodyKind: BodyKind;
  emblem: EmblemRect[];
  isGK: boolean;
  full: boolean;
}) {
  // Kit ramp (3-value) derived from the pitch-position tint so a defender's kit
  // reads blue, a forward's red, etc. — the body silhouette carries the role, the
  // colour carries the position. Keeper always wears the keeper green.
  const kitBase = isGK ? '#1f9d4f' : posHex(posColor);
  const kit = kitBase;
  const kitHi = lighten(kitBase, 0.32);
  const kitSh = darken(kitBase, 0.34);
  // Skin ramp.
  const skinHi = '#f4dcb8';
  const skin = '#e0b486';
  const skinSh = '#b88a5e';
  // Hair ramp.
  const hairHi = '#5a4636';
  const hair = '#3a2a1e';

  const emblemFill = (f: EmblemRect['fill']): string =>
    f === 'accent' ? accent : f === 'white' ? 'var(--line-white)' : f === 'ink' ? 'var(--ink-black)' : 'rgba(0,0,0,0.4)';

  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '58%' : '80%', maxWidth: full ? 92 : 54, height: '100%', maxHeight: full ? 96 : 56, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      {/* seat plate — a soft dark disc so the sprite reads off the card fill */}
      <rect x="3" y="3" width="18" height="18" fill="rgba(0,0,0,0.22)" />

      {/* HEAD — shared across bodies. Base, top-left highlight, bottom-right shadow. */}
      <rect x="9" y="4" width="6" height="6" fill={skin} />
      <rect x="9" y="4" width="3" height="3" fill={skinHi} />
      <rect x="13" y="8" width="2" height="2" fill={skinSh} />
      {/* HAIR — caps the head, lit on top-left */}
      <rect x="9" y="3" width="6" height="2" fill={hair} />
      <rect x="9" y="3" width="3" height="1" fill={hairHi} />
      <rect x="9" y="4" width="1" height="2" fill={hair} />
      <rect x="14" y="6" width="1" height="2" fill={skinSh} />
      {/* NECK */}
      <rect x="10" y="10" width="4" height="1" fill={skinSh} />

      {/* BODY — the role silhouette. Each is a self-contained top-left-lit block. */}
      <SpriteBody kind={bodyKind} kit={kit} kitHi={kitHi} kitSh={kitSh} accent={accent} isGK={isGK} />

      {/* EMBLEM — the role motif, stamped on the chest (drawn over the shirt). */}
      {emblem.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={emblemFill(r.fill)} />
      ))}

      {/* position pip on the shorts — the pitch-position tint as a hard chip */}
      <rect x="14" y="19" width="2" height="2" fill={posColor} />
    </svg>
  );
}

/**
 * The seven role BODIES. Each draws a torso/stance around the shared head+neck
 * (head at y3–10). All lit top-left: a highlight band on the top/left face, a
 * shadow band on the bottom/right, a 1px rim-light down the lit edge. Colours are
 * the kit ramp so the whole set stays a family; the silhouette is the identity.
 */
function SpriteBody({
  kind,
  kit,
  kitHi,
  kitSh,
  accent,
  isGK,
}: {
  kind: BodyKind;
  kit: string;
  kitHi: string;
  kitSh: string;
  accent: string;
  isGK: boolean;
}) {
  const collar = (
    <>
      <rect x="10" y="11" width="4" height="1" fill="var(--line-white)" />
      <rect x="11" y="12" width="2" height="1" fill={kitSh} />
    </>
  );
  const shorts = (
    <>
      <rect x="8" y="19" width="8" height="2" fill="var(--line-white)" />
      <rect x="8" y="19" width="8" height="1" fill="#ffffff" />
    </>
  );

  switch (kind) {
    case 'keeper':
      // Broad frame, gloves out, big padded shoulders. Must survive grid size.
      return (
        <>
          {/* wide jersey */}
          <rect x="5" y="11" width="14" height="8" fill={kit} />
          <rect x="5" y="11" width="14" height="2" fill={kitHi} />
          <rect x="5" y="17" width="14" height="2" fill={kitSh} />
          <rect x="5" y="11" width="1" height="8" fill={kitHi} />
          <rect x="18" y="11" width="1" height="8" fill={kitSh} />
          {/* big padded sleeves reaching wide (ready to save) */}
          <rect x="3" y="11" width="2" height="6" fill={kit} />
          <rect x="3" y="11" width="1" height="6" fill={kitHi} />
          <rect x="19" y="11" width="2" height="6" fill={kitSh} />
          {collar}
          {shorts}
        </>
      );
    case 'centreback':
      // Tall, square-shouldered, arms folded across the chest (solid).
      return (
        <>
          <rect x="6" y="11" width="12" height="8" fill={kit} />
          <rect x="6" y="11" width="12" height="2" fill={kitHi} />
          <rect x="6" y="17" width="12" height="2" fill={kitSh} />
          <rect x="6" y="11" width="1" height="8" fill={kitHi} />
          <rect x="17" y="11" width="1" height="8" fill={kitSh} />
          {/* folded forearms — a darker band across the middle */}
          <rect x="7" y="15" width="10" height="2" fill={kitSh} />
          <rect x="7" y="15" width="10" height="1" fill={kit} />
          {/* squared shoulders (sleeves flush) */}
          <rect x="4" y="12" width="2" height="4" fill={kit} />
          <rect x="4" y="12" width="1" height="4" fill={kitHi} />
          <rect x="18" y="12" width="2" height="4" fill={kitSh} />
          {collar}
          {shorts}
        </>
      );
    case 'fullback':
      // Leaner, one arm swung out (overlapping run), narrower torso.
      return (
        <>
          <rect x="7" y="11" width="10" height="8" fill={kit} />
          <rect x="7" y="11" width="10" height="2" fill={kitHi} />
          <rect x="7" y="17" width="10" height="2" fill={kitSh} />
          <rect x="7" y="11" width="1" height="8" fill={kitHi} />
          <rect x="16" y="11" width="1" height="8" fill={kitSh} />
          {/* trailing arm swung back-left (lit), leading arm forward-right */}
          <rect x="4" y="13" width="3" height="2" fill={kit} />
          <rect x="4" y="13" width="1" height="2" fill={kitHi} />
          <rect x="17" y="12" width="2" height="3" fill={kitSh} />
          {collar}
          {shorts}
        </>
      );
    case 'holding':
      // Balanced, planted, arms slightly out for the base — the anchor stance.
      return (
        <>
          <rect x="6" y="11" width="12" height="8" fill={kit} />
          <rect x="6" y="11" width="12" height="2" fill={kitHi} />
          <rect x="6" y="17" width="12" height="2" fill={kitSh} />
          <rect x="6" y="11" width="1" height="8" fill={kitHi} />
          <rect x="17" y="11" width="1" height="8" fill={kitSh} />
          {/* both arms out, low — a wide, grounded base */}
          <rect x="4" y="13" width="2" height="4" fill={kit} />
          <rect x="4" y="13" width="1" height="4" fill={kitHi} />
          <rect x="18" y="13" width="2" height="4" fill={kitSh} />
          {collar}
          {shorts}
        </>
      );
    case 'playmaker':
      // Poised, chest open, a ball at the feet (the creator's canvas).
      return (
        <>
          <rect x="6" y="11" width="12" height="8" fill={kit} />
          <rect x="6" y="11" width="12" height="2" fill={kitHi} />
          <rect x="6" y="17" width="12" height="2" fill={kitSh} />
          <rect x="6" y="11" width="1" height="8" fill={kitHi} />
          <rect x="17" y="11" width="1" height="8" fill={kitSh} />
          {/* relaxed arms tucked to the sides */}
          <rect x="5" y="12" width="1" height="5" fill={kit} />
          <rect x="18" y="12" width="1" height="5" fill={kitSh} />
          {collar}
          {shorts}
          {/* ball at the feet — a small lit sphere */}
          <rect x="15" y="20" width="3" height="3" fill="var(--line-white)" />
          <rect x="15" y="20" width="3" height="1" fill="#ffffff" />
          <rect x="17" y="22" width="1" height="1" fill="rgba(0,0,0,0.4)" />
        </>
      );
    case 'winger':
      // Dynamic, leaning forward — torso pitched right (running at pace).
      return (
        <>
          <rect x="6" y="11" width="12" height="8" fill={kit} />
          <rect x="6" y="11" width="12" height="2" fill={kitHi} />
          <rect x="6" y="17" width="12" height="2" fill={kitSh} />
          <rect x="6" y="11" width="1" height="8" fill={kitHi} />
          <rect x="17" y="11" width="1" height="8" fill={kitSh} />
          {/* pumping arms: leading arm forward-high, trailing arm back-low */}
          <rect x="17" y="10" width="3" height="2" fill={kitSh} />
          <rect x="4" y="15" width="3" height="2" fill={kit} />
          <rect x="4" y="15" width="1" height="2" fill={kitHi} />
          {collar}
          {/* offset shorts (mid-stride) */}
          <rect x="9" y="19" width="8" height="2" fill="var(--line-white)" />
          <rect x="9" y="19" width="8" height="1" fill="#ffffff" />
        </>
      );
    case 'striker':
    default:
      // Front-on, arms wide/coiled — the finisher, shoulders broad and lifted.
      return (
        <>
          <rect x="6" y="11" width="12" height="8" fill={kit} />
          <rect x="6" y="11" width="12" height="2" fill={kitHi} />
          <rect x="6" y="17" width="12" height="2" fill={kitSh} />
          <rect x="6" y="11" width="1" height="8" fill={kitHi} />
          <rect x="17" y="11" width="1" height="8" fill={kitSh} />
          {/* arms flared out and up — coiled to strike */}
          <rect x="3" y="12" width="3" height="2" fill={kit} />
          <rect x="3" y="12" width="1" height="2" fill={kitHi} />
          <rect x="18" y="12" width="3" height="2" fill={kitSh} />
          {collar}
          {shorts}
        </>
      );
  }
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
