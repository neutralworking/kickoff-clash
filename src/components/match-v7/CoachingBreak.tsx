'use client';

import { useMemo, useState } from 'react';
import type { BreakDecision, SubDecision, UiActionView, UiMatchView, UiPlayerView } from '@/game-v7';

// The coaching break: a focused, mobile-first substitution + action screen. It
// owns the in-progress plan (selections), shows energy used vs available, keeps
// a persistent plan summary, and only submits on an explicit confirm. Tapping a
// bench player then an active player queues a swap; the selected pair is made
// obvious; swaps can be removed before confirming. Actions show their effect,
// charges and legal/illegal state with a reason.

const BREAK_LABEL: Record<number, string> = { 1: 'First Break', 2: 'Half Time', 3: 'Final Break' };
const BREAK_ENERGY: Record<number, number> = { 1: 3, 2: 5, 3: 7 };

export function CoachingBreak({
  view,
  breakIndex,
  validate,
  onConfirm,
}: {
  view: UiMatchView;
  breakIndex: number;
  /** Live-validate a decision; returns human-readable errors ([] when legal). */
  validate: (decision: BreakDecision) => string[];
  onConfirm: (decision: BreakDecision) => void;
}) {
  const [pickBench, setPickBench] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubDecision[]>([]);
  const [activations, setActivations] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const energyAvailable = BREAK_ENERGY[breakIndex] ?? 3;
  const costOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of [...view.player.active, ...view.player.bench]) map.set(p.cardId, p.cost);
    return (id: string) => map.get(id) ?? 0;
  }, [view.player.active, view.player.bench]);
  const nameOf = (id: string) =>
    view.player.active.find((p) => p.cardId === id)?.shortName ?? view.player.bench.find((p) => p.cardId === id)?.shortName ?? id;

  const energyUsed = subs.reduce((sum, s) => sum + costOf(s.inCardId), 0);

  const actionSource = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of view.player.actions) map.set(a.instanceId, a.cardId);
    return map;
  }, [view.player.actions]);

  const toDecision = (nextSubs: SubDecision[], nextActivations: string[]): BreakDecision => ({
    subs: nextSubs,
    activations: nextActivations.map((id) => ({ actionInstanceId: id, sourceId: actionSource.get(id) ?? '' })),
  });
  const decision = toDecision(subs, activations);

  // Validate on every change (never in an effect): empty plans are trivially
  // legal; anything else is checked against the engine's own break rules.
  const revalidate = (nextSubs: SubDecision[], nextActivations: string[]) => {
    setErrors(nextSubs.length === 0 && nextActivations.length === 0 ? [] : validate(toDecision(nextSubs, nextActivations)));
  };

  const onPickBench = (cardId: string) => setPickBench((cur) => (cur === cardId ? null : cardId));
  const onPickActive = (cardId: string) => {
    if (!pickBench) return;
    if (subs.some((s) => s.outCardId === cardId || s.inCardId === pickBench)) return;
    const next = [...subs, { outCardId: cardId, inCardId: pickBench }];
    setSubs(next);
    setPickBench(null);
    revalidate(next, activations);
  };
  const removeSub = (i: number) => {
    const next = subs.filter((_, j) => j !== i);
    setSubs(next);
    revalidate(next, activations);
  };
  const toggleActivation = (id: string) => {
    const next = activations.includes(id) ? activations.filter((x) => x !== id) : [...activations, id];
    setActivations(next);
    revalidate(subs, next);
  };

  const activatable = view.player.actions.filter((a) => a.timing === 'activated');
  const overEnergy = energyUsed > energyAvailable;
  const canConfirm = errors.length === 0 && !overEnergy;

  const bench = view.player.bench;
  const subbedOut = new Set(subs.map((s) => s.outCardId));

  return (
    <div className="v7-coach">
      <div className="v7-coach-head">
        <div className="v7-coach-title">{BREAK_LABEL[breakIndex] ?? `Break ${breakIndex}`}</div>
        <div className={`v7-energy${overEnergy ? ' over' : ''}`}>
          <span className="v7-bolt" aria-hidden>⚡</span>
          <b>{energyUsed}</b>/{energyAvailable}
          <span className="v7-energy-label">energy</span>
        </div>
        <div className="v7-coach-priority">
          Priority: {view.priority === 'player' ? 'You' : 'Opponent'}
        </div>
      </div>

      <p className="v7-coach-hint">
        Blind changes — the opponent has locked a hidden plan. Tap a bench player, then the player to replace.
      </p>

      <div className="v7-coach-section">
        <div className="v7-section-label">Your XI {pickBench ? '· tap a player to swap out' : ''}</div>
        <div className="v7-xi-grid">
          {view.player.active.map((p) => (
            <button
              key={p.cardId}
              type="button"
              className={`v7-xi-card${subbedOut.has(p.cardId) ? ' out' : ''}${pickBench ? ' targetable' : ''}`}
              onClick={() => onPickActive(p.cardId)}
              disabled={!pickBench || subbedOut.has(p.cardId)}
              aria-label={`${p.name}, ${p.position ?? ''}, ${p.attack} attack ${p.defence} defence`}
            >
              <span className="v7-xi-name">{p.shortName}</span>
              <span className="v7-xi-meta">{p.position} · {p.attack}A/{p.defence}D</span>
              {subbedOut.has(p.cardId) ? <span className="v7-xi-flag">OUT</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="v7-coach-section">
        <div className="v7-section-label">Bench</div>
        <div className="v7-bench-grid">
          {bench.map((p: UiPlayerView) => {
            const used = subs.some((s) => s.inCardId === p.cardId);
            const affordable = p.cost <= energyAvailable - energyUsed + 0; // header shows the running total
            return (
              <button
                key={p.cardId}
                type="button"
                className={`v7-bench-card${pickBench === p.cardId ? ' picked' : ''}${used ? ' used' : ''}`}
                onClick={() => onPickBench(p.cardId)}
                disabled={used}
                aria-pressed={pickBench === p.cardId}
                aria-label={`${p.name}, ${p.position ?? ''}, cost ${p.cost} energy${used ? ', already in plan' : ''}`}
              >
                <span className="v7-xi-name">{p.shortName}</span>
                <span className="v7-xi-meta">{p.position} · {p.attack}A/{p.defence}D</span>
                <span className={`v7-cost${!affordable ? ' dear' : ''}`}>⚡{p.cost}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activatable.length > 0 ? (
        <div className="v7-coach-section">
          <div className="v7-section-label">Actions</div>
          <div className="v7-action-list">
            {activatable.map((a: UiActionView) => {
              const legal = !a.disabled && !a.usedThisBreak && (a.remainingCharges ?? 1) > 0;
              const reason = a.disabled ? 'disabled' : a.usedThisBreak ? 'used this break' : (a.remainingCharges ?? 1) <= 0 ? 'no charges' : '';
              return (
                <button
                  key={a.instanceId}
                  type="button"
                  className={`v7-action-card${activations.includes(a.instanceId) ? ' on' : ''}${legal ? '' : ' illegal'}`}
                  onClick={() => legal && toggleActivation(a.instanceId)}
                  disabled={!legal}
                  aria-pressed={activations.includes(a.instanceId)}
                >
                  <span className="v7-action-name">{a.actionName}</span>
                  <span className="v7-action-effect">{a.cardName} · {a.displayText}</span>
                  <span className="v7-action-foot">
                    <span className="v7-chip">{a.remainingCharges ?? '∞'} charge{a.remainingCharges === 1 ? '' : 's'}</span>
                    {legal ? <span className="v7-chip legal">tap to arm</span> : <span className="v7-chip why">{reason}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="v7-plan" aria-live="polite">
        <div className="v7-section-label">Pending plan</div>
        {subs.length === 0 && activations.length === 0 ? (
          <div className="v7-plan-empty">No changes — you&apos;ll play the same XI.</div>
        ) : (
          <ul className="v7-plan-list">
            {subs.map((s, i) => (
              <li key={`s${i}`} className="v7-plan-item">
                <span>🔁 {nameOf(s.outCardId)} → <b>{nameOf(s.inCardId)}</b> <span className="v7-muted">(⚡{costOf(s.inCardId)})</span></span>
                <button type="button" className="v7-mini-btn" onClick={() => removeSub(i)} aria-label={`Remove substitution ${nameOf(s.inCardId)}`}>remove</button>
              </li>
            ))}
            {activations.map((id) => (
              <li key={`a${id}`} className="v7-plan-item">
                <span>⚡ {view.player.actions.find((a) => a.instanceId === id)?.actionName} <span className="v7-muted">({nameOf(actionSource.get(id) ?? '')})</span></span>
                <button type="button" className="v7-mini-btn" onClick={() => toggleActivation(id)} aria-label="Remove action">remove</button>
              </li>
            ))}
          </ul>
        )}
        {overEnergy ? <div className="v7-err">Over the energy budget — remove a change (⚡{energyUsed} used of {energyAvailable}).</div> : null}
        {errors.length > 0 ? <div className="v7-err">{errors.join(' ')}</div> : null}
      </div>

      <button type="button" className="v7-confirm" onClick={() => canConfirm && onConfirm(decision)} disabled={!canConfirm}>
        Confirm plan &amp; kick off →
      </button>
    </div>
  );
}
