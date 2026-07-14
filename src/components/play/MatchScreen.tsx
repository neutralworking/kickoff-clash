'use client';

/**
 * KC six-contest UI (NW-143) — the match, replayed from the event log.
 *
 * The engine resolves the whole match deterministically (match.ts) and hands us
 * its typed event log; this screen REPLAYS it period-by-period (SM §9: feedback
 * is the surface). The match is judged on the SCORELINE — win / draw / loss,
 * nothing else — so the scoreboard IS the centrepiece. The opponent engine
 * strip shows its posture and telegraphs a shift one period ahead; the tactical
 * hand plays cards between periods (the shell re-resolves; determinism keeps
 * revealed periods byte-identical). The UI computes nothing.
 */

import { useMemo, useState } from 'react';
import type { Contest, Manager, FixtureSetup, MatchResult, TacticalCard, TacticalPlay } from '../../engine-v2';
import { TACTICS, DEFAULT_ENERGY } from '../../engine-v2';
import type { MatchEvent } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, PIXEL } from './ui';

const PERIODS = 6; // engine "batches" — 15' of match time each
const minuteOf = (period: number, inc: number) => Math.min(90, ((period - 1) * 3 + Math.max(1, inc)) * 5);

interface Snap {
  score: [number, number];
  oppPosture: string;
  pressureStacks: number;
}

/** Fold the event log up to (and including) `throughPeriod` into a scoreboard. */
function snapshot(events: MatchEvent[], throughPeriod: number): Snap {
  const snap: Snap = { score: [0, 0], oppPosture: 'balanced', pressureStacks: 0 };
  let lastStackPeriod = 0;
  for (const e of events) {
    const b = 'clock' in e ? e.clock.batch : 'batch' in e ? e.batch : 0;
    if (b > throughPeriod) continue;
    if (e.type === 'match-start') snap.oppPosture = e.postures[1];
    else if (e.type === 'goal') snap.score = e.score;
    else if (e.type === 'posture-shift' && e.side === 1) snap.oppPosture = e.to;
    else if (e.type === 'pressure-built' && e.side === 0) {
      snap.pressureStacks = e.stacks;
      lastStackPeriod = e.batch;
    }
  }
  // the hold broke (no stack event this period) → the pressure has dissipated
  if (lastStackPeriod < throughPeriod) snap.pressureStacks = 0;
  return snap;
}

const VERDICT_COPY = { win: 'YOU WIN', draw: 'A DRAW', loss: 'YOU LOSE' } as const;
const VERDICT_COLOR = { win: 'var(--success)', draw: 'var(--gold)', loss: 'var(--kit-red)' } as const;

