'use client';

import { useState } from 'react';
import type { BroadcastBeat, MatchResult, UiMatchView } from '@/game-v7';

// Full-time result screen: the verdict, the final score, the scorers, a key
// turning point, the actions that were activated, and an optional replay of the
// major beats. Compact and mobile-first. Restart replays the same seed; the lab
// entry link remounts the route fresh.

function turningPoint(beats: readonly BroadcastBeat[], result: MatchResult): string {
  const goals = beats.filter((b) => b.kind === 'goal');
  if (goals.length === 0) return 'A goalless deadlock — the dice never fell.';
  const winSide = result === 'VICTORY' ? 'player' : result === 'DEFEAT' ? 'opponent' : null;
  if (winSide) {
    const decisive = [...goals].reverse().find((g) => g.data.scoringSide === winSide) ?? goals[goals.length - 1]!;
    const scorer = decisive.sourceId ? decisive.detail?.replace(/ scores\.?$/, '') : undefined;
    return `${scorer ?? 'A late goal'} settled it in period ${decisive.period}.`;
  }
  const last = goals[goals.length - 1]!;
  return `Level to the last — the equaliser landed in period ${last.period}.`;
}

export function ResultScreen({
  view,
  result,
  beats,
  onRestart,
}: {
  view: UiMatchView;
  result: MatchResult;
  beats: readonly BroadcastBeat[];
  onRestart: () => void;
}) {
  const [showReplay, setShowReplay] = useState(false);
  const goals = beats.filter((b) => b.kind === 'goal');
  const actions = beats.filter((b) => b.kind === 'action');
  const major = beats.filter((b) => b.kind === 'goal' || b.kind === 'substitution' || (b.kind === 'action' && b.callout) || b.kind === 'period_end');

  const scorerLine = (side: 'player' | 'opponent') =>
    goals
      .filter((g) => g.data.scoringSide === side)
      .map((g) => (typeof g.data.scorerId === 'string' ? g.detail?.replace(/ scores\.?$/, '') : 'Unattributed'))
      .filter(Boolean);

  return (
    <div className={`v7-result-screen ${result}`} role="status" aria-live="polite">
      <div className="v7-verdict">{result}</div>
      <div className="v7-result-score">{view.player.score}<span>–</span>{view.opponent.score}</div>
      <div className="v7-result-teams">
        <span>{view.player.managerName}</span>
        <span className="v7-muted">vs</span>
        <span>{view.opponent.managerName}</span>
      </div>

      <div className="v7-result-grid">
        <div className="v7-result-card">
          <div className="v7-section-label">Scorers</div>
          {goals.length === 0 ? (
            <div className="v7-muted">None</div>
          ) : (
            <div className="v7-result-scorers">
              <div><b>{view.player.managerName}:</b> {scorerLine('player').join(', ') || '—'}</div>
              <div><b>{view.opponent.managerName}:</b> {scorerLine('opponent').join(', ') || '—'}</div>
            </div>
          )}
        </div>
        <div className="v7-result-card">
          <div className="v7-section-label">Turning point</div>
          <div>{turningPoint(beats, result)}</div>
        </div>
        <div className="v7-result-card">
          <div className="v7-section-label">Actions activated</div>
          {actions.length === 0 ? <div className="v7-muted">None</div> : (
            <div>{actions.map((a) => a.actionName).filter(Boolean).join(' · ')}</div>
          )}
        </div>
      </div>

      <div className="v7-result-actions">
        <button type="button" className="v7-btn ghost" onClick={() => setShowReplay((v) => !v)} aria-expanded={showReplay}>
          {showReplay ? 'Hide replay' : 'Replay major beats'}
        </button>
        <button type="button" className="v7-btn cta" onClick={onRestart}>Restart (same seed)</button>
        <a className="v7-btn" href="/lab/match-v7">Lab entry</a>
      </div>

      {showReplay ? (
        <ol className="v7-replay" aria-label="Major beats">
          {major.map((b) => (
            <li key={b.id} className={`v7-seq-item k-${b.kind}`}>
              <span className="v7-seq-kind">P{b.period} · {b.kind.replace(/_/g, ' ')}</span>
              <span>{b.title}{b.detail ? ` — ${b.detail}` : ''}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
