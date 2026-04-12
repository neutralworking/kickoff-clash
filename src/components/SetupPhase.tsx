'use client';

import { useState } from 'react';
import type { PackType } from '../lib/packs';
import { PACK_TYPES } from '../lib/packs';
import { PLAYING_STYLES } from '../lib/scoring';

interface SetupPhaseProps {
  onStart: (packType: PackType, style: string) => void;
}

export default function SetupPhase({ onStart }: SetupPhaseProps) {
  const [selectedPack, setSelectedPack] = useState<PackType | null>(null);
  const [style, setStyle] = useState<string | null>(null);

  const ready = selectedPack !== null && style !== null;

  return (
    <div
      className="phase-setup flex flex-col items-center min-h-screen px-4 py-10"
      style={{ background: 'var(--felt)' }}
    >
      {/* Title */}
      <h1
        className="text-4xl uppercase tracking-tight mb-10 text-center"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}
      >
        New Season
      </h1>

      {/* Pack Selection */}
      <div className="mb-10 w-full max-w-3xl">
        <h3
          className="text-xs font-bold uppercase tracking-[0.2em] mb-4 text-center"
          style={{ color: 'var(--dust)', fontFamily: 'var(--font-body)' }}
        >
          Choose Your Pack
        </h3>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {PACK_TYPES.map((pack) => {
            const selected = selectedPack?.id === pack.id;
            return (
              <button
                key={pack.id}
                onClick={() => setSelectedPack(pack)}
                className="flex-1 text-left rounded-[10px] p-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'var(--leather)',
                  border: `2px solid ${selected ? 'var(--amber)' : 'var(--gold)'}`,
                  boxShadow: selected ? '0 0 20px var(--amber-glow)' : 'none',
                  opacity: selected ? 1 : 0.85,
                }}
              >
                {/* Pack name */}
                <div
                  className="text-base mb-1"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: selected ? 'var(--amber)' : 'var(--cream)',
                  }}
                >
                  {pack.name}
                </div>

                {/* Description */}
                <div
                  className="text-xs mb-2 leading-snug"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: 'var(--cream-soft)',
                  }}
                >
                  {pack.description}
                </div>

                {/* Flavour */}
                <div
                  className="text-[11px] mb-3 italic leading-snug"
                  style={{
                    fontFamily: 'var(--font-flavour)',
                    color: 'var(--dust)',
                  }}
                >
                  &ldquo;{pack.flavour}&rdquo;
                </div>

                {/* Contents breakdown */}
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: 'rgba(212,160,53,0.12)',
                      color: 'var(--gold)',
                      border: '1px solid rgba(212,160,53,0.25)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {pack.playerCount} players
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: 'rgba(212,160,53,0.12)',
                      color: 'var(--gold)',
                      border: '1px solid rgba(212,160,53,0.25)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {pack.tacticCount} tactics
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: 'rgba(212,160,53,0.12)',
                      color: 'var(--gold)',
                      border: '1px solid rgba(212,160,53,0.25)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {pack.formationCount} formation{pack.formationCount !== 1 ? 's' : ''}
                  </span>
                  {pack.managerCount > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        background: 'rgba(232,98,26,0.12)',
                        color: 'var(--amber)',
                        border: '1px solid rgba(232,98,26,0.25)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {pack.managerCount} manager
                    </span>
                  )}
                  {pack.guaranteedEpicCount > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        background: 'rgba(139,92,246,0.15)',
                        color: '#a78bfa',
                        border: '1px solid rgba(139,92,246,0.3)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {pack.guaranteedEpicCount} epic+
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Style picker */}
      <div className="mb-10 w-full max-w-xl">
        <h3
          className="text-xs font-bold uppercase tracking-[0.2em] mb-4 text-center"
          style={{ color: 'var(--dust)', fontFamily: 'var(--font-body)' }}
        >
          Playing Style
        </h3>
        <div className="flex flex-wrap justify-center gap-3">
          {Object.entries(PLAYING_STYLES).map(([key, ps]) => {
            const selected = style === key;
            return (
              <button
                key={key}
                onClick={() => setStyle(key)}
                className="px-4 py-3 rounded-[var(--radius)] text-left min-w-[160px] transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: selected
                    ? 'rgba(232,98,26,0.12)'
                    : 'var(--leather)',
                  border: `2px solid ${selected ? 'var(--amber)' : 'rgba(154,139,115,0.2)'}`,
                  boxShadow: selected ? '0 0 12px var(--amber-glow)' : 'none',
                }}
              >
                <div
                  className="font-bold text-sm"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: selected ? 'var(--amber)' : 'var(--cream)',
                  }}
                >
                  {ps.name}
                </div>
                {ps.bonusArchetypes.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ps.bonusArchetypes.map((arch) => (
                      <span
                        key={arch}
                        className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                        style={{
                          background: 'rgba(212,160,53,0.15)',
                          color: 'var(--gold)',
                          border: '1px solid rgba(212,160,53,0.25)',
                        }}
                      >
                        {arch}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div
                    className="text-[10px] mt-1"
                    style={{ color: 'var(--dust)', fontFamily: 'var(--font-body)' }}
                  >
                    +{(ps.multiplier * 100).toFixed(0)}% flat per card
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Open Pack button */}
      <button
        disabled={!ready}
        onClick={() => ready && onStart(selectedPack!, style!)}
        className="w-full max-w-sm py-4 rounded-[var(--radius)] text-lg uppercase tracking-wide transition-all hover:scale-[1.03] active:scale-95"
        style={{
          fontFamily: 'var(--font-display)',
          background: ready
            ? 'linear-gradient(135deg, var(--amber), var(--amber-soft))'
            : 'var(--leather)',
          color: ready ? 'var(--cream)' : 'var(--ink)',
          boxShadow: ready ? '0 4px 20px var(--amber-glow)' : 'none',
          cursor: ready ? 'pointer' : 'not-allowed',
          opacity: ready ? 1 : 0.5,
        }}
      >
        Open Pack
      </button>
    </div>
  );
}
