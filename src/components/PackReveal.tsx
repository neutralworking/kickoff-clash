'use client';

import { useState } from 'react';
import type { PackContents } from '../lib/packs';

interface PackRevealProps {
  contents: PackContents;
  onContinue: () => void;
}

const RARITY_COLOR: Record<string, string> = {
  Common: '#9a8b73',
  Rare: '#5fa8d3',
  Epic: '#a78bfa',
  Legendary: '#e8a23a',
};

function lastName(name: string): string {
  const p = name.trim().split(' ');
  return p[p.length - 1];
}

export default function PackReveal({ contents, onContinue }: PackRevealProps) {
  const [opened, setOpened] = useState(false);
  const topPlayers = [...contents.players].sort((a, b) => b.power - a.power).slice(0, 6);

  return (
    <div className="flex flex-col px-4 py-5 overflow-hidden" style={{ height: '100dvh', background: 'var(--felt)' }}>
      <h1 className="text-2xl uppercase tracking-tight text-center mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>
        {opened ? 'Packs Opened' : 'Three Packs'}
      </h1>
      <p className="text-center text-[12px] mb-4" style={{ fontFamily: 'var(--font-flavour)', fontStyle: 'italic', color: 'var(--dust)' }}>
        {opened ? 'Your starting squad, gaffers and tactics.' : 'Rip them open to see what you got.'}
      </p>

      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* Players */}
        <div className="rounded-[12px] p-3 flex-1 min-h-0 flex flex-col" style={{ background: 'var(--leather)', border: '1px solid rgba(212,160,53,0.2)' }}>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>Player Pack</span>
            <span className="text-[11px]" style={{ color: 'var(--gold)' }}>{contents.players.length} players</span>
          </div>
          {opened && (
            <div className="grid grid-cols-3 gap-1.5 overflow-hidden">
              {topPlayers.map((c) => (
                <div key={c.id} className="rounded-[6px] px-2 py-1 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${RARITY_COLOR[c.rarity] ?? 'rgba(154,139,115,0.25)'}` }}>
                  <span className="text-[11px] font-bold truncate" style={{ color: 'var(--cream)' }}>{lastName(c.name)}</span>
                  <span className="text-[11px] font-bold ml-1" style={{ color: 'var(--gold)' }}>{Math.round(c.power)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Managers */}
        <div className="rounded-[12px] p-3 shrink-0" style={{ background: 'var(--leather)', border: '1px solid rgba(212,160,53,0.2)' }}>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>Manager Pack</span>
            <span className="text-[11px]" style={{ color: 'var(--gold)' }}>{contents.managers.length} gaffers</span>
          </div>
          {opened && (
            <div className="flex gap-2">
              {contents.managers.map((m) => (
                <div key={m.id} className="flex-1 rounded-[8px] p-2" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(212,160,53,0.2)' }}>
                  <div className="text-[13px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>{m.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.traits.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: 'rgba(212,160,53,0.14)', color: 'var(--gold)' }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tactics */}
        <div className="rounded-[12px] p-3 shrink-0" style={{ background: 'var(--leather)', border: '1px solid rgba(212,160,53,0.2)' }}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>Tactical Pack</span>
            <span className="text-[11px]" style={{ color: 'var(--gold)' }}>{contents.tactics.length} tactics</span>
          </div>
          {opened && (
            <div className="flex flex-wrap gap-1 mt-2">
              {contents.tactics.map((t) => (
                <span key={t.id} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: 'rgba(232,98,26,0.12)', color: 'var(--amber)' }}>{t.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => (opened ? onContinue() : setOpened(true))}
        className="w-full mt-4 py-3.5 rounded-[var(--radius)] text-lg uppercase tracking-wide transition-all active:scale-95 shrink-0"
        style={{
          fontFamily: 'var(--font-display)',
          background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
          color: 'var(--cream)',
          boxShadow: '0 4px 20px var(--amber-glow)',
        }}
      >
        {opened ? 'Pick Your Team →' : 'Open Packs'}
      </button>
    </div>
  );
}
