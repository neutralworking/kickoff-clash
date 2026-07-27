'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { V7Pitch, V7PlayerCard } from './V7Pitch';

type Sector = 'left' | 'centre' | 'right';
type DisplaySide = 'player' | 'opponent';

const BREAK_ENERGY = [0, 3, 5, 7];

function sectorForBeat(beat: BroadcastBeat | null): Sector | null {
  if (!beat) return null;
  const text = `${beat.title} ${beat.detail ?? ''}`.toLowerCase();
  if (text.includes('left')) return 'left';
  if (text.includes('right')) return 'right';
  if (text.includes('centre') || text.includes('center')) return 'centre';
  return null;
}

function totals(team: UiTeamView): { attack: number; defence: number } {
  return team.active.reduce(
    (sum, player) => ({ attack: sum.attack + Math.max(0, player.attack), defence: sum.defence + Math.max(0, player.defence) }),
    { attack: 0, defence: 0 },
  );
}

function chanceCount(events: readonly MatchEvent[], side: DisplaySide, period: number): number {
  return events.filter((event) => event.kind === 'chance_created' && event.side === side && event.period === period).length;
}

function beatText(beat: BroadcastBeat): string {
  return `${beat.title} ${beat.detail ?? ''}`.toLowerCase();
}

function focusPlayerForBeat(
  beat: BroadcastBeat | null,
  sector: Sector | null,
  player: UiTeamView,
  opponent: UiTeamView,
): UiPlayerView | null {
  if (!beat?.side) return null;
  const team = beat.side === 'player' ? player : opponent;
  const text = beatText(beat);
  const named = team.active.find((card) => {
    const names = [card.name, card.shortName, card.name.split(/\s+/).at(-1) ?? ''];
    return names.some((name) => name.length > 2 && text.includes(name.toLowerCase()));
  });
  if (named) return named;

  const sectorPlayers = sector ? team.active.filter((card) => (card.sector ?? 'centre') === sector) : team.active;
  const pool = sectorPlayers.length > 0 ? sectorPlayers : team.active;
  return [...pool].sort((a, b) => b.attack - a.attack)[0] ?? null;
}

function isLoggable(beat: BroadcastBeat): boolean {
  return ['kickoff', 'action', 'change', 'chance', 'roll', 'goal', 'miss', 'period_end', 'full_time'].includes(beat.kind);
}

