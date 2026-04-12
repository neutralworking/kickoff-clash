'use client';

import type { RunState } from '../lib/run';

interface EndScreenProps {
  state: RunState;
  onNewRun: () => void;
}

export default function EndScreen({ state, onNewRun }: EndScreenProps) {
  const won = state.status === 'won';
  const totalGoals = state.matchHistory.reduce((s, m) => s + m.yourGoals, 0);
  const totalRevenue = state.matchHistory.reduce((s, m) => s + m.revenue, 0);

  const headlineColor = won ? 'var(--gold)' : 'var(--danger)';
  const headlineGlow = won
    ? '0 0 40px rgba(212,160,53,0.5), 0 0 80px rgba(212,160,53,0.2)'
    : '0 0 40px rgba(192,57,43,0.5), 0 0 80px rgba(192,57,43,0.2)';

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-center px-6 py-10"
      style={{ background: 'var(--felt)' }}
    >
      {/* Headline */}
      <div className="mb-2">
        <div
          className="text-6xl uppercase tracking-widest"
          style={{
            fontFamily: 'var(--font-display)',
            color: headlineColor,
            textShadow: headlineGlow,
          }}
        >
          {won ? 'CHAMPIONS!' : 'RELEGATED!'}
        </div>
      </div>
      <p
        className="text-base mb-8"
        style={{
          fontFamily: 'var(--font-flavour)',
          fontStyle: 'italic',
          color: 'var(--dust)',
        }}
      >
        {won
          ? 'You conquered all five opponents!'
          : `You suffered ${state.losses} defeat${state.losses !== 1 ? 's' : ''}.`}
      </p>

      {/* Match record pips */}
      <div className="flex gap-2 justify-center mb-8">
        {state.matchHistory.map((m, i) => {
          let bg: string;
          let textClr: string;
          let borderClr: string;
          if (m.result === 'win') {
            bg = 'rgba(45,138,78,0.2)';
            textClr = 'var(--pitch-light)';
            borderClr = 'rgba(45,138,78,0.4)';
          } else if (m.result === 'loss') {
            bg = 'rgba(192,57,43,0.2)';
            textClr = 'var(--danger)';
            borderClr = 'rgba(192,57,43,0.4)';
          } else {
            bg = 'rgba(212,160,53,0.2)';
            textClr = 'var(--gold)';
            borderClr = 'rgba(212,160,53,0.4)';
          }
          return (
            <div
              key={i}
              className="w-10 h-10 rounded-[var(--radius-sm)] flex flex-col items-center justify-center text-sm font-bold"
              style={{ background: bg, color: textClr, border: `1px solid ${borderClr}` }}
            >
              <span>{m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}</span>
              <span className="text-[7px]">{m.yourGoals}-{m.opponentGoals}</span>
            </div>
          );
        })}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 max-w-sm w-full mb-10">
        <StatBox label="Matches Won" value={state.wins.toString()} color="var(--pitch-light)" />
        <StatBox label="Total Goals" value={totalGoals.toString()} color="var(--cream)" />
        <StatBox label="Revenue" value={`\u00a3${totalRevenue.toLocaleString()}`} color="var(--gold)" />
        <StatBox label="Final Cash" value={`\u00a3${state.cash.toLocaleString()}`} color="var(--gold)" />
      </div>

      {/* New Season button */}
      <button
        onClick={onNewRun}
        className="px-10 py-4 rounded-[var(--radius)] text-lg uppercase tracking-wide transition-all hover:brightness-110 hover:scale-[1.03] active:scale-95"
        style={{
          fontFamily: 'var(--font-display)',
          background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
          color: 'var(--cream)',
          boxShadow: '0 4px 20px var(--amber-glow)',
        }}
      >
        New Season
      </button>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-[var(--radius)] px-4 py-3 text-center"
      style={{
        background: 'var(--leather)',
        border: '1px solid rgba(154,139,115,0.15)',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.15em]"
        style={{ color: 'var(--dust)' }}
      >
        {label}
      </div>
      <div
        className="text-lg font-bold"
        style={{
          fontFamily: 'var(--font-display)',
          color: color ?? 'var(--cream)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
