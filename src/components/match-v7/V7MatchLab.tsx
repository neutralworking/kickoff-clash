'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import './v7lab.css';
import {
  buildBroadcastBeats,
  MatchDirector,
  V7MatchController,
  v7Fixture,
  type BreakDecision,
  type BroadcastBeat,
  type MatchEvent,
  type SubDecision,
  type UiActionView,
  type UiMatchView,
  type UiPlayerView,
  type UiTeamView,
} from '@/game-v7';

const SECTORS: Array<{ key: 'left' | 'centre' | 'right'; label: string }> = [
  { key: 'left', label: 'Left' },
  { key: 'centre', label: 'Centre' },
  { key: 'right', label: 'Right' },
];

function PlayerRow({ player, onPick, selected }: { player: UiPlayerView; onPick?: () => void; selected?: boolean }) {
  const className = `v7-card${onPick ? ' pick' : ''}${selected ? ' selected' : ''}`;
  const body = (
    <>
      <span>
        <span className="nm">{player.shortName}</span>{' '}
        <span className="meta">{player.position}</span>
        {player.emergencyGoalkeeper ? <span className="v7-oop"> · GK!</span> : player.outOfPosition ? <span className="v7-oop"> · OOP</span> : null}
      </span>
      <span className="stat">{player.attack}A / {player.defence}D</span>
    </>
  );
  return onPick ? (
    <button type="button" className={className} onClick={onPick}>{body}</button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function TeamBoard({
  team,
  score,
  isPlayer,
  breaking,
  pickBench,
  onPickActive,
  activeSector,
}: {
  team: UiTeamView;
  score: number;
  isPlayer: boolean;
  breaking: boolean;
  pickBench: string | null;
  onPickActive: (cardId: string) => void;
  activeSector: 'left' | 'centre' | 'right' | null;
}) {
  const bySector = (key: string) => team.active.filter((p) => (p.sector ?? 'centre') === key);
  return (
    <div className="v7-board">
      <h3>{team.managerName} <span className="v7-muted">· {score}</span></h3>
      <div className="sub">{team.formationName}</div>
      {SECTORS.map((sector) => {
        const players = bySector(sector.key);
        if (players.length === 0) return null;
        return (
          <div className={`v7-sector${activeSector === sector.key ? ' active' : ''}`} key={sector.key}>
            <div className="v7-sector-label">{sector.label}</div>
            {players.map((player) => (
              <PlayerRow
                key={player.cardId}
                player={player}
                {...(isPlayer && breaking && pickBench ? { onPick: () => onPickActive(player.cardId) } : {})}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function sectorForBeat(beat: BroadcastBeat | null): 'left' | 'centre' | 'right' | null {
  if (!beat) return null;
  const text = `${beat.title} ${beat.detail ?? ''}`.toLowerCase();
  if (text.includes('left')) return 'left';
  if (text.includes('right')) return 'right';
  if (text.includes('centre') || text.includes('center')) return 'centre';
  return null;
}

function CurrentMoment({
  beat,
  autoPlay,
  pending,
  onAdvance,
  onToggleAutoPlay,
  onSkip,
}: {
  beat: BroadcastBeat | null;
  autoPlay: boolean;
  pending: number;
  onAdvance: () => void;
  onToggleAutoPlay: () => void;
  onSkip: () => void;
}) {
  if (!beat) {
    return (
      <section className="v7-moment empty">
        <div>
          <div className="v7-tag">Current moment</div>
          <div className="v7-moment-title">Ready for the next phase</div>
          <div className="v7-muted">Resolve the period or confirm your coaching decisions to continue.</div>
        </div>
      </section>
    );
  }

  return (
    <section className={`v7-moment kind-${beat.kind} emphasis-${beat.emphasis}`} aria-live="polite">
      <div className="v7-moment-copy">
        <div className="v7-tag">{beat.eyebrow}</div>
        {beat.kind === 'roll' && <div className="v7-dice">◆</div>}
        <div className="v7-moment-title">{beat.title}</div>
        {beat.detail && <div className="v7-moment-detail">{beat.detail}</div>}
      </div>
      <div className="v7-moment-controls">
        <div className={`v7-playback-status${autoPlay ? ' active' : ''}`}>
          <span className="v7-playback-dot" aria-hidden="true" />
          {autoPlay ? 'Auto-playing' : 'Paused'} · {pending} {pending === 1 ? 'moment' : 'moments'} remaining
        </div>
        <div className="v7-moment-buttons">
          <button className="v7-btn" onClick={onToggleAutoPlay}>{autoPlay ? 'Pause' : 'Play'}</button>
          <button className="v7-btn cta" onClick={onAdvance}>Next →</button>
          <button className="v7-btn subtle" onClick={onSkip}>Skip sequence</button>
        </div>
      </div>
    </section>
  );
}

export default function V7MatchLab() {
  const [init] = useState<{ controller?: V7MatchController; error?: string }>(() => {
    try {
      return { controller: new V7MatchController(v7Fixture()) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  if (init.error || !init.controller) {
    return (
      <div className="v7-lab">
        <h1 className="v7-h1">Kickoff Clash — V7 match lab</h1>
        <div className="v7-err">Failed to initialise the V7 match: {init.error ?? 'unknown error'}</div>
      </div>
    );
  }

  return <V7MatchInner controller={init.controller} />;
}

function V7MatchInner({ controller }: { controller: V7MatchController }) {
  const [, setTick] = useState(0);
  const bump = () => setTick((tick) => tick + 1);
  const [director] = useState(() => new MatchDirector());
  const [autoPlay, setAutoPlay] = useState(true);
  const [presentedScore, setPresentedScore] = useState(() => {
    const initialView = controller.getView();
    return { player: initialView.player.score, opponent: initialView.opponent.score };
  });
  const revealedGoalIds = useRef(new Set<string>());
  const [pickBench, setPickBench] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubDecision[]>([]);
  const [activations, setActivations] = useState<string[]>([]);

  const phase = controller.getPhase();
  const view: UiMatchView = controller.getView();
  const events = controller.getEvents();
  const diag = controller.getDiagnostics();
  const presentation = director.snapshot();
  const currentBeat = presentation.currentBeat;
  const presentationBusy = presentation.isPlaying;
  const activeSector = sectorForBeat(currentBeat);
  const recentMoments = [...presentation.history].slice(-5).reverse();

  useEffect(() => {
    if (!currentBeat || currentBeat.kind !== 'goal' || !currentBeat.side || revealedGoalIds.current.has(currentBeat.id)) return;
    revealedGoalIds.current.add(currentBeat.id);
    setPresentedScore((score) => ({
      ...score,
      [currentBeat.side as 'player' | 'opponent']: score[currentBeat.side as 'player' | 'opponent'] + 1,
    }));
  }, [currentBeat]);

  useEffect(() => {
    if (!autoPlay || !currentBeat) return;
    const timer = window.setTimeout(() => {
      director.advance();
      setTick((tick) => tick + 1);
    }, currentBeat.durationMs);
    return () => window.clearTimeout(timer);
  }, [autoPlay, currentBeat, director]);

  const resetLocal = () => {
    setPickBench(null);
    setSubs([]);
    setActivations([]);
  };

  const activationSource = useMemo(() => {
    const map = new Map<string, string>();
    for (const action of view.player.actions) map.set(action.instanceId, action.cardId);
    return map;
  }, [view.player.actions]);

  const buildDecision = (nextSubs: SubDecision[], nextActivations: string[]): BreakDecision => ({
    subs: nextSubs,
    activations: nextActivations.map((instanceId) => ({ actionInstanceId: instanceId, sourceId: activationSource.get(instanceId) ?? '' })),
  });

  const appendNewEvents = (beforeCount: number) => {
    const nextEvents = controller.getEvents().slice(beforeCount);
    director.append(buildBroadcastBeats(nextEvents));
  };

  const sync = (nextSubs: SubDecision[], nextActivations: string[]) => {
    if (phase === 'break') controller.setPlayerDecision(buildDecision(nextSubs, nextActivations));
    bump();
  };

  const onResolvePeriod = () => {
    if (presentationBusy) return;
    const beforeCount = controller.getEvents().length;
    controller.resolvePeriod();
    appendNewEvents(beforeCount);
    resetLocal();
    bump();
  };

  const onResolveBreak = () => {
    if (presentationBusy) return;
    const result = controller.setPlayerDecision(buildDecision(subs, activations));
    if (!result.ok) {
      bump();
      return;
    }
    const beforeCount = controller.getEvents().length;
    controller.resolveBreak();
    appendNewEvents(beforeCount);
    resetLocal();
    bump();
  };

  const onRestart = () => {
    controller.restart();
    director.reset();
    revealedGoalIds.current.clear();
    const restartedView = controller.getView();
    setPresentedScore({ player: restartedView.player.score, opponent: restartedView.opponent.score });
    setAutoPlay(true);
    resetLocal();
    bump();
  };

  const onAdvanceMoment = () => {
    director.advance();
    bump();
  };

  const onSkipMoments = () => {
    director.skip();
    setPresentedScore({ player: view.player.score, opponent: view.opponent.score });
    bump();
  };

  const onPickBench = (cardId: string) => setPickBench((cur) => (cur === cardId ? null : cardId));
  const onPickActive = (cardId: string) => {
    if (!pickBench || presentationBusy) return;
    if (subs.some((s) => s.outCardId === cardId || s.inCardId === pickBench)) return;
    const next = [...subs, { outCardId: cardId, inCardId: pickBench }];
    setSubs(next);
    setPickBench(null);
    sync(next, activations);
  };
  const removeSub = (i: number) => {
    const next = subs.filter((_, j) => j !== i);
    setSubs(next);
    sync(next, activations);
  };
  const toggleActivation = (instanceId: string) => {
    const next = activations.includes(instanceId) ? activations.filter((id) => id !== instanceId) : [...activations, instanceId];
    setActivations(next);
    sync(subs, next);
  };

  const playerActivatable = view.player.actions.filter((a) => a.timing === 'activated' && !a.disabled && (a.remainingCharges ?? 1) > 0);
  const benchViews = view.player.bench;
  const nameOf = (cardId: string) => view.player.active.find((p) => p.cardId === cardId)?.shortName ?? view.player.bench.find((p) => p.cardId === cardId)?.shortName ?? cardId;

  return (
    <div className="v7-lab">
      <h1 className="v7-h1">Kickoff Clash — V7 match lab</h1>
      <div className="v7-banner">
        <span className="v7-tag">V7 auto-play slice</span>
        <span className="v7-muted">Entry <b>/lab/match-v7</b> · data <b>{diag.dataSource}</b> · V6 is still the default game.</span>
      </div>

      <div className="v7-scorebar">
        <div className="v7-team-name">{view.player.managerName}</div>
        <div>
          <div className="v7-score">{presentedScore.player}–{presentedScore.opponent}</div>
          <div className="v7-phase">{view.phaseLabel}</div>
          <div className="v7-priority">Priority: {view.priority === 'player' ? view.player.managerName : view.opponent.managerName}</div>
        </div>
        <div className="v7-team-name right">{view.opponent.managerName}</div>
      </div>

      <CurrentMoment
        beat={currentBeat}
        autoPlay={autoPlay}
        pending={presentation.pending}
        onAdvance={onAdvanceMoment}
        onToggleAutoPlay={() => setAutoPlay((playing) => !playing)}
        onSkip={onSkipMoments}
      />

      <div className="v7-boards">
        <TeamBoard team={view.player} score={presentedScore.player} isPlayer breaking={phase === 'break' && !presentationBusy} pickBench={pickBench} onPickActive={onPickActive} activeSector={activeSector} />
        <TeamBoard team={view.opponent} score={presentedScore.opponent} isPlayer={false} breaking={false} pickBench={null} onPickActive={() => {}} activeSector={activeSector} />
      </div>

      {recentMoments.length > 0 && (
        <section className="v7-recent">
          <div className="v7-tag">Recent moments</div>
          {recentMoments.map((beat) => (
            <div className={`v7-recent-item kind-${beat.kind}`} key={beat.id}>
              <span>{beat.eyebrow}</span>
              <b>{beat.title}</b>
            </div>
          ))}
        </section>
      )}

      {phase === 'period' && !presentationBusy && (
        <div className="v7-panel v7-row">
          <div>
            <div className="v7-tag">Ready</div>
            <div className="v7-muted">Resolve period {view.period}: create chances → roll → goals.</div>
          </div>
          <span className="v7-spacer" />
          <button className="v7-btn cta" onClick={onResolvePeriod}>Resolve Period {view.period} →</button>
        </div>
      )}

      {phase === 'break' && !presentationBusy && (
        <div className="v7-panel">
          <div className="v7-tag">{view.phaseLabel}</div>
          <div className="v7-muted" style={{ marginBottom: 8 }}>Blind changes — the opponent has locked a hidden plan. Pick a bench card, then an active player, to substitute.</div>

          <div className="v7-tag">Bench (energy {[0, 3, 5, 7][view.period] ?? 3} at this break)</div>
          {benchViews.map((player) => (
            <PlayerRow key={player.cardId} player={player} onPick={() => onPickBench(player.cardId)} selected={pickBench === player.cardId} />
          ))}

          {playerActivatable.length > 0 && (
            <div className="v7-actions">
              <div className="v7-tag">Actions</div>
              {playerActivatable.map((action: UiActionView) => (
                <label className="v7-action" key={action.instanceId}>
                  <input type="checkbox" checked={activations.includes(action.instanceId)} onChange={() => toggleActivation(action.instanceId)} />
                  <b>{action.actionName}</b> <span className="v7-muted">{action.cardName} · {action.displayText}</span>
                  <span className="v7-chip">{action.remainingCharges ?? '∞'}⚡</span>
                </label>
              ))}
            </div>
          )}

          {subs.length > 0 && (
            <div className="v7-actions">
              <div className="v7-tag">Plan</div>
              {subs.map((sub, i) => (
                <div className="v7-plan-row" key={i}>
                  <span>{nameOf(sub.outCardId)} → <b>{nameOf(sub.inCardId)}</b></span>
                  <button className="v7-btn" onClick={() => removeSub(i)}>remove</button>
                </div>
              ))}
            </div>
          )}

          {diag.validationErrors.length > 0 && <div className="v7-err">{diag.validationErrors.join(' ')}</div>}

          <div className="v7-row" style={{ marginTop: 10 }}>
            <span className="v7-spacer" />
            <button className="v7-btn cta" onClick={onResolveBreak}>Ready — Resolve Break →</button>
          </div>
        </div>
      )}

      {phase === 'fulltime' && view.result && !presentationBusy && (
        <div className={`v7-result ${view.result}`}>
          <div className="big">{presentedScore.player}–{presentedScore.opponent}</div>
          <div className="verdict">{view.result}</div>
          <button className="v7-btn cta" onClick={onRestart}>Restart (same seed)</button>
        </div>
      )}

      <details className="v7-panel v7-diag" style={{ marginTop: 12 }}>
        <summary>Diagnostics and raw events</summary>
        <dl className="v7-diag-grid">
          <dt>seed</dt><dd>{diag.seed}</dd>
          <dt>phase</dt><dd>{diag.phase}</dd>
          <dt>period</dt><dd>{diag.period}</dd>
          <dt>breakIndex</dt><dd>{diag.breakIndex}</dd>
          <dt>priority</dt><dd>{diag.priority}</dd>
          <dt>stateId</dt><dd>{diag.stateId}</dd>
          <dt>receipts</dt><dd>{diag.receiptCount}</dd>
          <dt>latest receipt</dt><dd>{diag.latestReceiptType ?? '—'}</dd>
          <dt>events</dt><dd>{diag.eventCount}</dd>
          <dt>data source</dt><dd>{diag.dataSource}</dd>
          <dt>validation</dt><dd>{diag.validationErrors.length ? diag.validationErrors.join(' ') : 'ok'}</dd>
        </dl>
        <div className="v7-feed">
          {[...events].slice(-80).reverse().map((event: MatchEvent) => (
            <div className={`v7-feed-item k-${event.kind}`} key={event.id}>
              <span className="v7-feed-kind">{event.kind.replace(/_/g, ' ')}</span>
              <span>{event.text}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
