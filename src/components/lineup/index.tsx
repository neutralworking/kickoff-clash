'use client';

/**
 * Kickoff Clash — shared LINEUP surfaces.
 *
 * The pitch chip, the position tag, the fitness meter, the enriched bench tile
 * and the bench-cover summary — consumed by the unified SquadScreen (which
 * serves both the run-start draft and the between-ties team talk, so the two
 * phases can never drift). Everything here is pure display plus pass-through
 * pointer handlers for the screen's drag layer; callers own their state,
 * overlays and chrome. The only shared vocabulary is the Card and the
 * formation slot.
 *
 * Design law honoured here: the position TAG is a colour-keyed pixel code
 * (GK/CB/FB/DM/…) that never truncates in a 54px box — it replaces the old
 * word label that clipped to "RIGHT WI…". The pixel content stays crisp; the
 * glass lives on the tile frame, never on the sprite.
 */

import type { PointerEventHandler } from 'react';
import type { Card } from '../../lib/scoring';
import type { Formation } from '../../lib/formations';
import { PIXEL, POSITION_COLOR, lastName } from '../cards/cardTokens';
import { deriveStats } from '../../lib/funnel';
import { portraitBackgroundStyle, rarityFrame, HERO } from '../cards/portrait';

// ---------------------------------------------------------------------------
// Condition glyph (§7) — the 5-grade wear read shown on the selection tile
// footer: ◆ for the intact grades (mint/played), ◢ for the worn grades
// (worn/creased/torn), tinted by grade. Mirrors the CONDG map in the handoff.
// ---------------------------------------------------------------------------

const CONDITION_GLYPH: Record<string, { glyph: string; color: string }> = {
  MINT: { glyph: '◆', color: '#1f9d4f' },
  PLAYED: { glyph: '◆', color: '#c9bb95' },
  WORN: { glyph: '◢', color: '#e8b23a' },
  CREASED: { glyph: '◢', color: '#e0332d' },
  TORN: { glyph: '◢', color: '#e0332d' },
};
function conditionGlyph(card: Card): { glyph: string; color: string } {
  return CONDITION_GLYPH[card.condition ?? 'MINT'] ?? CONDITION_GLYPH.MINT;
}

// ---------------------------------------------------------------------------
// Pointer pass-through — the SquadScreen drag layer disambiguates tap (inspect/
// assign) from drag (move) on the wrapping element; these props just forward
// the raw events. touch-action is set by the host so the browser never steals
// the gesture mid-drag.
// ---------------------------------------------------------------------------

export interface DragPointerHandlers {
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
}

// ---------------------------------------------------------------------------
// Fitness read — mirrors the engine's fitnessOf (injured cards start low).
// Kept here so every lineup surface reads condition identically.
// ---------------------------------------------------------------------------

export const fitnessOf = (c: Card): number => c.fitness ?? (c.injured ? 2 : 6);
const LOW_FITNESS = 2.5; // engine injury-risk threshold (advanceIncrement)

export function fitnessColor(c: Card): string {
  if (c.injured) return 'var(--danger)';
  const f = fitnessOf(c);
  if (f >= 4) return 'var(--success)';
  if (f >= LOW_FITNESS) return 'var(--gold)';
  return 'var(--danger)';
}

export function fitnessLabel(c: Card): string {
  if (c.injured) return 'INJ';
  const f = fitnessOf(c);
  if (f >= 4.5) return 'FRESH';
  if (f >= 3) return 'OK';
  if (f >= LOW_FITNESS) return 'TIRED';
  return 'SPENT';
}

// A compact 3-letter archetype tag for dense readouts (the card carries the full word).
export function archShort(a?: string): string {
  if (!a) return '';
  if (a === 'GK' || a === 'Shotstopper') return 'GK';
  return a.slice(0, 3).toUpperCase();
}

// ---------------------------------------------------------------------------
// PosTag — a small pixel position code, colour-keyed to POSITION_COLOR.
// The defining read that never clips: GK / CB / FB / DM / CM / WM / AM / WF / CF.
// `misfit` flips it to the danger colour so an out-of-position starter is loud.
// ---------------------------------------------------------------------------

