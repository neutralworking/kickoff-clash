'use client';

/**
 * Rebuild card tile — the SM §9 regime pre-evaluation surface: every trait
 * pill renders LIT (the engine feeds it) or DIM (dormant under this manager).
 * Function before flourish; the full card-designer treatment is Phase 6.
 */

import type { EngineCard } from '../../engine/cards';
import { traitIsLit } from '../../engine/draft';
import { PIXEL_FONT } from './RebuildShell';

const RARITY_ACCENT: Record<string, string> = {
  Common: '#9aa0a8',
  Rare: '#3d7bd6',
  Epic: '#a855f7',
  Legendary: 'var(--gold)',
};

export default function RCard({
  card,
  sigs,
  onClick,
  selected,
  tag,
}: {
  card: EngineCard;
  sigs: Set<string>;
  onClick?: () => void;
  selected?: boolean;
  /** Small right-aligned label (price, slot, SELL value…). */
  tag?: string;
}) {
  const accent = RARITY_ACCENT[card.rarity] ?? 'var(--dust)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="active:scale-95"
      style={{
        textAlign: 'left',
        width: '100%',
        borderRadius: 'var(--radius-sm)',
        border: `2px solid ${selected ? 'var(--amber)' : 'var(--ink-black)'}`,
        borderLeft: `4px solid ${accent}`,
        background: selected ? 'rgba(255,122,31,0.10)' : 'var(--surface)',
        padding: '8px 10px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 6 }}>
        <div className="flex items-center" style={{ gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontFamily: PIXEL_FONT,
              fontSize: 8,
              padding: '3px 4px',
              borderRadius: 3,
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              color: 'var(--cream-soft)',
              flexShrink: 0,
            }}
          >
            {card.position}
          </span>
          <span className="truncate" style={{ fontFamily: PIXEL_FONT, fontSize: 10, color: 'var(--cream)' }}>
            {card.name.toUpperCase()}
          </span>
        </div>
        {tag && (
          <span style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--gold)', flexShrink: 0 }}>{tag}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: 4, marginTop: 6 }}>
        {card.traits.map((t, i) => {
          const lit = traitIsLit(t, sigs);
          return (
            <span
              key={`${t.templateId}-${i}`}
              style={{
                fontFamily: PIXEL_FONT,
                fontSize: 7.5,
                letterSpacing: 0.3,
                padding: '3px 5px',
                borderRadius: 3,
                border: `1px solid ${lit ? 'var(--gold)' : 'var(--border)'}`,
                color: lit ? 'var(--gold)' : 'var(--ink)',
                background: lit ? 'rgba(232,178,60,0.12)' : 'transparent',
              }}
              title={lit ? 'Lit: your engine feeds this trait' : 'Dormant under this manager'}
            >
              {lit ? '◆ ' : '◇ '}
              {t.name.toUpperCase()}
            </span>
          );
        })}
        <span style={{ fontFamily: PIXEL_FONT, fontSize: 7.5, color: 'var(--ink)', marginLeft: 'auto' }}>
          BASE {card.baseContribution.toFixed(2)}
        </span>
      </div>
    </button>
  );
}
