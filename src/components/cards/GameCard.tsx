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
  MANAGER_MEDALLION,
  playerActions,
  matchFitColor,
  type ClassMedallion,
} from './cardTokens';
import { ChargePips, ClassGem } from './ContestIcons';
import { classOfCard } from '../../lib/contest-map';
import {
  portraitArtStyle,
  rarityFrame,
  PLAYER_PITCH_BG,
  MANAGER_LEATHER_BG,
  TACTIC_BOARD_BG,
  GROUND_SHADOW_BG,
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

  // --- PLAYER / MANAGER / TACTIC: the v3 foil-frame → inner card. ---
  const frameRarity =
    model.variant === 'player'
      ? model.card.rarity
      : model.variant === 'manager'
        ? MANAGER_RARITY_TO_FRAME[model.manager.rarity] ?? 'Rare'
        : TACTIC_RARITY_TO_FRAME[model.tactic.rarity];
  const fr = rarityFrame(frameRarity);
  const ring = selected ? '0 0 0 2px var(--gold), ' : '';
  frameStyle = {
    position: 'relative',
    width: '100%',
    aspectRatio: `${ASPECT}`,
    borderRadius: full ? 15 : 9,
    padding: full ? 5 : 3,
    background: fr.frame,
    boxShadow: ring + fr.glow,
    boxSizing: 'border-box',
    opacity: dimmed ? 0.42 : 1,
    display: 'flex',
    textAlign: 'left',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform 0.12s ease',
    minWidth: 0,
    // The Turn-9 player card's corner GEMS overhang the frame top/bottom — a
    // vertical margin gives them room (vertical only, so width:100% is untouched
    // and no horizontal page-scroll is introduced). Manager/tactic keep no margin.
    margin: model.variant === 'player' ? `${full ? 12 : 7}px 0` : undefined,
    animationDelay: delay != null ? `${delay}ms` : undefined,
  };

  content =
    model.variant === 'player' ? (
      <PlayerFace card={model.card} full={full} foil={fr.foil} />
    ) : model.variant === 'manager' ? (
      <ManagerFace manager={model.manager} full={full} foil={fr.foil} />
    ) : (
      <TacticFace tactic={model.tactic} charges={model.charges} full={full} foil={fr.foil} />
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
// PLAYER face (Turn 9) — glassy foil frame, pixel interior, overhanging gems.
//   Four stacked regions in a fixed-height inner card:
//     1. Art (stadium horizon + pix5c bust, position group top-right)
//     2. Name plate (name + role under, centered)
//     3. Actions (real defining traits, class-coloured keyword + effect)
//     4. Fitness bar (MATCH FIT · NN%)
//   Corner gems overhang the frame: CLASS top-left, ATK bottom-left, DEF bottom-right.
// ===========================================================================

function PlayerFace({ card, full, foil }: { card: Card; full: boolean; foil: boolean }) {
  const stats = deriveStats(card);
  const name = lastName(card.name).toUpperCase();
  const role = card.tacticalRole ?? card.archetype;
  const cls = classOfCard(card);
  const fitPct = Math.max(0, Math.min(100, Math.round(card.fitness ?? 100)));
  const fitColor = matchFitColor(fitPct);
  const actions = playerActions(card);

  const primaryPos = card.position;
  // Secondary "can operate" slots stack BELOW the primary (Turn-9). Grid keeps
  // just the primary pill so the small art stays readable.
  const secondary = full ? eligiblePositions(card.position).slice(1, 3) : [];

  // The card is FIXED-HEIGHT: as the action count climbs (a Legendary can carry
  // up to 4), the actions region tightens (fewer lines/action, a hair smaller,
  // a slightly shorter art window) so every action fits cleanly and nothing
  // clips. The region also scrolls internally as a final safety net.
  // Fixed-height budgeting: the more actions, the tighter the actions region and
  // the shorter the art window, so every line fits and nothing clips (the region
  // also scrolls internally as a last resort). Full has room for a couple of
  // wrapped lines; the small grid token clamps each action to one line and steps
  // the type/spacing/art down as the count climbs (a 4-action Legendary is the
  // tightest case).
  const nActions = actions.length;
  const busy = nActions >= 3;
  const clamp = full ? (busy ? 1 : 3) : 1;
  const artBasis = full
    ? nActions >= 4 ? '44%' : '47%'
    : nActions >= 4 ? '40%' : nActions === 3 ? '43%' : '47%';
  const actFont = full ? (busy ? 9.5 : 10.5) : nActions >= 4 ? 5 : nActions === 3 ? 5.5 : 6.5;
  const actLineH = !full && busy ? 1.3 : 1.35;
  const kwFont = full ? (busy ? 7.5 : 8) : nActions >= 4 ? 5 : 5.5;
  const actGap = full ? (busy ? 5 : 6) : busy ? 2 : 3;
  const nameThin = !full && busy;

  return (
    <>
      <Inner background="#0f1510" full={full} foil={foil}>
        {/* 1 — ART REGION: stadium horizon, ground shadow, bust, position group. */}
        <div
          style={{
            position: 'relative',
            flex: `0 0 ${artBasis}`,
            minHeight: 0,
            background: PLAYER_PITCH_BG,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: full ? 6 : 4,
              transform: 'translateX(-50%)',
              width: '50%',
              height: full ? 18 : 10,
              borderRadius: '50%',
              background: GROUND_SHADOW_BG,
            }}
          />
          <div className="pixelated" aria-hidden style={portraitArtStyle(card.id)} />

          {/* Position group — primary pill on top, secondaries stacked below. */}
          <div
            style={{
              position: 'absolute',
              top: full ? 8 : 4,
              right: full ? 8 : 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: full ? 5 : 3,
              zIndex: 2,
            }}
          >
            <PositionPill pos={primaryPos} primary full={full} />
            {secondary.map((p) => (
              <PositionPill key={p} pos={p} primary={false} full={full} />
            ))}
          </div>
        </div>

        {/* 2 — NAME PLATE: name + role directly under, centered. */}
        <div
          style={{
            flexShrink: 0,
            background: 'linear-gradient(180deg, #2a2113, #171207)',
            borderTop: `2px solid ${INNER_INK}`,
            borderBottom: '1px solid rgba(232,178,60,0.4)',
            padding: full ? '6px 12px' : nameThin ? '3px 7px' : '4px 7px',
            textAlign: 'center',
            zIndex: 2,
          }}
        >
          <span
            style={{
              display: 'block',
              fontFamily: PIXEL,
              fontSize: fitFontSize(name, full ? 15 : 9),
              color: CREAM,
              textShadow: `0 ${full ? 2 : 1}px 0 ${INNER_INK}`,
              lineHeight: 1.12,
              overflowWrap: 'anywhere',
            }}
          >
            {name}
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: BODY_FONT,
              fontSize: fitFontSize(role, full ? 9.5 : 6.5),
              color: DUST,
              marginTop: full ? 3 : 1.5,
              lineHeight: 1.2,
              overflowWrap: 'break-word',
            }}
          >
            {role}
          </span>
        </div>

        {/* 3 — ACTIONS: one line per real defining trait (class-coloured keyword
            + effect text). Bonus (★ gold) for signature / high-rarity extras. */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            background: 'linear-gradient(180deg, #14100a, #0f0b06)',
            padding: full ? '9px 13px 10px' : '5px 7px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: actGap,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            zIndex: 2,
          }}
        >
          {actions.map((a) => (
            <span
              key={a.key}
              style={{
                fontFamily: BODY_FONT,
                fontSize: actFont,
                lineHeight: actLineH,
                color: '#e6dcc6',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: clamp,
                overflow: 'hidden',
              }}
            >
              <b
                style={{
                  fontFamily: PIXEL,
                  fontSize: kwFont,
                  letterSpacing: 0.5,
                  color: a.color,
                }}
              >
                {a.bonus ? '★ ' : ''}
                {a.label}:
              </b>{' '}
              {a.text}
            </span>
          ))}
        </div>

        {/* 4 — FITNESS BAR: slim meter (fill = fitness %, colour = fitColor) with a
            centered MATCH FIT · NN% micro-label. */}
        <div
          style={{
            position: 'relative',
            flexShrink: 0,
            background: '#0f0b06',
            borderTop: '1px solid rgba(232,178,60,0.2)',
            padding: full ? '7px 34px 8px' : '4px 16px 5px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              height: full ? 9 : 6,
              borderRadius: 5,
              background: '#241c10',
              border: `1px solid ${INNER_INK}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${fitPct}%`,
                background: `linear-gradient(180deg, ${fitColor}, #0b0703)`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            />
          </div>
          <span
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              textAlign: 'center',
              fontFamily: PIXEL,
              fontSize: full ? 5.5 : 4.5,
              letterSpacing: 1,
              color: '#fbf7ec',
              textShadow: '0 1px 1px #000',
              pointerEvents: 'none',
            }}
          >
            {fitPct}%
          </span>
        </div>
      </Inner>

      {/* CORNER GEMS — overhang the frame. CLASS top-left, ATK bottom-left,
          DEF bottom-right (per Turn-9). */}
      <div style={{ position: 'absolute', left: full ? -6 : -4, top: full ? -9 : -6, zIndex: 6 }}>
        <ClassGem cls={cls} size={full ? 34 : 20} border={3} />
      </div>
      <StatGem value={stats.atk} label="ATK" side="atk" full={full} pos="left" />
      <StatGem value={stats.def} label="DEF" side="def" full={full} pos="right" />
    </>
  );
}

