'use client';

import type { Sector, TeamSide } from '@/engine-v7';
import type { BroadcastBeat, UiMatchView } from '@/game-v7';
import { Pitch } from './Pitch';

// The match stage: the compact, mobile-first "one beat at a time" broadcast
// surface. A score header, the priority, the pitch (with the active sector /
// players highlighted), the central event callout (which specialises for rolls,
// goals, misses and chances), and a short recent-events strip. The full event
// log lives behind a collapsible dev control, never here.

const PIP: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Die({ value, hit }: { value: number; hit: boolean }) {
  const pips = PIP[Math.max(1, Math.min(6, value))] ?? [];
  return (
    <div className={`v7-die${hit ? ' hit' : ''}`} role="img" aria-label={`Rolled ${value}`}>
      <div className="v7-die-grid">
        {Array.from({ length: 9 }).map((_, i) => {
          const on = pips.some(([r, c]) => r * 3 + c === i);
          return <span key={i} className={on ? 'v7-pip on' : 'v7-pip'} />;
        })}
      </div>
    </div>
  );
}

function beatChances(beat: BroadcastBeat | null): { side?: TeamSide; bySector?: Record<Sector, number> } {
  if (!beat || beat.kind !== 'chance' || beat.data.cancelled) return {};
  const s = beat.data.bySector as Record<Sector, number> | undefined;
  if (!s) return {};
  return { side: beat.side, bySector: s };
}

function Callout({ beat }: { beat: BroadcastBeat | null }) {
  if (!beat) {
    return (
      <div className="v7-callout k-info" role="status" aria-live="polite">
        <div className="v7-callout-title">Kick-off</div>
        <div className="v7-callout-detail">Tap play to watch the match unfold.</div>
      </div>
    );
  }

  const rolls = Array.isArray(beat.data.rolls) ? (beat.data.rolls as number[]) : [];
  const finalRoll = typeof beat.data.finalRoll === 'number' ? beat.data.finalRoll : rolls[rolls.length - 1];
  const threshold = typeof beat.data.threshold === 'number' ? beat.data.threshold : undefined;

  return (
    <div className={`v7-callout k-${beat.kind}`} role="status" aria-live="polite">
      {beat.callout ? <div className="v7-callout-flag">{beat.callout.label}</div> : null}
      <div className="v7-callout-title">{beat.title}</div>
      {beat.detail ? <div className="v7-callout-detail">{beat.detail}</div> : null}

      {(beat.kind === 'roll' || beat.kind === 'miss') && finalRoll ? (
        <div className="v7-roll">
          <Die value={finalRoll} hit={beat.kind === 'roll' && beat.data.scored === true} />
          {threshold ? <div className="v7-roll-need">needs <b>{threshold}</b></div> : null}
          {rolls.length > 1 ? <div className="v7-roll-seq">{rolls.join(' → ')}</div> : null}
        </div>
      ) : null}

      {beat.kind === 'goal' && beat.causalPath ? (
        <ol className="v7-causal" aria-label="How the goal was built">
          {beat.causalPath.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      ) : null}

      {beat.kind === 'chance' && !beat.data.cancelled ? (
        <div className="v7-chance-tokens" aria-hidden>
          {Array.from({ length: Math.min(Number(beat.data.count) || 0, 6) }).map((_, i) => (
            <span key={i} className="v7-token-dot big" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MatchStage({
  view,
  beat,
  recent,
  reducedMotion,
}: {
  view: UiMatchView;
  beat: BroadcastBeat | null;
  recent: BroadcastBeat[];
  reducedMotion: boolean;
}) {
  const highlightIds = new Set<string>();
  if (beat?.sourceId) highlightIds.add(beat.sourceId);
  for (const id of beat?.targetIds ?? []) highlightIds.add(id);
  const activeSector = beat?.sector;
  const chance = beatChances(beat);
  const priorityName = view.priority === 'player' ? view.player.managerName : view.opponent.managerName;

  return (
    <div className="v7-stage">
      <div className="v7-scorehead">
        <div className="v7-side-name">{view.player.managerName}</div>
        <div className="v7-score-box">
          <div className={`v7-score${beat?.kind === 'goal' && !reducedMotion ? ' flash' : ''}`}>
            {view.player.score}<span className="v7-score-dash">–</span>{view.opponent.score}
          </div>
          <div className="v7-phase">{view.phaseLabel}</div>
        </div>
        <div className="v7-side-name right">{view.opponent.managerName}</div>
      </div>
      <div className="v7-priority-row">
        <span className="v7-pill">Priority</span> {priorityName} reveal first
      </div>

      <Pitch
        player={view.player}
        opponent={view.opponent}
        {...(beat?.side ? { activeSide: beat.side } : {})}
        {...(activeSector ? { activeSector } : {})}
        highlightIds={highlightIds}
        {...(chance.side ? { chanceSide: chance.side } : {})}
        {...(chance.bySector ? { chancesBySector: chance.bySector } : {})}
      />

      <Callout beat={beat} />

      {reducedMotion ? (
        <ol className="v7-sequence" aria-label="Presented beats">
          {recent.map((b) => (
            <li key={b.id} className={`v7-seq-item k-${b.kind}`}>
              <span className="v7-seq-kind">{b.kind.replace(/_/g, ' ')}</span>
              <span>{b.title}{b.detail ? ` — ${b.detail}` : ''}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="v7-recent" aria-label="Recent events">
          {recent.slice(-4).map((b) => (
            <div key={b.id} className={`v7-recent-item k-${b.kind}`}>
              <span className="v7-recent-kind">{b.kind.replace(/_/g, ' ')}</span>
              <span className="v7-recent-text">{b.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
