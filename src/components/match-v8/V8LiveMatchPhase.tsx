'use client';

import { useMemo } from 'react';
import { buildLiveV8Fixture } from '@/game-v8';
import type { Card } from '@/lib/scoring';
import type { HandState } from '@/lib/hand';
import type { MatchVerdict } from '@/lib/match-v5';
import type { RunState } from '@/lib/run';
import V8CalibrationLab, { type V8LiveMatchResult } from './V8CalibrationLab';

interface MatchResultPayload {
  yourGoals: number;
  opponentGoals: number;
  result: 'win' | 'draw' | 'loss';
  handState: HandState;
  verdict: MatchVerdict;
  sentOffIds: number[];
  scored: Record<number, { goals: number; assists: number }>;
  playerOfMatch: { card: Card; goals: number; assists: number; rating: number } | null;
}

export default function V8LiveMatchPhase({
  runState,
  onMatchComplete,
}: {
  runState: RunState;
  onMatchComplete: (result: MatchResultPayload) => void;
}) {
  const init = useMemo(() => {
    try {
      return { fixture: buildLiveV8Fixture(runState) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [runState]);

  if (!init.fixture) {
    return (
      <main className="v8-shell v8-shell--live">
        <div className="v8-err">Failed to initialise the live V8 match: {init.error ?? 'unknown error'}</div>
      </main>
    );
  }

  const finish = ({ homeScore, awayScore }: V8LiveMatchResult) => {
    const result: MatchResultPayload['result'] = homeScore > awayScore ? 'win' : homeScore < awayScore ? 'loss' : 'draw';
    const headline = result === 'win'
      ? `Won ${homeScore}–${awayScore}`
      : result === 'loss'
        ? `Lost ${homeScore}–${awayScore}`
        : `Drew ${homeScore}–${awayScore}`;

    onMatchComplete({
      yourGoals: homeScore,
      opponentGoals: awayScore,
      result,
      verdict: { headline, factors: [] },
      sentOffIds: [],
      // V8 currently scores at team level. Keep attribution empty until the engine
      // emits a real scorer receipt instead of inventing one at the shell boundary.
      scored: {},
      playerOfMatch: null,
      handState: {
        xi: init.fixture!.homeCards,
        bench: [],
        remainingDeck: [],
        subsRemaining: 0,
        subsUsed: [],
        currentIncrement: 3,
        isFirstHalf: false,
        yourGoals: homeScore,
        opponentGoals: awayScore,
      },
    });
  };

  return (
    <V8CalibrationLab
      fixture={{
        homePlayerIds: init.fixture.homePlayerIds,
        awayPlayerIds: init.fixture.awayPlayerIds,
        seed: init.fixture.seed,
        homeLabel: 'YOU',
        awayLabel: init.fixture.awayLabel,
        contextLabel: init.fixture.contextLabel,
      }}
      onComplete={finish}
    />
  );
}
