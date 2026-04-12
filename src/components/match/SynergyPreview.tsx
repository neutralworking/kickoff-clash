'use client';

import type { Connection, CrossSynergy } from '../../lib/chemistry';

interface SynergyPreviewProps {
  attackSynergies: Connection[];
  defenceSynergies: Connection[];
  crossSynergies: CrossSynergy[];
}

export default function SynergyPreview({
  attackSynergies,
  defenceSynergies,
  crossSynergies,
}: SynergyPreviewProps) {
  const hasSynergies =
    attackSynergies.length > 0 || defenceSynergies.length > 0 || crossSynergies.length > 0;

  if (!hasSynergies) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '3px 10px',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {attackSynergies.length > 0 && (
        <>
          <span style={{ fontSize: 10, color: '#fbbf24', opacity: 0.6 }}>&#x2694;</span>
          {attackSynergies.map((syn) => (
            <span
              key={syn.key}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#fbbf24',
                background: 'rgba(251,191,36,0.15)',
                borderRadius: 4,
                padding: '2px 8px',
              }}
            >
              {syn.name} +{syn.bonus}
            </span>
          ))}
        </>
      )}
      {defenceSynergies.length > 0 && (
        <>
          <span style={{ fontSize: 10, color: '#60a5fa', opacity: 0.6 }}>&#x1F6E1;</span>
          {defenceSynergies.map((syn) => (
            <span
              key={syn.key}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#60a5fa',
                background: 'rgba(96,165,250,0.15)',
                borderRadius: 4,
                padding: '2px 8px',
              }}
            >
              {syn.name} +{syn.bonus}
            </span>
          ))}
        </>
      )}
      {crossSynergies.length > 0 && (
        <>
          <span style={{ fontSize: 10, color: '#a855f7', opacity: 0.6 }}>&#x21C4;</span>
          {crossSynergies.map((syn) => (
            <span
              key={syn.key}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#a855f7',
                background: 'rgba(168,85,247,0.15)',
                borderRadius: 4,
                padding: '2px 8px',
              }}
            >
              {syn.name} +{syn.bonus}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
