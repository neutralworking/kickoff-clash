'use client';

/**
 * Kickoff Clash — GameCard (v3, "Turn 7" locked card language)
 *
 * The reusable playing card. One shared frame → inner pair, four variants:
 *   • PLAYER     — stadium-horizon pitch, seeded face-first bust, theme medallion,
 *                  ATK/DEF stats, name + role + position pills, rarity/theme meta.
 *   • MANAGER    — aged leather, suited bust, 👔 medallion, name + role, JOKER chip,
 *                  effect + flavour block.
 *   • TACTIC     — dark tactical board, big category medallion, class medallion,
 *                  charge pips, name + descriptor + category chip, effect + flavour.
 *   • INVESTMENT — Boardroom crest (unchanged glass-chrome family).
 *
 * Two sizes: `grid` (dense token) and `full` (the CardModal blow-up). Both share
 * the same frame so a tapped grid card grows into its full self.
 *
 * The reconciliation (LOCKED): GLASSY FOIL FRAME, PIXEL INTERIOR. The 5px foil
 * band IS the rarity border (gradient + glow live on the frame). The interior —
 * the seeded portrait, the flat blocks, the Silkscreen — stays crisp pixel art
 * (`pixelated`, `crispEdges`, no blur, no soft shadow on a pixel).
 *
 * The card FACE follows the Turn-7 handoff (no on-card contest icons / action
 * panel — those live in CardModal). Game data the static art spec omits is folded
 * in tastefully: tactic charge pips, player fitness bar + wear overlay/condition.
 *
 * Tokens come from cardTokens.ts + portrait.ts. See DESIGN.md › Cards.
 */

import { useState } from 'react';
import type { Card } from '../../lib/scoring';
import { deriveStats } from '../../lib/funnel';
import type { JokerCard } from '../../lib/jokers';
import { type TacticCard, tacticCapacity } from '../../lib/tactics';
import type { InvestmentCard } from '../../lib/economy';
import {
  PIXEL,
  POSITION_COLOR,
  TACTIC_RARITY_TO_FRAME,
  MANAGER_RARITY_TO_FRAME,
  INVESTMENT_META,
  formatCash,
  lastName,
  eligiblePositions,
  tacticMedallion,
  playerActions,
  ACTION_BONUS_GOLD,
  handoffTier,
  handoffMgrTier,
  handoffClassColor,
  classIconInk,
  posInk,
  managerClass,
  type ClassMedallion,
} from './cardTokens';
import ClassGlyph from './ClassGlyph';
import { ChargePips } from './ContestIcons';
import { classOfCard } from '../../lib/contest-map';
import {
  portraitArtStyle,
  portraitSrc,
  managerPortraitSrc,
  rarityFrame,
  MANAGER_LEATHER_BG,
  TACTIC_BOARD_BG,
  NAME_BAND_BG,
  EFFECT_BLOCK_BG,
  INNER_INK,
} from './portrait';

// Class-medallion + theme glyphs (⚔ ⚡ ♫ ❤ 👔 🛡️ …) fall outside the Silkscreen
// glyph set, so render them in a Unicode-complete fallback stack — the readable
// pixel-font label is the signal; the glyph is the accent.
const GLYPH_FONT = "'DejaVu Sans', 'Noto Sans Symbols', 'Segoe UI Symbol', sans-serif";

// Body font (role line, effect text) and flavour font (quotes), per the handoff.
const BODY_FONT = "var(--font-body, 'DM Sans', sans-serif)";
const FLAVOUR_FONT = "var(--font-flavour, 'Playfair Display', serif)";
// The portrait-card handoff puts ARCHIVO BLACK on names / numbers / labels. In
// this repo Archivo Black is loaded as --font-heavy (layout.tsx); the app's
// Silkscreen canon is untouched — only the card faces adopt the heavy display.
const HEAVY = "var(--font-heavy, 'Archivo Black', sans-serif)";

// Handoff surface tokens.
const CREAM = '#f2ead6';
const CREAM_SOFT = '#c9bb95';
const DUST = '#9a8b6a';
const STAT_CREAM = '#fbf7ec';

/**
 * Length-aware font sizing so a name/role NEVER truncates: we scale the type down
 * by character count and let the text wrap (see NameBand). A short surname keeps
 * the full hero size; a long single word ("Featherstonehaughbottomley") or a long
 * role ("Deep-Lying Playmaker") steps down and/or wraps so it always shows in full
 * — no ellipsis, at any card size. Pure length heuristic (no layout measurement),
 * so it's deterministic and cheap; the wrap is the safety net beneath it.
 */
