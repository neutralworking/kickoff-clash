'use client';

import { useState, useEffect } from 'react';
import type { IncrementResult, CascadeLine } from '../../lib/match-v5';

interface ResolvingPhaseProps {
  result: IncrementResult;
  onComplete: () => void;
}

const LINE_DELAY = 400;

function cascadeColor(type: CascadeLine['type']): string {
  switch (type) {
    case 'base': return 'var(--cream, #f5f0e8)';
    case 'synergy': return '#f59e0b';
    case 'style': return '#22c55e';
    case 'dual-role': return '#c084fc';
    case 'personality': return '#facc15';
    case 'manager': return '#a855f7';
    case 'tactic': return '#4a9eff';
    case 'ability': return '#f472b6';
    default: return 'var(--cream, #f5f0e8)';
  }
}

export default function ResolvingPhase({ result, onComplete }: ResolvingPhaseProps) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [showEvent, setShowEvent] = useState(false);

  const allLines = [
    ...result.split.attackBreakdown.map((l) => ({ ...l, side: 'attack' as const })),
    { label: `Attack Total: ${result.split.attackScore}`, value: result.split.attackScore, type: 'base' as const, side: 'attack' as const },
    ...result.split.defenceBreakdown.map((l) => ({ ...l, side: 'defence' as const })),
    { label: `Defence Total: ${result.split.defenceScore}`, value: result.split.defenceScore, type: 'base' as const, side: 'defence' as const },
  ];

  useEffect(() => {
    // Stagger cascade lines
    const timers: ReturnType<typeof setTimeout>[] = [];
    allLines.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), (i + 1) * LINE_DELAY));
    });

    // Show event after all lines
    const eventDelay = (allLines.length + 1) * LINE_DELAY;
    timers.push(setTimeout(() => setShowEvent(true), eventDelay));

    // Auto-complete after event shown
    const completeDelay = eventDelay + 2500;
    timers.push(setTimeout(onComplete, completeDelay));

    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '8px 16px',
        minHeight: 0,
        overflow: 'auto',
      }}
    >
      {/* Cascade */}
      <div
        style={{
          background: 'rgba(0,0,0,0.35)',
          borderRadius: 8,
          padding: '8px 12px',
          maxHeight: '60vh',
          overflowY: 'auto',
        }}
      >
        {allLines.map((line, i) => {
          const isTotal = line.label.includes('Total');
          const sideColor = line.side === 'attack' ? '#fbbf24' : '#60a5fa';
          return (
            <div
              key={i}
              style={{
                opacity: i < visibleLines ? 1 : 0,
                transition: 'opacity 0.3s ease',
                fontSize: isTotal ? 14 : 12,
                lineHeight: 1.8,
                fontFamily: isTotal ? 'var(--font-display, sans-serif)' : 'var(--font-body, sans-serif)',
                fontWeight: isTotal ? 900 : 400,
                color: isTotal ? sideColor : cascadeColor(line.type),
                borderTop: isTotal ? `1px solid ${sideColor}40` : undefined,
                marginTop: isTotal ? 4 : 0,
                paddingTop: isTotal ? 4 : 0,
              }}
            >
              {!isTotal && (
                <span style={{ color: sideColor, fontSize: 9, marginRight: 6 }}>
                  {line.side === 'attack' ? 'ATK' : 'DEF'}
                </span>
              )}
              {isTotal ? line.label : `${line.label}: +${line.value}`}
            </div>
          );
        })}

        {/* Goal chances */}
        {visibleLines >= allLines.length && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--dust, #8a7560)' }}>
            <span>Goal chance: {Math.round(result.yourGoalChance * 100)}%</span>
            <span style={{ margin: '0 8px' }}>|</span>
            <span>Concede chance: {Math.round(result.opponentGoalChance * 100)}%</span>
          </div>
        )}

        {/* Event */}
        {showEvent && (
          <div
            style={{
              marginTop: 12,
              fontFamily: 'var(--font-flavour, serif)',
              fontStyle: 'italic',
              fontSize: 14,
              fontWeight: 600,
              color:
                result.event.type === 'goal-yours'
                  ? 'var(--amber, #f59e0b)'
                  : result.event.type === 'goal-opponent'
                    ? '#ef4444'
                    : 'var(--dust, #8a7560)',
            }}
          >
            {result.event.text}
          </div>
        )}
      </div>

      {/* Tap to skip */}
      <button
        onClick={onComplete}
        style={{
          marginTop: 12,
          alignSelf: 'center',
          padding: '8px 24px',
          borderRadius: 6,
          border: '1px solid var(--dust, #8a7560)',
          background: 'transparent',
          color: 'var(--cream, #f5f0e8)',
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'var(--font-body, sans-serif)',
          opacity: 0.6,
        }}
      >
        Skip &rarr;
      </button>
    </div>
  );
}
