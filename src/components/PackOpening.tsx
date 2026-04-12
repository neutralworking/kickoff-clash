'use client';

import React from 'react';
import type { PackType } from '../lib/packs';
import { PACK_TYPES } from '../lib/packs';

// ---------------------------------------------------------------------------
// CSS vars (defined in global theme):
//   --felt:    #0b1a10
//   --leather: #1a1510
//   --amber:   #e8621a
//   --gold:    #d4a035
//   --cream:   #f5f0e0
//   --dust:    #9a8b73
// ---------------------------------------------------------------------------

interface PackOpeningProps {
  onSelect: (packType: PackType) => void;
}

function formatContents(pack: PackType): string {
  const parts: string[] = [`${pack.playerCount} players`];
  if (pack.tacticCount > 0) parts.push(`${pack.tacticCount} tactics`);
  if (pack.formationCount > 0) {
    parts.push(`${pack.formationCount} formation${pack.formationCount > 1 ? 's' : ''}`);
  }
  if (pack.managerCount > 0) {
    parts.push(`${pack.managerCount} manager${pack.managerCount > 1 ? 's' : ''}`);
  }
  return parts.join(' · ');
}

function PackCard({ pack, onSelect }: { pack: PackType; onSelect: (p: PackType) => void }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      onClick={() => onSelect(pack)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        padding: '20px 16px',
        background: hovered
          ? 'linear-gradient(160deg, #221c14 0%, #1a1510 60%, #0f120a 100%)'
          : 'linear-gradient(160deg, #1e1810 0%, #1a1510 60%, #0d110a 100%)',
        border: `1.5px solid ${hovered ? '#d4a035' : '#8a6820'}`,
        borderRadius: '10px',
        cursor: 'pointer',
        flex: '1 1 200px',
        minWidth: '160px',
        maxWidth: '280px',
        textAlign: 'center',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
        boxShadow: hovered
          ? '0 0 18px rgba(212, 160, 53, 0.35), 0 4px 16px rgba(0,0,0,0.6)'
          : '0 2px 8px rgba(0,0,0,0.5)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Pack icon placeholder — a simple sealed-pack glyph */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #d4a035 0%, #a07820 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0,
        }}
        aria-hidden
      >
        {pack.id === 'academy' ? '🎓' : pack.id === 'chequebook' ? '💰' : '🧠'}
      </div>

      {/* Pack name */}
      <span
        style={{
          fontFamily: "var(--font-display, sans-serif)",
          fontSize: 16,
          color: '#f5f0e0',
          lineHeight: 1.2,
          letterSpacing: '0.01em',
        }}
      >
        {pack.name}
      </span>

      {/* Description */}
      <span
        style={{
          fontFamily: "var(--font-body, sans-serif)",
          fontSize: 11,
          color: '#c8b898',
          lineHeight: 1.4,
        }}
      >
        {pack.description}
      </span>

      {/* Contents breakdown */}
      <span
        style={{
          fontFamily: "var(--font-body, sans-serif)",
          fontSize: 10,
          color: '#d4a035',
          letterSpacing: '0.02em',
          opacity: 0.9,
        }}
      >
        {formatContents(pack)}
      </span>

      {/* Divider */}
      <div
        style={{
          width: '80%',
          height: 1,
          background: 'linear-gradient(90deg, transparent, #8a6820, transparent)',
        }}
      />

      {/* Flavour text */}
      <span
        style={{
          fontFamily: "var(--font-flavour, serif)",
          fontStyle: 'italic',
          fontSize: 10,
          color: '#9a8b73',
          lineHeight: 1.5,
          maxWidth: '90%',
        }}
      >
        {pack.flavour}
      </span>

      {/* CTA */}
      <div
        style={{
          marginTop: 4,
          padding: '6px 14px',
          background: hovered ? '#d4a035' : 'transparent',
          border: '1px solid #d4a035',
          borderRadius: 4,
          fontFamily: "var(--font-body, sans-serif)",
          fontSize: 11,
          fontWeight: 600,
          color: hovered ? '#0b1a10' : '#d4a035',
          transition: 'background 0.15s, color 0.15s',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        Open Pack
      </div>
    </button>
  );
}

export default function PackOpening({ onSelect }: PackOpeningProps) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0b1a10',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        gap: 32,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1
          style={{
            fontFamily: "var(--font-display, sans-serif)",
            fontSize: 'clamp(22px, 5vw, 32px)',
            color: '#f5f0e0',
            margin: 0,
            letterSpacing: '0.02em',
          }}
        >
          Choose Your Pack
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: 13,
            color: '#9a8b73',
            margin: 0,
          }}
        >
          Your squad starts here. Pick wisely.
        </p>
      </div>

      {/* Pack cards */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'center',
          width: '100%',
          maxWidth: 900,
        }}
      >
        {PACK_TYPES.map((pack) => (
          <PackCard key={pack.id} pack={pack} onSelect={onSelect} />
        ))}
      </div>

      {/* Footer felt texture hint */}
      <p
        style={{
          fontFamily: "var(--font-flavour, serif)",
          fontStyle: 'italic',
          fontSize: 11,
          color: '#4a3e2e',
          margin: 0,
        }}
      >
        All packs sealed. All cards waiting.
      </p>
    </div>
  );
}
