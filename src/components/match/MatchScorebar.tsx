'use client';

interface MatchScorebarProps {
  yourGoals: number;
  opponentGoals: number;
  minute: number;
  opponentName: string;
  round: number;
  seasonPoints: number;
  boardTargetPoints: number;
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
  subPhase,
}: MatchScorebarProps) {
  return (
    <div
      className="match-scorebar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 16px 8px',
        background: 'linear-gradient(180deg, rgba(26,21,16,0.98), rgba(22,17,13,0.92))',
        borderBottom: '1px solid rgba(245,158,11,0.16)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.24)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--cream, #f5f0e8)',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            vs {opponentName}
          </div>
          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginTop: 3 }}>
            Fixture {round}/5
          </div>
        </div>

        <span
          style={{
            fontFamily: 'var(--font-display, sans-serif)',
            fontSize: 32,
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
        <div style={{ minWidth: 0, textAlign: 'right' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--cream, #f5f0e8)',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            Season Race
          </div>
          <div style={{ fontSize: 10, color: 'var(--dust, #8a7560)', marginTop: 3 }}>
            Points {seasonPoints}/{boardTargetPoints}
          </div>
        </div>
      </div>
      <div
        style={{
          width: '100%',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginTop: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: 'var(--dust, #8a7560)',
            padding: '4px 8px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          Live tactical window
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--dust, #8a7560)',
            padding: '4px 8px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          {subPhase === 'planning' ? 'Set the move' : subPhase}
        </span>
      </div>
    </div>
  );
}
