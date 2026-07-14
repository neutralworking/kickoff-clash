'use client';

/**
 * KC six-contest UI (NW-143) — the post-match dashboard (SM §9: "why did I
 * win/lose?").
 *
 * The match is judged on the SCORELINE — win / draw / loss, nothing else. This
 * screen aggregates the event log into the reads that matter (chances generated
 * vs converted, big-chance share, goals for/against, cash) and closes with a
 * ONE-LINE DIAGNOSIS naming the lever. Reads the settled log; computes nothing.
 */

import { useMemo } from 'react';
import type { Manager, FixtureSetup, MatchResult, RunState } from '../../engine-v2';
import type { MatchEvent } from '../../engine-v2';
import { PPanel, PButton, Chip, Eyebrow, PIXEL } from './ui';

interface Agg {
  chances: number;
  converted: number;
  big: number;
  pressureStacks: number;
  goalsFor: number;
  goalsAgainst: number;
}

function aggregate(events: MatchEvent[]): Agg {
  const a: Agg = { chances: 0, converted: 0, big: 0, pressureStacks: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const e of events) {
    if (e.type === 'chance' && e.side === 0) {
      a.chances += 1;
      if (e.quality === 'big') a.big += 1;
      if (e.converted) a.converted += 1;
    } else if (e.type === 'pressure-built' && e.side === 0) {
      a.pressureStacks = Math.max(a.pressureStacks, e.stacks);
    } else if (e.type === 'goal') {
      if (e.side === 0) a.goalsFor += 1;
      else a.goalsAgainst += 1;
    }
  }
  return a;
}

function diagnose(a: Agg, verdict: 'win' | 'draw' | 'loss'): string {
  const convRate = a.chances ? a.converted / a.chances : 0;
  if (verdict === 'win') {
    if (a.goalsAgainst === 0) return 'Won it AND kept them out — the complete performance.';
    if (a.pressureStacks >= 2) return 'The pressure told — you strangled them and the opening came.';
    return 'Job done — the win banks the full purse. On to the next.';
  }
  if (verdict === 'draw') {
    if (a.chances >= 8 && convRate < 0.25) return 'A point — but you left the winner out there. Buy a finisher (FINISH).';
    return 'A point survives you — on half the purse. Find a winner next time.';
  }
  if (a.chances >= 8 && convRate < 0.25) return 'The engine ran, the parts didn’t convert — buy a finisher (FINISH).';
  if (a.chances < 5) return 'You couldn’t create — buy creativity (CREATE) to make more chances.';
  if (a.goalsAgainst >= 3) return 'Leaky at the back — buy a wall (STOP). You can’t outscore that defence.';
  return 'Beaten on the day — commit harder to your win-con.';
}

const VERDICT_COPY = { win: 'YOU WIN', draw: 'A DRAW', loss: 'RUN OVER' } as const;
const VERDICT_COLOR = { win: 'var(--success)', draw: 'var(--gold)', loss: 'var(--kit-red)' } as const;

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
  const verdict = result.verdict;
  const dead = !run.alive;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 10 }}>
      <div>
        <Eyebrow color={VERDICT_COLOR[verdict]}>FIXTURE {setup.fixture} · FULL TIME</Eyebrow>
        <div style={{ fontFamily: PIXEL, fontSize: 20, color: VERDICT_COLOR[verdict], marginTop: 2 }}>
          {VERDICT_COPY[verdict]}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Headline: the scoreline IS the result. */}
        <PPanel glow={verdict === 'win'} style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: PIXEL, fontSize: 26, color: VERDICT_COLOR[verdict] }}>
              {result.score[0]}–{result.score[1]}
            </div>
            <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--dust)' }}>
              {verdict === 'draw' ? 'SURVIVED · HALF PURSE' : verdict === 'win' ? 'FULL PURSE' : 'PERMADEATH'}
            </div>
          </div>
        </PPanel>

        {/* Diagnosis. */}
        <PPanel style={{ padding: 12, border: `1px solid ${verdict === 'loss' ? 'var(--kit-red)' : 'var(--gold)'}` }}>
          <Eyebrow color={verdict === 'loss' ? 'var(--kit-red)' : 'var(--gold)'}>THE DIAGNOSIS</Eyebrow>
          <div style={{ fontFamily: PIXEL, fontSize: 9, color: 'var(--cream)', marginTop: 6, lineHeight: 1.6 }}>{diagnose(a, verdict)}</div>
        </PPanel>

        {/* Chances + defence + cash. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <PPanel style={{ flex: 1, padding: 12 }}>
            <Eyebrow>CHANCES</Eyebrow>
            <div style={{ fontFamily: PIXEL, fontSize: 16, color: 'var(--cream)', marginTop: 4 }}>{a.converted}<span style={{ fontSize: 10, color: 'var(--dust)' }}> / {a.chances}</span></div>
            <div style={{ fontFamily: PIXEL, fontSize: 7, color: 'var(--dust)', marginTop: 2 }}>CONVERTED / GENERATED · {a.big} BIG</div>
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

        {a.pressureStacks >= 2 && (
          <Chip color="var(--gold)">BUILD PRESSURE · PEAKED ×{a.pressureStacks}</Chip>
        )}
        {setup.challenge && <Chip color="var(--kit-red)">CHALLENGE · {setup.challenge.name.toUpperCase()}</Chip>}
      </div>

      <PButton accent onClick={onContinue}>
        {dead ? 'SEE RUN SUMMARY →' : run.completed ? 'RUN COMPLETE →' : 'TO THE SHOP →'}
      </PButton>
    </div>
  );
}