export default function MatchScreen({
  manager,
  setup,
  result,
  committed,
  plays,
  onPlayTactic,
  onFullTime,
}: {
  manager: Manager;
  setup: FixtureSetup;
  result: MatchResult;
  /** Contests the kicked-off XI is committed to (lights up tactic class buffs). */
  committed: Set<Contest>;
  /** Plays already called this match (spent energy). */
  plays: TacticalPlay[];
  /** Call a play at the given period — the shell re-resolves the fixture. */
  onPlayTactic: (atBatch: number, tactic: TacticalCard) => void;
  onFullTime: () => void;
}) {
  const [period, setPeriod] = useState(0); // periods revealed so far
  const [handOpen, setHandOpen] = useState(false);
  const snap = useMemo(() => snapshot(result.events, period), [result.events, period]);
  const done = period >= PERIODS;
  const energyLeft = DEFAULT_ENERGY - plays.reduce((s, p) => s + p.tactic.energyCost, 0);

  // telegraph: does the opponent shift posture in the NEXT period?
  const telegraph = useMemo(() => {
    const next = result.events.find((e) => e.type === 'posture-shift' && e.side === 1 && e.batch === period + 1);
    return next && next.type === 'posture-shift' ? next.to : null;
  }, [result.events, period]);

  const leading = snap.score[0] > snap.score[1];
  const level = snap.score[0] === snap.score[1];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 10 }}>
      {/* Scoreboard: the scoreline IS the game. */}
      <PPanel style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: PIXEL, fontSize: 26, color: leading ? 'var(--success)' : level ? 'var(--cream)' : 'var(--kit-red)' }}>
            {snap.score[0]}–{snap.score[1]}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--dust)' }}>{minuteOf(Math.max(1, period), 3)}&apos;</div>
            <Eyebrow>PERIOD {Math.min(period, PERIODS)}/{PERIODS}</Eyebrow>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 10, color: leading ? 'var(--success)' : level ? 'var(--gold)' : 'var(--kit-red)' }}>
              {leading ? 'WINNING' : level ? 'LEVEL' : 'LOSING'}
            </div>
            <Eyebrow>{level ? 'DRAW = HALF PURSE' : leading ? 'HOLD IT' : 'LOSS = RUN OVER'}</Eyebrow>
          </div>
        </div>
      </PPanel>

      {/* Your engine + their engine. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <PPanel style={{ flex: 1, padding: 10 }}>
          <Eyebrow color="var(--gold)">YOUR ENGINE</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--cream)', marginTop: 6 }}>{manager.name.toUpperCase()}</div>
          {snap.pressureStacks >= 2 ? (
            <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--gold)', marginTop: 4 }}>
              BUILD PRESSURE ×{snap.pressureStacks}
            </div>
          ) : (
            <div style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', marginTop: 4 }}>{manager.winCon.split('—')[0].trim().toUpperCase()}</div>
          )}
        </PPanel>
        <PPanel style={{ flex: 1, padding: 10 }}>
          <Eyebrow color="var(--kit-red)">THEIR ENGINE</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 14, color: 'var(--kit-red)', marginTop: 6 }}>{snap.score[1]} SCORED</div>
          <div style={{ fontFamily: PIXEL, fontSize: 8, color: telegraph ? 'var(--kit-blue)' : 'var(--dust)', marginTop: 4 }}>
            {telegraph ? `SHIFTING → ${telegraph.toUpperCase()}` : snap.oppPosture.toUpperCase()}
          </div>
          {setup.boss && <Chip color="var(--kit-red)" style={{ marginTop: 6 }}>BOSS</Chip>}
        </PPanel>
      </div>

      {/* Period ticker. */}
      <PPanel style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        <Ticker events={result.events} throughPeriod={period} />
      </PPanel>

      {/* The tactical hand — plays are called BETWEEN periods; the engine
          re-resolves under the new window (past periods replay identically). */}
      {!done && (
        <PPanel style={{ padding: 8 }}>
          <button
            onClick={() => setHandOpen((o) => !o)}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Eyebrow color="var(--kit-blue)">TACTICS · ENERGY {energyLeft}/{DEFAULT_ENERGY}</Eyebrow>
            <span style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)' }}>{handOpen ? '▾' : '▸'}</span>
          </button>
          {handOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {TACTICS.map((t) => {
                const boostEntries = Object.entries(t.dialBoost ?? {}) as [Contest, number][];
                const boostLive = boostEntries.every(([c]) => committed.has(c));
                const affordable = energyLeft >= t.energyCost;
                return (
                  <button
                    key={t.id}
                    disabled={!affordable}
                    onClick={() => {
                      onPlayTactic(period + 1, t);
                      setHandOpen(false);
                    }}
                    style={{
                      all: 'unset',
                      cursor: affordable ? 'pointer' : 'default',
                      opacity: affordable ? 1 : 0.35,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      border: '1px solid var(--ink)',
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--cream)' }}>{t.name}</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {boostEntries.map(([c, v]) => (
                        <Chip key={c} color={boostLive ? 'var(--gold)' : 'var(--dust)'}>
                          {boostLive ? `${c} +${v}` : `NEEDS ${c}`}
                        </Chip>
                      ))}
                      <Chip color="var(--kit-blue)">{t.posture.toUpperCase()} ×{t.durationBatches}</Chip>
                      <span style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--gold)' }}>⚡{t.energyCost}</span>
                    </span>
                  </button>
                );
              })}
              <div style={{ fontFamily: PIXEL, fontSize: 7.5, color: 'var(--dust)' }}>
                CALLED AT THE NEXT PERIOD · CLASS BUFFS NEED THE COMMITTED BUILD
              </div>
            </div>
          )}
        </PPanel>
      )}

      {/* Advance control. */}
      {!done ? (
        <PButton accent onClick={() => setPeriod((b) => Math.min(PERIODS, b + 1))}>
          {period === 0 ? 'KICK OFF →' : `PLAY PERIOD ${period + 1} →`}
        </PButton>
      ) : (
        <PButton
          accent
          onClick={onFullTime}
          style={{ background: result.verdict === 'win' ? 'linear-gradient(180deg, var(--success), #1f9d4f)' : undefined }}
        >
          FULL TIME · <span style={{ color: VERDICT_COLOR[result.verdict] }}>{VERDICT_COPY[result.verdict]}</span> →
        </PButton>
      )}
      {!done && period > 0 && (
        <PButton onClick={() => setPeriod(PERIODS)} style={{ fontSize: 9, padding: '8px 12px' }}>SKIP TO FULL TIME</PButton>
      )}
    </div>
  );
}