/** An overhanging ATK/DEF corner gem — a dark radial disc with a red (ATK) or
 *  blue (DEF) ring, the value in near-white Silkscreen + a tiny tinted label.
 *  Sits over the frame's bottom corner (per Turn-9). */
function StatGem({ value, label, side, full, pos }: { value: number; label: string; side: 'atk' | 'def'; full: boolean; pos: 'left' | 'right' }) {
  const size = full ? 38 : 21;
  const ring = side === 'atk' ? '#e23b35' : '#3d7bd6';
  const bg = side === 'atk'
    ? 'radial-gradient(circle at 38% 30%, #46281a, #150b06 72%)'
    : 'radial-gradient(circle at 38% 30%, #1c3247, #0a1119 72%)';
  const labelColor = side === 'atk' ? '#ff8f6a' : '#8fb6ff';
  return (
    <div
      style={{
        position: 'absolute',
        [pos]: full ? -6 : -4,
        bottom: full ? -10 : -6,
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: `3px solid ${ring}`,
        boxShadow: '0 3px 8px rgba(0,0,0,0.65), inset 0 2px 3px rgba(255,255,255,0.18)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 6,
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: full ? 15 : 9, lineHeight: 0.85, color: '#fbf7ec', textShadow: `0 2px 0 ${INNER_INK}` }}>
        {value}
      </span>
      <span style={{ fontFamily: PIXEL, fontSize: full ? 4.5 : 3.5, letterSpacing: 1, color: labelColor, lineHeight: 1 }}>
        {label}
      </span>
    </div>
  );
}

