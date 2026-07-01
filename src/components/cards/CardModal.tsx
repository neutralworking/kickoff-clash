'use client';

/**
 * Kickoff Clash — CardModal
 *
 * The full-card overlay. Tapping any GameCard opens this: a dimmed scrim with a
 * large GameCard (size="full") on the left and the complete detail panel on the
 * right (stacked on a phone). The page never scrolls; the panel scrolls
 * internally if a bio runs long. Closes on backdrop tap, the close control, or
 * Escape.
 *
 * Detail content per variant:
 *   • Player     — position (long), archetype (+secondary), rating, rarity, nation,
 *                  durability, tags, strengths, weaknesses, quirk, bio.
 *   • Manager    — nation, philosophy, trait pills.
 *   • Tactic     — category, effect, flavour, contradiction note.
 *   • Investment — ladder, tier, cost, Boardroom effect, flavour.
 */

import { useEffect } from 'react';
import type { Card } from '../../lib/scoring';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard } from '../../lib/tactics';
import type { InvestmentCard } from '../../lib/economy';
import { getTacticById } from '../../lib/tactics';
import GameCard, { type GameCardModel } from './GameCard';
import {
  PIXEL,
  RARITY_COLOR,
  POSITION_COLOR,
  POSITION_LABEL,
  DURABILITY_META,
  TACTIC_CAT_COLOR,
  INVESTMENT_META,
  eligiblePositions,
  fitnessMeter,
  formatCash,
  nationFlag,
  nationCode,
  nationGloss,
  managerTraitStyle,
  definingTraitsFor,
  type ResolvedTrait,
} from './cardTokens';

// Trait glyphs (✦ ➴ ⚑ …) sit outside the Silkscreen glyph set; render them in a
// Unicode-complete fallback stack so a symbol never renders as a blank tofu box.
const GLYPH_FONT = "'DejaVu Sans', 'Noto Sans Symbols', 'Segoe UI Symbol', sans-serif";

interface CardModalProps {
  model: GameCardModel | null;
  onClose: () => void;
}