function fitFontSize(text: string, base: number): number {
  const len = text.trim().length;
  if (len <= 10) return base;
  if (len <= 14) return base * 0.86;
  if (len <= 19) return base * 0.72;
  if (len <= 26) return base * 0.6;
  return base * 0.5;
}

/**
 * Gentler, grid-only sizing for the short meta lines on the small token (the
 * role under the name, the action titles). These strings are bounded (~20 chars
 * max — "Commander of the Box", "Half-Space Creator"), so the aggressive
 * fitFontSize curve (built for arbitrary names) over-shrinks them below phone
 * legibility. Whole/half-pixel steps keep the type crisp; anything that still
 * doesn't fit one line WRAPS instead of truncating.
 */
function gridMetaFont(text: string, base: number): number {
  const len = text.trim().length;
  if (len <= 10) return base;
  if (len <= 16) return base - 1;
  return base - 1.5;
}

export type CardSize = 'grid' | 'full';

export type GameCardModel =
  | { variant: 'player'; card: Card }
  | { variant: 'manager'; manager: JokerCard }
  // `charges` = current called-play charges left (capacity = tacticCapacity). When
  // omitted, the card renders full (a fresh/full play — all pips lit).
  | { variant: 'tactic'; tactic: TacticCard; charges?: number }
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

  if (model.variant === 'investment') {
    // Investment keeps the original glass-chrome family (not part of the Turn-7
    // three-class respec — Boardroom cards stay their own material).
    const accent = INVESTMENT_META[model.investment.ladder]?.accent ?? 'var(--gold)';
    const inkDrop = `0 ${full ? 6 : 3}px 0 0 var(--ink-black)`;
    const ambient = `0 ${full ? 12 : 5}px ${full ? 26 : 10}px rgba(2,9,5,0.5)`;
    const ring = selected ? `0 0 0 2px ${accent}` : null;
    const boxShadow = [ring, inkDrop, ambient].filter(Boolean).join(', ');

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

    content = (
      <>
        <div style={{ position: 'relative', height: full ? 5 : 3, background: accent, flexShrink: 0, zIndex: 2 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)' }} />
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', zIndex: 2 }}>
          <InvestmentBody investment={model.investment} full={full} accent={accent} />
        </div>
        <div style={{ position: 'relative', height: full ? 5 : 3, background: accent, flexShrink: 0, zIndex: 2 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.4), transparent)' }} />
        </div>
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

  // --- PLAYER / MANAGER / TACTIC: metallic rarity frame → inner card. ---
  // The frame MATERIAL is the rarity tell (handoff): players + managers wear the
  // portrait-card metallic tiers (bronze/silver/gold; Legendary = a black+gold
  // seam that shimmers); tactics keep the legacy foil frame.
  const ring = selected ? '0 0 0 2px var(--gold), ' : '';
  let frameBg: string;
  let frameShadow: string;
  let framePad: number;
  let frameRadius: number;
  let holoFrame = false; // Legendary player → animated seam
  let tacticFoil = false;

  if (model.variant === 'player') {
    const tier = handoffTier(model.card.rarity);
    frameBg = tier.frame;
    frameShadow = `0 8px 22px rgba(0,0,0,0.55), 0 0 ${tier.holo ? 24 : 14}px ${tier.glow}${tier.holo ? `, 0 0 46px ${tier.glow}` : ''}`;
    framePad = full ? 2.5 : 2;
    frameRadius = full ? 15 : 11;
    holoFrame = tier.holo;
  } else if (model.variant === 'manager') {
    const tier = handoffMgrTier(MANAGER_RARITY_TO_FRAME[model.manager.rarity] ?? 'Rare');
    frameBg = tier.frame;
    frameShadow = `0 8px 22px rgba(0,0,0,0.6), 0 0 ${full ? 22 : 14}px ${tier.glow}`;
    framePad = full ? 4 : 3;
    frameRadius = full ? 18 : 13;
  } else {
    const fr = rarityFrame(TACTIC_RARITY_TO_FRAME[model.tactic.rarity]);
    frameBg = fr.frame;
    frameShadow = fr.glow;
    framePad = full ? 5 : 3;
    frameRadius = full ? 15 : 9;
    tacticFoil = fr.foil;
  }

  // Player + manager cards are CONTENT-driven height (the portrait window sets a
  // 3:4-ish shape; the full player grows to fit every ability row). Tactics stay
  // aspect-locked. Vertical margin (only) gives the glow room without touching
  // width:100% — so no horizontal page-scroll is ever introduced.
  const contentHeight = model.variant === 'player' || model.variant === 'manager';
  frameStyle = {
    position: 'relative',
    width: '100%',
    aspectRatio: contentHeight ? undefined : `${ASPECT}`,
    minHeight: full && model.variant === 'player' ? 288 : undefined,
    borderRadius: frameRadius,
    padding: framePad,
    background: frameBg,
    backgroundSize: holoFrame ? '260% 100%' : contentHeight ? '150% 150%' : undefined,
    // Inline animation would override the .chip-reveal class (and its opacity:0),
    // so only run the holo seam when NOT staggering a reveal (delay == null).
    animation: holoFrame && delay == null ? 'holoShift 7s linear infinite' : undefined,
    boxShadow: ring + frameShadow,
    boxSizing: 'border-box',
    opacity: dimmed ? 0.42 : 1,
    display: 'flex',
    textAlign: 'left',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform 0.12s ease',
    minWidth: 0,
    margin: contentHeight ? `${full ? 8 : 5}px 0` : undefined,
    animationDelay: delay != null ? `${delay}ms` : undefined,
  };

  content =
    model.variant === 'player' ? (
      <PlayerFace card={model.card} full={full} />
    ) : model.variant === 'manager' ? (
      <ManagerFace manager={model.manager} full={full} />
    ) : (
      <TacticFace tactic={model.tactic} charges={model.charges} full={full} foil={tacticFoil} />
    );

  const holoClass = holoFrame ? 'card-holo' : '';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`active:scale-95 ${holoClass} ${delay != null ? 'chip-reveal' : ''} ${className ?? ''}`}
        style={frameStyle}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={`${holoClass} ${delay != null ? 'chip-reveal' : ''} ${className ?? ''}`} style={frameStyle}>
      {content}
    </div>
  );
}

