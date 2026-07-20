'use client';

import type { V6MatchState } from '@/lib/match-v6';

export function V6ScoreHeader({ state, phaseLabel }: { state: V6MatchState; phaseLabel: string }) {
  const priorityLabel = state.priority === 'player' ? 'You reveal first' : `${state.opponent.name} reveals first`;
  return (
    <div className="v6-top">
      <div className="v6-scoreline">
        <div className="v6-team">{state.player.name}</div>
        <div className="v6-score v6-pixel">
          {state.player.score}–{state.opponent.score}
        </div>
        <div className="v6-team right">{state.opponent.name}</div>
      </div>
      <div className="v6-meta">
        <span className="v6-chip">{phaseLabel}</span>
        <span className="v6-chip priority">{priorityLabel}</span>
      </div>
    </div>
  );
}