export function PosTag({
  position,
  size = 'sm',
  misfit = false,
}: {
  position: string;
  size?: 'sm' | 'md';
  misfit?: boolean;
}) {
  const bg = misfit ? 'var(--danger)' : POSITION_COLOR[position] ?? 'var(--dust)';
  const fs = size === 'md' ? 9 : 8;
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: fs,
        lineHeight: 1,
        letterSpacing: 0.3,
        color: 'var(--ink-black)',
        background: bg,
        borderRadius: 3,
        padding: size === 'md' ? '2.5px 4px' : '2px 3px',
        border: '1px solid var(--ink-black)',
        display: 'inline-block',
      }}
    >
      {position}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FitnessBar — a compact condition meter (the headline read of the lineup).
// ---------------------------------------------------------------------------

export function FitnessBar({ card, width = '100%' }: { card: Card; width?: number | string }) {
  const f = fitnessOf(card);
  const pct = Math.max(0, Math.min(1, (f - 1) / 5)); // 1→0, 6→1
  return (
    <div
      style={{
        width,
        height: 3,
        borderRadius: 2,
        marginTop: 2,
        background: 'rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${pct * 100}%`, height: '100%', background: fitnessColor(card) }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LineupSlot — the top-down pitch chip. Filled = rating + POSITION tag + fitness
// + surname; empty = a dashed target with the slot's role code (never the long
// word — that is the truncation bug this component exists to kill).
//
// Interaction is owner-driven: an empty slot takes `onClick` (open the assign
// sheet); a filled slot takes the drag pointer handlers (tap = fallback sheet,
// drag = move — disambiguated by the host). `dim` fades the drag source;
// `dropHint` rings the chip gold while a dragged player hovers it.
// ---------------------------------------------------------------------------

export function LineupSlot({
  slot,
  card,
  justPlaced,
  onClick,
  onInspect,
  showFitness = false,
  showMisfit = false,
  misfit = false,
  dim = false,
  dropHint = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  slot: Formation['slots'][number];
  card: Card | undefined;
  justPlaced: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  showFitness?: boolean;
  showMisfit?: boolean;
  misfit?: boolean;
  dim?: boolean;
  dropHint?: boolean;
} & DragPointerHandlers) {
  const activeMisfit = showMisfit && misfit;
  const frameSpec = card ? rarityFrame(card.rarity) : null;
  const posColor = card ? POSITION_COLOR[card.position] ?? 'var(--dust)' : 'var(--dust)';

  return (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="absolute flex flex-col items-center active:scale-95"
      style={{
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        transform: `translate(-50%, -50%)${dropHint ? ' scale(1.12)' : ''}`,
        width: 58,
        transition: 'transform 0.1s ease',
        touchAction: onPointerDown ? 'none' : undefined,
        opacity: dim ? 0.3 : 1,
        zIndex: dropHint ? 6 : undefined,
      }}
    >
      {card && frameSpec ? (
        // §7 selection tile — foil frame → pixel interior (pos + ATK/DEF, portrait,
        // name + condition glyph, fitness bar). A problem slot (misfit / dropHint)
        // gets a coloured outline; injured keeps a small corner flag.
        <div
          className={`relative ${justPlaced ? 'chip-place' : ''}`}
          style={{
            width: 58,
            borderRadius: 7,
            padding: 2,
            background: activeMisfit ? 'linear-gradient(135deg, #e0332d, #7a1f1c)' : frameSpec.frame,
            boxShadow: dropHint
              ? `0 0 0 3px var(--gold-glow), 0 2px 0 0 ${HERO.ink}`
              : `0 2px 0 0 ${HERO.ink}, 0 4px 8px rgba(0,0,0,0.45)`,
            outline: dropHint ? '2px solid var(--gold)' : activeMisfit ? '2px solid #e0332d' : 'none',
            outlineOffset: 1,
          }}
        >
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 5, border: `1.5px solid ${HERO.ink}`, background: 'linear-gradient(165deg, #2f2415, #191309)' }}>
            {/* header: position chip + printed ATK/DEF */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 3px 0' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 4.5, lineHeight: 1, color: HERO.badgeText, background: activeMisfit ? '#e0332d' : posColor, padding: '1.5px 2.5px', borderRadius: 2 }}>{card.position}</span>
              {(() => { const st = deriveStats(card); return (
                <span style={{ fontFamily: PIXEL, fontSize: 7, lineHeight: 1, color: HERO.cream, fontVariantNumeric: 'tabular-nums' }}>{st.atk}/{st.def}</span>
              ); })()}
            </div>
            {/* portrait window (26px) — the seeded pixel bust */}
            <div style={{ height: 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'radial-gradient(90% 80% at 50% 30%, rgba(232,178,60,0.14), transparent 72%)' }}>
              <div className="pixelated" aria-hidden style={{ ...portraitBackgroundStyle(card.id), width: '58%', height: '100%' }} />
            </div>
            {/* footer: name + condition glyph */}
            <div style={{ padding: '1px 3px 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
              <span style={{ fontFamily: PIXEL, fontSize: 4.5, lineHeight: 1.2, color: HERO.cream, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastName(card.name)}</span>
              {(() => { const g = conditionGlyph(card); return (
                <span aria-label={`Condition ${card.condition ?? 'MINT'}`} style={{ fontFamily: PIXEL, fontSize: 4.5, lineHeight: 1, color: g.color, flexShrink: 0 }}>{g.glyph}</span>
              ); })()}
            </div>
            {/* fitness bar (3px) */}
            <div style={{ height: 3, background: 'rgba(0,0,0,0.5)' }}>
              <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, (fitnessOf(card) - 1) / 5)) * 100}%`, background: fitnessColor(card) }} />
            </div>
          </div>
          {/* injured corner flag */}
          {showFitness && card.injured && (
            <span className="absolute" style={{ top: -5, left: -5, width: 13, height: 13, borderRadius: '50%', background: 'var(--danger)', border: `1.5px solid ${HERO.ink}`, color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 8, lineHeight: '10px', textAlign: 'center', zIndex: 3 }}>+</span>
          )}
          {/* inspect pip — tap the tile = assign sheet; this = inspect the card. */}
          {onInspect && (
            <span
              role="button"
              aria-label={`Inspect ${lastName(card.name)}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onInspect(); }}
              className="absolute flex items-center justify-center"
              style={{ bottom: -7, right: -7, width: 14, height: 14, borderRadius: '50%', background: HERO.ink, border: '1.5px solid var(--line-white)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1, zIndex: 3 }}
            >i</span>
          )}
        </div>
      ) : (
        <>
          <div
            className="slot-pulse flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(7,16,11,0.45)',
              border: dropHint ? '2px solid var(--gold)' : '2px dashed rgba(242,246,239,0.7)',
              boxShadow: dropHint ? '0 0 0 3px var(--gold-glow)' : undefined,
            }}
          >
            <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'rgba(242,246,239,0.9)', lineHeight: 1 }}>+</span>
          </div>
          {/* empty slot role code */}
          <span style={{ marginTop: 3, fontFamily: PIXEL, fontSize: 8, lineHeight: 1, letterSpacing: 0.3, color: 'var(--ink-black)', background: 'rgba(242,246,239,0.85)', borderRadius: 3, padding: '2px 3px', border: '1px solid var(--ink-black)' }}>{slot.type}</span>
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BenchTile — every sub reads its POSITION, rating, role + condition.
// Also serves the RESERVES strip (no onRemove there; touch-action pan-x so the
// strip still scrolls sideways while a vertical pull starts a drag).
// ---------------------------------------------------------------------------

export function BenchTile({
  card,
  onRemove,
  dim = false,
  dropHint = false,
  touchAction,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  card: Card;
  onRemove?: () => void;
  dim?: boolean;
  dropHint?: boolean;
  touchAction?: 'none' | 'pan-x';
} & DragPointerHandlers) {
  const frameSpec = rarityFrame(card.rarity);
  const posColor = POSITION_COLOR[card.position] ?? 'var(--dust)';
  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-label={lastName(card.name)}
      className="relative flex flex-col active:scale-95"
      style={{
        width: '100%',
        borderRadius: 5,
        padding: 2,
        background: frameSpec.frame,
        boxShadow: dropHint
          ? `0 0 0 2px var(--gold-glow), 0 2px 0 0 ${HERO.ink}`
          : `0 2px 0 0 ${HERO.ink}, 0 3px 6px rgba(0,0,0,0.4)`,
        outline: dropHint ? '2px solid var(--gold)' : 'none',
        transition: 'transform 0.12s ease',
        minWidth: 0,
        opacity: dim ? 0.3 : 1,
        touchAction: touchAction ?? (onPointerDown ? 'none' : undefined),
      }}
    >
      <div style={{ overflow: 'hidden', borderRadius: 3, border: `1px solid ${HERO.ink}`, background: 'linear-gradient(165deg, #2f2415, #191309)', width: '100%' }}>
        {/* header: position chip + ATK/DEF */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 3px 0' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 4.5, lineHeight: 1, color: HERO.badgeText, background: posColor, padding: '1px 2px', borderRadius: 2 }}>{card.position}</span>
          {(() => { const st = deriveStats(card); return (
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, lineHeight: 1, color: HERO.cream, fontVariantNumeric: 'tabular-nums' }}>{st.atk}/{st.def}</span>
          ); })()}
        </div>
        {/* portrait window (24px) */}
        <div style={{ height: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="pixelated" aria-hidden style={{ ...portraitBackgroundStyle(card.id), width: '60%', height: '100%' }} />
        </div>
        {/* surname + condition glyph */}
        <div style={{ padding: '0 3px 1px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 4.5, lineHeight: 1.2, color: HERO.cream, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastName(card.name)}</span>
          {(() => { const g = conditionGlyph(card); return (
            <span style={{ fontFamily: PIXEL, fontSize: 4.5, lineHeight: 1, color: g.color, flexShrink: 0 }}>{g.glyph}</span>
          ); })()}
        </div>
        {/* fitness bar (2px) */}
        <div style={{ height: 2, background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, (fitnessOf(card) - 1) / 5)) * 100}%`, background: fitnessColor(card) }} />
        </div>
      </div>
      {/* injured marker */}
      {card.injured && (
        <span
          className="absolute"
          style={{
            top: -4,
            left: -4,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: 'var(--danger)',
            border: `1px solid ${HERO.ink}`,
            color: 'var(--line-white)',
            fontFamily: PIXEL,
            fontSize: 7,
            lineHeight: '9px',
            textAlign: 'center',
            zIndex: 3,
          }}
        >
          +
        </span>
      )}
      {/* remove — pointerdown is stopped so the × never begins a drag. */}
      {onRemove && (
        <span
          role="button"
          aria-label={`Remove ${lastName(card.name)} from bench`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute flex items-center justify-center"
          style={{
            top: -5,
            right: -5,
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: 'var(--danger)',
            border: '1.5px solid var(--ink-black)',
            color: 'var(--line-white)',
            fontFamily: PIXEL,
            fontSize: 9,
            lineHeight: 1,
            zIndex: 3,
          }}
        >
          {'×'}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BenchCover — a one-glance read of which lines the bench can refresh,
// e.g. "DEF 2 · MID 3 · ATT 1". Positioning is the caller's.
// ---------------------------------------------------------------------------

export function BenchCover({ benchCards }: { benchCards: Card[] }) {
  const LINE: Record<string, 'GK' | 'DEF' | 'MID' | 'ATT'> = {
    GK: 'GK',
    CD: 'DEF',
    WD: 'DEF',
    DM: 'MID',
    CM: 'MID',
    WM: 'MID',
    AM: 'MID',
    WF: 'ATT',
    CF: 'ATT',
  };
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const c of benchCards) counts[LINE[c.position] ?? 'MID']++;
  const parts: { k: string; n: number; color: string }[] = [
    { k: 'GK', n: counts.GK, color: POSITION_COLOR.GK },
    { k: 'DEF', n: counts.DEF, color: POSITION_COLOR.CD },
    { k: 'MID', n: counts.MID, color: POSITION_COLOR.CM },
    { k: 'ATT', n: counts.ATT, color: POSITION_COLOR.CF },
  ].filter((p) => p.n > 0);
  if (!parts.length) return null;
  return (
    <span className="flex items-center gap-1.5">
      {parts.map((p) => (
        <span
          key={p.k}
          className="flex items-center gap-0.5"
          style={{ fontFamily: PIXEL, fontSize: 7.5, letterSpacing: 0.3, color: 'var(--cream-soft)' }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          {p.k} {p.n}
        </span>
      ))}
    </span>
  );
}
