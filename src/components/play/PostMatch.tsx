'use client';

/**
 * KC six-contest UI (NW-143) — the post-match dashboard (SM §9: "why did I
 * win/lose?").
 *
 * Aggregates the match event log into the reads that matter: points banked by
 * channel (goals / pressure / clean), chances generated vs converted, goals
 * for/against, cash earned. Then a ONE-LINE DIAGNOSIS names the lever — "the
 * engine ran, the parts didn't convert — buy a finisher". The engine produced
 * the log and the settled run; this screen only reads them.
 */

import { useMemo } from 'react';
import type { Manager, FixtureSetup, MatchResult, RunState } from '../../engine-v2';
import type { MatchEvent } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, Meter, PIXEL } from './ui';

interface Agg {
  points: number;
  bySource: { goal: number; 'clean-batch': number; 'pressure-batch': number };
  chances: number;
  converted: number;
  goalsFor: number;
  goalsAgainst: number;
}

function aggregate(events: MatchEvent[]): Agg {
  const a: Agg = { points: 0, bySource: { goal: 0, 'clean-batch': 0, 'pressure-batch': 0 }, chances: 0, converted: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const e of events) {
    if (e.type === 'points-banked' && e.side === 0) {
      a.points = e.total;
      a.bySource[e.source] += e.value;
    } else if (e.type === 'chance' && e.side === 0) {
      a.chances += 1;
      if (e.converted) a.converted += 1;
    } else if (e.type === 'goal') {
      if (e.side === 0) a.goalsFor += 1;
      else a.goalsAgainst += 1;
    }
  }
  return a;
}

function diagnose(a: Agg, beaten: boolean, target: number): string {
  const convRate = a.chances ? a.converted / a.chances : 0;
  if (beaten) {
    const top = Object.entries(a.bySource).sort((x, y) => y[1] - x[1])[0]?.[0];
    if (top === 'clean-batch') return 'The wall held — clean batches banked the target. Keep conceding nothing.';
    if (top === 'pressure-batch') return 'You battered them — sustained pressure carried you over even without the finish.';
    return 'Clinical up front — your win-con converted. On to the next.';
  }
  if (a.chances >= 8 && convRate < 0.25) return 'The engine ran, the parts didn’t convert — buy a finisher (FINISH).';
  if (a.chances < 5) return 'You couldn’t create — buy creativity (CREATE) to make more chances.';
  if (a.goalsAgainst >= 3) return 'Leaky at the back — buy a wall (STOP) so a barren match still banks clean batches.';
  return `Short of the bar (${a.points.toFixed(1)}/${target.toFixed(1)}) — commit harder to your win-con.`;
}

export default function PostMatch({
  manager,
  setup,
  result,
  run,
  onContinue,
}: {
  manager: Manager;
  setup: FixtureSetup;
  result: MatchResult;
  run: RunState;
  onContinue: () => void;
}) {
  const a = useMemo(() => aggregate(result.events), [result.events]);
  const fr = run.log[run.log.length - 1];
  const beaten = !!fr?.beaten;
  const dead = !run.alive;
  const target = setup.target;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 10 }}>
      <div>
        <Eyebrow color={beaten ? 'var(--success)' : 'var(--kit-red)'}>FIXTURE {setup.fixture} · FULL TIME</Eyebrow>
        <div style={{ fontFamily: PIXEL, fontSize: 20, color: beaten ? 'var(--success)' : 'var(--kit-red)', marginTop: 2 }}>
          {beaten ? 'TARGET MET' : dead ? 'RUN OVER' : 'TARGET MISSED'}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Headline: points vs target. */}
        <PPanel glow={beaten} style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 24, color: beaten ? 'var(--success)' : 'var(--gold)' }}>{a.points.toFixed(1)}</div>
            <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)' }}>TARGET {target.toFixed(1)} · SCORE {result.score[0]}–{result.score[1]}</div>
          </div>
          <div style={{ marginTop: 8 }}><Meter value={a.points} max={target} color={beaten ? 'var(--success)' : 'var(--gold)'} height={7} /></div>
        </PPanel>

        {/* Diagnosis. */}
        <PPanel style={{ padding: 12, border: `1px solid ${beaten ? 'var(--gold)' : 'var(--kit-red)'}` }}>
          <Eyebrow color={beaten ? 'var(--gold)' : 'var(--kit-red)'}>THE DIAGNOSIS</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--cream)', marginTop: 6, lineHeight: 1.6 }}>{diagnose(a, beaten, target)}</div>
        </PPanel>

        {/* Points by channel. */}
        <PPanel style={{ padding: 12 }}>
          <Eyebrow>POINTS BY CHANNEL</Eyebrow>
          {(() => {
            const scale = Math.max(a.bySource.goal, a.bySource['pressure-batch'], a.bySource['clean-batch'], 1);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                <StatRow label={`GOALS ×${a.goalsFor}`} value={a.bySource.goal} scale={scale} color="var(--kit-red)" />
                <StatRow label="PRESSURE" value={a.bySource['pressure-batch']} scale={scale} color="#e8b23a" />
                <StatRow label="CLEAN BATCHES" value={a.bySource['clean-batch']} scale={scale} color="var(--success)" />
              </div>
            );
          })()}
        </PPanel>

        {/* Chances + discipline. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <PPanel style={{ flex: 1, padding: 12 }}>
            <Eyebrow>CHANCES</Eyebrow>
            <div style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', marginTop: 4 }}>{a.converted}<span style={{ fontSize: 10, color: 'var(--dust)' }}> / {a.chances}</span></div>
            <div style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', marginTop: 2 }}>CONVERTED / GENERATED</div>
          </PPanel>
          <PPanel style={{ flex: 1, padding: 12 }}>
            <Eyebrow>CONCEDED</Eyebrow>
            <div style={{ fontFamily: PIXEL, fontSize: 16, color: a.goalsAgainst ? 'var(--kit-red)' : 'var(--success)', marginTop: 4 }}>{a.goalsAgainst}</div>
            <div style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', marginTop: 2 }}>GOALS AGAINST</div>
          </PPanel>
          <PPanel style={{ flex: 1, padding: 12 }}>
            <Eyebrow>CASH</Eyebrow>
            <div style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--gold)', marginTop: 4 }}>£{fr?.cashEarned ?? 0}</div>
            <div style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', marginTop: 2 }}>EARNED</div>
          </PPanel>
        </div>

        {setup.challenge && <Chip color="var(--kit-red)">CHALLENGE · {setup.challenge.name.toUpperCase()}</Chip>}
      </div>

      <PButton accent onClick={onContinue}>
        {dead ? 'SEE RUN SUMMARY →' : run.completed ? 'RUN COMPLETE →' : 'TO THE SHOP →'}
      </PButton>
    </div>
  );
}

function StatRow({ label, value, scale, color }: { label: string; value: number; scale: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 8, color: 'var(--dust)', width: 96 }}>{label}</span>
      <div style={{ flex: 1 }}><Meter value={value} max={scale} color={color} height={5} /></div>
      <span style={{ fontFamily: PIXEL, fontSize: 9, color: value > 0 ? color : 'var(--ink)', width: 28, textAlign: 'right' }}>{value.toFixed(1)}</span>
    </div>
  );
}
