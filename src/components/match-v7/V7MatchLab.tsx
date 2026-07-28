'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './v7lab.css';
import './v7choreography.css';
import {
  FIXTURE_SEED,
  PresentationDirector,
  V7MatchController,
  buildPeriodPresentation,
  buildSubstitutionRevealBeats,
  previewSubstitutions,
  v7Fixture,
  type BreakDecision,
  type PresentationBeat,
  type SubDecision,
  type UiActionView,
  type UiMatchView,
  type UiPlayerView,
  type UiTeamView,
} from '@/game-v7';
import { cardMetaFor, V7Pitch, V7PlayerCard } from './V7Pitch';
import { V7PressureBoard, V7ResolutionStrip } from './V7ResolutionStage';

type DisplaySide = 'player' | 'opponent';

const BREAK_ENERGY = [0, 3, 5, 7];

function totals(team: UiTeamView): { attack: number; defence: number } {
  return team.active.reduce(
    (sum, player) => ({
      attack: sum.attack + Math.max(0, player.attack),
      defence: sum.defence + Math.max(0, player.defence),
    }),
    { attack: 0, defence: 0 },
  );
}

function TeamSwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7v5h5M6.6 17A8 8 0 1 0 6 7.5L5 12" />
    </svg>
  );
}

function NewSeedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.4 4.1L18 8.5l-3.7 2.6.1 4.6-3.7-2.7-3.7 2.7.1-4.6L3.4 8.5 8 7.1 9.3 3l2.7 3 2.7-3" />
    </svg>
  );
}

function logIcon(beat: PresentationBeat): string {
  switch (beat.kind) {
    case 'goal': return '⚽';
    case 'miss': return '×';
    case 'cancelled': return '⊘';
    case 'roll': return '◆';
    case 'reveal': return '↔';
    case 'full_time': return '■';
    case 'period_end': return '■';
    default: return '•';
  }
}

