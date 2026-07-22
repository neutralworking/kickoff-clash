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
import { HERO, fitnessColor as fitnessColorForPct } from '../cards/portrait';
import { PitchToken } from '../PitchToken';
import { V6PitchCard } from '../match-v6/V6PitchCard';
import type { V6Card } from '../../lib/match-v6';
import { competenceOf, type Competence } from '../../lib/team-select';
import { pitchAxis } from '../../lib/pitch-layout';

// FIX 2 — token-fit insets for the team-select pitch. A LineupSlot token is
// SLOT_TOKEN_W wide, so a raw slot x at the formation extremes (wing-backs at
// x≈8, wingers at x≈92) spills half the token off the green. The slot's x/y is
// remapped into a safe interior band inset by half a token (+edge pad), so the
// FULL token stays inside the pitch. Exported so SquadScreen's drag hit-testing
// uses the identical maths and the drop targets never drift from the render.
const SLOT_TOKEN_W = 64;
export const SLOT_INSET_X = SLOT_TOKEN_W / 2 + 7; // 39px
export const SLOT_INSET_Y = SLOT_TOKEN_W / 2 + 2; // 34px — just past half the token; avoids
                                                  // over-compressing the shape onto the middle band

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

export const fitnessOf = (c: Card): number => c.fitness ?? (c.injured ? 33 : 100);
const LOW_FITNESS = 50; // engine injury-risk threshold (advanceIncrement)

// Colour is the canonical 0–100 band fn (portrait.ts) — the single source of truth,
// so this surface can't drift from the pitch/card. Injured is always danger-red.
export function fitnessColor(c: Card): string {
  if (c.injured) return 'var(--danger)';
  return fitnessColorForPct(fitnessOf(c));
}

export function fitnessLabel(c: Card): string {
  if (c.injured) return 'INJ';
  const f = fitnessOf(c);
  if (f >= 75) return 'FRESH';
  if (f >= 50) return 'OK';
  if (f >= 25) return 'TIRED';
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
  const pct = Math.max(0, Math.min(1, f / 100)); // 0→0, 100→1
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
  v6card,
  justPlaced,
  onClick,
  onInspect,
  competence,
  stats,
  misfitReveal = false,
  dim = false,
  dropHint = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  slot: Formation['slots'][number];
  card: Card | undefined;
  /** When set, render the unified V6 token (portrait/cost/pos/ATT-DEF/action) so
   *  team-select reads like the match. Falls back to the legacy PitchToken. */
  v6card?: V6Card;
  justPlaced: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  /** Competence in this slot — colours the token's position pill. Defaults from
   *  the card's position vs the slot when not supplied. */
  competence?: Competence;
  /** Live effective + printed ATK/DEF (previewSplit.cardStats). Falls back to the
   *  printed stats (deriveStats) when the projection isn't available yet. */
  stats?: { atk: number; def: number; baseAtk: number; baseDef: number };
  /** MISFIT-chip reveal → an amber outline on an incompetent token. */
  misfitReveal?: boolean;
  dim?: boolean;
  dropHint?: boolean;
} & DragPointerHandlers) {
  const comp: Competence = competence ?? (card ? competenceOf(card.position, slot) : 'primary');

  return (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="absolute flex flex-col items-center active:scale-95"
      style={{
        left: pitchAxis(slot.x, SLOT_INSET_X),
        top: pitchAxis(slot.y, SLOT_INSET_Y),
        transform: `translate(-50%, -50%)${dropHint ? ' scale(1.12)' : ''}`,
        width: 64,
        transition: 'transform 0.1s ease',
        touchAction: onPointerDown ? 'none' : undefined,
        opacity: dim ? 0.3 : 1,
        zIndex: dropHint ? 6 : undefined,
      }}
    >
      {card ? (
        // v4 shared pitch token. A drop target rings it gold via the wrapper below.
        <div
          className={`relative ${justPlaced ? 'chip-place' : ''}`}
          style={{ borderRadius: 8, boxShadow: dropHint ? '0 0 0 3px var(--gold-glow)' : undefined, outline: dropHint ? '2px solid var(--gold)' : 'none', outlineOffset: 1 }}
        >
          {v6card ? (
            <V6PitchCard card={v6card} outOfPosition={comp !== 'primary'} />
          ) : (() => {
            const s = stats ?? (() => { const d = deriveStats(card); return { atk: d.atk, def: d.def, baseAtk: d.atk, baseDef: d.def }; })();
            return (
              <PitchToken
                card={card}
                competence={comp}
                atk={s.atk}
                def={s.def}
                baseAtk={s.baseAtk}
                baseDef={s.baseDef}
                fitness={fitnessOf(card)}
                injured={card.injured}
                misfitReveal={misfitReveal}
                width={64}
              />
            );
          })()}
          {/* inspect pip — tap the tile = assign sheet; this = inspect the card. */}
          {onInspect && (
            <span
              role="button"
              aria-label={`Inspect ${lastName(card.name)}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onInspect(); }}
              className="absolute flex items-center justify-center"
              style={{ bottom: -7, right: -7, width: 14, height: 14, borderRadius: '50%', background: HERO.ink, border: '1.5px solid var(--line-white)', color: 'var(--line-white)', fontFamily: PIXEL, fontSize: 8, lineHeight: 1, zIndex: 5 }}
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
  v6card,
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
  /** When set, render the unified V6 token instead of the legacy PitchToken. */
  v6card?: V6Card;
  onRemove?: () => void;
  dim?: boolean;
  dropHint?: boolean;
  touchAction?: 'none' | 'pan-x';
} & DragPointerHandlers) {
  // FIX 3 — the bench sub reads as a SMALLER, pictureless PitchToken: the same
  // class gem + competence-coloured position pill + ATT/DEF split bar + fitness
  // bar + name, with NO portrait — so the bench and the pitch are one visual
  // language ("the same player tokens, smaller"). A bench player is shown at his
  // own natural position, so competence is 'primary'. Injured reads through the
  // token's own red frame + corner flag (PitchToken owns that).
  const st = deriveStats(card);
  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-label={lastName(card.name)}
      className="relative flex active:scale-95"
      style={{
        width: '100%',
        borderRadius: 8,
        boxShadow: dropHint ? '0 0 0 2px var(--gold-glow)' : undefined,
        outline: dropHint ? '2px solid var(--gold)' : 'none',
        outlineOffset: 1,
        transition: 'transform 0.12s ease',
        minWidth: 0,
        padding: 0,
        background: 'none',
        border: 'none',
        touchAction: touchAction ?? (onPointerDown ? 'none' : undefined),
      }}
    >
      {v6card ? (
        <V6PitchCard card={v6card} dim={dim} />
      ) : (
        <PitchToken
          card={card}
          competence="primary"
          atk={st.atk}
          def={st.def}
          baseAtk={st.atk}
          baseDef={st.def}
          fitness={fitnessOf(card)}
          injured={card.injured}
          dim={dim}
          width="100%"
        />
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