function logIcon(beat: BroadcastBeat): string {
  switch (beat.kind) {
    case 'goal': return '⚽';
    case 'miss': return '×';
    case 'roll': return '◆';
    case 'action': return '⚡';
    case 'change': return '↔';
    case 'period_end': return '■';
    case 'full_time': return '■';
    default: return '•';
  }
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
  const [displaySide, setDisplaySide] = useState<DisplaySide>('player');
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
  const displayTeam = displaySide === 'player' ? view.player : view.opponent;
  const homeTotals = totals(view.player);
  const awayTotals = totals(view.opponent);
  const homeEdge = homeTotals.attack / Math.max(1, homeTotals.attack + awayTotals.defence);
  const awayEdge = awayTotals.attack / Math.max(1, awayTotals.attack + homeTotals.defence);
  const focusPlayer = focusPlayerForBeat(currentBeat, activeSector, view.player, view.opponent);
  const plannedOutIds = subs.map((sub) => sub.outCardId);
  const plannedInIds = new Set(subs.map((sub) => sub.inCardId));
  const canEditHome = phase === 'break' && !presentationBusy && displaySide === 'player';

  const logBeats = useMemo(() => {
    const all = [...presentation.history, ...(currentBeat ? [currentBeat] : [])];
    return all.filter(isLoggable).slice(-8).reverse();
  }, [currentBeat, presentation.history]);

  const revealGoal = useCallback((beat: BroadcastBeat | null) => {
    if (!beat || beat.kind !== 'goal' || !beat.side || revealedGoalIds.current.has(beat.id)) return;
    revealedGoalIds.current.add(beat.id);
    const side = beat.side;
    setPresentedScore((score) => ({ ...score, [side]: score[side] + 1 }));
  }, []);

  const advancePresentation = useCallback(() => {
    const nextBeat = director.advance();
    revealGoal(nextBeat);
    setTick((tick) => tick + 1);
  }, [director, revealGoal]);

  useEffect(() => {
    if (!autoPlay || !currentBeat) return;
    const timer = window.setTimeout(advancePresentation, currentBeat.durationMs);
    return () => window.clearTimeout(timer);
  }, [advancePresentation, autoPlay, currentBeat]);

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
    activations: nextActivations.map((instanceId) => ({
      actionInstanceId: instanceId,
      sourceId: activationSource.get(instanceId) ?? '',
    })),
  });

  const appendNewEvents = (beforeCount: number) => {
    const nextEvents = controller.getEvents().slice(beforeCount);
    director.append(buildBroadcastBeats(nextEvents));
    revealGoal(director.currentBeat());
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
    setDisplaySide('player');
    resetLocal();
    bump();
  };

  const onSkipMoments = () => {
    director.skip();
    setPresentedScore({ player: view.player.score, opponent: view.opponent.score });
    bump();
  };

  const onPickBench = (cardId: string) => {
    if (!canEditHome || plannedInIds.has(cardId)) return;
    setPickBench((current) => (current === cardId ? null : cardId));
  };

  const onPickActive = (cardId: string) => {
    if (!pickBench || !canEditHome) return;
    if (subs.some((sub) => sub.outCardId === cardId || sub.inCardId === pickBench)) return;
    const next = [...subs, { outCardId: cardId, inCardId: pickBench }];
    setSubs(next);
    setPickBench(null);
    sync(next, activations);
  };

  const removeSub = (index: number) => {
    const next = subs.filter((_, currentIndex) => currentIndex !== index);
    setSubs(next);
    sync(next, activations);
  };

  const toggleActivation = (instanceId: string) => {
    const next = activations.includes(instanceId)
      ? activations.filter((id) => id !== instanceId)
      : [...activations, instanceId];
    setActivations(next);
    sync(subs, next);
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
    ? { label: 'Play again →', onClick: onRestart, disabled: presentationBusy }
    : phase === 'break'
      ? { label: 'Continue →', onClick: onResolveBreak, disabled: presentationBusy }
      : { label: `Play period ${view.period} →`, onClick: onResolvePeriod, disabled: presentationBusy };

  const homeChances = chanceCount(events, 'player', view.period);
  const awayChances = chanceCount(events, 'opponent', view.period);

  return (
    <main className="v7-lab">
      <section className="v7-scoreboard">
        <div className="v7-score-top">
          <div className="v7-team-total home">
            <span>HOME</span>
            <div><strong className="att">{homeTotals.attack}</strong><strong className="def">{homeTotals.defence}</strong></div>
            <small>{view.player.managerName}</small>
          </div>
          <div className="v7-score-centre">
            <span>{phase === 'fulltime' ? 'FULL TIME' : `PERIOD ${view.period}`}</span>
            <strong>{presentedScore.player}<i>–</i>{presentedScore.opponent}</strong>
            <small>{presentationBusy ? currentBeat?.eyebrow ?? 'Playing' : view.phaseLabel}</small>
          </div>
          <div className="v7-team-total away">
            <span>AWAY</span>
            <div><strong className="att">{awayTotals.attack}</strong><strong className="def">{awayTotals.defence}</strong></div>
            <small>{view.opponent.managerName}</small>
          </div>
        </div>
        <div className="v7-score-bars">
          <div className="v7-score-bar-row">
            <span>HOME</span><div><i className="home" style={{ width: `${homeEdge * 100}%` }} /></div><b>{homeChances}◆</b>
          </div>
          <div className="v7-score-bar-row">
            <span>AWAY</span><div><i className="away" style={{ width: `${awayEdge * 100}%` }} /></div><b>{awayChances}◆</b>
          </div>
        </div>
      </section>

      <V7Pitch
        beat={currentBeat}
        team={displayTeam}
        side={displaySide}
        activeSector={activeSector}
        focusPlayer={focusPlayer}
        canSelect={canEditHome}
        selectedBenchId={pickBench}
        plannedOutIds={plannedOutIds}
        onPickActive={onPickActive}
      />

      <section className="v7-bench-section">
        <div className="v7-section-heading">
          <div>
            <span className="v7-tag">{displaySide === 'player' ? 'Home bench' : 'Away bench'}</span>
            <strong>{canEditHome ? (pickBench ? 'Now pick a player on the pitch' : 'Pick a substitute') : 'Available players'}</strong>
          </div>
          {phase === 'break' && displaySide === 'player' && <b>{BREAK_ENERGY[view.period] ?? 3}⚡</b>}
        </div>
        <div className="v7-bench-row">
          {displayTeam.bench.map((player) => (
            <V7PlayerCard
              key={player.cardId}
              player={player}
              compact
              selected={pickBench === player.cardId}
              dimmed={plannedInIds.has(player.cardId)}
              badge={plannedInIds.has(player.cardId) ? 'IN' : undefined}
              onClick={canEditHome ? () => onPickBench(player.cardId) : undefined}
            />
          ))}
        </div>
      </section>

      {phase === 'break' && !presentationBusy && displaySide === 'player' && (
        <section className="v7-coaching-panel">
          <div className="v7-section-heading">
            <div><span className="v7-tag">Coaching break</span><strong>Make changes before continuing</strong></div>
          </div>

          {playerActivatable.length > 0 && (
            <div className="v7-action-list">
              {playerActivatable.map((action: UiActionView) => (
                <label className={`v7-action-chip${activations.includes(action.instanceId) ? ' selected' : ''}`} key={action.instanceId}>
                  <input type="checkbox" checked={activations.includes(action.instanceId)} onChange={() => toggleActivation(action.instanceId)} />
                  <span><b>{action.actionName}</b><small>{action.cardName} · {action.displayText}</small></span>
                  <strong>{action.remainingCharges ?? '∞'}⚡</strong>
                </label>
              ))}
            </div>
          )}

          {subs.length > 0 && (
            <div className="v7-sub-plan">
              {subs.map((sub, index) => (
                <button type="button" key={`${sub.outCardId}:${sub.inCardId}`} onClick={() => removeSub(index)}>
                  {nameOf(sub.outCardId)} <span>→</span> <b>{nameOf(sub.inCardId)}</b><i>×</i>
                </button>
              ))}
            </div>
          )}
          {diag.validationErrors.length > 0 && <div className="v7-err">{diag.validationErrors.join(' ')}</div>}
        </section>
      )}

      <section className="v7-match-log">
        <div className="v7-log-heading">
          <div><span className="v7-tag">Match log</span><strong>{presentationBusy ? 'Live sequence' : 'Recent events'}</strong></div>
          {presentationBusy && (
            <div className="v7-playback-controls">
              <button type="button" onClick={() => setAutoPlay((playing) => !playing)}>{autoPlay ? 'Pause' : 'Play'}</button>
              <button type="button" onClick={advancePresentation}>Next</button>
              <button type="button" onClick={onSkipMoments}>Skip</button>
            </div>
          )}
        </div>
        <div className="v7-log-list">
          {logBeats.length === 0 ? (
            <div className="v7-log-empty">The teams are set. Play the first period to start the match.</div>
          ) : logBeats.map((beat) => (
            <div className={`v7-log-row kind-${beat.kind}${beat.id === currentBeat?.id ? ' current' : ''}`} key={beat.id}>
              <span className="v7-log-icon">{logIcon(beat)}</span>
              <span className="v7-log-side">{beat.side === 'player' ? 'HOME' : beat.side === 'opponent' ? 'AWAY' : 'MATCH'}</span>
              <div><strong>{beat.title}</strong>{beat.detail && <small>{beat.detail}</small>}</div>
            </div>
          ))}
        </div>
      </section>

      {phase === 'fulltime' && view.result && !presentationBusy && (
        <section className={`v7-result ${view.result}`}>
          <span>FULL TIME</span><strong>{view.result}</strong><b>{presentedScore.player}–{presentedScore.opponent}</b>
        </section>
      )}

      <div className="v7-bottom-actions">
        <button
          type="button"
          className="v7-view-toggle"
          onClick={() => setDisplaySide((side) => (side === 'player' ? 'opponent' : 'player'))}
          aria-label="Toggle between home and away team"
        >
          <span className={displaySide === 'player' ? 'active' : ''}>HOME</span>
          <i>↔</i>
          <span className={displaySide === 'opponent' ? 'active' : ''}>AWAY</span>
        </button>
        <button type="button" className="v7-primary-action" disabled={primary.disabled} onClick={primary.onClick}>
          {presentationBusy ? `${currentBeat?.eyebrow ?? 'Match'} · playing…` : primary.label}
        </button>
      </div>

      <details className="v7-diagnostics">
        <summary>Diagnostics</summary>
        <dl>
          <dt>seed</dt><dd>{diag.seed}</dd>
          <dt>phase</dt><dd>{diag.phase}</dd>
          <dt>period</dt><dd>{diag.period}</dd>
          <dt>state</dt><dd>{diag.stateId}</dd>
          <dt>receipts</dt><dd>{diag.receiptCount}</dd>
          <dt>events</dt><dd>{diag.eventCount}</dd>
          <dt>validation</dt><dd>{diag.validationErrors.length ? diag.validationErrors.join(' ') : 'ok'}</dd>
        </dl>
        <div className="v7-raw-feed">
          {[...events].slice(-50).reverse().map((event: MatchEvent) => (
            <div key={event.id}><b>{event.kind.replace(/_/g, ' ')}</b><span>{event.text}</span></div>
          ))}
        </div>
      </details>
    </main>
  );
}
