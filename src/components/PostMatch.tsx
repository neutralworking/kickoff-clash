'use client';

import { useState, useEffect } from 'react';
import type { Card } from '../lib/scoring';

interface PostMatchProps {
  matchResult: {
    opponentName: string;
    yourGoals: number;
    opponentGoals: number;
    result: 'win' | 'draw' | 'loss';
    attendance: number;
    revenue: number;
  };
  durabilityResult: {
    shattered: Card[];
    injured: Card[];
    promoted: Card[];
    commentary: string[];
  };
  onContinue: () => void;
}

export default function PostMatch({ matchResult, durabilityResult, onContinue }: PostMatchProps) {
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    if (revealStep < 5) {
      const timer = setTimeout(() => setRevealStep(s => s + 1), 700);
      return () => clearTimeout(timer);
    }
  }, [revealStep]);

  const resultColor =
    matchResult.result === 'win'
      ? 'var(--pitch-light)'
      : matchResult.result === 'loss'
      ? 'var(--danger)'
      : 'var(--gold)';

  const resultText =
    matchResult.result === 'win' ? 'WIN' : matchResult.result === 'loss' ? 'LOSS' : 'DRAW';

  return (
    <div className="phase-postmatch max-w-lg mx-auto p-4 space-y-6 overflow-y-auto max-h-screen">
      {/* Scoreline */}
      <div
        className="transition-all duration-500"
        style={{ opacity: revealStep >= 0 ? 1 : 0 }}
      >
        <div className="text-center relative py-4">
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(245,240,224,0.06) 0%, transparent 70%)',
            }}
          />
          <div
            className="text-xs uppercase tracking-[0.2em] mb-2"
            style={{ color: 'var(--dust)' }}
          >
            Full Time
          </div>
          <div className="flex items-center justify-center gap-6">
            <span
              className="text-5xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}
            >
              {matchResult.yourGoals}
            </span>
            <span className="text-2xl" style={{ color: 'var(--ink)' }}>
              -
            </span>
            <span
              className="text-5xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}
            >
              {matchResult.opponentGoals}
            </span>
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--dust)' }}>
            vs {matchResult.opponentName}
          </div>
        </div>
      </div>

      {/* Result banner */}
      <div
        style={{
          opacity: revealStep >= 1 ? 1 : 0,
        }}
      >
        <div className="text-center">
          <div
            className={revealStep >= 1 ? 'score-pop' : ''}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(48px, 12vw, 72px)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: resultColor,
              textShadow: `0 0 30px ${resultColor}`,
            }}
          >
            {resultText}
          </div>
        </div>
      </div>

      {/* Revenue + Attendance */}
      <div
        className="transition-all duration-500"
        style={{
          opacity: revealStep >= 2 ? 1 : 0,
          transform: revealStep >= 2 ? 'translateY(0)' : 'translateY(16px)',
        }}
      >
        <div className="flex gap-3 justify-center flex-wrap">
          <StatBox label="Revenue" value={`\u00a3${matchResult.revenue.toLocaleString()}`} color="var(--gold)" />
          <StatBox label="Attendance" value={matchResult.attendance.toLocaleString()} color="var(--cream)" />
        </div>
      </div>

      {/* Durability check */}
      <div
        className="transition-all duration-500"
        style={{
          opacity: revealStep >= 3 ? 1 : 0,
          transform: revealStep >= 3 ? 'translateY(0)' : 'translateY(16px)',
        }}
      >
        {durabilityResult.commentary.length > 0 && (
          <div
            className="rounded-[var(--radius)] p-4 space-y-2"
            style={{
              background: 'var(--leather)',
              border: '1px solid rgba(154,139,115,0.15)',
            }}
          >
            <h4
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: 'var(--dust)' }}
            >
              Durability Check
            </h4>
            {durabilityResult.commentary.map((line, i) => {
              const isShatter = durabilityResult.shattered.some(c => line.includes(c.name));
              const isInjury = durabilityResult.injured.some(c => line.includes(c.name));
              const isPromotion = durabilityResult.promoted.some(c => line.includes(c.name));

              let bg = 'transparent';
              let borderClr = 'transparent';
              let textClr = 'var(--cream-soft)';
              let icon = '';

              if (isShatter) {
                bg = 'rgba(192,57,43,0.15)';
                borderClr = 'rgba(192,57,43,0.3)';
                textClr = '#e74c3c';
                icon = '\uD83D\uDCA5 ';
              } else if (isInjury) {
                bg = 'rgba(230,126,34,0.15)';
                borderClr = 'rgba(230,126,34,0.3)';
                textClr = '#e67e22';
                icon = '\uD83E\uDE78 ';
              } else if (isPromotion) {
                bg = 'rgba(212,160,53,0.15)';
                borderClr = 'rgba(212,160,53,0.3)';
                textClr = 'var(--gold)';
                icon = '\u2B50 ';
              }

              return (
                <div
                  key={i}
                  className="text-sm py-1.5 px-3 rounded-[var(--radius-sm)]"
                  style={{
                    fontFamily: 'var(--font-body)',
                    background: bg,
                    border: `1px solid ${borderClr}`,
                    color: textClr,
                  }}
                >
                  {icon}{line}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Continue button */}
      <div
        className="transition-all duration-500"
        style={{ opacity: revealStep >= 4 ? 1 : 0 }}
      >
        <div className="flex justify-center pt-4 pb-8">
          <button
            onClick={onContinue}
            className="px-8 py-3 rounded-[var(--radius)] font-bold uppercase tracking-wide transition-all hover:brightness-110 hover:scale-[1.03] active:scale-95"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(135deg, var(--amber), var(--amber-soft))',
              color: 'var(--cream)',
              boxShadow: '0 4px 20px var(--amber-glow)',
            }}
          >
            Continue to Shop
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-[var(--radius)] px-5 py-3 text-center min-w-[100px]"
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
