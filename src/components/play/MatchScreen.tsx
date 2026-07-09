'use client';

/**
 * KC six-contest UI (NW-143) — the match, replayed from the event log.
 *
 * The engine resolves the whole match deterministically (match.ts) and hands us
 * its typed event log; this screen REPLAYS it batch-by-batch (SM §9: feedback is
 * the surface). The scoreline stays honest while the points meter races the
 * target; the centrepiece is the two scoring FLOORS (goals + pressure | clean
 * batches) — this engine has no streak. The opponent engine strip shows its
 * posture and telegraphs a shift one batch ahead. The UI computes nothing.
 */

import { useMemo, useState } from 'react';
import type { Contest, Manager, FixtureSetup, MatchResult } from '../../engine-v2';
import type { MatchEvent } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, Meter, PIXEL } from './ui';

const BATCHES = 6;
const minuteOf = (batch: number, inc: number) => Math.min(90, ((batch - 1) * 3 + Math.max(1, inc)) * 5);

interface Snap {
  score: [number, number];
  points: number;
  bySource: { goal: number; 'clean-batch': number; 'pressure-batch': number };
  oppPosture: string;
}

/** Fold the event log up to (and including) `throughBatch` into a scoreboard. */
function snapshot(events: MatchEvent[], throughBatch: number): Snap {
  const snap: Snap = { score: [0, 0], points: 0, bySource: { goal: 0, 'clean-batch': 0, 'pressure-batch': 0 }, oppPosture: 'balanced' };
  for (const e of events) {
    const b = 'clock' in e ? e.clock.batch : 'batch' in e ? e.batch : 0;
    if (b > throughBatch) continue;
    if (e.type === 'match-start') snap.oppPosture = e.postures[1];
    else if (e.type === 'goal') snap.score = e.score;
    else if (e.type === 'points-banked' && e.side === 0) {
      snap.points = e.total;
      snap.bySource[e.source] += e.value;
    } else if (e.type === 'posture-shift' && e.side === 1) snap.oppPosture = e.to;
  }
  return snap;
}

export default function MatchScreen({
  manager,
  setup,
  result,
  onFullTime,
}: {
  manager: Manager;
  setup: FixtureSetup;
  result: MatchResult;
  onFullTime: () => void;
}) {
  const [batch, setBatch] = useState(0); // batches revealed so far
  const target = setup.target;
  const snap = useMemo(() => snapshot(result.events, batch), [result.events, batch]);
  const done = batch >= BATCHES;

  // telegraph: does the opponent shift posture in the NEXT batch?
  const telegraph = useMemo(() => {
    const next = result.events.find((e) => e.type === 'posture-shift' && e.side === 1 && e.batch === batch + 1);
    return next && next.type === 'posture-shift' ? next.to : null;
  }, [result.events, batch]);

  const beaten = snap.points >= target;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 10 }}>
      {/* Scoreboard: honest scoreline · points vs target · clock. */}
      <PPanel style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: PIXEL, fontSize: 22, color: 'var(--cream)' }}>{snap.score[0]}–{snap.score[1]}</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 10, color: 'var(--dust)' }}>{minuteOf(Math.max(1, batch), 3)}&apos;</div>
            <Eyebrow>BATCH {Math.min(batch, BATCHES)}/{BATCHES}</Eyebrow>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 16, color: beaten ? 'var(--success)' : 'var(--gold)' }}>{snap.points.toFixed(1)}</div>
            <Eyebrow>TARGET {target.toFixed(1)}</Eyebrow>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <Meter value={snap.points} max={target} color={beaten ? 'var(--success)' : 'var(--gold)'} height={7} />
        </div>
      </PPanel>

      {/* Scoring floors (the centrepiece) + opponent engine strip. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <PPanel style={{ flex: 1, padding: 10 }}>
          <Eyebrow color="var(--gold)">POINTS BANKED</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            <FloorRow label="GOALS" value={snap.bySource.goal} color="var(--kit-red)" />
            <FloorRow label="PRESSURE" value={snap.bySource['pressure-batch']} color="#e8b23a" />
            <FloorRow label="CLEAN" value={snap.bySource['clean-batch']} color="var(--success)" />
          </div>
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

      {/* Batch ticker. */}
      <PPanel style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        <Ticker events={result.events} throughBatch={batch} />
      </PPanel>

      {/* Advance control. */}
      {!done ? (
        <PButton accent onClick={() => setBatch((b) => Math.min(BATCHES, b + 1))}>
          {batch === 0 ? 'KICK OFF →' : `PLAY BATCH ${batch + 1} →`}
        </PButton>
      ) : (
        <PButton accent onClick={onFullTime} style={{ background: beaten ? 'linear-gradient(180deg, var(--success), #1f9d4f)' : undefined }}>
          FULL TIME · {beaten ? 'TARGET MET' : 'TARGET MISSED'} →
        </PButton>
      )}
      {!done && batch > 0 && (
        <PButton onClick={() => setBatch(BATCHES)} style={{ fontSize: 9, padding: '8px 12px' }}>SKIP TO FULL TIME</PButton>
      )}
    </div>
  );
}

function FloorRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)' }}>{label}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 11, color: value > 0 ? color : 'var(--ink)' }}>{value.toFixed(1)}</span>
    </div>
  );
}

/** Plain-English batch ticker over the salient events, newest first. */
function Ticker({ events, throughBatch }: { events: MatchEvent[]; throughBatch: number }) {
  const lines: { key: number; text: string; color?: string }[] = [];
  events.forEach((e, i) => {
    const b = 'clock' in e ? e.clock.batch : 'batch' in e ? e.batch : 0;
    if (b > throughBatch) return;
    const at = 'clock' in e ? `${minuteOf(e.clock.batch, e.clock.increment)}'` : '';
    switch (e.type) {
      case 'goal':
        lines.push({ key: i, text: `${at} GOAL ${e.side === 0 ? 'FOR' : 'AGAINST'} — via ${e.via}. ${e.score[0]}–${e.score[1]}`, color: e.side === 0 ? 'var(--success)' : 'var(--kit-red)' });
        break;
      case 'points-banked':
        if (e.side !== 0) break;
        lines.push({
          key: i,
          text: `${at} +${e.value.toFixed(1)} ${e.source.replace('-', ' ')} → ${e.total.toFixed(1)} pts`,
          color: e.source === 'goal' ? 'var(--gold)' : 'var(--cream-soft)',
        });
        break;
      case 'posture-shift':
        lines.push({ key: i, text: `${e.side === 0 ? 'You' : 'They'} shift to ${e.to}${e.reason === 'revert' ? ' (window over)' : ''}`, color: 'var(--kit-blue)' });
        break;
      case 'tactic-played':
        lines.push({ key: i, text: `You play ${e.card} (${e.durationBatches} batches)`, color: 'var(--kit-blue)' });
        break;
      case 'fitness-drained':
        lines.push({ key: i, text: `${e.side === 0 ? 'Your' : 'Their'} legs drained (${e.fitness})`, color: 'var(--dust)' });
        break;
      case 'cash-banked':
        if (e.side === 0) lines.push({ key: i, text: `${at} +£${e.value} banked`, color: 'var(--gold)' });
        break;
      case 'early-whistle':
        lines.push({ key: i, text: `EARLY WHISTLE — target met with the lead`, color: 'var(--success)' });
        break;
      case 'batch-start':
        lines.push({ key: i, text: `— Batch ${e.batch} (${e.band}) —`, color: 'var(--dust)' });
        break;
    }
  });
  lines.reverse();
  if (lines.length === 0) return <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)' }}>KICK OFF to play the first batch.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {lines.slice(0, 80).map((l) => (
        <div key={l.key} style={{ fontFamily: PIXEL, fontSize: 8.5, lineHeight: 1.5, color: l.color ?? 'var(--cream-soft)' }}>{l.text}</div>
      ))}
    </div>
  );
}