/** A Turn-9 position pill — primary is a larger filled pill in the position
 *  colour; secondaries are smaller filled pills stacked below it. */
function PositionPill({ pos, primary, full }: { pos: string; primary: boolean; full: boolean }) {
  const color = POSITION_COLOR[pos] ?? '#9aa0a8';
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: primary ? (full ? 12 : 8) : full ? 7 : 5.5,
        lineHeight: 1,
        color: '#fbf7ec',
        background: color,
        padding: primary ? (full ? '4px 7px' : '3px 4px') : full ? '3px 5px' : '2px 3px',
        borderRadius: primary ? 5 : 3,
        border: `1px solid ${INNER_INK}`,
        boxShadow: primary ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {pos}
    </span>
  );
}

// ===========================================================================
// MANAGER face (#7b)
// ===========================================================================

function ManagerFace({ manager, full, foil }: { manager: JokerCard; full: boolean; foil: boolean }) {
  const name = manager.name.toUpperCase();
  const role = manager.traits[0] ?? 'The Gaffer';
  return (
    <Inner background="linear-gradient(165deg, #2f2415, #161009)" full={full} foil={foil}>
      {/* ART REGION — aged leather, suited bust, medallion, ground shadow. */}
      <div style={{ position: 'relative', flex: 1, minHeight: full ? 96 : 40, background: MANAGER_LEATHER_BG, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: full ? 8 : 5,
            transform: 'translateX(-50%)',
            width: '52%',
            height: full ? 22 : 12,
            borderRadius: '50%',
            background: GROUND_SHADOW_BG,
          }}
        />
        <div className="pixelated" aria-hidden style={portraitArtStyle(manager.id, { suit: true })} />
        <Medallion med={MANAGER_MEDALLION} classLabel="MANAGER" chipFg="#0b0703" chipBg="#e8b23a" full={full} />
      </div>

      {/* NAME BAND — name + role, JOKER chip on the right. Manager names are full
          (first + last), so a slightly smaller face keeps two words legible. */}
      <NameBand
        name={name}
        role={role}
        full={full}
        nameSize={full ? 13 : 8}
        right={<ClassChip glyph={'\u{1F0CF}'} label="JOKER" color="#e8b23a" bg="rgba(232,178,60,0.14)" border="rgba(232,178,60,0.4)" full={full} />}
      />

      {/* EFFECT + FLAVOUR block. */}
      <EffectBlock effect={manager.effect} flavour={manager.philosophy} full={full} />
    </Inner>
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