export default function CardModal({ model, onClose }: CardModalProps) {
  useEffect(() => {
    if (!model) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [model, onClose]);

  if (!model) return null;

  const accent =
    model.variant === 'player'
      ? RARITY_COLOR[model.card.rarity] ?? RARITY_COLOR.Common
      : model.variant === 'manager'
        ? 'var(--kit-red)'
        : model.variant === 'tactic'
          ? TACTIC_CAT_COLOR[model.tactic.category] ?? 'var(--gold)'
          : INVESTMENT_META[model.investment.ladder]?.accent ?? 'var(--gold)';

  return (
    <div
      className="absolute inset-0 scrim-fade"
      style={{
        background: 'rgba(0,0,0,0.66)',
        backdropFilter: 'blur(2px)',
        zIndex: 60,
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* DEDICATED CLOSE BACKDROP — a full-bleed dismiss layer UNDER the content. Any
          tap that is not on the card or the detail panel lands here and closes the
          overlay. Making the dismiss a real, full-size hit target (rather than
          relying on whatever scrim a near-fullscreen card leaves over) is the fix
          for "clicking outside doesn't reliably close" — every variant inherits it.
          A plain div (not a button) avoids a second focusable "Close" control; the
          × button and Escape are the labelled affordances. */}
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      />

      {/* Foreground content — pointer-events pass THROUGH the empty parts of this
          layer to the backdrop button; only the card and detail re-enable events. */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          padding: 'max(env(safe-area-inset-top), 16px) 16px max(env(safe-area-inset-bottom), 16px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        {/* Close control row — the hint + the × button (both re-enable events). */}
        <div className="flex items-center justify-between shrink-0" style={{ marginBottom: 10, pointerEvents: 'auto' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.8, color: 'var(--dust)' }}>
            TAP OUTSIDE TO CLOSE
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="active:scale-90"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-sm)',
              border: '2px solid var(--ink-black)',
              background: 'var(--surface)',
              boxShadow: '0 3px 0 0 var(--ink-black)',
              color: 'var(--cream)',
              fontFamily: PIXEL,
              fontSize: 16,
              lineHeight: 1,
              transition: 'transform 0.12s ease',
            }}
          >
            {'×'}
          </button>
        </div>

        {/* Card + detail. Each re-enables pointer events; the gaps between/around
            them stay click-through, so a tap on empty space hits the backdrop. */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-start" style={{ gap: 14, pointerEvents: 'none' }}>
          <div className="hero-pop shrink-0" style={{ width: 168, maxWidth: '46%', pointerEvents: 'auto' }}>
            <GameCard model={model} size="full" />
          </div>

          <div
            className="w-full min-h-0 overflow-y-auto"
            style={{ maxWidth: 360, overscrollBehavior: 'contain', pointerEvents: 'auto' }}
          >
            {model.variant === 'player' ? (
              <PlayerDetail card={model.card} accent={accent} />
            ) : model.variant === 'manager' ? (
              <ManagerDetail manager={model.manager} />
            ) : model.variant === 'tactic' ? (
              <TacticDetail tactic={model.tactic} accent={accent} />
            ) : (
              <InvestmentDetail investment={model.investment} accent={accent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared detail primitives
// ---------------------------------------------------------------------------

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pixel-edge"
      style={{
        background: 'var(--surface)',
        border: '2px solid var(--ink-black)',
        borderRadius: 'var(--radius)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: 'var(--dust)' }}>{children}</span>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
      }}
    >
      <Label>{label}</Label>
      <span className="truncate" style={{ fontFamily: PIXEL, fontSize: 11, color: color ?? 'var(--cream)', lineHeight: 1.1 }}>
        {value}
      </span>
    </div>
  );
}

function TagRow({ items, color, bg }: { items: string[]; color: string; bg: string }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 5 }}>
      {items.map((t) => (
        <span
          key={t}
          style={{
            fontFamily: PIXEL,
            fontSize: 8.5,
            letterSpacing: 0.3,
            color,
            background: bg,
            border: `1px solid ${color}`,
            borderRadius: 'var(--radius-lg)',
            padding: '4px 7px',
            lineHeight: 1,
          }}
        >
          {t.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PLAYER detail
// ---------------------------------------------------------------------------

function PlayerDetail({ card, accent }: { card: Card; accent: string }) {
  const flag = nationFlag(card.nation);
  const dur = DURABILITY_META[card.durability] ?? DURABILITY_META.standard;
  // The ROLE (a real, evocative on-pitch identity — Inverted Winger, Regista) is
  // what the player reads; the scoring-internal `archetype`/`secondaryArchetype`
  // are engine plumbing and no longer surfaced on the expanded card.
  const role = card.tacticalRole ?? card.archetype;
  const gloss = nationGloss(card.nation);
  // Defining traits — the marquee "what this card DOES" list. Signature/legend
  // loadouts surface first; otherwise the seeded rarity-count pick.
  const traits = definingTraitsFor(card);
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{card.name}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 9, color: accent, letterSpacing: 0.5, flexShrink: 0 }}>
            {card.rarity.toUpperCase()}
          </span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
          <StatCell label="RATING" value={String(Math.round(card.power))} color="var(--line-white)" />
          <StatCell label="POSITION" value={POSITION_LABEL[card.position] ?? card.position} />
          <StatCell label="NATION" value={flag ? card.nation ?? '—' : nationCode(card.nation) || '—'} />
          {/* ROLE is the prominent, accent-coloured identity where ARCHETYPE was —
              archetype/secondary are no longer surfaced on the expanded card. */}
          <StatCell label="ROLE" value={role} color={accent} />
          <StatCell label="DURABILITY" value={dur.label} color={dur.color} />
        </div>
        {/* Nation gloss — the fictional footballing culture in one line, so a code
            like SOL / ESY reads as a place with an identity rather than a stub. */}
        {gloss && (
          <div className="flex flex-col" style={{ gap: 4 }}>
            <Label>{`${card.nation ?? 'NATION'}`.toUpperCase()}</Label>
            <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--cream-soft)' }}>{gloss}</span>
          </div>
        )}
        {/* Where they can operate — eligible pitch positions as pixel chips. */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <Label>CAN OPERATE</Label>
          <div className="flex flex-wrap" style={{ gap: 5 }}>
            {eligiblePositions(card.position).map((p, i) => (
              <PositionChip key={p} pos={p} primary={i === 0} />
            ))}
          </div>
        </div>
        {typeof card.fitness === 'number' && <FitnessRow fitness={card.fitness} />}
        {card.personalityTheme && card.personalityTheme !== 'General' && (
          <div className="flex flex-wrap" style={{ gap: 5 }}>
            <Chip label="THEME" value={card.personalityTheme} />
          </div>
        )}
      </Panel>

      {traits.length > 0 && <TraitsSection traits={traits} rarity={card.rarity} accent={accent} />}

      {card.abilityText && (
        <Panel>
          <Label>{(card.abilityName ?? 'Ability').toUpperCase()}</Label>
          <span style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--cream-soft)' }}>{card.abilityText}</span>
        </Panel>
      )}

      {(card.strengths?.length || card.weaknesses?.length) && (
        <Panel>
          {card.strengths && card.strengths.length > 0 && (
            <div className="flex flex-col" style={{ gap: 6 }}>
              <Label>STRENGTHS</Label>
              <TagRow items={card.strengths} color="var(--success)" bg="rgba(52,196,106,0.12)" />
            </div>
          )}
          {card.weaknesses && card.weaknesses.length > 0 && (
            <div className="flex flex-col" style={{ gap: 6 }}>
              <Label>WEAKNESSES</Label>
              <TagRow items={card.weaknesses} color="var(--danger)" bg="rgba(232,54,47,0.12)" />
            </div>
          )}
        </Panel>
      )}

      {card.tags && card.tags.length > 0 && (
        <Panel>
          <Label>TAGS</Label>
          <TagRow items={card.tags} color="var(--gold)" bg="rgba(245,197,66,0.1)" />
        </Panel>
      )}

      {(card.bio || card.quirk) && (
        <Panel>
          {card.bio && (
            <p style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--cream-soft)', margin: 0 }}>{card.bio}</p>
          )}
          {card.quirk && (
            <p
              style={{
                fontFamily: 'var(--font-flavour, serif)',
                fontStyle: 'italic',
                fontSize: 11,
                lineHeight: 1.4,
                color: 'var(--dust)',
                margin: 0,
              }}
            >
              {'“'}{card.quirk}{'”'}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

/**
 * The marquee Traits section — the place a player reads what a card actually DOES.
 * Each defining trait is glyph + label + one-line blurb, coloured by its kind.
 * Rarity lands as identity here: a Legendary fills this panel with 4 actions, a
 * Common with 1. Signature/legend traits sort first and carry a SIGNATURE badge.
 */
function TraitsSection({ traits, rarity, accent }: { traits: ResolvedTrait[]; rarity: string; accent: string }) {
  // Signature traits first, original order preserved within each group.
  const ordered = [...traits].sort((a, b) => Number(b.signature) - Number(a.signature));
  return (
    <Panel>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <Label>DEFINING TRAITS</Label>
        <span style={{ fontFamily: PIXEL, fontSize: 8.5, letterSpacing: 0.5, color: accent, lineHeight: 1 }}>
          {rarity.toUpperCase()} · {ordered.length}
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {ordered.map((t, i) => (
          <TraitRow key={`${t.name}-${i}`} trait={t} />
        ))}
      </div>
    </Panel>
  );
}

/** One defining-trait row: a coloured pixel glyph badge, the label (+ signature
 *  marker), and the Marvel-Snap-voice blurb of what the action does. */
function TraitRow({ trait }: { trait: ResolvedTrait }) {
  const { color, bg } = trait.style;
  return (
    <div className="flex" style={{ gap: 9, alignItems: 'flex-start' }}>
      {/* Kind glyph badge — a hard chip in the trait's kind colour. The glyph is
          drawn in a Unicode-complete face (it falls outside the pixel font's set,
          which is why the on-card chips used to read blank). */}
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: GLYPH_FONT,
          fontSize: 14,
          lineHeight: 1,
          color,
          background: bg,
          border: `1px solid ${color}`,
          borderRadius: 4,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.28)',
        }}
      >
        {trait.copy.glyph}
      </span>
      <div className="flex flex-col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
        <div className="flex items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 10.5, color, letterSpacing: 0.3, lineHeight: 1.1 }}>
            {trait.copy.label.toUpperCase()}
          </span>
          {trait.signature && (
            <span
              style={{
                fontFamily: PIXEL,
                fontSize: 6.5,
                letterSpacing: 0.6,
                lineHeight: 1,
                color: 'var(--gold)',
                background: 'rgba(245,197,66,0.12)',
                border: '1px solid var(--gold)',
                borderRadius: 3,
                padding: '2px 4px',
              }}
            >
              SIGNATURE
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--cream-soft)' }}>{trait.copy.blurb}</span>
      </div>
    </div>
  );
}

/** A small pixel position chip — the player's own slot is filled (primary). */
function PositionChip({ pos, primary }: { pos: string; primary: boolean }) {
  const color = POSITION_COLOR[pos] ?? 'var(--dust)';
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: 9,
        letterSpacing: 0.4,
        lineHeight: 1,
        color: primary ? 'var(--line-white)' : color,
        background: primary ? color : 'transparent',
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '4px 6px',
        boxShadow: primary ? 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.3)' : undefined,
      }}
    >
      {pos}
    </span>
  );
}

/** Crisp pixel fitness meter row inside the detail panel. */
function FitnessRow({ fitness }: { fitness: number }) {
  const { filled, total, color } = fitnessMeter(fitness);
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <Label>FITNESS</Label>
      <div className="flex" style={{ gap: 2 }}>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 12,
              height: 7,
              background: i < filled ? color : 'rgba(255,255,255,0.10)',
              boxShadow: i < filled
                ? 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.35), 0 0 0 1px var(--ink-black)'
                : 'inset 0 0 0 1px rgba(0,0,0,0.35)',
            }}
          />
        ))}
      </div>
      <span style={{ fontFamily: PIXEL, fontSize: 9, color, lineHeight: 1 }}>{filled}/{total}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '4px 8px',
      }}
    >
      <span style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.5, color: 'var(--dust)' }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--cream)', lineHeight: 1 }}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// MANAGER detail
