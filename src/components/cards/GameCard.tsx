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
 * Visuals are pure CSS/SVG pixel blocks — no external image assets. Tokens come
 * from cardTokens.ts and DESIGN.md. See DESIGN.md › Cards.
 */

import type { Card } from '../../lib/scoring';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard } from '../../lib/tactics';
import type { InvestmentCard } from '../../lib/economy';
import {
  PIXEL,
  RARITY_COLOR,
  POSITION_COLOR,
  TACTIC_CAT_COLOR,
  INVESTMENT_META,
  formatCash,
  nationFlag,
  nationCode,
  lastName,
} from './cardTokens';

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
  const full = size === 'full';

  const frameStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: `${ASPECT}`,
    borderRadius: full ? 'var(--radius)' : 'var(--radius-sm)',
    border: `${full ? 3 : 2}px solid var(--ink-black)`,
    background: 'linear-gradient(165deg, var(--surface-raised) 0%, var(--surface) 55%, #0c1d12 100%)',
    boxShadow: selected
      ? `0 0 0 2px ${accent}, 0 ${full ? 6 : 3}px 0 0 var(--ink-black), 0 ${full ? 10 : 4}px ${full ? 22 : 8}px rgba(0,0,0,0.45)`
      : `0 ${full ? 6 : 3}px 0 0 var(--ink-black), 0 ${full ? 10 : 4}px ${full ? 22 : 8}px rgba(0,0,0,0.45)`,
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
      {/* Accent top rail — the family signature. */}
      <div style={{ height: full ? 5 : 3, background: accent, flexShrink: 0 }} />
      {body}
      {/* Accent bottom rail. */}
      <div style={{ height: full ? 5 : 3, background: accent, flexShrink: 0 }} />
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
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: full ? 10 : '5px 6px' }}>
      {/* Header row: position tab · rating */}
      <div className="flex items-center justify-between" style={{ gap: 4 }}>
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
          }}
        >
          {card.position}
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: full ? 24 : 13, lineHeight: 1, color: 'var(--line-white)' }}>
          {Math.round(card.power)}
        </span>
      </div>

      {/* Sprite portrait — pixel-block kit + head, drawn in CSS/SVG. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: full ? '8px 0' : '4px 0' }}>
        <PlayerSprite accent={accent} posColor={posColor} isGK={card.position === 'GK'} full={full} />
      </div>

      {/* Name + archetype */}
      <span
        className="truncate"
        style={{ fontSize: full ? 14 : 11, fontWeight: 700, color: 'var(--cream)', lineHeight: 1.15 }}
      >
        {lastName(card.name)}
      </span>
      <div className="flex items-center justify-between" style={{ gap: 4, marginTop: 1 }}>
        <span className="truncate" style={{ fontSize: full ? 10 : 8.5, color: 'var(--dust)', letterSpacing: 0.2, lineHeight: 1 }}>
          {card.archetype}
        </span>
        {flag ? (
          <span style={{ fontSize: full ? 13 : 10, flexShrink: 0, lineHeight: 1 }}>{flag}</span>
        ) : card.nation ? (
          <span style={{ fontFamily: PIXEL, fontSize: full ? 7.5 : 6.5, color: 'var(--dust)', flexShrink: 0, lineHeight: 1 }}>
            {nationCode(card.nation)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Sprite-y player portrait built from flat pixel blocks (head + shirt + crest). */
function PlayerSprite({ accent, posColor, isGK, full }: { accent: string; posColor: string; isGK: boolean; full: boolean }) {
  const kit = isGK ? '#16a34a' : 'var(--kit-red)';
  const kitDark = isGK ? '#0f7a35' : '#b62520';
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '60%' : '74%', maxWidth: full ? 96 : 52, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      {/* halo plate */}
      <rect x="2" y="2" width="20" height="20" fill="rgba(0,0,0,0.25)" />
      {/* head */}
      <rect x="9" y="3" width="6" height="6" fill="#e8c9a0" />
      <rect x="9" y="3" width="6" height="2" fill="#3a2a1e" />
      {/* shoulders / shirt */}
      <rect x="6" y="10" width="12" height="9" fill={kit} />
      <rect x="6" y="10" width="12" height="2" fill={kitDark} />
      {/* sleeves */}
      <rect x="4" y="11" width="2" height="6" fill={kitDark} />
      <rect x="18" y="11" width="2" height="6" fill={kitDark} />
      {/* collar */}
      <rect x="10" y="9" width="4" height="2" fill="var(--line-white)" />
      {/* crest block in accent */}
      <rect x="11" y="13" width="3" height="3" fill={accent} />
      {/* shorts hint */}
      <rect x="8" y="19" width="8" height="2" fill="var(--line-white)" />
      {/* position pip */}
      <rect x="6" y="19" width="2" height="2" fill={posColor} />
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

      {/* Name + philosophy */}
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: full ? 13 : 9.5, color: 'var(--cream)', lineHeight: 1.2 }}>
        {manager.name}
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
      {/* Trait pills */}
      <div className="flex flex-wrap" style={{ gap: full ? 5 : 3, marginTop: full ? 8 : 4 }}>
        {visibleTraits.map((t) => (
          <span
            key={t}
            style={{
              fontFamily: PIXEL,
              fontSize: full ? 8.5 : 6.5,
              letterSpacing: 0.3,
              color: accent,
              background: 'rgba(232,54,47,0.14)',
              border: `1px solid ${accent}`,
              borderRadius: 4,
              padding: full ? '4px 6px' : '3px 4px',
              lineHeight: 1,
            }}
          >
            {t.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Gaffer crest: pixel suit + tie sprite. */
function ManagerSprite({ accent, full }: { accent: string; full: boolean }) {
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '60%' : '74%', maxWidth: full ? 96 : 52, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      <rect x="2" y="2" width="20" height="20" fill="rgba(0,0,0,0.25)" />
      {/* head */}
      <rect x="9" y="3" width="6" height="6" fill="#e8c9a0" />
      <rect x="9" y="3" width="6" height="2" fill="#2a2018" />
      {/* suit jacket */}
      <rect x="6" y="10" width="12" height="11" fill="#1b2730" />
      <rect x="6" y="10" width="12" height="2" fill="#0f171d" />
      {/* shirt V */}
      <polygon points="10,10 14,10 12,16" fill="var(--line-white)" />
      {/* tie in accent */}
      <rect x="11" y="11" width="2" height="6" fill={accent} />
      {/* lapels */}
      <polygon points="9,10 11,10 9,15" fill="#0f171d" />
      <polygon points="15,10 13,10 15,15" fill="#0f171d" />
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

/** Tactic crest: pixel chevron/arrow board sprite. */
function TacticSprite({ accent, full }: { accent: string; full: boolean }) {
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '58%' : '70%', maxWidth: full ? 92 : 48, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      <rect x="2" y="2" width="20" height="20" fill="rgba(0,0,0,0.22)" />
      {/* tactic board grid hint */}
      <rect x="4" y="4" width="16" height="16" fill="rgba(31,157,79,0.18)" />
      {/* chevrons */}
      <polygon points="6,16 12,8 18,16 15,16 12,12 9,16" fill={accent} />
      <polygon points="6,20 12,12 18,20 15,20 12,16 9,20" fill="var(--line-white)" opacity="0.5" />
      {/* node markers */}
      <rect x="5" y="5" width="2" height="2" fill="var(--line-white)" opacity="0.6" />
      <rect x="17" y="5" width="2" height="2" fill="var(--line-white)" opacity="0.6" />
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
          }}
        >
          {meta.tab}
        </span>
        <span style={{ fontFamily: PIXEL, fontSize: full ? 15 : 10, lineHeight: 1, color: 'var(--gold)', flexShrink: 0 }}>
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

/** Boardroom crest: a gold chairman's seal framing a per-ladder pixel glyph
 *  (stadium stands / academy sapling / box-office ticket). */
function InvestmentSprite({ ladder, accent, full }: { ladder: string; accent: string; full: boolean }) {
  return (
    <svg
      className="pixelated"
      viewBox="0 0 24 24"
      style={{ width: full ? '58%' : '72%', maxWidth: full ? 92 : 50, aspectRatio: '1', display: 'block' }}
      shapeRendering="crispEdges"
    >
      {/* seal plate */}
      <rect x="2" y="2" width="20" height="20" fill="rgba(0,0,0,0.25)" />
      {/* gold crest ring */}
      <rect x="3" y="3" width="18" height="18" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.55" />
      {ladder === 'stadium' ? (
        <>
          {/* terraced stand: three tiers + floodlight */}
          <rect x="5" y="14" width="14" height="5" fill={accent} />
          <rect x="5" y="14" width="14" height="1" fill="var(--line-white)" opacity="0.6" />
          <rect x="6" y="11" width="12" height="3" fill={accent} opacity="0.8" />
          <rect x="7" y="9" width="10" height="2" fill={accent} opacity="0.6" />
          {/* seat pixels */}
          <rect x="7" y="16" width="2" height="2" fill="var(--ink-black)" opacity="0.4" />
          <rect x="11" y="16" width="2" height="2" fill="var(--ink-black)" opacity="0.4" />
          <rect x="15" y="16" width="2" height="2" fill="var(--ink-black)" opacity="0.4" />
          {/* floodlight */}
          <rect x="11" y="4" width="2" height="5" fill="var(--dust)" />
          <rect x="9" y="4" width="6" height="2" fill="var(--line-white)" />
        </>
      ) : ladder === 'academy' ? (
        <>
          {/* sapling in a pot: youth growth */}
          <rect x="10" y="14" width="4" height="5" fill={accent} />
          <rect x="11" y="6" width="2" height="9" fill="#6b4a2b" />
          {/* leaves */}
          <rect x="7" y="8" width="3" height="3" fill={accent} />
          <rect x="14" y="8" width="3" height="3" fill={accent} />
          <rect x="9" y="5" width="6" height="3" fill={accent} />
          <rect x="11" y="4" width="2" height="2" fill="var(--line-white)" opacity="0.7" />
          {/* pot rim */}
          <rect x="9" y="14" width="6" height="1" fill="var(--line-white)" opacity="0.5" />
        </>
      ) : (
        <>
          {/* admission ticket: box office */}
          <rect x="5" y="8" width="14" height="8" fill={accent} />
          <rect x="5" y="8" width="14" height="1" fill="var(--line-white)" opacity="0.6" />
          {/* perforation notch */}
          <rect x="13" y="8" width="1" height="8" fill="var(--ink-black)" opacity="0.45" />
          {/* stub stars */}
          <rect x="7" y="11" width="2" height="2" fill="var(--ink-black)" opacity="0.45" />
          <rect x="10" y="11" width="2" height="2" fill="var(--ink-black)" opacity="0.45" />
          <rect x="15" y="10" width="3" height="1" fill="var(--ink-black)" opacity="0.45" />
          <rect x="15" y="13" width="3" height="1" fill="var(--ink-black)" opacity="0.45" />
        </>
      )}
    </svg>
  );
}
