'use client';

interface MatchScorebarProps {
  yourGoals: number;
  opponentGoals: number;
  minute: number;
  opponentName: string;
  round: number;
  seasonPoints: number;
  boardTargetPoints: number;
  opponentStyle: string;
  opponentWeakness: string;
  starPlayer: string;
  subPhase: string;
}

export default function MatchScorebar({
  yourGoals,
  opponentGoals,
  minute,
  opponentName,
  round,
  seasonPoints,
  boardTargetPoints,
  opponentStyle,
  opponentWeakness,
  starPlayer,
  subPhase,
}: MatchScorebarProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 12px',
        background: 'linear-gradient(135deg, var(--leather, #3d2b1f), #2a1e15)',
        borderBottom: '1px solid rgba(245,158,11,0.2)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span
          style={{
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 28,
            color: 'var(--cream, #f5f0e8)',
            lineHeight: 1,
          }}
        >
          {yourGoals}
        </span>
        <span style={{ fontSize: 14, color: 'var(--dust, #8a7560)', fontWeight: 600 }}>
          -
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 28,
            color: 'var(--cream, #f5f0e8)',
            lineHeight: 1,
          }}
        >
          {opponentGoals}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--amber, #f59e0b)',
            color: '#1a1a1a',
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 13,
            borderRadius: 6,
            padding: '2px 8px',
            animation: subPhase === 'resolving' ? 'pulse 1s infinite' : undefined,
          }}
        >
          {minute}&apos;
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
          vs {opponentName}
        </span>
        <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
          Fixture {round}/5
        </span>
        <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
          Points {seasonPoints}/{boardTargetPoints}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
          Style: {opponentStyle}
        </span>
        <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
          Weakness: {opponentWeakness}
        </span>
        <span style={{ fontSize: 10, color: 'var(--dust, #8a7560)' }}>
          Star: {starPlayer}
        </span>
      </div>
    </div>
  );
}