/** Plain-English period ticker over the salient events, newest first. */
function Ticker({ events, throughPeriod }: { events: MatchEvent[]; throughPeriod: number }) {
  const lines: { key: number; text: string; color?: string }[] = [];
  events.forEach((e, i) => {
    const b = 'clock' in e ? e.clock.batch : 'batch' in e ? e.batch : 0;
    if (b > throughPeriod) return;
    const at = 'clock' in e ? `${minuteOf(e.clock.batch, e.clock.increment)}'` : '';
    switch (e.type) {
      case 'goal':
        lines.push({ key: i, text: `${at} GOAL ${e.side === 0 ? 'FOR' : 'AGAINST'} — via ${e.via}. ${e.score[0]}–${e.score[1]}`, color: e.side === 0 ? 'var(--success)' : 'var(--kit-red)' });
        break;
      case 'pressure-built':
        lines.push({ key: i, text: `The pressure builds — ×${e.stacks} periods on the ball`, color: 'var(--gold)' });
        break;
      case 'posture-shift':
        lines.push({ key: i, text: `${e.side === 0 ? 'You' : 'They'} shift to ${e.to}${e.reason === 'revert' ? ' (window over)' : ''}`, color: 'var(--kit-blue)' });
        break;
      case 'tactic-played':
        lines.push({
          key: i,
          text: `${e.side === 0 ? 'You play' : 'THEY play'} ${e.card} (${e.durationBatches} periods)`,
          color: e.side === 0 ? 'var(--kit-blue)' : 'var(--kit-red)',
        });
        break;
      case 'fitness-drained':
        lines.push({ key: i, text: `${e.side === 0 ? 'Your' : 'Their'} legs drained (${e.fitness})`, color: 'var(--dust)' });
        break;
      case 'cash-banked':
        if (e.side === 0) lines.push({ key: i, text: `${at} +£${e.value} banked`, color: 'var(--gold)' });
        break;
      case 'batch-start':
        lines.push({ key: i, text: `— Period ${e.batch} (${e.band}) —`, color: 'var(--dust)' });
        break;
    }
  });
  lines.reverse();
  if (lines.length === 0) return <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)' }}>KICK OFF to play the first period.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {lines.slice(0, 80).map((l) => (
        <div key={l.key} style={{ fontFamily: PIXEL, fontSize: 8.5, lineHeight: 1.5, color: l.color ?? 'var(--cream-soft)' }}>{l.text}</div>
      ))}
    </div>
  );
}
