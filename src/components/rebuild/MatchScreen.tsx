'use client';

/**
 * The rebuild match screen (SM §6, §9): step-resolved and interactive. The
 * batch decision bar (tactical hand, substitution, energy) sits between
 * batches; every generated window is a commit/pass choice — no empty turns.
 * The streak meter with projected payout is the centrepiece; the scoreline
 * stays honest while the points meter races the target; the opponent runs a
 * visible streak and its posture shifts arrive telegraphed one batch ahead.
 */

import { useMemo, useState } from 'react';
import type { RunState } from '../../engine/run';
import { fixtureConfig, applyMatchOutcome } from '../../engine/run';
import type { ManagerDef } from '../../engine/data/managers';
import type { EngineCard } from '../../engine/cards';
import type { AdvanceResult, MatchState } from '../../engine/match';
import { createMatch, advance } from '../../engine/match';
import type { MatchEvent } from '../../engine/events';
import { TACTICAL_CARDS, getTacticalCard } from '../../engine/data/tactical-cards';
import { GOAL_VALUE } from '../../engine/data/baseline';
import { RButton, RPanel, PIXEL_FONT } from './RebuildShell';
import { Chip } from './ManagerPick';

export default function MatchScreen({
  run,
  manager,
  xi,
  formation,
  onFullTime,
}: {
  run: RunState;
  manager: ManagerDef;
  xi: EngineCard[];
  formation?: string;
  onFullTime: (match: MatchState, nextRun: RunState) => void;
}) {
  const [res, setRes] = useState<AdvanceResult>(() =>
    createMatch(fixtureConfig(run, xi, undefined, formation))
  );
  const state = res.state;
  const me = state.sides[0];
  const them = state.sides[1];
  const minute = Math.min(90, ((Math.max(1, state.batch) - 1) * 3 + state.increment) * 5);

  const step = (decision: Parameters<typeof advance>[1]) => setRes(advance(state, decision));

  const upcoming = useMemo(() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.type === 'batch-start') return e.upcoming ?? null;
    }
    return null;
  }, [state.log]);

  const shiftTelegraphed =
    upcoming && res.awaiting?.kind === 'batch-start' && upcoming[1] !== activeOppPosture(state.log);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 16, paddingBottom: 8, minHeight: 0 }}>
      {/* Scoreboard: honest scoreline · points vs target · clock. */}
      <RPanel style={{ padding: 10 }}>
        <div className="flex items-center justify-between">
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 20, color: 'var(--cream)' }}>
            {me.goals}–{them.goals}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--dust)' }}>{minute}&apos;</div>
            <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--ink)' }}>BATCH {Math.max(1, state.batch)}/6</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: PIXEL_FONT, fontSize: 16, color: me.points >= state.config.target ? 'var(--success)' : 'var(--gold)' }}>
              {me.points.toFixed(1)}
            </div>
            <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)' }}>TARGET {state.config.target.toFixed(1)}</div>
          </div>
        </div>
        {/* Points meter. */}
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: 8, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (me.points / state.config.target) * 100)}%`,
              background: me.points >= state.config.target ? 'var(--success)' : 'var(--gold)',
            }}
          />
        </div>
      </RPanel>

      {/* Streak meter (the centrepiece) + the opponent engine strip. */}
      <div className="flex" style={{ gap: 8 }}>
        <RPanel style={{ flex: 1, padding: 10 }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)', letterSpacing: 1 }}>YOUR STREAK</div>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 22, color: me.streak >= 3 ? 'var(--gold)' : 'var(--cream)' }}>
            ×{Math.max(1, me.streak)}
          </div>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)' }}>
            NEXT GOAL BANKS {(Math.max(1, me.streak + 1) * GOAL_VALUE).toFixed(0)}
          </div>
        </RPanel>
        <RPanel style={{ flex: 1, padding: 10 }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: 'var(--dust)', letterSpacing: 1 }}>THEIR ENGINE</div>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 22, color: 'var(--kit-red)' }}>×{Math.max(1, them.streak)}</div>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 8, color: shiftTelegraphed ? 'var(--kit-blue)' : 'var(--dust)' }}>
            {shiftTelegraphed ? `SHIFTING TO ${upcoming![1].toUpperCase()}` : activeOppPosture(state.log).toUpperCase()}
          </div>
        </RPanel>
      </div>

      {/* Event ticker. */}
      <RPanel style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        <Ticker log={state.log} />
      </RPanel>

      {/* Decision bar. */}
      {res.awaiting?.kind === 'window' && (
        <RPanel style={{ padding: 10, border: '1px solid var(--gold)' }}>
          <div style={{ fontFamily: PIXEL_FONT, fontSize: 10, color: 'var(--gold)', letterSpacing: 1 }}>
            {res.awaiting.window.kind === 'transition' ? 'TRANSITION WINDOW' : 'SET-PIECE WINDOW'}
          </div>
          <div className="flex" style={{ gap: 8, marginTop: 8 }}>
            <RButton accent onClick={() => step({ type: 'commit' })} style={{ flex: 1 }}>
              COMMIT
            </RButton>
            <RButton onClick={() => step({ type: 'pass' })} style={{ flex: 1 }}>
              LET IT PASS
            </RButton>
          </div>
        </RPanel>
      )}

      {res.awaiting?.kind === 'batch-start' && (
        <RPanel style={{ padding: 10 }}>
          <div className="flex items-center justify-between">
            <div style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--dust)', letterSpacing: 1 }}>
              BATCH {res.awaiting.batch} · ENERGY {state.energy} · SUBS {me.subsLeft}
            </div>
          </div>
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
            {TACTICAL_CARDS.map((c) => {
              const used = state.playedCards.includes(c.id);
              const affordable = state.energy >= c.energyCost;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={used || !affordable}
                  onClick={() => step({ type: 'tactic-play', cardId: c.id })}
                  style={{
                    fontFamily: PIXEL_FONT,
                    fontSize: 8,
                    padding: '6px 8px',
                    borderRadius: 3,
                    border: `1px solid ${used || !affordable ? 'var(--border)' : c.posture === 'possession' ? 'var(--kit-red)' : 'var(--kit-blue)'}`,
                    color: used || !affordable ? 'var(--ink)' : 'var(--cream)',
                    opacity: used ? 0.35 : 1,
                  }}
                  title={`${c.posture} for ${c.durationBatches} batch(es) — ${c.energyCost} energy`}
                >
                  {c.name.toUpperCase()} ·{c.energyCost}⚡{c.durationBatches}B
                </button>
              );
            })}
            <button
              type="button"
              disabled={me.subsLeft <= 0}
              onClick={() => step({ type: 'substitution' })}
              style={{
                fontFamily: PIXEL_FONT,
                fontSize: 8,
                padding: '6px 8px',
                borderRadius: 3,
                border: '1px solid var(--success)',
                color: me.subsLeft > 0 ? 'var(--success)' : 'var(--ink)',
                opacity: me.subsLeft > 0 ? 1 : 0.35,
              }}
            >
              SUBSTITUTION
            </button>
          </div>
          <RButton accent onClick={() => step({ type: 'none' })} style={{ width: '100%', marginTop: 8 }}>
            PLAY BATCH {res.awaiting.batch} →
          </RButton>
        </RPanel>
      )}

      {res.awaiting === null && (
        <RButton accent onClick={() => onFullTime(state, applyMatchOutcome(run, state))}>
          FULL TIME →
        </RButton>
      )}
    </div>
  );
}

function activeOppPosture(log: MatchEvent[]): string {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.type === 'batch-start') return e.telegraph[1];
    if (e.type === 'match-start') return e.postures[1];
  }
  return 'possession';
}

/** Compact, plain-English ticker over the salient event kinds — newest first. */
function Ticker({ log }: { log: MatchEvent[] }) {
  const lines: { key: number; text: string; color?: string }[] = [];
  log.forEach((e, i) => {
    const min = 'clock' in e ? Math.min(90, ((e.clock.batch - 1) * 3 + Math.max(1, e.clock.increment)) * 5) : null;
    const at = min !== null ? `${min}'` : '';
    switch (e.type) {
      case 'goal':
        lines.push({
          key: i,
          text: `${at} GOAL ${e.side === 0 ? 'FOR' : 'AGAINST'} — via ${e.via}. ${e.score[0]}-${e.score[1]}`,
          color: e.side === 0 ? 'var(--success)' : 'var(--kit-red)',
        });
        break;
      case 'points-banked':
        if (e.side !== 0) break;
        if (e.source === 'accrual') {
          // Fold accrual ticks into one quiet line each (no goal-bank framing).
          lines.push({ key: i, text: `${at} +${e.value.toFixed(1)} accrual → ${e.total.toFixed(1)} pts` });
        } else {
          lines.push({ key: i, text: `${at} ×${e.mult} banks ${e.value.toFixed(1)} → ${e.total.toFixed(1)} pts`, color: 'var(--gold)' });
        }
        break;
      case 'streak-broken':
        if (e.side === 0)
          lines.push({ key: i, text: `${at} STREAK BROKEN — ${e.reason} (was ×${e.atStreak})`, color: 'var(--kit-red)' });
        break;
      case 'window-resolved':
        if (e.side === 0)
          lines.push({
            key: i,
            text: `${at} ${e.kind} window: ${e.charge.toFixed(1)} + d${e.die}→${e.roll} vs ${e.threshold} — ${e.converted ? 'CONVERTED' : 'missed'}`,
          });
        else if (e.converted) lines.push({ key: i, text: `${at} they convert a ${e.kind} window`, color: 'var(--kit-red)' });
        break;
      case 'window-decision':
        if (e.side === 0 && e.decision === 'pass') lines.push({ key: i, text: `${at} window passed up` });
        break;
      case 'posture-shift':
        lines.push({
          key: i,
          text: `${e.side === 0 ? 'You' : 'They'} shift to ${e.to}${e.reason === 'revert' ? ' (window over)' : ''}`,
          color: 'var(--kit-blue)',
        });
        break;
      case 'tactic-played':
        lines.push({ key: i, text: `You play ${getTacticalCard(e.card)?.name ?? e.card} (${e.durationBatches} batches)`, color: 'var(--kit-blue)' });
        break;
      case 'substitution':
        lines.push({ key: i, text: `Substitution — ${e.subsLeft} left`, color: 'var(--success)' });
        break;
      case 'cash-banked':
        if (e.side === 0) lines.push({ key: i, text: `${at} ${e.trait}: +£${e.value}`, color: 'var(--gold)' });
        break;
      case 'early-whistle':
        lines.push({ key: i, text: `EARLY WHISTLE — target met. Surplus £${e.surplusCash}`, color: 'var(--success)' });
        break;
      case 'batch-start':
        lines.push({ key: i, text: `— Batch ${e.batch} —` });
        break;
    }
  });
  lines.reverse();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {lines.slice(0, 60).map((l) => (
        <div key={l.key} style={{ fontFamily: PIXEL_FONT, fontSize: 8.5, lineHeight: 1.5, color: l.color ?? 'var(--cream-soft)' }}>
          {l.text}
        </div>
      ))}
      {lines.length === 0 && (
        <div style={{ fontFamily: PIXEL_FONT, fontSize: 9, color: 'var(--dust)' }}>KICK OFF — play the first batch.</div>
      )}
    </div>
  );
}
