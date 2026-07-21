'use client';

import type { V6MatchState } from '@/lib/match-v6';

export function V6ScoreHeader({
  state,
  phaseLabel,
  scoreOverride,
}: {
  state: V6MatchState;
  phaseLabel: string;
  scoreOverride?: { player: number; opponent: number };
}) {
  const priorityLabel = state.priority === 'player' ? 'You reveal first' : `${state.opponent.name} reveals first`;
  const shown = scoreOverride ?? { player: state.player.score, opponent: state.opponent.score };
  return (
    <div className="v6-top">
      <div className="v6-scoreline">
        <div className="v6-team">{state.player.name}</div>
        <div className="v6-score v6-pixel">
          {shown.player}–{shown.opponent}
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
