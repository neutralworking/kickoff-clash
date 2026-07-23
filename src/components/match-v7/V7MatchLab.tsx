'use client';

import { useMemo, useState } from 'react';
import './v7lab.css';
import {
  V7MatchController,
  v7Fixture,
  type BreakDecision,
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
  isPlayer,
  breaking,
  pickBench,
  onPickActive,
}: {
  team: UiTeamView;
  isPlayer: boolean;
  breaking: boolean;
  pickBench: string | null;
  onPickActive: (cardId: string) => void;
}) {
  const bySector = (key: string) => team.active.filter((p) => (p.sector ?? 'centre') === key);
  return (
    <div className="v7-board">
      <h3>{team.managerName} <span className="v7-muted">· {team.score}</span></h3>
      <div className="sub">{team.formationName}</div>
      {SECTORS.map((sector) => {
        const players = bySector(sector.key);
        if (players.length === 0) return null;
        return (
          <div className="v7-sector" key={sector.key}>
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

export default function V7MatchLab() {
  // Guarded initialisation: build the controller once, and if it throws, show a
  // useful diagnostic (with the heading) instead of a blank page. All match
  // hooks live in the inner component so hook order is never conditional.
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
  // The controller is a stable mutable instance; reading it during render is
  // safe, and a tick forces re-render after each command mutates it in place.
  const [, setTick] = useState(0);
  const bump = () => setTick((tick) => tick + 1);
  const [pickBench, setPickBench] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubDecision[]>([]);
  const [activations, setActivations] = useState<string[]>([]);

  const phase = controller.getPhase();
  const view: UiMatchView = controller.getView();
  const events = controller.getEvents();
  const diag = controller.getDiagnostics();

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

  const sync = (nextSubs: SubDecision[], nextActivations: string[]) => {
    if (phase === 'break') controller.setPlayerDecision(buildDecision(nextSubs, nextActivations));
    bump();
  };

  const onResolvePeriod = () => {
    controller.resolvePeriod();
    resetLocal();
    bump();
  };

  const onResolveBreak = () => {
    const result = controller.setPlayerDecision(buildDecision(subs, activations));
    if (!result.ok) {
      bump();
      return;
    }
    controller.resolveBreak();
    resetLocal();
    bump();
  };

  const onRestart = () => {
    controller.restart();
    resetLocal();
    bump();
  };

  const onPickBench = (cardId: string) => setPickBench((cur) => (cur === cardId ? null : cardId));
  const onPickActive = (cardId: string) => {
    if (!pickBench) return;
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
        <span className="v7-tag">V7 dev slice</span>
        <span className="v7-muted">Entry <b>/lab/match-v7</b> · data <b>{diag.dataSource}</b> · V6 is still the default game.</span>
      </div>

      <div className="v7-scorebar">
        <div className="v7-team-name">{view.player.managerName}</div>
        <div>
          <div className="v7-score">{view.player.score}–{view.opponent.score}</div>
          <div className="v7-phase">{view.phaseLabel}</div>
          <div className="v7-priority">Priority: {view.priority === 'player' ? view.player.managerName : view.opponent.managerName}</div>
        </div>
        <div className="v7-team-name right">{view.opponent.managerName}</div>
      </div>

      <div className="v7-boards">
        <TeamBoard team={view.player} isPlayer breaking={phase === 'break'} pickBench={pickBench} onPickActive={onPickActive} />
        <TeamBoard team={view.opponent} isPlayer={false} breaking={false} pickBench={null} onPickActive={() => {}} />
      </div>

      {phase === 'period' && (
        <div className="v7-panel v7-row">
          <div>
            <div className="v7-tag">Ready</div>
            <div className="v7-muted">Resolve period {view.period}: create chances → roll → goals.</div>
          </div>
          <span className="v7-spacer" />
          <button className="v7-btn cta" onClick={onResolvePeriod}>Resolve Period {view.period} →</button>
        </div>
      )}

      {phase === 'break' && (
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
            <button className="v7-btn cta" onClick={onResolveBreak}>Resolve Break →</button>
          </div>
        </div>
      )}

      {phase === 'fulltime' && view.result && (
        <div className={`v7-result ${view.result}`}>
          <div className="big">{view.player.score}–{view.opponent.score}</div>
          <div className="verdict">{view.result}</div>
          <button className="v7-btn cta" onClick={onRestart}>Restart (same seed)</button>
        </div>
      )}

      <div className="v7-tag" style={{ margin: '4px 2px' }}>Event feed ({events.length})</div>
      <div className="v7-feed">
        {[...events].slice(-80).reverse().map((event: MatchEvent) => (
          <div className={`v7-feed-item k-${event.kind}`} key={event.id}>
            <span className="v7-feed-kind">{event.kind.replace(/_/g, ' ')}</span>
            <span>{event.text}</span>
          </div>
        ))}
      </div>

      <details className="v7-panel v7-diag" style={{ marginTop: 12 }}>
        <summary>Diagnostics</summary>
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
      </details>
    </div>
  );
}
