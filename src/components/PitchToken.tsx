'use client';

/**
 * Kickoff Clash — PitchToken: the ONE shared pitch player token (v4 squad-screen
 * handoff, direction 1a + Match). Used on BOTH the team-selection pitch
 * (SquadScreen, via LineupSlot) and the in-match pitch (PitchMatchView), so the
 * two surfaces can never drift.
 *
 * Anatomy (README › Player Token) — NO player picture (the kit is uniform):
 *   • Top row     — class GEM (left, ContestIcons.ClassGem) + POSITION pill whose
 *                   BACKGROUND encodes competence in the assigned slot
 *                   (COMPETENCE_COLOR: green primary / amber secondary / red misfit).
 *   • Power row   — a split bar: left half ATT (orange), right half DEF (blue), REAL
 *                   effective values. A buff/debuff shows as a small signed number
 *                   over the affected half (green +, red −): the delta = eff − printed.
 *   • Fitness bar — thin, no label: green ≥85 / amber ≥55 / red below.
 *   • Name        — one row, bottom.
 *
 * Reconciliation law: the FRAME is glassy rarity foil + sheen/glow; the INTERIOR
 * is crisp pixel content (flat blocks + Silkscreen). Depth lives on the frame,
 * never smudged into the pixels.
 *
 * Pure presentation. All interaction (drag / inspect / assign) lives on the
 * wrapping element in each screen's pitch loop.
 */

import type { Card } from '../lib/scoring';
import { PIXEL, lastName } from './cards/cardTokens';
import { rarityFrame, HERO } from './cards/portrait';
import { ClassGem } from './cards/ContestIcons';
import { classOfCard } from '../lib/contest-map';
import { COMPETENCE_COLOR, type Competence } from '../lib/team-select';

/** Handoff fitness band for the token bar (green ≥85 / amber ≥55 / red below). */
export function tokenFitnessColor(f: number): string {
  return f >= 85 ? '#3ba55d' : f >= 55 ? '#f59e0b' : '#c0392b';
}

const ATT_FILL = 'linear-gradient(180deg, #c0461f, #7f2c12)';
const DEF_FILL = 'linear-gradient(180deg, #2a5c9e, #17335c)';

export interface PitchTokenProps {
  card: Card;
  /** Competence in the slot the token occupies — colours the position pill. */
  competence: Competence;
  /** Effective ATK / DEF right now (the feedback numbers). */
  atk: number;
  def: number;
  /** Printed ATK / DEF — the delta (eff − printed) surfaces as the signed buff/debuff. */
  baseAtk: number;
  baseDef: number;
  /** 0–100 condition; the thin bottom bar. */
  fitness: number;
  injured?: boolean;
  /** Token width. A number (px) on the pitch (~62–64), or '100%' so a bench tile
   *  fills its grid cell as a smaller instance of the same token. */
  width?: number | string;
  /** MISFIT reveal (team-select): an amber outline on an incompetent token. */
  misfitReveal?: boolean;
  /** Fade the drag source. */
  dim?: boolean;
  /** Carrier glow during resolve. */
  glow?: boolean;
  /** Match-only status chips / overlays. */
  goals?: number;
  booked?: boolean;
  sentOff?: boolean;
  /** Opponent's most dangerous card — a gold star tag above. */
  isStar?: boolean;
  /** Tap the power row → open the modifier receipt (match only). */
  onStatTap?: () => void;
}