function delta(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function beatLabel(beat: PresentationBeat | null, period: number): string {
  if (!beat) return `PERIOD ${period}`;
  switch (beat.kind) {
    case 'lock': return 'PERIOD LOCKED';
    case 'pressure': return beat.side === 'player' ? 'YOUR PRESSURE' : 'THEIR PRESSURE';
    case 'threshold': return `THRESHOLD ${beat.thresholdIndex ?? ''}`.trim();
    case 'chances': return beat.side === 'player' ? 'YOUR CHANCES' : 'THEIR CHANCES';
    case 'overview': return 'CHANCES SET';
    case 'roll': return beat.side === 'player' ? 'YOUR ROLL' : 'THEIR ROLL';
    case 'goal': return 'GOAL';
    case 'miss': return 'MISS';
    case 'cancelled': return 'CHANCE BLOCKED';
    case 'full_time': return 'FULL TIME';
    case 'period_end': return 'PERIOD COMPLETE';
    default: return beat.kind.replace('_', ' ').toUpperCase();
  }
}

export default function V7MatchLab() {
  const [session, setSession] = useState({ seed: FIXTURE_SEED, replay: 0 });
  const init = useMemo<{ controller?: V7MatchController; error?: string }>(() => {
    try {
      return { controller: new V7MatchController({ ...v7Fixture(), seed: session.seed }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [session]);

  if (init.error || !init.controller) {
    return <main className="v7-lab"><div className="v7-err">Failed to initialise V7: {init.error ?? 'unknown error'}</div></main>;
  }

  return (
    <V7MatchInner
      key={`${session.seed}:${session.replay}`}
      controller={init.controller}
      onReplay={() => setSession((current) => ({ ...current, replay: current.replay + 1 }))}
      onNewMatch={() => setSession((current) => ({ seed: nextSeed(current.seed), replay: 0 }))}
    />
  );
}

function V7MatchInner({
  controller,
  onReplay,
  onNewMatch,
}: {
  controller: V7MatchController;
  onReplay: () => void;
  onNewMatch: () => void;
}) {
  const [, setTick] = useState(0);
  const bump = () => setTick((tick) => tick + 1);
  const [director] = useState(() => new PresentationDirector());
  const [autoPlay, setAutoPlay] = useState(true);
  const [displaySide, setDisplaySide] = useState<DisplaySide>('player');
  const [presentedScore, setPresentedScore] = useState({ player: 0, opponent: 0 });
  const revealedGoalIds = useRef(new Set<string>());
  const [pickBench, setPickBench] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubDecision[]>([]);
  const [activations, setActivations] = useState<string[]>([]);
  const [inspected, setInspected] = useState<UiPlayerView | null>(null);

  const phase = controller.getPhase();
  const view: UiMatchView = controller.getView();
  const diag = controller.getDiagnostics();
  const presentation = director.snapshot();
  const currentBeat = presentation.currentBeat;
  const presentationBusy = presentation.isPlaying;
  const displayTeam = displaySide === 'player' ? view.player : view.opponent;
  const homeTotals = totals(view.player);
  const awayTotals = totals(view.opponent);
  const plannedOutIds = subs.map((sub) => sub.outCardId);
  const plannedInIds = new Set(subs.map((sub) => sub.inCardId));
  const canEditHome = phase === 'break' && !presentationBusy && displaySide === 'player';
  const energyBudget = phase === 'break' ? BREAK_ENERGY[view.period] ?? 0 : 0;
  const energySpent = subs.reduce((total, sub) => total + cardMetaFor(sub.inCardId).cost, 0);
  const energyRemaining = Math.max(0, energyBudget - energySpent);
  const substitutionPreview = previewSubstitutions(view, subs);

  const allVisibleBeats = useMemo(
    () => [...presentation.history, ...(currentBeat ? [currentBeat] : [])],
    [currentBeat, presentation.history],
  );
  const pressureBeat = useMemo(
    () => [...allVisibleBeats].reverse().find((beat) => beat.pressure),
    [allVisibleBeats],
  );
  const logBeats = useMemo(
    () => allVisibleBeats
      .filter((beat) => !['lock', 'pressure', 'threshold', 'chances', 'overview'].includes(beat.kind))
      .slice(-3)
      .reverse(),
    [allVisibleBeats],
  );

  const revealGoal = useCallback((beat: PresentationBeat | null) => {
    if (!beat || beat.kind !== 'goal' || !beat.side || revealedGoalIds.current.has(beat.id)) return;
    revealedGoalIds.current.add(beat.id);
    setPresentedScore((score) => ({ ...score, [beat.side!]: score[beat.side!] + 1 }));
  }, []);

  const advancePresentation = useCallback(() => {
    const nextBeat = director.advance();
    revealGoal(nextBeat);
    setTick((tick) => tick + 1);
  }, [director, revealGoal]);

  useEffect(() => {
    if (!autoPlay || !currentBeat || inspected) return;
    const timer = window.setTimeout(advancePresentation, currentBeat.durationMs);
    return () => window.clearTimeout(timer);
  }, [advancePresentation, autoPlay, currentBeat, inspected]);

  useEffect(() => {
    if (presentationBusy && currentBeat?.side) setDisplaySide(currentBeat.side);
  }, [currentBeat?.id, currentBeat?.side, presentationBusy]);

  useEffect(() => {
    if (phase === 'break' && !presentationBusy) setDisplaySide('player');
  }, [phase, presentationBusy]);

  const resetPlan = () => {
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
    activations: nextActivations.map((instanceId) => ({
      actionInstanceId: instanceId,
      sourceId: activationSource.get(instanceId) ?? '',
    })),
  });

  const appendBeats = (beats: readonly PresentationBeat[]) => {
    director.append(beats);
    revealGoal(director.currentBeat());
    setAutoPlay(true);
    bump();
  };

  const resolveCurrentPeriod = (prefix: readonly PresentationBeat[] = []) => {
    controller.resolvePeriod();
    const snapshot = controller.getSnapshots().at(-1);
    if (!snapshot) throw new Error('V7 resolved a period without producing a snapshot.');
    const nextView = controller.getView();
    const periodBeats = buildPeriodPresentation(snapshot, nextView, controller.getPhase() === 'fulltime');
    appendBeats([...prefix, ...periodBeats]);
    resetPlan();
    bump();
  };

  const onKickoff = () => {
    if (presentationBusy || phase !== 'period') return;
    resolveCurrentPeriod();
  };

  const onContinueBreak = () => {
    if (presentationBusy || phase !== 'break') return;
    const result = controller.setPlayerDecision(buildDecision(subs, activations));
    if (!result.ok) {
      bump();
      return;
    }

    const revealBeats = buildSubstitutionRevealBeats(view.period, view, subs);
    const activationBeats: PresentationBeat[] = activations.flatMap((instanceId, index) => {
      const action = view.player.actions.find((candidate) => candidate.instanceId === instanceId);
      if (!action) return [];
      return [{
        id: `presentation:${view.period}:activation:${index}:${instanceId}`,
        kind: 'reveal',
        period: view.period,
        side: 'player',
        cardId: action.cardId,
        title: `${action.actionName} activated`,
        detail: `${action.cardName} · ${action.displayText}`,
        durationMs: 1100,
      }];
    });

    controller.resolveBreak();
    resolveCurrentPeriod([...revealBeats, ...activationBeats]);
  };

  const onSkipMoments = () => {
    director.skip();
    setPresentedScore({ player: view.player.score, opponent: view.opponent.score });
    bump();
  };

  const onPickBench = (player: UiPlayerView) => {
    const cost = cardMetaFor(player.cardId).cost;
    const spent = plannedInIds.has(player.cardId);
    const unaffordable = cost > energyRemaining;
    if (!canEditHome || spent || unaffordable) {
      setInspected(player);
      return;
    }
    setPickBench((current) => (current === player.cardId ? null : player.cardId));
  };

  const onPickActive = (cardId: string) => {
    if (!pickBench || !canEditHome) return;
    if (subs.some((sub) => sub.outCardId === cardId || sub.inCardId === pickBench)) return;
    const next = [...subs, { outCardId: cardId, inCardId: pickBench }];
    setSubs(next);
    setPickBench(null);
    controller.setPlayerDecision(buildDecision(next, activations));
    bump();
  };

  const removeSub = (index: number) => {
    const next = subs.filter((_, currentIndex) => currentIndex !== index);
    setSubs(next);
    controller.setPlayerDecision(buildDecision(next, activations));
    bump();
  };

  const toggleActivation = (instanceId: string) => {
    const next = activations.includes(instanceId)
      ? activations.filter((id) => id !== instanceId)
      : [...activations, instanceId];
    setActivations(next);
    controller.setPlayerDecision(buildDecision(subs, next));
    bump();
  };

  const playerActivatable = view.player.actions.filter(
    (action) => action.timing === 'activated' && !action.disabled && (action.remainingCharges ?? 1) > 0,
  );
  const nameOf = (cardId: string) => (
    view.player.active.find((player) => player.cardId === cardId)?.shortName
    ?? view.player.bench.find((player) => player.cardId === cardId)?.shortName
    ?? cardId
  );

  const primary = phase === 'fulltime'
    ? { label: 'New match →', onClick: onNewMatch, disabled: presentationBusy }
    : phase === 'break'
      ? { label: subs.length || activations.length ? 'Lock changes →' : 'Continue →', onClick: onContinueBreak, disabled: presentationBusy }
      : { label: 'Kick off →', onClick: onKickoff, disabled: presentationBusy };

  const pressure = pressureBeat?.pressure;
  const otherSideLabel = displaySide === 'player' ? 'away' : 'home';

  return (
    <main className={`v7-lab${presentationBusy ? ' resolving' : ''}`}>
      <section className="v7-scoreboard">
        <div className="v7-score-top">
          <div className="v7-team-total home">
            <span>HOME</span>
            <div><strong className="att">{homeTotals.attack}</strong><strong className="def">{homeTotals.defence}</strong></div>
          </div>
          <div className="v7-score-centre">
            <span>{phase === 'fulltime' && !presentationBusy ? 'FULL TIME' : beatLabel(currentBeat, view.period)}</span>
            <strong>{presentedScore.player}<i>–</i>{presentedScore.opponent}</strong>
            <small>Seed {view.seed}</small>
          </div>
          <div className="v7-team-total away">
            <span>AWAY</span>
            <div><strong className="att">{awayTotals.attack}</strong><strong className="def">{awayTotals.defence}</strong></div>
          </div>
        </div>

        <V7PressureBoard currentBeat={currentBeat} visibleBeats={allVisibleBeats} pressure={pressure} />
      </section>

      <V7Pitch
        beat={currentBeat}
        team={displayTeam}
        side={displaySide}
        canSelect={canEditHome}
        selectedBenchId={pickBench}
        plannedOutIds={plannedOutIds}
        onPickActive={onPickActive}
        onInspect={setInspected}
      />

      <section className="v7-bench-section" style={{ '--bench-count': Math.max(1, displayTeam.bench.length) } as React.CSSProperties}>
        <div className="v7-bench-heading">
          <div><span className="v7-tag">{displaySide === 'player' ? 'Home bench' : 'Away bench'}</span><strong>{canEditHome ? 'Tap a card, then a player' : 'Tap any card to inspect'}</strong></div>
          {phase === 'break' && displaySide === 'player' && <div className="v7-energy"><strong>{energyRemaining}</strong><span>/{energyBudget}</span><i>⚡</i></div>}
        </div>
        <div className="v7-bench-row">
          {displayTeam.bench.map((player) => {
            const cost = cardMetaFor(player.cardId).cost;
            const spent = plannedInIds.has(player.cardId);
            const unaffordable = canEditHome && !spent && cost > energyRemaining;
            return (
              <V7PlayerCard
                key={player.cardId}
                player={player}
                compact
                selected={pickBench === player.cardId}
                dimmed={spent || unaffordable}
                badge={spent ? 'IN' : unaffordable ? 'LOCK' : undefined}
                onClick={() => onPickBench(player)}
              />
            );
          })}
        </div>
      </section>

      {presentationBusy && currentBeat ? (
        <V7ResolutionStrip beat={currentBeat} />
      ) : phase === 'break' && displaySide === 'player' ? (
        <section className="v7-coach-strip">
          <div className="v7-impact-row">
            <span>PROJECTED</span>
            <b>{delta(substitutionPreview.attackDelta)} ATT</b>
            <b>{delta(substitutionPreview.defenceDelta)} DEF</b>
            <strong>{substitutionPreview.nextHomeChances} chances {substitutionPreview.homeChanceDelta !== 0 ? `(${delta(substitutionPreview.homeChanceDelta)})` : ''}</strong>
          </div>
          <div className="v7-plan-row">
            {subs.map((sub, index) => (
              <button type="button" key={`${sub.outCardId}:${sub.inCardId}`} onClick={() => removeSub(index)}>
                {nameOf(sub.outCardId)} <span>→</span> {nameOf(sub.inCardId)} <i>×</i>
              </button>
            ))}
            {playerActivatable.map((action: UiActionView) => (
              <button
                type="button"
                className={activations.includes(action.instanceId) ? 'active' : ''}
                key={action.instanceId}
                onClick={() => toggleActivation(action.instanceId)}
              >
                ⚡ {action.actionName}
              </button>
            ))}
            {subs.length === 0 && playerActivatable.length === 0 && <span className="v7-plan-empty">No changes selected.</span>}
          </div>
          {diag.validationErrors.length > 0 && <div className="v7-err">{diag.validationErrors.join(' ')}</div>}
        </section>
      ) : (
        <section className="v7-match-log">
          {logBeats.length === 0 ? (
            <div className="v7-log-empty">Your XI is set. Kick off to calculate pressure and chances.</div>
          ) : logBeats.map((beat) => (
            <div className={`v7-log-row kind-${beat.kind}`} key={beat.id}>
              <span>{logIcon(beat)}</span>
              <b>{beat.side === 'player' ? 'HOME' : beat.side === 'opponent' ? 'AWAY' : 'MATCH'}</b>
              <div><strong>{beat.title}</strong>{beat.detail && <small>{beat.detail}</small>}</div>
            </div>
          ))}
        </section>
      )}

      <footer className={`v7-bottom-actions${phase === 'fulltime' ? ' fulltime' : ''}`}>
        <button type="button" className="v7-icon-action" disabled={presentationBusy} onClick={() => setDisplaySide((side) => side === 'player' ? 'opponent' : 'player')} aria-label={`Show ${otherSideLabel} team`} title={`Show ${otherSideLabel} team`}>
          <TeamSwitchIcon />
        </button>
        <button type="button" className="v7-primary-action" disabled={primary.disabled} onClick={primary.onClick}>
          {presentationBusy ? 'Resolving period…' : primary.label}
        </button>
        {phase === 'fulltime' ? (
          <button type="button" className="v7-icon-action" disabled={presentationBusy} onClick={onReplay} aria-label="Replay the same seed" title="Replay same seed"><ReplayIcon /></button>
        ) : (
          <button type="button" className="v7-icon-action seed" disabled={presentationBusy} onClick={onNewMatch} aria-label="Start a new seeded match" title="New seed"><NewSeedIcon /></button>
        )}
      </footer>

      {presentationBusy && (
        <div className="v7-playback-controls">
          <button type="button" onClick={() => setAutoPlay((playing) => !playing)}>{autoPlay ? 'Pause' : 'Play'}</button>
          <button type="button" onClick={advancePresentation}>Next</button>
          <button type="button" onClick={onSkipMoments}>Skip</button>
        </div>
      )}

      {inspected && (
        <div className="v7-inspector-backdrop" role="presentation" onClick={() => setInspected(null)}>
          <section className="v7-inspector" role="dialog" aria-modal="true" aria-label={`${inspected.name} details`} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="v7-inspector-close" onClick={() => setInspected(null)} aria-label="Close player details">×</button>
            <V7PlayerCard player={inspected} highlighted onClick={() => {}} />
            <div className="v7-inspector-copy">
              <span>{inspected.position} · {cardMetaFor(inspected.cardId).role} · Cost {cardMetaFor(inspected.cardId).cost}</span>
              <h2>{inspected.name}</h2>
              <div className="v7-inspector-stats"><b>{inspected.attack}<small>ATT</small></b><b>{inspected.defence}<small>DEF</small></b></div>
              <div className="v7-inspector-actions">
                {cardMetaFor(inspected.cardId).actions.length
                  ? cardMetaFor(inspected.cardId).actions.map((action) => <span key={action}>⚡ {action}</span>)
                  : <span>No active ability</span>}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
