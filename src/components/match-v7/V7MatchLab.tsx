'use client';

import { useEffect, useState } from 'react';
import './v7lab.css';
import { V7MatchController, v7Fixture, type BreakDecision } from '@/game-v7';
import { MatchStage } from './MatchStage';
import { CoachingBreak } from './CoachingBreak';
import { ResultScreen } from './ResultScreen';

// The V7 match lab — a receipt-driven BROADCAST of one deterministic match. The
// controller owns the engine + the broadcast queue; this component only renders
// the active beat, drives presentation timers (never gameplay), and switches
// between the two experiences: the flowing MATCH STAGE and the paused COACHING
// BREAK. Timers advance presentation; the engine only ever advances once its
// current sequence is fully presented.

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

  // Honour the OS reduced-motion preference once, before the first paint. A lazy
  // initializer runs a single time and needs no re-render — the first render
  // already reads the flag back off the controller.
  useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      controller.setReducedMotion(true);
    }
    return null;
  });

  const phase = controller.getPhase();
  const hasPending = controller.hasPendingBeats();
  const playing = controller.isBroadcastPlaying();
  const reduced = controller.isReducedMotion();
  const activeBeatId = controller.getActiveBeat()?.id;

  // Presentation clock. In motion mode it reveals one beat per its duration hint,
  // then (only once a sequence is fully presented) lets the engine resolve the
  // next period. In reduced-motion mode beats are already all on screen, so it
  // just paces the engine forward. It never runs during a coaching break.
  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      if (phase === 'period' && controller.canResolvePeriod()) {
        const t = setTimeout(() => { controller.resolvePeriod(); bump(); }, 450);
        return () => clearTimeout(t);
      }
      return;
    }
    if (hasPending) {
      const beat = controller.getActiveBeat();
      const delay = beat ? beat.durationHint : 600;
      const t = setTimeout(() => { controller.advanceBeat(); bump(); }, delay);
      return () => clearTimeout(t);
    }
    if (phase === 'period' && controller.canResolvePeriod()) {
      const t = setTimeout(() => { controller.resolvePeriod(); bump(); }, 550);
      return () => clearTimeout(t);
    }
    return;
  }, [controller, playing, reduced, phase, hasPending, activeBeatId]);

  const mode = phase === 'fulltime' && !hasPending ? 'result' : phase === 'break' && !hasPending ? 'coaching' : 'stage';

  const view = controller.getStageView();
  const beat = controller.getActiveBeat();
  const presented = controller.getPresentedBeats();

  const validate = (decision: BreakDecision): string[] => {
    const result = controller.setPlayerDecision(decision);
    return result.ok ? [] : controller.getDiagnostics().validationErrors;
  };
  const onConfirm = (decision: BreakDecision) => {
    const result = controller.setPlayerDecision(decision);
    if (!result.ok) { bump(); return; }
    controller.resolveBreak();
    bump();
  };
  const onRestart = () => { controller.restart(); bump(); };

  const diag = controller.getDiagnostics();

  return (
    <div className={`v7-lab${reduced ? ' reduced' : ''}`}>
      <header className="v7-topbar">
        <h1 className="v7-h1">Kickoff Clash · V7</h1>
        <div className="v7-topbar-right">
          <button
            type="button"
            className={`v7-toggle${reduced ? ' on' : ''}`}
            onClick={() => { controller.setReducedMotion(!reduced); bump(); }}
            aria-pressed={reduced}
          >
            {reduced ? 'Motion off' : 'Reduce motion'}
          </button>
        </div>
      </header>

      {mode === 'result' && controller.getResult() ? (
        <ResultScreen view={view} result={controller.getResult()!} beats={controller.getBeats()} onRestart={onRestart} />
      ) : mode === 'coaching' ? (
        <CoachingBreak view={view} breakIndex={view.period} validate={validate} onConfirm={onConfirm} />
      ) : (
        <>
          <MatchStage view={view} beat={beat} recent={presented.slice(-16)} reducedMotion={reduced} />
          {!reduced ? (
            <div className="v7-transport" role="group" aria-label="Playback controls">
              <button type="button" className="v7-t-btn" onClick={() => { controller.toggleBroadcast(); bump(); }} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button type="button" className="v7-t-btn" onClick={() => { controller.skipBeat(); bump(); }} disabled={!hasPending} aria-label="Next beat">
                ⏭ Beat
              </button>
              <button type="button" className="v7-t-btn" onClick={() => { controller.skipSequence(); bump(); }} disabled={!hasPending} aria-label="Skip sequence">
                ⏩ Skip
              </button>
              <span className="v7-t-count">{controller.pendingBeatCount()} queued</span>
            </div>
          ) : (
            <div className="v7-transport" role="group" aria-label="Playback controls">
              <button type="button" className="v7-t-btn" onClick={() => { if (controller.canResolvePeriod()) { controller.resolvePeriod(); bump(); } }} disabled={!controller.canResolvePeriod()}>
                ⏩ Next period
              </button>
              <span className="v7-t-count">reduced-motion · static</span>
            </div>
          )}
        </>
      )}

      <details className="v7-dev">
        <summary>Developer tools</summary>
        <div className="v7-dev-body">
          <dl className="v7-diag-grid">
            <dt>seed</dt><dd>{diag.seed}</dd>
            <dt>phase</dt><dd>{diag.phase}</dd>
            <dt>period</dt><dd>{diag.period}</dd>
            <dt>priority</dt><dd>{diag.priority}</dd>
            <dt>beats</dt><dd>{diag.beatCount} ({diag.pendingBeats} pending)</dd>
            <dt>receipts</dt><dd>{diag.receiptCount}</dd>
            <dt>latest receipt</dt><dd>{diag.latestReceiptType ?? '—'}</dd>
            <dt>data source</dt><dd>{diag.dataSource}</dd>
          </dl>
          <div className="v7-section-label">Raw event feed ({controller.getEvents().length})</div>
          <div className="v7-feed">
            {[...controller.getEvents()].slice(-60).reverse().map((event) => (
              <div className={`v7-feed-item k-${event.kind}`} key={event.id}>
                <span className="v7-feed-kind">{event.kind.replace(/_/g, ' ')}</span>
                <span>{event.text}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
