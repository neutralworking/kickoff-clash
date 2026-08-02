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
 *   • Player     — position (long) + eligible slots, role, rarity, nation,
 *                  character, nickname, availability, contests, actions, bio.
 *   • Manager    — nation, philosophy, effect, trait pills.
 *   • Tactic     — category, effect, flavour, contradiction note.
 *   • Investment — ladder, tier, cost, Boardroom effect, flavour.
 */

import { useEffect } from 'react';
import type { Card } from '../../lib/scoring';
import type { JokerCard } from '../../lib/jokers';
import type { TacticCard } from '../../lib/tactics';
import type { InvestmentCard } from '../../lib/economy';
import { getTacticById, tacticCapacity } from '../../lib/tactics';
import { contestsForManager, contestsForTactic, CONTEST_META, classOfCard, PLAYER_CLASS_META, type ContestKey } from '../../lib/contest-map';
import GameCard, { type GameCardModel } from './GameCard';
import { ContestIcons, ClassGem } from './ContestIcons';
import {
  PIXEL,
  RARITY_COLOR,
  TACTIC_CAT_COLOR,
  INVESTMENT_META,
  eligiblePositions,
  formatCash,
  nationFlag,
  nationCode,
  managerTraitStyle,
  playerActions,
  matchFitColor,
  matchFitLabel,
  POSITION_COLOR,
} from './cardTokens';
import { conditionRecipe, rarityFrame } from './portrait';

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
          <div
            className="hero-pop shrink-0"
            style={{
              // Player / manager / tactic are the tall v3 foil cards, so they blow
              // up larger; investment is the shorter Boardroom card.
              width: model.variant === 'investment' ? 172 : 208,
              maxWidth: model.variant === 'investment' ? '48%' : '62%',
              pointerEvents: 'auto',
            }}
          >
            <GameCard model={model} size="full" />
          </div>

          <div
            className="w-full min-h-0 overflow-y-auto"
            style={{ maxWidth: 360, overscrollBehavior: 'contain', pointerEvents: 'auto' }}
          >
            {model.variant === 'player' ? (
              <PlayerDetail card={model.card} />
            ) : model.variant === 'manager' ? (
              <ManagerDetail manager={model.manager} />
            ) : model.variant === 'tactic' ? (
              <TacticDetail tactic={model.tactic} charges={model.charges} accent={accent} />
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
      <span style={{ fontFamily: PIXEL, fontSize: 10.5, color: color ?? 'var(--cream)', lineHeight: 1.15, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
        {value}
      </span>
    </div>
  );
}

/** A labelled contest row for the detail panel — the pixel badges plus a readable
 *  label list, so the modal teaches which of the six contests the card touches.
 *  Renders nothing for an empty list (identity managers / neutral tactics). */
function ContestRow({ heading, keys }: { heading: string; keys: ContestKey[] }) {
  if (!keys.length) return null;
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <Label>{heading}</Label>
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <ContestIcons keys={keys} full />
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 0.5, color: 'var(--cream-soft)', lineHeight: 1.3 }}>
          {keys.map((k) => CONTEST_META[k].label).join(' · ')}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PLAYER detail (Turn-9 inspector)
// ---------------------------------------------------------------------------

function PlayerDetail({ card }: { card: Card }) {
  const role = card.tacticalRole ?? card.archetype;
  const cls = classOfCard(card);
  const clsMeta = PLAYER_CLASS_META[cls];
  const actions = playerActions(card);
  const grade = card.rarity.toUpperCase();
  const lc = rarityFrame(card.rarity).lc;
  const nation = nationCode(card.nation) || (card.nation ?? '').toUpperCase();
  const flag = nationFlag(card.nation);

  const fitPct = Math.max(0, Math.min(100, Math.round(card.fitness ?? 100)));
  const fitColor = matchFitColor(fitPct);
  const fitLabel = matchFitLabel(fitPct);
  const condition = conditionRecipe(card.condition).label;

  const primaryColor = POSITION_COLOR[card.position] ?? '#9aa0a8';
  const secondary = eligiblePositions(card.position).slice(1);

  const HAIRLINE = '1px solid rgba(154,139,115,0.15)';
  const CHIP_BG = 'linear-gradient(180deg, #1c1610, #120d07)';

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #17130d, #100c07)',
        border: '1px solid rgba(232,178,60,0.28)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      }}
    >
      {/* ── HEADER: full name + nation (left), rarity grade (right) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 16px 12px', borderBottom: HAIRLINE }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 15, color: '#f2ead6', textShadow: '0 2px 0 #0b0703', lineHeight: 1.15 }}>
            {card.name.toUpperCase()}
          </span>
          {nation && (
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: '#9a8b6a', border: '1px solid rgba(154,139,115,0.3)', borderRadius: 3, padding: '2px 4px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {flag && <span style={{ fontSize: 10 }}>{flag}</span>}
              {nation}
            </span>
          )}
        </div>
        <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: lc, flexShrink: 0 }}>{grade}</span>
      </div>

      {/* ── IDENTITY + RECORD ── */}
      <div style={{ display: 'flex', gap: 16, padding: '14px 16px', borderBottom: HAIRLINE }}>
        {/* LEFT — class gem + label + role, then POSITIONS */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClassGem cls={cls} size={46} border={3} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 12, letterSpacing: 1, color: clsMeta.color, lineHeight: 1.1 }}>{clsMeta.label}</span>
              <span style={{ fontSize: 11, color: '#c9bb95', lineHeight: 1.2 }}>{role}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 2, color: '#9a8b6a' }}>POSITIONS</span>
            <span
              style={{
                fontFamily: PIXEL,
                fontSize: 13,
                color: '#fbf7ec',
                background: primaryColor,
                padding: '5px 10px',
                borderRadius: 5,
                border: '1px solid #0b0703',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                alignSelf: 'flex-start',
              }}
            >
              {card.position}
            </span>
            {secondary.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, color: '#6f6552' }}>also</span>
                {secondary.map((p) => (
                  <span
                    key={p}
                    style={{
                      fontFamily: PIXEL,
                      fontSize: 8,
                      color: '#f2ead6',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '3px 5px',
                      borderRadius: 3,
                      border: `1px solid ${POSITION_COLOR[p] ?? '#9aa0a8'}`,
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — RECORD: Apps / Goals / Assists */}
        <div style={{ width: 108, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 2, color: '#9a8b6a' }}>RECORD</span>
          <RecordChip value={card.matchesPlayed ?? 0} label="APPS" color="#f2ead6" bg={CHIP_BG} />
          <RecordChip value={card.goals ?? 0} label="GOALS" color="#e8b23a" bg={CHIP_BG} />
          <RecordChip value={card.assists ?? 0} label="AST" color="#4a9eff" bg={CHIP_BG} />
        </div>
      </div>

      {/* ── ACTIONS ── */}
      <div style={{ padding: '13px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 2, color: '#9a8b6a' }}>ACTIONS</span>
          <span style={{ fontFamily: PIXEL, fontSize: 7, letterSpacing: 1, color: lc }}>{grade} {'·'} {actions.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 11 }}>
          {actions.map((a) => (
            <div key={a.key} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  borderRadius: 7,
                  background: 'linear-gradient(180deg, #241c10, #120d07)',
                  border: `1.5px solid ${a.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                }}
              >
                <span aria-hidden style={{ fontFamily: GLYPH_FONT, fontSize: 14, lineHeight: 1, color: a.classColor }}>{a.glyph}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 0.5, color: a.color, lineHeight: 1.15 }}>
                  {a.bonus ? '★ ' : ''}{a.label}
                </span>
                <span style={{ fontSize: 11, lineHeight: 1.42, color: '#e6dcc6' }}>{a.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One RECORD stat chip — value left-aligned against its label (Turn-9). */
function RecordChip({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', background: bg, border: '1px solid rgba(154,139,115,0.15)', borderRadius: 7, padding: '6px 9px' }}>
      <span style={{ fontFamily: PIXEL, fontSize: 16, color, textShadow: '0 2px 0 #0b0703' }}>{value}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 6, letterSpacing: 1, color: '#9a8b6a' }}>{label}</span>
    </div>
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
            color: 'var(--dust)',
            margin: 0,
          }}
        >
          {'“'}{manager.philosophy}{'”'}
        </p>
      </Panel>

      <Panel>
        <Label>EFFECT</Label>
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream)' }}>{manager.effect}</span>
        {/* Only the four contest-reworked gaffers name a contest — omitted otherwise. */}
        <ContestRow heading="RAISES" keys={contestsForManager(manager.id)} />
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

function TacticDetail({ tactic, charges, accent }: { tactic: TacticCard; charges?: number; accent: string }) {
  const contradicts = tactic.contradicts ? getTacticById(tactic.contradicts) : null;
  const capacity = tacticCapacity(tactic);
  const filled = charges == null ? capacity : Math.max(0, Math.min(capacity, charges));
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
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
          <StatCell label="RARITY" value={tactic.rarity.toUpperCase()} color={accent} />
          <StatCell label="CHARGES" value={`${filled} / ${capacity}`} color="var(--gold)" />
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <Label>EFFECT</Label>
          <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cream-soft)' }}>{tactic.effect}</span>
        </div>
        {/* RAISES — which contest(s) this call lifts (a neutral/enemy-debuff play shows none). */}
        <ContestRow heading="RAISES" keys={contestsForTactic(tactic.id)} />
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
            The opposite play to <b style={{ color: 'var(--cream)' }}>{contradicts.name}</b>.
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
