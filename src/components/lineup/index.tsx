'use client';

/**
 * Kickoff Clash — shared LINEUP surfaces.
 *
 * The pitch chip, the position tag, the fitness meter, the enriched bench tile
 * and the bench-cover summary — extracted from TeamTalk so both the run-start
 * draft (TeamSelect) and the pre-tie Team Talk render the SAME lineup, and the
 * two screens can never drift again. Everything here is pure display; callers
 * own their state, overlays and chrome. The only shared vocabulary is the Card
 * and the formation slot.
 *
 * Design law honoured here: the position TAG is a colour-keyed pixel code
 * (GK/CB/FB/DM/…) that never truncates in a 54px box — it replaces the old
 * word label that clipped to "RIGHT WI…". The pixel content stays crisp; the
 * glass lives on the tile frame, never on the sprite.
 */

import type { Card } from '../../lib/scoring';
import type { Formation } from '../../lib/formations';
import { PIXEL, RARITY_COLOR, POSITION_COLOR, lastName } from '../cards/cardTokens';

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
// `showFitness`/`showMisfit` let TeamSelect run a lighter chip (no injury/fitness
// state yet at draft time) while TeamTalk turns the full read on. The POSITION
// tag is always shown for both, empty and filled.
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
}: {
  slot: Formation['slots'][number];
  card: Card | undefined;
  justPlaced: boolean;
  onClick: () => void;
  onInspect?: () => void;
  showFitness?: boolean;
  showMisfit?: boolean;
  misfit?: boolean;
}) {
  const isGK = slot.type === 'GK';
  const kit = isGK ? '#16a34a' : 'var(--kit-red)';
  const rarityRing = card ? RARITY_COLOR[card.rarity] ?? 'var(--line-white)' : null;
  const activeMisfit = showMisfit && misfit;
  const ring = activeMisfit ? 'var(--danger)' : rarityRing;

  return (
    <button
      onClick={onClick}
      className="absolute flex flex-col items-center active:scale-95"
      style={{
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        transform: 'translate(-50%, -50%)',
        width: 56,
        transition: 'transform 0.1s ease',
      }}
    >
      {card ? (
        <div
          className={`relative flex items-center justify-center ${justPlaced ? 'chip-place' : ''}`}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 32%, ${kit}, ${isGK ? '#0f7a35' : '#b62520'})`,
            border: `2px solid ${ring}`,
            boxShadow: activeMisfit
              ? '0 0 0 2px var(--danger), 0 2px 0 0 var(--ink-black)'
              : '0 2px 0 0 var(--ink-black), 0 3px 5px rgba(0,0,0,0.4)',
          }}
        >
          <span
            style={{
              fontFamily: PIXEL,
              fontSize: 13,
              color: 'var(--line-white)',
              textShadow: '0 1px 0 rgba(0,0,0,0.6)',
            }}
          >
            {Math.round(card.power)}
          </span>
          {/* injured marker */}
          {showFitness && card.injured && (
            <span
              className="absolute"
              style={{
                top: -4,
                left: -4,
                width: 13,
                height: 13,
                borderRadius: '50%',
                background: 'var(--danger)',
                border: '1.5px solid var(--ink-black)',
                color: 'var(--line-white)',
                fontFamily: PIXEL,
                fontSize: 8,
                lineHeight: '10px',
                textAlign: 'center',
              }}
            >
              +
            </span>
          )}
          {/* inspect pip (tap chip = swap/clear; this = inspect) */}
          {onInspect && (
            <span
              role="button"
              aria-label={`Inspect ${lastName(card.name)}`}
              onClick={(e) => {
                e.stopPropagation();
                onInspect();
              }}
              className="absolute flex items-center justify-center"
              style={{
                // Fully outside the rating circle — at −3/−4 the pip clipped the
                // score digits; hung off the corner the number stays readable.
                bottom: -8,
                right: -9,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--surface)',
                border: '1.5px solid var(--line-white)',
                color: 'var(--line-white)',
                fontFamily: PIXEL,
                fontSize: 8,
                lineHeight: 1,
              }}
            >
              i
            </span>
          )}
        </div>
      ) : (
        <div
          className="slot-pulse flex items-center justify-center"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'rgba(7,16,11,0.45)',
            border: '2px dashed rgba(242,246,239,0.7)',
          }}
        >
          <span style={{ fontFamily: PIXEL, fontSize: 14, color: 'rgba(242,246,239,0.9)', lineHeight: 1 }}>
            +
          </span>
        </div>
      )}

      {/* POSITION code — slot's role when empty, the player's actual position when
          filled (danger-red when they can't cover this slot). Never truncates. */}
      <span style={{ marginTop: 3 }}>
        <span
          style={{
            fontFamily: PIXEL,
            fontSize: 8,
            lineHeight: 1,
            letterSpacing: 0.3,
            color: 'var(--ink-black)',
            background: activeMisfit
              ? 'var(--danger)'
              : card
                ? POSITION_COLOR[card.position] ?? 'var(--dust)'
                : 'rgba(242,246,239,0.85)',
            borderRadius: 3,
            padding: '2px 3px',
            border: '1px solid var(--ink-black)',
            display: 'inline-block',
          }}
        >
          {card ? card.position : slot.type}
        </span>
      </span>

      {showFitness && card && <FitnessBar card={card} width={34} />}

      {/* Surname when filled — the pixel name label. */}
      {card && (
        <span
          className="truncate text-center"
          style={{
            width: 58,
            marginTop: 2,
            fontSize: 8.5,
            fontWeight: 700,
            color: 'var(--line-white)',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
            lineHeight: 1.1,
          }}
        >
          {lastName(card.name)}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BenchTile — every sub reads its POSITION, rating, role + condition.
// The enriched tile that replaces bare number+surname bench chips.
// ---------------------------------------------------------------------------

export function BenchTile({
  card,
  onInspect,
  onRemove,
}: {
  card: Card;
  onInspect: () => void;
  onRemove: () => void;
}) {
  const ring = RARITY_COLOR[card.rarity] ?? 'var(--border)';
  return (
    <button
      onClick={onInspect}
      className="relative flex flex-col items-center active:scale-95 glass-surface overflow-hidden"
      style={{
        height: 62,
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${ring}`,
        boxShadow: `inset 0 1px 0 0 var(--glass-highlight), 0 0 8px ${ring}33, var(--depth-1)`,
        transition: 'transform 0.12s ease',
        minWidth: 0,
        paddingTop: 3,
      }}
    >
      {/* top row: POSITION tag + rating */}
      <span className="flex items-center justify-center gap-1 relative w-full px-0.5" style={{ zIndex: 2 }}>
        <PosTag position={card.position} />
        <span style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1, color: 'var(--line-white)' }}>
          {Math.round(card.power)}
        </span>
      </span>
      {/* surname */}
      <span
        className="truncate w-full text-center px-0.5 relative"
        style={{ fontSize: 7.5, color: 'var(--cream-soft)', marginTop: 2, zIndex: 2 }}
      >
        {lastName(card.name)}
      </span>
      {/* archetype short */}
      <span
        className="truncate w-full text-center px-0.5 relative"
        style={{ fontFamily: PIXEL, fontSize: 6.5, letterSpacing: 0.5, color: 'var(--dust)', marginTop: 1, zIndex: 2 }}
      >
        {archShort(card.archetype)}
      </span>
      {/* condition */}
      <span className="relative w-full px-1.5" style={{ marginTop: 'auto', marginBottom: 4, zIndex: 2 }}>
        <FitnessBar card={card} />
      </span>
      {/* injured marker */}
      {card.injured && (
        <span
          className="absolute"
          style={{
            top: 3,
            left: 3,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: 'var(--danger)',
            border: '1px solid var(--ink-black)',
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
      {/* remove */}
      <span
        role="button"
        aria-label={`Remove ${lastName(card.name)} from bench`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute flex items-center justify-center"
        style={{
          top: -5,
          right: -5,
          width: 16,
          height: 16,
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
    </button>
  );
}

// ---------------------------------------------------------------------------
// BenchCover — a one-glance read of which lines the bench can refresh,
// e.g. "DEF 2 · MID 3 · ATT 1".
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
    <span className="flex items-center gap-1.5 ml-auto">
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
