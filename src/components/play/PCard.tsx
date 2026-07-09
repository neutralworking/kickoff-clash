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
import { POSITION_COLOR, RARITY_COLOR } from '../cards/cardTokens';

export type Regime = 'lit' | 'dim' | 'red';

const REGIME_EDGE: Record<Regime, string> = {
  lit: 'var(--gold)',
  dim: 'var(--border)',
  red: 'var(--kit-red)',
};

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
  const posColor = POSITION_COLOR[card.pos] ?? 'var(--dust)';
  const contestColor = CONTEST_COLOR[card.contest];
  const rarityColor = RARITY_COLOR[card.rarity] ?? 'var(--dust)';
  const edge = selected ? 'var(--gold)' : REGIME_EDGE[regime];

  return (
    <button
      type="button"
      onClick={onClick}
      className={onClick ? 'active:scale-95' : undefined}
      style={{
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 7,
        borderRadius: 8,
        border: `2px solid ${edge}`,
        background: 'linear-gradient(165deg, #2f2415, #221a0f 55%, #120d07)',
        boxShadow: selected ? '0 0 0 2px var(--gold), 0 3px 0 0 var(--ink-black)' : '0 3px 0 0 var(--ink-black)',
        opacity: regime === 'red' && !selected ? 0.72 : 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 80ms',
        minWidth: 0,
        ...style,
      }}
    >
      {/* header: position badge + ATK/DEF */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--line-white, #fff)', background: posColor, padding: '2px 4px', borderRadius: 3, border: '1px solid var(--ink-black)' }}>
          {card.pos}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 11, color: '#f2ead6' }}>
            {card.att}
            <span style={{ fontSize: 6, color: '#e0332d', marginLeft: 1 }}>A</span>
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 11, color: '#c9bb95' }}>
            {card.def}
            <span style={{ fontSize: 6, color: '#2b74e0', marginLeft: 1 }}>D</span>
          </span>
        </div>
      </div>

      {/* name */}
      <div style={{ fontFamily: PIXEL, fontSize: compact ? 8 : 9.5, color: '#f2ead6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {card.name}
      </div>

      {/* contest + tilt dial */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: contestColor, border: `1px solid ${contestColor}`, borderRadius: 3, padding: '1px 4px' }}>
          {card.contest} +{card.tilt}
        </span>
        {!compact && <span style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.role}</span>}
      </div>

      {/* action + rarity */}
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginTop: 1 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: '#e8b23a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {action ? `◆ ${action.name}` : '—'}
          </span>
          <span style={{ fontFamily: PIXEL, fontSize: 6, color: rarityColor }}>{card.rarity[0]}</span>
        </div>
      )}
    </button>
  );
}