export function PitchToken({
  card,
  competence,
  atk,
  def,
  baseAtk,
  baseDef,
  fitness,
  injured = false,
  width = 64,
  misfitReveal = false,
  dim = false,
  glow = false,
  goals = 0,
  booked = false,
  sentOff = false,
  isStar = false,
  onStatTap,
}: PitchTokenProps) {
  const frameSpec = rarityFrame(card.rarity);
  const comp = COMPETENCE_COLOR[competence];
  const incompetent = competence === 'incompetent';
  const fitPct = Math.max(0, Math.min(100, injured ? Math.min(fitness, 33) : fitness));
  const fitCol = injured ? '#c0392b' : tokenFitnessColor(fitPct);
  const aDelta = atk - baseAtk;
  const dDelta = def - baseDef;
  const dstr = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '');
  const dcol = (n: number) => (n > 0 ? '#5fd08a' : n < 0 ? '#f0928c' : 'transparent');

  // The frame reddens on a genuine misfit; the MISFIT-reveal adds an amber ring.
  const outline = misfitReveal && incompetent ? '2px solid #f59e0b' : 'none';

  return (
    <div style={{ width, position: 'relative', opacity: dim ? 0.3 : 1 }} className={glow ? 'carrier-glow' : undefined}>
      {/* Event chips above (match): a goal ball + a yellow-card rect. */}
      {(goals > 0 || (booked && !sentOff)) && (
        <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 3, alignItems: 'center', zIndex: 7, pointerEvents: 'none' }}>
          {goals > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: PIXEL, fontSize: 6, color: HERO.cream, background: 'rgba(11,7,3,0.92)', border: `1px solid ${HERO.gold}66`, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {'⚽'}{goals > 1 ? goals : ''}
            </span>
          )}
          {booked && !sentOff && (
            <span aria-label="Booked" style={{ width: 6, height: 9, background: '#f5c542', border: `1px solid ${HERO.ink}`, borderRadius: 1 }} />
          )}
        </div>
      )}
      {isStar && (
        <span style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontFamily: PIXEL, fontSize: 7, color: HERO.ink, background: HERO.gold, padding: '2px 4px', borderRadius: 3, whiteSpace: 'nowrap', zIndex: 8, boxShadow: `0 1px 0 0 ${HERO.ink}` }}>{'★'} DANGER</span>
      )}

      {/* Glass rarity foil frame → crisp pixel interior. */}
      <div
        style={{
          position: 'relative',
          borderRadius: 8,
          padding: 2,
          background: incompetent ? 'linear-gradient(135deg, #e0332d, #7a1f1c)' : frameSpec.frame,
          boxShadow: isStar
            ? `0 3px 7px rgba(0,0,0,0.5), 0 0 12px rgba(232,178,60,0.5)`
            : '0 3px 7px rgba(0,0,0,0.5)',
          outline,
          outlineOffset: 1,
        }}
      >
        <div style={{ borderRadius: 6, border: `1px solid ${HERO.ink}`, overflow: 'hidden', background: '#14100a' }}>
          {/* Top row: class gem + competence-coloured position pill. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 3px 2px', background: 'rgba(11,7,3,0.5)' }}>
            <ClassGem cls={classOfCard(card)} size={16} />
            <span style={{ fontFamily: PIXEL, fontSize: 7, lineHeight: 1, color: comp.text, background: comp.bg, padding: '2px 4px', borderRadius: 3, border: '1px solid rgba(0,0,0,0.4)' }}>
              {card.position}
            </span>
          </div>

          {/* Power row: half ATT / half DEF + signed buff/debuff over each half. */}
          <div
            role={onStatTap ? 'button' : undefined}
            aria-label={onStatTap ? 'Power — tap for modifiers' : undefined}
            onPointerDown={onStatTap ? (e) => e.stopPropagation() : undefined}
            onClick={onStatTap ? (e) => { e.stopPropagation(); onStatTap(); } : undefined}
            style={{ position: 'relative', display: 'flex', height: 17, cursor: onStatTap ? 'pointer' : undefined }}
          >
            <div style={{ flex: 1, background: ATT_FILL, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${HERO.ink}` }}>
              <span style={{ fontFamily: PIXEL, fontSize: 9, color: '#fff', textShadow: '0 1px 1px #000' }}>{atk}</span>
            </div>
            <div style={{ flex: 1, background: DEF_FILL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 9, color: '#fff', textShadow: '0 1px 1px #000' }}>{def}</span>
            </div>
            {aDelta !== 0 && (
              <span style={{ position: 'absolute', left: 2, top: -2, fontFamily: PIXEL, fontSize: 7, color: dcol(aDelta), textShadow: '0 1px 2px #000' }}>{dstr(aDelta)}</span>
            )}
            {dDelta !== 0 && (
              <span style={{ position: 'absolute', right: 2, top: -2, fontFamily: PIXEL, fontSize: 7, color: dcol(dDelta), textShadow: '0 1px 2px #000' }}>{dstr(dDelta)}</span>
            )}
          </div>

          {/* Fitness bar — thin, no label. */}
          <div style={{ height: 4, background: '#241c10' }}>
            <div style={{ height: '100%', width: `${fitPct}%`, background: fitCol }} />
          </div>

          {/* Name — one row, bottom. */}
          <div style={{ padding: '3px 3px', background: 'rgba(11,7,3,0.72)', textAlign: 'center' }}>
            <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 6.5, color: HERO.cream, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lastName(card.name).toUpperCase()}
            </span>
          </div>
        </div>

        {/* Sent-off wash + red card. */}
        {sentOff && (
          <span aria-label="Sent off" style={{ position: 'absolute', inset: 2, borderRadius: 6, background: 'rgba(20,4,4,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
            <span style={{ width: 10, height: 14, background: '#e0332d', border: `1px solid ${HERO.ink}`, borderRadius: 1.5, transform: 'rotate(8deg)', boxShadow: `0 1px 0 0 ${HERO.ink}` }} />
          </span>
        )}
        {/* Injured corner flag. */}
        {injured && !sentOff && (
          <span className="absolute" style={{ position: 'absolute', top: -5, left: -5, width: 13, height: 13, borderRadius: '50%', background: '#c0392b', border: `1.5px solid ${HERO.ink}`, color: '#fff', fontFamily: PIXEL, fontSize: 8, lineHeight: '10px', textAlign: 'center', zIndex: 4 }}>+</span>
        )}
      </div>
    </div>
  );
}