// ---------------------------------------------------------------------------

function ManagerDetail({ manager }: { manager: JokerCard }) {
  const flag = nationFlag(manager.nation);
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{manager.name}</span>
          {manager.nation && (
            <span style={{ fontSize: 11, color: 'var(--dust)', flexShrink: 0, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              {flag && <span style={{ fontSize: 14 }}>{flag}</span>}
              {manager.nation}
            </span>
          )}
        </div>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: 13,
            lineHeight: 1.4,
            color: 'var(--cream-soft)',
            margin: 0,
          }}
        >
          {'“'}{manager.philosophy}{'”'}
        </p>
      </Panel>

      <Panel>
        <Label>TRAITS</Label>
        {/* Each trait tag is coloured BY MEANING (defensive-blue, attacking-red, …)
            so the modal matches the grid card and a gaffer's identity reads at a
            glance rather than every tag being the same kit-red. */}
        <div className="flex flex-wrap" style={{ gap: 5 }}>
          {manager.traits.map((t) => {
            const s = managerTraitStyle(t);
            return (
              <span
                key={t}
                style={{
                  fontFamily: PIXEL,
                  fontSize: 8.5,
                  letterSpacing: 0.3,
                  color: s.color,
                  background: s.bg,
                  border: `1px solid ${s.color}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '4px 7px',
                  lineHeight: 1,
                }}
              >
                {t.toUpperCase()}
              </span>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TACTIC detail
// ---------------------------------------------------------------------------

function TacticDetail({ tactic, accent }: { tactic: TacticCard; accent: string }) {
  const contradicts = tactic.contradicts ? getTacticById(tactic.contradicts) : null;
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{tactic.name}</span>
          <span
            style={{
              fontFamily: PIXEL,
              fontSize: 8,
              letterSpacing: 0.5,
              color: 'var(--ink-black)',
              background: accent,
              borderRadius: 3,
              padding: '4px 6px',
              flexShrink: 0,
            }}
          >
            {tactic.category.toUpperCase()}
          </span>
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <Label>EFFECT</Label>
          <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{tactic.effect}</span>
        </div>
      </Panel>

      <Panel>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: 12.5,
            lineHeight: 1.45,
            color: 'var(--dust)',
            margin: 0,
          }}
        >
          {tactic.flavour}
        </p>
        {contradicts && (
          <span style={{ fontSize: 10.5, color: 'var(--danger)', lineHeight: 1.35 }}>
            Replaces <b style={{ color: 'var(--cream)' }}>{contradicts.name}</b> if deployed together.
          </span>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVESTMENT detail (Boardroom)
// ---------------------------------------------------------------------------

const INVESTMENT_FLAVOUR: Record<string, string> = {
  stadium: 'Bricks and roar. Every result pays a little more.',
  academy: 'The future is grown, not bought.',
  boxoffice: 'Give them goals and they will pay at the gate.',
};

function InvestmentDetail({ investment, accent }: { investment: InvestmentCard; accent: string }) {
  const meta = INVESTMENT_META[investment.ladder] ?? INVESTMENT_META.stadium;
  const ladderLabel =
    investment.ladder === 'stadium'
      ? 'Stadium Expansion'
      : investment.ladder === 'academy'
        ? 'Youth Academy'
        : 'Box Office';
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <Panel>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', lineHeight: 1.15 }}>{investment.name}</span>
          <span
            style={{
              fontFamily: PIXEL,
              fontSize: 8,
              letterSpacing: 0.5,
              color: 'var(--ink-black)',
              background: accent,
              borderRadius: 3,
              padding: '4px 6px',
              flexShrink: 0,
            }}
          >
            {meta.tab}
          </span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
          <StatCell label="LADDER" value={ladderLabel} color={accent} />
          <StatCell label="COST" value={formatCash(investment.cost)} color="var(--gold)" />
          {investment.ladder !== 'boxoffice' && (
            <StatCell label="TIER" value={String(investment.tier)} />
          )}
          <StatCell label="TYPE" value={meta.kicker} />
        </div>
      </Panel>

      <Panel>
        <Label>BOARDROOM EFFECT</Label>
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{investment.description}</span>
      </Panel>

      <Panel>
        <p
          style={{
            fontFamily: 'var(--font-flavour, serif)',
            fontStyle: 'italic',
            fontSize: 12.5,
            lineHeight: 1.45,
            color: 'var(--dust)',
            margin: 0,
          }}
        >
          {'“'}{INVESTMENT_FLAVOUR[investment.ladder] ?? ''}{'”'}
        </p>
        <span style={{ fontSize: 10.5, color: 'var(--gold)', lineHeight: 1.35 }}>
          One-time unlock. Consumed on purchase.
        </span>
      </Panel>
    </div>
  );
}