// ===========================================================================
// Shared v3 card scaffolding
// ===========================================================================

/** The inner surface — rounded, ink-bordered flex column that holds the three
 *  stacked regions. The foil frame is the parent's padding. */
function Inner({ background, full, foil, children }: { background: string; full: boolean; foil: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        borderRadius: full ? 11 : 7,
        border: `2px solid ${INNER_INK}`,
        background,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
      {foil && <FoilSweep />}
    </div>
  );
}

/** Legendary holo foil sweep — a travelling gloss band over the whole inner face.
 *  Screen-blended, reduced-motion aware (via .card-foil). Never touches a pixel. */
function FoilSweep() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', zIndex: 5 }}>
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
  );
}

/** The class medallion + its class label chip. Anchored BOTTOM-left so it sits
 *  over the shoulder/lower chest rather than the face (the bust's face reads
 *  clean). Same slot on every class; glyph/colour swap by class (the single
 *  at-a-glance class tell). */
function Medallion({
  med,
  classLabel,
  chipFg,
  chipBg,
  full,
}: {
  med: ClassMedallion;
  classLabel: string;
  chipFg: string;
  chipBg: string;
  full: boolean;
}) {
  const size = full ? 38 : 22;
  return (
    <div
      style={{
        position: 'absolute',
        // Bottom-left: over the shoulder, clear of the face. Sits above the
        // fitness bar (player, bottom:0) so it never collides with it.
        bottom: full ? 12 : 7,
        left: full ? 8 : 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: full ? 3 : 2,
        zIndex: 3,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'rgba(11,7,3,0.8)',
          border: `2px solid ${med.color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 7px rgba(0,0,0,0.6)',
        }}
      >
        <span style={{ fontFamily: GLYPH_FONT, fontSize: full ? 18 : 11, lineHeight: 1, color: med.color }}>{med.glyph}</span>
      </div>
      {/* Class label chip — omitted when empty (the player face drops it; the
          pitch background + bust already tell you it's a player). */}
      {classLabel && (
        <span
          style={{
            fontFamily: PIXEL,
            fontSize: full ? 6 : 5,
            letterSpacing: full ? 1 : 0.5,
            lineHeight: 1,
            color: chipFg,
            background: chipBg,
            padding: full ? '2px 4px' : '1px 3px',
            borderRadius: 3,
          }}
        >
          {classLabel}
        </span>
      )}
    </div>
  );
}

/** The name band — name (Silkscreen) over role (DM Sans) on the left, a right slot
 *  for position pills (player) / class chip (manager, tactic). */
function NameBand({
  name,
  role,
  right,
  full,
  nameSize,
}: {
  name: string;
  role: string;
  right: React.ReactNode;
  full: boolean;
  nameSize?: number;
}) {
  return (
    <div
      style={{
        background: NAME_BAND_BG,
        borderTop: `2px solid ${INNER_INK}`,
        padding: full ? '8px 10px' : '5px 6px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: full ? 8 : 5,
        flexShrink: 0,
        zIndex: 2,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* NAME — auto-sized by length + wraps (break-anywhere for a giant single
            word). NEVER truncates: the band grows and the art (flex:1) yields. */}
        <span
          style={{
            display: 'block',
            fontFamily: PIXEL,
            fontSize: fitFontSize(name, nameSize ?? (full ? 15 : 8.5)),
            color: CREAM,
            textShadow: `0 ${full ? 2 : 1}px 0 ${INNER_INK}`,
            lineHeight: 1.12,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {name}
        </span>
        {/* ROLE — auto-sized + wraps at word boundaries (breaks only if forced). */}
        <span
          style={{
            display: 'block',
            fontFamily: BODY_FONT,
            fontSize: fitFontSize(role, full ? 11 : 7),
            color: CREAM_SOFT,
            marginTop: full ? 4 : 2,
            lineHeight: 1.2,
            overflowWrap: 'break-word',
          }}
        >
          {role}
        </span>
      </div>
      {right && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: full ? 5 : 3 }}>{right}</div>}
    </div>
  );
}

/** A class chip (manager JOKER / tactic category) for the name band's right slot. */
function ClassChip({ glyph, label, color, bg, border, full }: { glyph: string; label: string; color: string; bg: string; border: string; full: boolean }) {
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: full ? 8 : 6,
        lineHeight: 1,
        color,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 4,
        padding: full ? '4px 6px' : '3px 4px',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: full ? 4 : 2,
      }}
    >
      <span aria-hidden style={{ fontFamily: GLYPH_FONT, fontSize: full ? 9 : 7, lineHeight: 1 }}>{glyph}</span>
      {full && label}
    </span>
  );
}

/** The effect + flavour block (manager, tactic) — replaces the player meta strip. */
function EffectBlock({ effect, flavour, full }: { effect: string; flavour: string; full: boolean }) {
  // Some flavour strings already carry their own quotation marks; don't double up.
  const fq = flavour.trim();
  const quoted = /^["'“]/.test(fq) ? fq : `“${fq}”`;
  return (
    <div
      style={{
        background: EFFECT_BLOCK_BG,
        padding: full ? '6px 10px 8px' : '4px 6px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: full ? 5 : 2,
        flexShrink: 0,
        zIndex: 2,
      }}
    >
      <span
        style={{
          fontFamily: BODY_FONT,
          fontSize: full ? 10.5 : 8,
          lineHeight: 1.35,
          color: CREAM,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: full ? 4 : 2,
          overflow: 'hidden',
        }}
      >
        {effect}
      </span>
      {flavour && full && (
        <span
          style={{
            fontFamily: FLAVOUR_FONT,
            fontStyle: 'italic',
            fontSize: 11,
            lineHeight: 1.3,
            color: DUST,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}
        >
          {quoted}
        </span>
      )}
    </div>
  );
}

// ===========================================================================
// PLAYER face (portrait-card handoff) — a thin METALLIC rarity frame around a
// pixel/photo interior. Top → bottom: framed 3:4 portrait window (class disc
// top-left, stacked position pills top-right, rarity vignette + sheen sweep) ·
// Archivo-Black name + archetype · class-coloured ability rows (full only) ·
// match-fit bar with overlapping ATK (red) / DEF (blue) corner discs.
// ===========================================================================

function PlayerFace({ card, full }: { card: Card; full: boolean }) {
  const stats = deriveStats(card);
  const name = lastName(card.name).toUpperCase();
  const role = card.tacticalRole ?? card.archetype;
  const cls = classOfCard(card);
  const tier = handoffTier(card.rarity);
  const cc = handoffClassColor(cls);
  const iconInk = classIconInk(cls);
  const fitPct = Math.max(0, Math.min(100, Math.round(card.fitness ?? 100)));
  const actions = playerActions(card);
  const src = portraitSrc(card);
  const [imgOk, setImgOk] = useState(true);

  // full shows every eligible slot (capped at 2); grid shows the primary only.
  const positions = full ? eligiblePositions(card.position).slice(0, 2) : [card.position];

  const cfg = full
    ? { disc: 44, glyph: 24, badgeFs: 9, badgePad: '3px 7px', discR: 50, nameBase: 19, arche: 11, winPad: '8px 8px 0', winRadius: 8 }
    : { disc: 26, glyph: 15, badgeFs: 6.5, badgePad: '2px 4px', discR: 30, nameBase: 11, arche: 8, winPad: '5px 5px 0', winRadius: 6 };

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: full ? 12 : 9,
        background: 'linear-gradient(180deg,#12100e,#0b0908)',
        paddingBottom: cfg.discR * 0.46,
      }}
    >
      {/* 1 — PORTRAIT WINDOW: framed 3:4 image (or procedural bust) on the pitch. */}
      <div
        style={{
          position: 'relative',
          margin: cfg.winPad,
          flex: full ? '0 0 auto' : '1 1 auto',
          aspectRatio: full ? '1.2' : undefined,
          minHeight: full ? 0 : 42,
          borderRadius: cfg.winRadius,
          overflow: 'hidden',
          border: `1px solid ${tier.edge}66`,
          background: 'radial-gradient(ellipse at 50% 34%, #2f7a45, #1c5230 58%, #103322)',
        }}
      >
        {src && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element -- raw <img> is deliberate: it needs onError → procedural fallback + a basePath src under static export.
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setImgOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 6%', display: 'block' }}
          />
        ) : (
          <div className="pixelated" aria-hidden style={portraitArtStyle(card.id)} />
        )}

        {/* top rarity vignette */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '46%', background: `linear-gradient(180deg, ${tier.edge}3a, transparent)`, pointerEvents: 'none', zIndex: 2 }} />
        {/* bottom fade into the name plate */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '34%', background: 'linear-gradient(180deg, transparent, rgba(9,7,4,0.6))', pointerEvents: 'none', zIndex: 2 }} />
        {/* diagonal sheen sweep — GLASS overlay, never touches the pixel interior */}
        <div className="card-sheen" aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '42%', zIndex: 3, pointerEvents: 'none', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.26), transparent)' }} />

        {/* CLASS DISC (top-left) */}
        <div
          style={{
            position: 'absolute',
            top: full ? 7 : 4,
            left: full ? 7 : 4,
            zIndex: 5,
            width: cfg.disc,
            height: cfg.disc,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, ${cc}, ${cc}bb)`,
            border: `2px solid ${tier.edge}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 2px 7px rgba(0,0,0,0.6), 0 0 8px ${tier.glow}`,
          }}
        >
          <ClassGlyph cls={cls} size={cfg.glyph} color={iconInk} />
        </div>

        {/* POSITION PILLS (top-right, stacked) */}
        <div style={{ position: 'absolute', top: full ? 7 : 4, right: full ? 7 : 4, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: full ? 4 : 3 }}>
          {positions.map((p) => (
            <span
              key={p}
              style={{
                background: POSITION_COLOR[p] ?? '#71717a',
                color: posInk(p),
                fontFamily: BODY_FONT,
                fontWeight: 800,
                fontSize: cfg.badgeFs,
                letterSpacing: '0.03em',
                padding: cfg.badgePad,
                borderRadius: 5,
                lineHeight: 1,
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* 2 — NAME PLATE */}
      <div style={{ padding: full ? '9px 10px 6px' : '5px 6px 3px', textAlign: 'center', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: HEAVY,
            fontSize: fitFontSize(name, cfg.nameBase),
            color: CREAM,
            letterSpacing: '0.01em',
            lineHeight: 1.04,
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: full ? fitFontSize(role, cfg.arche) : gridMetaFont(role, cfg.arche),
            color: DUST,
            marginTop: full ? 3 : 1.5,
            lineHeight: 1.15,
            overflowWrap: 'break-word',
          }}
        >
          {role}
        </div>
      </div>

      {/* 3 — ABILITY ROWS (full only): base always; a starred bonus (★ gold) for
          signature / Epic / Legendary extras. Class-coloured keyword. */}
      {full && (
        <div style={{ flex: '1 0 auto', padding: '0 13px 4px' }}>
          <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${tier.edge}55,transparent)`, margin: '2px 0 9px' }} />
          {actions.map((a) => (
            <p key={a.key} style={{ margin: '0 0 7px', fontFamily: BODY_FONT, fontSize: 11, lineHeight: 1.35, color: CREAM_SOFT, textAlign: 'left' }}>
              <span style={{ fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: a.bonus ? ACTION_BONUS_GOLD : cc }}>
                {(a.bonus ? '★ ' : '') + a.label + ': '}
              </span>
              {a.text}
            </p>
          ))}
        </div>
      )}

      {/* 4 — MATCH-FIT BAR + overlapping ATK/DEF corner discs. */}
      <div style={{ position: 'relative', marginTop: full ? 8 : 6, padding: full ? '0 12px' : '0 8px', flexShrink: 0 }}>
        <div style={{ margin: `0 ${cfg.discR * 0.72}px` }}>
          <FitBar pct={fitPct} full={full} />
        </div>
        <StatDisc kind="ATK" value={stats.atk} side="atk" full={full} discR={cfg.discR} anchor="left" />
        <StatDisc kind="DEF" value={stats.def} side="def" full={full} discR={cfg.discR} anchor="right" />
      </div>
    </div>
  );
}

/** The match-fit bar — a rounded green track, fill to fit%, with a centered
 *  `MATCH FIT · NN%` (full) / `NN%` (grid) label. */
function FitBar({ pct, full }: { pct: number; full: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        height: full ? 16 : 11,
        borderRadius: 999,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(45,138,78,0.5)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'linear-gradient(90deg,#1f7a3e,#3ba55d)', boxShadow: '0 0 8px rgba(59,165,93,0.5)' }} />
      <span
        style={{
          position: 'relative',
          fontFamily: BODY_FONT,
          fontWeight: 800,
          fontSize: full ? 8 : 7,
          letterSpacing: '0.1em',
          color: '#eafff0',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          textTransform: 'uppercase',
        }}
      >
        {full ? `Match Fit · ${pct}%` : `${pct}%`}
      </span>
    </div>
  );
}

/** An overlapping ATK/DEF corner disc — a dark radial disc with a red (ATK) or
 *  blue (DEF) ring, the value in Archivo Black + a tiny tinted label. Overlaps
 *  the card's bottom edge (translateY 42%), anchored to a bottom corner. */
function StatDisc({ kind, value, side, full, discR, anchor }: { kind: string; value: number; side: 'atk' | 'def'; full: boolean; discR: number; anchor: 'left' | 'right' }) {
  const col = side === 'atk' ? '#ef4444' : '#4a9eff';
  return (
    <div
      style={{
        position: 'absolute',
        [anchor]: full ? 6 : 4,
        bottom: 0,
        transform: 'translateY(42%)',
        zIndex: 7,
        width: discR,
        height: discR,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 32%, #17120b, #0a0705)',
        border: `2.5px solid ${col}`,
        boxShadow: `0 3px 9px rgba(0,0,0,0.6), 0 0 9px ${col}55`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      <span style={{ fontFamily: HEAVY, fontSize: full ? 22 : 12, color: CREAM, textShadow: `0 0 6px ${col}77` }}>{value}</span>
      {full && <span style={{ fontFamily: BODY_FONT, fontWeight: 800, fontSize: 7, letterSpacing: '0.14em', color: col, marginTop: 1 }}>{kind}</span>}
    </div>
  );
}

// ===========================================================================
// MANAGER face (#7b)
// ===========================================================================

// ===========================================================================
// MANAGER face (portrait-card handoff) — full-bleed portrait behind the ornate
// rarity frame: class-icon disc top-left, MGR foil chip + rarity chip top-right,
// four corner brackets in the rarity edge, and a bottom identity plate
// (Archivo-Black name · dashed-rule archetype · amber ACTION pill · effect line ·
// Playfair flavour). Wired to the real JokerCard.
// ===========================================================================

function ManagerFace({ manager, full }: { manager: JokerCard; full: boolean }) {
  const tier = handoffMgrTier(MANAGER_RARITY_TO_FRAME[manager.rarity] ?? 'Rare');
  const rarityName = MANAGER_RARITY_TO_FRAME[manager.rarity] ?? 'Rare';
  const cls = managerClass(manager.id);
  const cc = handoffClassColor(cls);
  const iconInk = classIconInk(cls);
  const name = manager.name.toUpperCase();
  const action = (manager.traits[0] ?? manager.archetype).toUpperCase();
  const flav = (manager.flavour || manager.philosophy || '').trim();
  const quoted = flav ? (/^["'“]/.test(flav) ? flav : `“${flav}”`) : '';
  const src = managerPortraitSrc(manager.id);
  const [imgOk, setImgOk] = useState(true);

  const dashRule = (
    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${tier.edge}99, transparent)` }} />
  );
  const bracket = (m: 'tl' | 'tr' | 'bl' | 'br') => {
    const base: React.CSSProperties = { position: 'absolute', width: full ? 16 : 11, height: full ? 16 : 11, pointerEvents: 'none', borderColor: tier.edge, borderStyle: 'solid', borderWidth: 0, zIndex: 8 };
    const off = full ? 5 : 3;
    const r = full ? 5 : 4;
    const m2: Record<string, React.CSSProperties> = {
      tl: { top: off, left: off, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: r },
      tr: { top: off, right: off, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: r },
      bl: { bottom: off, left: off, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: r },
      br: { bottom: off, right: off, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: r },
    };
    return <div key={m} style={{ ...base, ...m2[m] }} />;
  };

  return (
    <>
      {/* INNER — full-bleed portrait + overlays. A fixed 300:452 aspect (the
          handoff card shape) gives the all-absolute children an intrinsic
          height, so a standalone manager card never collapses. */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          aspectRatio: '300 / 452',
          overflow: 'hidden',
          borderRadius: full ? 14 : 10,
          border: `1px solid ${tier.inner}`,
          background: '#0b0805',
        }}
      >
        {/* fallback leather tint + full-bleed portrait (real, or procedural suit bust) */}
        <div style={{ position: 'absolute', inset: 0, background: MANAGER_LEATHER_BG, zIndex: 0, pointerEvents: 'none' }} />
        {src && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element -- raw <img> is deliberate: it needs onError → procedural fallback + a basePath src under static export.
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setImgOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 6%', display: 'block', zIndex: 1 }}
          />
        ) : (
          <div className="pixelated" aria-hidden style={{ ...portraitArtStyle(manager.id, { suit: true }), zIndex: 1 }} />
        )}

        {/* top scrim */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: full ? 74 : 44, zIndex: 2, background: 'linear-gradient(180deg, rgba(6,4,2,0.78), transparent)', pointerEvents: 'none' }} />

        {/* class icon (top-left) */}
        <div
          style={{
            position: 'absolute',
            top: full ? 12 : 7,
            left: full ? 12 : 7,
            zIndex: 4,
            width: full ? 40 : 26,
            height: full ? 40 : 26,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, ${cc}, ${cc}aa)`,
            border: `2px solid ${tier.edge}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 2px 8px rgba(0,0,0,0.55), 0 0 8px ${tier.glow}`,
          }}
        >
          <ClassGlyph cls={cls} size={full ? 24 : 15} color={iconInk} />
        </div>

        {/* MGR chip + rarity chip (top-right) */}
        <div style={{ position: 'absolute', top: full ? 14 : 8, right: full ? 12 : 7, zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: full ? 5 : 3 }}>
          <span style={{ fontFamily: HEAVY, fontSize: full ? 13 : 9, letterSpacing: '0.02em', color: '#1a0f06', background: tier.frame, padding: full ? '4px 9px' : '2px 6px', borderRadius: 6, border: `1px solid ${tier.inner}`, boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
            MGR
          </span>
          {full && (
            <span style={{ fontFamily: BODY_FONT, fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', color: tier.label, background: 'rgba(0,0,0,0.55)', border: `1px solid ${tier.edge}`, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' }}>
              {rarityName}
            </span>
          )}
        </div>

        {/* identity plate */}
        <div
          style={{
            position: 'absolute',
            left: full ? 10 : 6,
            right: full ? 10 : 6,
            bottom: full ? 10 : 6,
            zIndex: 3,
            borderRadius: full ? 11 : 8,
            background: 'linear-gradient(180deg, rgba(12,9,5,0.86) 0%, rgba(10,7,4,0.96) 40%)',
            border: `1px solid ${tier.inner}`,
            boxShadow: '0 -2px 10px rgba(0,0,0,0.4)',
            padding: full ? '12px 14px 13px' : '7px 8px 8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: HEAVY, fontSize: fitFontSize(name, full ? 26 : 13), color: CREAM, letterSpacing: '0.01em', lineHeight: 0.98, textShadow: '0 2px 4px rgba(0,0,0,0.6)', overflowWrap: 'anywhere' }}>
            {name}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: full ? '7px 0 9px' : '4px 0 6px' }}>
            {dashRule}
            <span style={{ fontFamily: BODY_FONT, fontSize: full ? 9.5 : 7.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: tier.label, whiteSpace: 'nowrap' }}>
              {manager.archetype}
            </span>
            {dashRule}
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: full ? '5px 14px' : '3px 9px', borderRadius: 7, border: '1.5px solid var(--amber, #f59e0b)', background: 'rgba(245,158,11,0.1)', boxShadow: '0 0 10px rgba(245,158,11,0.25), inset 0 0 8px rgba(245,158,11,0.08)' }}>
            <span style={{ fontFamily: GLYPH_FONT, fontSize: full ? 11 : 9, color: 'var(--amber-hi, #fbbf24)' }}>⚡</span>
            <span style={{ fontFamily: HEAVY, fontSize: full ? 12 : 8.5, letterSpacing: '0.03em', color: 'var(--amber-hi, #fbbf24)' }}>{action}</span>
          </div>

          {full && (
            <>
              <div style={{ height: 1, background: 'rgba(212,160,53,0.2)', margin: '11px 0 9px' }} />
              <p style={{ margin: 0, fontFamily: BODY_FONT, fontSize: 11, lineHeight: 1.4, color: CREAM_SOFT }}>{manager.effect}</p>
              {quoted && <p style={{ margin: '8px 0 0', fontFamily: FLAVOUR_FONT, fontStyle: 'italic', fontSize: 12, lineHeight: 1.25, color: DUST }}>{quoted}</p>}
            </>
          )}
        </div>
      </div>

      {/* corner brackets */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(bracket)}
    </>
  );
}

// ===========================================================================
// TACTIC face (#7c)
// ===========================================================================

const TACTIC_DESCRIPTOR: Record<string, string> = {
  attacking: 'Attacking play',
  defensive: 'Defensive shape',
  specialist: 'Set play',
};

function TacticFace({ tactic, charges, full, foil }: { tactic: TacticCard; charges?: number; full: boolean; foil: boolean }) {
  const med = tacticMedallion(tactic.category);
  const capacity = tacticCapacity(tactic);
  const filled = charges == null ? capacity : Math.max(0, Math.min(capacity, charges));
  const name = tactic.name.toUpperCase();
  const descriptor = TACTIC_DESCRIPTOR[tactic.category] ?? 'Called play';

  return (
    <Inner background="linear-gradient(165deg, #2f2415, #161009)" full={full} foil={foil}>
      {/* ART REGION — dark tactical board, big centred category medallion. */}
      <div style={{ position: 'relative', flex: 1, minHeight: full ? 96 : 40, background: TACTIC_BOARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* big centred category medallion (the tactic hero) */}
        <div
          style={{
            width: full ? 70 : 40,
            height: full ? 70 : 40,
            borderRadius: '50%',
            background: 'rgba(11,7,3,0.7)',
            border: `2px solid ${med.color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 3px 10px rgba(0,0,0,0.6)',
          }}
        >
          <span style={{ fontFamily: GLYPH_FONT, fontSize: full ? 36 : 21, lineHeight: 1, color: med.color }}>{med.glyph}</span>
        </div>

        {/* class medallion (top-left) */}
        <Medallion med={med} classLabel="TACTIC" chipFg={STAT_CREAM} chipBg={med.color} full={full} />

        {/* charge pips (folded-in game data) — top-right resource slot. */}
        <div style={{ position: 'absolute', top: full ? 9 : 5, right: full ? 9 : 5, zIndex: 3 }}>
          <ChargePips capacity={capacity} charges={filled} accent={med.color} full={full} />
        </div>
      </div>

      {/* NAME BAND — name + descriptor, category chip on the right. */}
      <NameBand
        name={name}
        role={descriptor}
        full={full}
        nameSize={full ? 14 : 8}
        right={<ClassChip glyph={med.glyph} label={med.label} color={med.color} bg="rgba(0,0,0,0.32)" border={med.color} full={full} />}
      />

      {/* EFFECT + FLAVOUR block. */}
      <EffectBlock effect={tactic.effect} flavour={tactic.flavour} full={full} />
    </Inner>
  );
}

// ===========================================================================
// INVESTMENT body (Boardroom) — unchanged glass-chrome family.
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
