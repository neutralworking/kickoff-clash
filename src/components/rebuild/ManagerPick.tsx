'use client';

/**
 * Run start: choice of three managers (SM §4). Identity is known from minute
 * one — each card states the one-line win condition, default posture, and
 * preferred formation.
 */

import Link from 'next/link';
import type { ManagerDef } from '../../engine/data/managers';
import { RButton, RPanel, PIXEL_FONT } from './RebuildShell';

export default function ManagerPick({
  offer,
  seed,
  onPick,
  onReroll,
}: {
  offer: [ManagerDef, ManagerDef, ManagerDef];
  seed: number;
  onPick: (managerId: string) => void;
  onReroll: () => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <header style={{ textAlign: 'center', marginTop: 12 }}>
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, letterSpacing: 1, color: 'var(--ink)' }}>KICKOFF CLASH V2</div>
        <h1 style={{ fontFamily: PIXEL_FONT, fontSize: 18, color: 'var(--gold)', marginTop: 6 }}>CHOOSE YOUR MANAGER</h1>
        <p style={{ fontSize: 12, color: 'var(--dust)', marginTop: 4 }}>
          The manager defines how you are allowed to win.
        </p>
      </header>

      {offer.map((m) => (
        <RPanel key={m.id}>
          <div className="flex items-start justify-between" style={{ gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: 13, color: 'var(--cream)' }}>{m.name.toUpperCase()}</div>
              <p style={{ fontSize: 12, color: 'var(--gold)', marginTop: 4, lineHeight: 1.4 }}>{m.winCondition}</p>
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                <Chip label={m.defaultPosture.toUpperCase()} />
                <Chip label={m.preferredFormation} />
                <Chip label={m.nation} dim />
              </div>
            </div>
            <RButton accent onClick={() => onPick(m.id)} style={{ flexShrink: 0 }}>
              PICK
            </RButton>
          </div>
        </RPanel>
      ))}

      <div style={{ textAlign: 'center', marginTop: 'auto', paddingBottom: 16 }}>
        <RButton onClick={onReroll}>NEW OFFER</RButton>
        <p style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--ink)', marginTop: 10 }}>SEED {seed}</p>
        <Link
          href="/"
          style={{ display: 'inline-block', fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--dust)', marginTop: 12, textDecoration: 'none' }}
        >
          ← BACK TO KICKOFF CLASH
        </Link>
      </div>
    </div>
  );
}

export function Chip({ label, dim, color }: { label: string; dim?: boolean; color?: string }) {
  return (
    <span
      style={{
        fontFamily: PIXEL_FONT,
        fontSize: 8,
        letterSpacing: 0.5,
        padding: '4px 6px',
        borderRadius: 3,
        border: `1px solid ${color ?? (dim ? 'var(--border)' : 'var(--gold)')}`,
        color: color ?? (dim ? 'var(--dust)' : 'var(--gold)'),
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
