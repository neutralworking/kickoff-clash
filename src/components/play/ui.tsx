'use client';

/**
 * KC six-contest UI (NW-143, P5) — shared pixel primitives.
 *
 * The engine-v2 game loop's screens (manager → fixture → squad → match →
 * post-match → shop → summary) all render from these, so the black-and-gold
 * pixel house style stays one family. Presentational only — no engine imports.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Contest } from '../../engine-v2';

export const PIXEL = 'var(--font-pixel)';

/** The six contests, coloured by family: KEEP/CREATE possession-gold, PRESS/BREAK
 *  ball-winning blue, FINISH kit-red, STOP wall-green. Used everywhere a dial shows. */
export const CONTEST_COLOR: Record<Contest, string> = {
  KEEP: '#f5c542',
  CREATE: '#e8b23a',
  PRESS: '#3d7bd6',
  BREAK: '#6fa3ef',
  FINISH: '#e23b35',
  STOP: '#34c46a',
};

export function PPanel({ children, style, glow }: { children: ReactNode; style?: CSSProperties; glow?: boolean }) {
  return (
    <div
      className="glass-surface"
      style={{ borderRadius: 'var(--radius, 10px)', padding: 12, ...(glow ? { boxShadow: '0 0 18px rgba(232,178,60,0.28)' } : null), ...style }}
    >
      {children}
    </div>
  );
}

export function PButton({
  children,
  onClick,
  disabled,
  accent,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="active:scale-95"
      style={{
        fontFamily: PIXEL,
        fontSize: 12,
        letterSpacing: 1,
        padding: '12px 16px',
        borderRadius: 'var(--radius, 10px)',
        border: '2px solid var(--ink-black)',
        background: accent ? 'linear-gradient(180deg, var(--amber), var(--amber-soft))' : 'var(--surface-raised)',
        color: accent ? 'var(--ink-black)' : 'var(--cream)',
        opacity: disabled ? 0.4 : 1,
        boxShadow: '0 3px 0 0 var(--ink-black)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'transform 80ms',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** A small caption label (pixel, muted, tracked). */
export function Eyebrow({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1.2, color: color ?? 'var(--dust)', ...style }}>{children}</div>
  );
}

/** A rounded pixel chip — the workhorse tag (contest dials, postures, rewards). */
export function Chip({ children, color, filled, style }: { children: ReactNode; color?: string; filled?: boolean; style?: CSSProperties }) {
  const c = color ?? 'var(--cream-soft)';
  return (
    <span
      style={{
        fontFamily: PIXEL,
        fontSize: 8,
        letterSpacing: 0.5,
        padding: '3px 6px',
        borderRadius: 4,
        border: `1px solid ${c}`,
        background: filled ? c : 'transparent',
        color: filled ? 'var(--ink-black)' : c,
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}

/** A horizontal progress meter (points vs target, quality, etc.). */
export function Meter({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  return (
    <div style={{ height, borderRadius: height / 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, (value / Math.max(0.001, max)) * 100))}%`, background: color, transition: 'width 220ms ease' }} />
    </div>
  );
}

/** Screen scaffold: a titled scrollable column with a fixed footer slot. */
export function Screen({ title, kicker, children, footer }: { title: string; kicker?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 12 }}>
      <div>
        {kicker && <Eyebrow color="var(--gold)">{kicker}</Eyebrow>}
        <div style={{ fontFamily: PIXEL, fontSize: 18, color: 'var(--cream)', marginTop: kicker ? 2 : 0 }}>{title}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
      {footer && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{footer}</div>}
    </div>
  );
}
