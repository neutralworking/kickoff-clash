'use client';

/**
 * KC six-contest UI (NW-143) — the engine-v2 card face.
 *
 * Renders a `KCCard` in the pixel house style with its six-contest identity
 * (contest + tilt), printed ATK/DEF, and its catalogue ACTION. The `regime`
 * prop is the SM §9 pre-evaluation: lit = this card feeds the manager's
 * commitment, dim = neutral, red = off-position / wrong contest. Selection
 * state rings the frame. Presentational — the caller computes the regime.
 */

import type { CSSProperties } from 'react';
import type { KCCard } from '../../engine-v2';
import { cardTraits } from '../../engine-v2';
import { PIXEL, CONTEST_COLOR } from './ui';
import { POSITION_COLOR } from '../cards/cardTokens';
import { portraitBackgroundStyle, rarityFrame, HERO } from '../cards/portrait';

export type Regime = 'lit' | 'dim' | 'red';

const REGIME_RING: Record<Regime, string | null> = {
  lit: '0 0 0 2px var(--gold)',
  dim: null,
  red: '0 0 0 2px var(--kit-red)',
};

/**
 * The six-contest /play card — same "Pixel Hero" face as the live game (foil frame
 * by rarity + seeded 16-bit portrait), extended with its contest/tilt dial. The
 * `regime` is the SM §9 pre-evaluation ring (lit feeds commitment, red is
 * off-contest, dim is neutral); selection rings gold.
 */
export default function PCard({
  card,
  regime = 'dim',
  selected,
  onClick,
  compact,
  style,
}: {
  card: KCCard;
  regime?: Regime;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  style?: CSSProperties;
}) {
  const action = cardTraits(card)[0];
  const posColor = POSITION_COLOR[card.pos] ?? '#9aa0a8';
  const contestColor = CONTEST_COLOR[card.contest];
  const fr = rarityFrame(card.rarity);
  const ring = selected ? '0 0 0 2px var(--gold)' : REGIME_RING[regime];

  return (
    <button
      type="button"
      onClick={onClick}
      className={onClick ? 'active:scale-95' : undefined}
      style={{
        textAlign: 'left',
        display: 'flex',
        padding: 3,
        borderRadius: 8,
        background: fr.frame,
        boxShadow: [ring, fr.glow].filter(Boolean).join(', '),
        opacity: regime === 'red' && !selected ? 0.78 : 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 80ms',
        minWidth: 0,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          borderRadius: 5,
          border: `1.5px solid ${HERO.ink}`,
          background: HERO.faceGradient,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* header: position badge + ATK/DEF */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4, padding: '5px 5px 0' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 6, lineHeight: 1, color: HERO.badgeText, background: posColor, padding: '2px 4px', borderRadius: 2, border: `1px solid ${HERO.ink}` }}>
            {card.pos}
          </span>
          <div style={{ display: 'flex', gap: 5 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1, color: HERO.cream, textShadow: `0 1px 0 ${HERO.ink}` }}>
              {card.att}
              <span style={{ fontSize: 6, color: HERO.atk, marginLeft: 1 }}>A</span>
            </span>
            <span style={{ fontFamily: PIXEL, fontSize: 11, lineHeight: 1, color: HERO.creamBody, textShadow: `0 1px 0 ${HERO.ink}` }}>
              {card.def}
              <span style={{ fontSize: 6, color: HERO.def, marginLeft: 1 }}>D</span>
            </span>
          </div>
        </div>

        {/* seeded 16-bit portrait window */}
        <div style={{ position: 'relative', flex: 1, minHeight: compact ? 40 : 48, marginTop: 2, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'radial-gradient(90% 80% at 50% 30%, rgba(232,178,60,0.16), transparent 72%)' }}>
          <div className="pixelated" aria-hidden style={{ ...portraitBackgroundStyle(card.id), width: '100%', height: '94%' }} />
        </div>

        {/* name */}
        <div style={{ fontFamily: PIXEL, fontSize: 8, color: HERO.cream, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '4px 5px 2px' }}>
          {card.name}
        </div>

        {/* gold role band */}
        <div style={{ background: HERO.roleBandMini, borderTop: `1px solid ${HERO.ink}`, borderBottom: `1px solid ${HERO.ink}`, padding: '2px 5px' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 6, color: '#171207', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{card.role}</span>
        </div>

        {/* contest+tilt dial + action */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, padding: '4px 5px 5px' }}>
          <span style={{ fontFamily: PIXEL, fontSize: 6.5, color: contestColor, border: `1px solid ${contestColor}`, borderRadius: 3, padding: '1px 3px', flexShrink: 0 }}>
            {card.contest} +{card.tilt}
          </span>
          {!compact && (
            <span style={{ fontFamily: PIXEL, fontSize: 6.5, color: HERO.gold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {action ? action.name : '—'}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
